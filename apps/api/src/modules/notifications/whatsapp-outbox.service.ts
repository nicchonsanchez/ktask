import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type WhatsappOutbox } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { WhatsAppHelper } from '@/modules/whatsapp/whatsapp.helper';
import type { NotificationEventKey } from './preferences.types';

/**
 * Outbox de mensagens WhatsApp pendentes. Mata 3 problemas:
 *   1. **Batching**: agrupa N notifs do mesmo destinatario em 1 mensagem.
 *      Janela de 2min (urgent) ou 15min (standard). Evita ping incessante.
 *   2. **Caps anti-block**: max 6 msgs/user/hora e 20/org/hora. WhatsApp
 *      pessoal (Baileys) bloqueia contas com padrao "bot-like".
 *   3. **Quiet hours**: msgs geradas 22h-7h BRT acumulam ate 7h da manha
 *      (preserva respeito + concentra entrega numa unica msg matinal).
 *
 * Throttle adicional acontece no scheduler que chama processBatch().
 */

const URGENT_EVENTS = new Set<NotificationEventKey>([
  'mention_comment',
  'task_assigned',
  'approval_pending',
]);
const URGENT_WINDOW_MIN = 2;
const STANDARD_WINDOW_MIN = 15;
const MAX_ATTEMPTS = 3;
const HARD_CAP_PER_USER_HOUR = 6;
const HARD_CAP_PER_ORG_HOUR = 20;
const QUIET_HOUR_START_BRT = 22; // inclusive
const QUIET_HOUR_END_BRT = 7; // exclusive

export interface EnqueueWhatsappParams {
  userId: string;
  organizationId: string;
  event: NotificationEventKey;
  /**
   * Vars pra formatar a mensagem. Shape livre — formatter conhece.
   * Sugerido: { title, cardTitle, cardId, actorName, url? }.
   */
  payload: Record<string, unknown>;
}

/**
 * Resultado de uma rodada do cron. Util pra log do scheduler.
 */
export interface ProcessResult {
  /** Mensagens efetivamente enviadas. */
  sent: number;
  /** Rows agrupadas (cobertas pelos sends). */
  rowsCovered: number;
  /** Rows que falharam no envio (Evolution retornou erro). */
  failed: number;
  /** Rows adiadas por caps anti-abuse (re-agendadas pra hora cheia). */
  capped: number;
}

@Injectable()
export class WhatsappOutboxService {
  private readonly logger = new Logger(WhatsappOutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wa: WhatsAppHelper,
  ) {}

  /**
   * Enfileira uma notif pra envio WhatsApp. Calcula urgency, scheduledFor
   * (respeitando quiet hours). NAO envia agora — cron pega depois.
   */
  async enqueue(params: EnqueueWhatsappParams): Promise<WhatsappOutbox> {
    const urgency = URGENT_EVENTS.has(params.event) ? 'urgent' : 'standard';
    const windowMin = urgency === 'urgent' ? URGENT_WINDOW_MIN : STANDARD_WINDOW_MIN;
    const baseScheduledFor = new Date(Date.now() + windowMin * 60_000);
    const scheduledFor = applyQuietHours(baseScheduledFor);

    return this.prisma.whatsappOutbox.create({
      data: {
        userId: params.userId,
        organizationId: params.organizationId,
        eventType: params.event,
        urgency,
        payload: params.payload as Prisma.InputJsonValue,
        scheduledFor,
      },
    });
  }

  /**
   * Roda 1 ciclo de envio. Chamado pelo scheduler (cron a cada 60s).
   * Pega rows due, agrupa por user, envia. Aplica caps + quiet hours.
   */
  async processBatch(now: Date = new Date()): Promise<ProcessResult> {
    if (isInQuietHours(now)) {
      // Nem chega a buscar — economiza query. Mensagens novas continuam
      // sendo enfileiradas (scheduledFor ja eh ajustado), so nao enviamos.
      return { sent: 0, rowsCovered: 0, failed: 0, capped: 0 };
    }

    const due = await this.prisma.whatsappOutbox.findMany({
      where: {
        sentAt: null,
        scheduledFor: { lte: now },
        attempts: { lt: MAX_ATTEMPTS },
      },
      orderBy: { scheduledFor: 'asc' },
      take: 200, // protegido — cron roda toda hora, ninguem precisa de pulso enorme
    });

    if (due.length === 0) {
      return { sent: 0, rowsCovered: 0, failed: 0, capped: 0 };
    }

    // Agrupa por userId — uma mensagem mesclada por destinatario.
    const byUser = new Map<string, WhatsappOutbox[]>();
    for (const row of due) {
      const arr = byUser.get(row.userId) ?? [];
      arr.push(row);
      byUser.set(row.userId, arr);
    }

    let sent = 0;
    let rowsCovered = 0;
    let failed = 0;
    let capped = 0;

    // Hard cap por org/hora — calcula uma vez, vale pra todos os users
    const orgSentLastHour = await this.countSentLastHour(
      due[0]?.organizationId ?? '',
      'organization',
      now,
    );
    let orgRemainingSlots = HARD_CAP_PER_ORG_HOUR - orgSentLastHour;

    for (const [userId, rows] of byUser) {
      if (orgRemainingSlots <= 0) {
        await this.deferRows(rows, capNextHourStart(now), 'org_cap_reached');
        capped += rows.length;
        continue;
      }
      const userSentLastHour = await this.countSentLastHour(userId, 'user', now);
      if (userSentLastHour >= HARD_CAP_PER_USER_HOUR) {
        await this.deferRows(rows, capNextHourStart(now), 'user_cap_reached');
        capped += rows.length;
        continue;
      }

      // Pega user + phone. Se nao tiver phone, descarta as rows (loga).
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { phone: true, name: true },
      });
      if (!user?.phone) {
        await this.prisma.whatsappOutbox.updateMany({
          where: { id: { in: rows.map((r) => r.id) } },
          data: { sentAt: now, lastError: 'no_phone', batchId: `noop-${now.getTime()}` },
        });
        this.logger.log(
          `User ${userId} sem phone — ${rows.length} rows descartadas (marcadas sentAt)`,
        );
        rowsCovered += rows.length;
        continue;
      }

      const message = formatBatch(rows, user.name);
      const ok = await this.wa.sendText(user.phone, message);
      if (ok) {
        const batchId = `b-${now.getTime()}-${userId.slice(-6)}`;
        await this.prisma.whatsappOutbox.updateMany({
          where: { id: { in: rows.map((r) => r.id) } },
          data: { sentAt: new Date(), batchId, lastError: null },
        });
        sent += 1;
        rowsCovered += rows.length;
        orgRemainingSlots -= 1;
        // Throttle entre destinatarios — espalha pulso pra parecer humano.
        // Jitter 2-4s. Numero pequeno (~10 destinatarios/ciclo no pico),
        // entao adiciona ~30s de delay total max. Aceitavel.
        const jitter = 2000 + Math.floor(Math.random() * 2000);
        await sleep(jitter);
      } else {
        await this.prisma.whatsappOutbox.updateMany({
          where: { id: { in: rows.map((r) => r.id) } },
          data: {
            attempts: { increment: 1 },
            lastError: 'evolution_send_failed',
            // Reagenda 5min depois pra retry. Apos MAX_ATTEMPTS tenta-
            // -ivas, a query ignora (where attempts<MAX_ATTEMPTS).
            scheduledFor: new Date(now.getTime() + 5 * 60_000),
          },
        });
        failed += rows.length;
      }
    }

    return { sent, rowsCovered, failed, capped };
  }

  /**
   * Conta msgs enviadas (sentAt > NOW - 1h) pra um user ou organization.
   * Usado nos caps anti-abuse.
   */
  private async countSentLastHour(
    id: string,
    scope: 'user' | 'organization',
    now: Date,
  ): Promise<number> {
    const since = new Date(now.getTime() - 60 * 60_000);
    return this.prisma.whatsappOutbox.count({
      where: {
        ...(scope === 'user' ? { userId: id } : { organizationId: id }),
        sentAt: { gt: since },
      },
    });
  }

  /**
   * Reagenda rows pra um horario mais a frente (sem incrementar attempts).
   * Caps anti-abuse "atrasam" em vez de "descartar".
   */
  private async deferRows(rows: WhatsappOutbox[], nextAt: Date, reason: string) {
    await this.prisma.whatsappOutbox.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { scheduledFor: nextAt, lastError: reason },
    });
  }
}

/**
 * Formata mensagem mesclada pro WhatsApp. NAO inclui conteudo do
 * comentario/payload alem do necessario — evita previews indesejados
 * (links no comment trigam preview do WA) e info sensivel.
 *
 * Caso 1 row: mensagem curta tipo
 *    🔔 KTask
 *    Joao mencionou voce em "Briefing AFB"
 *    ktask.agenciakharis.com.br/c/CMQ...
 *
 * Caso N rows: header + bullets, max ~4 antes de "…e mais X"
 */
function formatBatch(rows: WhatsappOutbox[], userName: string): string {
  const greeting = pickGreeting(userName);
  if (rows.length === 1) {
    const line = formatLine(rows[0]!);
    const url = extractUrl(rows[0]!);
    return `${greeting}\n${line}${url ? `\n${url}` : ''}`;
  }
  const top = rows.slice(0, 4).map((r) => `▸ ${formatLine(r)}`);
  const moreCount = rows.length - top.length;
  const moreLine =
    moreCount > 0 ? `\n…e mais ${moreCount} novidade${moreCount === 1 ? '' : 's'}` : '';
  return `${greeting} — ${rows.length} atualizações\n\n${top.join('\n')}${moreLine}\n\nAbra: ktask.agenciakharis.com.br/notificacoes`;
}

function formatLine(row: WhatsappOutbox): string {
  const p = (row.payload ?? {}) as Record<string, string | undefined>;
  const actor = p.actorName ?? 'Alguém';
  const cardTitle = p.cardTitle ?? 'um card';
  switch (row.eventType as NotificationEventKey) {
    case 'mention_comment':
      return `${actor} mencionou você em "${cardTitle}"`;
    case 'task_assigned':
      return `${actor} atribuiu "${p.taskText ?? 'uma tarefa'}" a você em "${cardTitle}"`;
    case 'task_due_soon':
      return `Tarefa "${p.taskText ?? '...'}" vence em breve (${cardTitle})`;
    case 'approval_pending':
      return `Aprovação pendente: "${cardTitle}"`;
    case 'approval_responded':
      return `Aprovação que você pediu foi ${p.decision ?? 'respondida'}: "${cardTitle}"`;
    case 'card_lead_assigned':
      return `Você virou líder de "${cardTitle}"`;
    case 'card_sla_breach':
      return `Card atrasado: "${cardTitle}"`;
    default:
      return `Atualização em "${cardTitle}"`;
  }
}

function extractUrl(row: WhatsappOutbox): string | null {
  const p = (row.payload ?? {}) as Record<string, string | undefined>;
  if (p.url) return p.url;
  if (p.cardId) return `ktask.agenciakharis.com.br/c/${p.cardId}`;
  return null;
}

/**
 * Saudacao com pequena variacao pra reduzir padrao detectavel pelo
 * algoritmo do WhatsApp. Inclui primeiro nome quando disponivel.
 */
function pickGreeting(userName: string): string {
  const first = userName.trim().split(/\s+/)[0];
  const options = [`🔔 KTask · oi ${first}`, `🔔 KTask`, `📋 KTask · ${first}`];
  return options[Math.floor(Math.random() * options.length)]!;
}

/**
 * Verifica se `now` esta em horario de silencio (22h-7h BRT). Usa
 * Intl pra evitar issues de TZ do container (mesmo que o container
 * esteja em UTC, BRT eh o que importa pro usuario final).
 */
function isInQuietHours(now: Date): boolean {
  const hourBRT = Number(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      hour12: false,
    }).format(now),
  );
  return hourBRT >= QUIET_HOUR_START_BRT || hourBRT < QUIET_HOUR_END_BRT;
}

/**
 * Ajusta scheduledFor pra fora da quiet zone. Se cair em 22h-7h,
 * empurra pra 7h05 BRT do dia seguinte (se necessario).
 */
function applyQuietHours(scheduledFor: Date): Date {
  if (!isInQuietHours(scheduledFor)) return scheduledFor;
  // Constroi 7h05 BRT do dia da scheduledFor. Se ja passou (madrugada),
  // soma 1 dia.
  const dayBRT = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(scheduledFor);
  // 7h05 BRT = 10h05 UTC (BRT = UTC-3, sem DST atualmente no BR)
  const morningBRT = new Date(`${dayBRT}T10:05:00Z`);
  if (morningBRT.getTime() > scheduledFor.getTime()) return morningBRT;
  // Caso scheduledFor seja madrugada (00-07h BRT), 7h05 do MESMO dia
  // ja passou em UTC compare (porque "dia BRT" inicia 03h UTC). Soma 24h.
  return new Date(morningBRT.getTime() + 24 * 60 * 60_000);
}

function capNextHourStart(now: Date): Date {
  const next = new Date(now.getTime());
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return applyQuietHours(next);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
