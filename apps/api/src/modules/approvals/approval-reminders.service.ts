import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Organization, Prisma } from '@prisma/client';

import { env } from '@/config/env';
import { PrismaService } from '@/common/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { WhatsAppHelper } from '@/modules/whatsapp/whatsapp.helper';

/**
 * Cap de seguranca: nao mandar lembrete pra approval mais antiga que isto.
 * Aprovacao parada ha 30 dias provavelmente foi esquecida; quem precisar
 * cobra manualmente (resend) ou cancela.
 */
const MAX_AGE_DAYS = 30;

/**
 * Janela ativa em milisegundos. Sweeper roda a cada 30min — dentro do tick,
 * approvals que ficaram devidas viram alvo. Granularidade 30min eh boa o
 * suficiente; nao vale rodar a cada 5min e sobrecarregar.
 */
const CRON_INTERVAL = CronExpression.EVERY_30_MINUTES;

/**
 * Servico de lembretes automaticos de aprovacao pendente.
 *
 * Roda em-process via @nestjs/schedule. Pra cada Organization com setting
 * `approvalReminderEnabled = true`:
 *
 *   1. Verifica se NOW (em America/Sao_Paulo) cai dentro da janela util
 *      configurada (hourStart-hourEnd, seg-sex). Fora dela: pula a org.
 *   2. Busca approvals candidatas (PENDING, nao desabilitadas, abaixo do
 *      cap de tentativas, com `base + interval <= NOW` onde base eh o
 *      maior entre lastReminderAt e requestedAt).
 *   3. Agrupa por reviewer (consolida): cada reviewer recebe 1 mensagem
 *      WhatsApp + 1 notificacao in-app listando seus N approvals
 *      pendentes — evita spam quando 1 pessoa eh reviewer de varias.
 *   4. Atualiza `lastReminderAt = NOW` e incrementa `reminderCount` em
 *      cada approval enviada.
 *
 * Reviewer externo (phone-only, sem userId) recebe WhatsApp; nao recebe
 * in-app (nao tem User pra notificar). Internos com phone recebem ambos.
 */
@Injectable()
export class ApprovalRemindersService {
  private readonly logger = new Logger(ApprovalRemindersService.name);

  /** Anti-reentrada: cron pode disparar enquanto execucao anterior roda. */
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly whatsapp: WhatsAppHelper,
  ) {}

  @Cron(CRON_INTERVAL)
  async run() {
    if (this.processing) return;
    this.processing = true;
    try {
      await this.runOnce();
    } catch (err) {
      this.logger.error(`Cron de lembretes falhou: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.processing = false;
    }
  }

  /**
   * Pode ser chamado por test/seed/admin pra forcar uma rodada. Public
   * pra facilitar testes manuais (POST /admin/approval-reminders/run).
   */
  async runOnce(): Promise<{ orgsChecked: number; remindersSent: number }> {
    const orgs = await this.prisma.organization.findMany({
      where: { approvalReminderEnabled: true },
    });
    let totalSent = 0;
    for (const org of orgs) {
      try {
        const sent = await this.processOrg(org);
        totalSent += sent;
      } catch (err) {
        this.logger.error(
          `processOrg(${org.id}) falhou: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return { orgsChecked: orgs.length, remindersSent: totalSent };
  }

  /**
   * Processa uma org: valida janela horaria, busca candidatos, agrupa
   * por reviewer, envia mensagens e atualiza tracking.
   */
  private async processOrg(org: Organization): Promise<number> {
    if (!this.isWithinBusinessHours(org)) return 0;

    const now = new Date();

    // Quando "unlimited" esta ativo, ignora maxAttempts E o cap de idade:
    // a approval recebe lembrete enquanto estiver PENDING (so para se
    // alguem decidir ou cancelar).
    const where: Prisma.CardApprovalWhereInput = {
      organizationId: org.id,
      status: 'PENDING',
      reminderDisabled: false,
    };
    if (!org.approvalReminderUnlimited) {
      where.reminderCount = { lt: org.approvalReminderMaxAttempts };
      where.requestedAt = {
        gte: new Date(now.getTime() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000),
      };
    }

    // Busca approvals PENDING que ainda podem receber lembrete. Filtros
    // de tempo (base + interval <= now) sao feitos no app pra suportar
    // override per-approval.
    const candidates = await this.prisma.cardApproval.findMany({
      where,
      include: {
        card: {
          select: {
            id: true,
            title: true,
            board: { select: { name: true } },
            list: { select: { name: true } },
          },
        },
        reviewers: {
          select: {
            id: true,
            userId: true,
            phone: true,
            externalName: true,
            user: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Filtra por "devida agora": base (lastReminder OR requested) + interval <= now.
    const due = candidates.filter((a) => {
      const intervalMs =
        (a.reminderIntervalHoursOverride ?? org.approvalReminderIntervalHours) * 60 * 60 * 1000;
      const base = (a.lastReminderAt ?? a.requestedAt).getTime();
      return base + intervalMs <= now.getTime();
    });

    if (due.length === 0) return 0;

    // Consolida por reviewer: 1 entrada por reviewer (interno OU externo)
    // com lista de approvals pendentes dele. Mesma key pra mesmo userId,
    // ou mesmo phone (externos).
    type ReviewerKey = string;
    interface PendingForReviewer {
      key: ReviewerKey;
      userId: string | null;
      phone: string | null;
      displayName: string;
      approvals: Array<{
        id: string;
        cardId: string;
        cardTitle: string;
        boardName: string;
        listName: string;
      }>;
    }

    const byReviewer = new Map<ReviewerKey, PendingForReviewer>();

    for (const a of due) {
      for (const r of a.reviewers) {
        // Skip se nao tem nem userId nem phone (não dá pra contactar)
        if (!r.userId && !r.phone) continue;
        const key = r.userId ? `u:${r.userId}` : `p:${r.phone}`;
        const displayName = r.user?.name ?? r.externalName ?? r.phone ?? 'Aprovador';
        if (!byReviewer.has(key)) {
          byReviewer.set(key, {
            key,
            userId: r.userId,
            phone: r.phone,
            displayName,
            approvals: [],
          });
        }
        byReviewer.get(key)!.approvals.push({
          id: a.id,
          cardId: a.cardId,
          cardTitle: a.card.title,
          boardName: a.card.board.name,
          listName: a.card.list.name,
        });
      }
    }

    // Envia 1 lembrete por reviewer (consolidado).
    let sent = 0;
    const approvalsTouched = new Set<string>();
    for (const reminder of byReviewer.values()) {
      await this.sendReminder(org, reminder);
      sent++;
      for (const a of reminder.approvals) approvalsTouched.add(a.id);
    }

    // Atualiza tracking em batch das approvals que receberam lembrete
    // (pelo menos 1 reviewer notificado). Usa updateMany pra performance.
    if (approvalsTouched.size > 0) {
      await this.prisma.cardApproval.updateMany({
        where: { id: { in: Array.from(approvalsTouched) } },
        data: {
          lastReminderAt: now,
          reminderCount: { increment: 1 },
        },
      });
    }

    this.logger.log(
      `Org ${org.id}: ${due.length} approvals devidas, ${byReviewer.size} reviewers notificados`,
    );
    return sent;
  }

  /**
   * Verifica se NOW (em America/Sao_Paulo) cai na janela util da org.
   * BRT eh UTC-3 sem DST. Dias da semana: 1=seg ... 7=dom (ISO).
   */
  private isWithinBusinessHours(org: Organization): boolean {
    const now = new Date();
    // BRT = UTC-3
    const brtMs = now.getTime() - 3 * 60 * 60_000;
    const brt = new Date(brtMs);
    const hour = brt.getUTCHours();
    const dayOfWeek = brt.getUTCDay(); // 0=dom ... 6=sab
    // V1: seg-sex (1..5). Feriados ficam pra V2.
    if (dayOfWeek === 0 || dayOfWeek === 6) return false;
    return hour >= org.approvalReminderHourStart && hour < org.approvalReminderHourEnd;
  }

  /**
   * Envia 1 lembrete consolidado pra 1 reviewer. WhatsApp (se tiver
   * phone OU se tiver userId E achar phone do user) + in-app
   * (so se userId, externos nao tem User).
   */
  private async sendReminder(
    org: Organization,
    reminder: {
      userId: string | null;
      phone: string | null;
      displayName: string;
      approvals: Array<{
        id: string;
        cardId: string;
        cardTitle: string;
        boardName: string;
        listName: string;
      }>;
    },
  ): Promise<void> {
    const firstName = reminder.displayName.split(' ')[0] ?? reminder.displayName;
    const count = reminder.approvals.length;

    // Resolve telefone: phone direto (reviewer externo) ou phone do User
    // (reviewer interno que tem phone cadastrado).
    let phoneToSend: string | null = reminder.phone;
    if (!phoneToSend && reminder.userId) {
      const u = await this.prisma.user.findUnique({
        where: { id: reminder.userId },
        select: { phone: true, notifyApprovalsOnWhatsApp: true },
      });
      // Respeita o opt-in: usuario interno so recebe WA se ativou na conta.
      if (u?.phone && u.notifyApprovalsOnWhatsApp) {
        phoneToSend = u.phone;
      }
    }

    if (phoneToSend) {
      const text = this.composeMessage(firstName, count, reminder.approvals);
      await this.whatsapp.sendText(phoneToSend, text).catch(() => undefined);
    }

    // In-app notification: so faz sentido pra User interno.
    if (reminder.userId) {
      const title =
        count === 1
          ? 'Aprovação pendente esperando você'
          : `${count} aprovações pendentes esperando você`;
      const body =
        count === 1
          ? `Card: "${reminder.approvals[0]!.cardTitle}"`
          : `Cards: ${reminder.approvals
              .slice(0, 3)
              .map((a) => `"${a.cardTitle}"`)
              .join(', ')}${count > 3 ? ` e mais ${count - 3}` : ''}`;
      await this.notifications
        .create({
          userId: reminder.userId,
          organizationId: org.id,
          type: 'APPROVAL_REQUEST',
          title,
          body,
          // Sem entityType/Id especifico (sao N approvals); url direto
          // pra inbox global de aprovacoes.
          url: '/aprovacoes',
        })
        .catch((err) => {
          this.logger.warn(
            `notification create falhou pra user ${reminder.userId}: ${err instanceof Error ? err.message : err}`,
          );
        });
    }
  }

  /**
   * Compoe mensagem WhatsApp consolidada. Quando eh 1 approval, formato
   * proximo ao reminder atual (com link direto). Quando eh N, lista
   * cards e link pra inbox /aprovacoes (decisao na inbox, nao individual).
   *
   * Asteriscos (`*texto*`) = negrito do WhatsApp. URL aparece clicavel
   * automaticamente em qualquer cliente.
   */
  private composeMessage(
    firstName: string,
    count: number,
    approvals: Array<{ cardId: string; cardTitle: string; boardName: string; listName: string }>,
  ): string {
    const greeting = firstName ? `Olá, ${firstName}!` : 'Olá!';
    const footer = '\n\n> Esta é uma mensagem automática.';

    if (count === 1) {
      const a = approvals[0]!;
      const link = `${env.APP_URL}/aprovacoes?card=${a.cardId}`;
      const lines = [
        greeting,
        '',
        'Você tem 1 aprovação ainda *pendente*:',
        '',
        `📋 Card: *${a.cardTitle}*`,
        `📁 Fluxo: ${a.boardName} → ${a.listName}`,
        '',
        'Acesse e responda:',
        link,
      ];
      return lines.join('\n') + footer;
    }

    const inboxLink = `${env.APP_URL}/aprovacoes`;
    const lines = [
      greeting,
      '',
      `Você tem *${count} aprovações pendentes* esperando sua resposta:`,
      '',
    ];
    // Lista ate 10 pra nao virar mensagem gigante.
    const toList = approvals.slice(0, 10);
    for (const a of toList) {
      lines.push(`• ${a.cardTitle} (${a.boardName})`);
    }
    if (approvals.length > 10) {
      lines.push(`... e mais ${approvals.length - 10}`);
    }
    lines.push('', 'Acesse sua caixa de aprovações:', inboxLink);
    return lines.join('\n') + footer;
  }
}
