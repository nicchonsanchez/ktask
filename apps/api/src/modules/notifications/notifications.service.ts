import { Injectable, Logger } from '@nestjs/common';
import type { NotificationType } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { PushService } from '@/modules/push/push.service';

import { passesScope, shouldNotify, type NotificationEventKey } from './preferences.types';
import { WhatsappOutboxService } from './whatsapp-outbox.service';

interface CreateNotificationParams {
  userId: string;
  organizationId: string;
  type: NotificationType;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  /** URL pra abrir quando clicar na notificação push (cliente). Default: derivado de entityType/Id. */
  url?: string;
  /**
   * Chave canonica do evento que originou a notif. Quando fornecida:
   *   - Consulta `User.notificationPreferences` antes de criar
   *   - Eventos com app=false sao silenciados (nao cria Notification)
   *   - Eventos com whatsapp=true sao enfileirados no WhatsappOutbox
   *
   * Quando ausente: comportamento legado (sempre cria, sem WhatsApp).
   * Caller pode setar `eventKey: 'mention_comment'` etc — ver
   * preferences.types.ts pra lista de chaves validas.
   */
  eventKey?: NotificationEventKey;
  /**
   * Pros eventos com escopo (`card_commented`, `card_moved`, etc).
   * Necessario pra decidir se o user "passa no escopo" (leader vs present).
   * Sem isso, eventos com escopo serao ignorados (assume falha de escopo).
   */
  scopeCard?: { leadId: string | null; memberUserIds: string[] };
  /**
   * Payload extra pro formatador de WhatsApp. Caller pode incluir actorName,
   * cardTitle, taskText etc — sem isso o formatter cai em fallbacks
   * genericos. Ignorado quando o evento nao vai pro WhatsApp.
   */
  whatsappPayload?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly waOutbox: WhatsappOutboxService,
  ) {}

  /**
   * Decide se o user deve receber notif desse evento (canal `app`). Tambem
   * agenda WhatsApp via outbox quando aplicavel. Retorna `false` quando o
   * caller deve PULAR o create (preferencia desligou).
   *
   * Sem eventKey: sempre `true` (legado).
   */
  private async resolveDeliveryGates(
    params: CreateNotificationParams,
  ): Promise<{ deliverApp: boolean }> {
    if (!params.eventKey) return { deliverApp: true };
    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: { notificationPreferences: true, notifyApprovalsOnWhatsApp: true },
    });
    if (!user) return { deliverApp: false };

    // Escopo: pros eventos contextuais (card_*), valida se o user esta no
    // papel certo (lead vs present). Sem scopeCard, falha conservador.
    const prefs = await import('./preferences.types').then((m) => m.resolveNotificationPrefs(user));
    const evtPref = prefs[params.eventKey];
    if (evtPref?.scope) {
      if (!params.scopeCard) return { deliverApp: false };
      if (!passesScope(evtPref.scope, params.userId, params.scopeCard)) {
        return { deliverApp: false };
      }
    }

    // App: respeita o toggle do user
    const deliverApp = shouldNotify(user, params.eventKey, 'app');

    // WhatsApp: enfileira (fire-and-forget) se o user habilitou
    if (shouldNotify(user, params.eventKey, 'whatsapp')) {
      this.waOutbox
        .enqueue({
          userId: params.userId,
          organizationId: params.organizationId,
          event: params.eventKey,
          payload: params.whatsappPayload ?? {
            title: params.title,
            body: params.body,
            cardId: params.entityType === 'card' ? params.entityId : undefined,
          },
        })
        .catch((err) =>
          this.logger.warn(
            `WhatsappOutbox.enqueue falhou pro user ${params.userId}: ${err instanceof Error ? err.message : err}`,
          ),
        );
    }

    return { deliverApp };
  }

  /**
   * Resolve URL pra clique na notif (sino e push). Card → `/?card=X&n=Y`
   * (modal sobre home, board-agnostico). Multi-fluxo: usuario pode nao ter
   * acesso ao board primario do card mas sim ao card via outra presenca —
   * link via board causava 403 nesses casos. Frontend GlobalCardModal
   * cuida do render em qualquer rota fora de /b/.
   */
  private async deriveUrl(
    params: CreateNotificationParams,
    notificationId: string,
  ): Promise<string> {
    if (params.url) return params.url;
    const isCard =
      (params.entityType === 'card' || params.entityType === 'Card') && params.entityId;
    if (isCard) {
      return `/?card=${params.entityId}&n=${notificationId}`;
    }
    return `/?n=${notificationId}`;
  }

  async create(params: CreateNotificationParams) {
    const { deliverApp } = await this.resolveDeliveryGates(params);
    if (!deliverApp) {
      // Pref do user pediu pra silenciar esse evento no app. WhatsApp
      // ja foi tratado em resolveDeliveryGates (enqueue ocorre la mesmo
      // que app esteja off — eventos sao decididos canal-a-canal).
      return null;
    }

    const { url: _urlIn, eventKey: _ek, scopeCard: _sc, whatsappPayload: _wp, ...dbData } = params;
    const created = await this.prisma.notification.create({ data: dbData });
    const url = await this.deriveUrl(params, created.id);

    // Dispara push em background — fire-and-forget, sem bloquear a resposta.
    this.push
      .sendToUser(params.userId, {
        title: params.title,
        body: params.body,
        url,
        tag:
          params.entityType && params.entityId
            ? `${params.entityType}:${params.entityId}`
            : undefined,
        notificationId: created.id,
      })
      .catch((err) => {
        this.logger.warn(
          `Push failed for user ${params.userId}: ${err instanceof Error ? err.message : err}`,
        );
      });

    return { ...created, url };
  }

  async createMany(items: CreateNotificationParams[]) {
    if (items.length === 0) return { count: 0 };

    // Aplica gates 1-a-1 (sequencial porque cada item pode ter user/evento
    // diferente). N callers usam createMany pra notificar varios users
    // de uma vez (ex: comments — autores das menções). Filtra os que o
    // user silenciou; WhatsApp eh enfileirado nos que ele habilitou.
    const filtered: CreateNotificationParams[] = [];
    for (const item of items) {
      const { deliverApp } = await this.resolveDeliveryGates(item);
      if (deliverApp) filtered.push(item);
    }
    if (filtered.length === 0) return { count: 0 };

    const dbItems = filtered.map(
      ({ url: _urlIn, eventKey: _ek, scopeCard: _sc, whatsappPayload: _wp, ...rest }) => rest,
    );
    const result = await this.prisma.notification.createMany({
      data: dbItems,
      skipDuplicates: true,
    });

    // Resolve url pra cada item em paralelo (faz lookups quando necessario)
    const urls = await Promise.all(
      filtered.map((it) => this.deriveUrl(it, '').then((u) => (it.url ? it.url : u))),
    );

    // Push em batch (fire-and-forget). createMany não retorna IDs, entao a URL
    // de fallback nao consegue passar `&n=...` mas o redirect ainda funciona pelo
    // boardId/cardId.
    filtered.forEach((it, i) => {
      this.push
        .sendToUser(it.userId, {
          title: it.title,
          body: it.body,
          url: urls[i] ?? '/',
          tag: it.entityType && it.entityId ? `${it.entityType}:${it.entityId}` : undefined,
        })
        .catch(() => undefined);
    });

    return result;
  }

  async list(userId: string, opts: { onlyUnread?: boolean; take?: number } = {}) {
    const items = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(opts.onlyUnread ? { isRead: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: opts.take ?? 50,
    });

    return items.map((n) => {
      const isCard = (n.entityType === 'card' || n.entityType === 'Card') && n.entityId;
      // URL board-agnostica — modal sobre rota atual via GlobalCardModal.
      const url = isCard ? `/?card=${n.entityId}&n=${n.id}` : `/?n=${n.id}`;
      return { ...n, url };
    });
  }

  /**
   * Variante paginada (cursor-based) pra tela /notificacoes (historico
   * completo). O endpoint `list` segue retornando array pro sininho —
   * separar evita quebra de contrato.
   *
   * Cursor = `id` da ultima notif retornada na pagina anterior. Skip:1
   * pula o proprio cursor pra nao re-entregar.
   */
  async listPaginated(userId: string, opts: { take?: number; cursor?: string } = {}) {
    const take = Math.min(Math.max(opts.take ?? 50, 1), 100);
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: take + 1, // +1 pra detectar se ha proxima pagina
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const trimmed = hasMore ? rows.slice(0, take) : rows;
    const items = trimmed.map((n) => {
      const isCard = (n.entityType === 'card' || n.entityType === 'Card') && n.entityId;
      const url = isCard ? `/?card=${n.entityId}&n=${n.id}` : `/?n=${n.id}`;
      return { ...n, url };
    });
    return {
      items,
      nextCursor: hasMore ? (trimmed[trimmed.length - 1]?.id ?? null) : null,
    };
  }

  countUnread(userId: string) {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }

  async markAsRead(userId: string, notificationId: string) {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true, readAt: new Date() },
    });
    return { ok: true };
  }

  async markAllAsRead(userId: string) {
    const res = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { count: res.count };
  }
}
