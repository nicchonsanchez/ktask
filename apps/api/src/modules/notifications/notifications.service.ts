import { Injectable, Logger } from '@nestjs/common';
import type { NotificationType } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import { PushService } from '@/modules/push/push.service';

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
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

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
    const { url: _omit, ...dbData } = params;
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
    const dbItems = items.map(({ url: _omit, ...rest }) => rest);
    const result = await this.prisma.notification.createMany({
      data: dbItems,
      skipDuplicates: true,
    });

    // Resolve url pra cada item em paralelo (faz lookups quando necessario)
    const urls = await Promise.all(
      items.map((it) => this.deriveUrl(it, '').then((u) => (it.url ? it.url : u))),
    );

    // Push em batch (fire-and-forget). createMany não retorna IDs, entao a URL
    // de fallback nao consegue passar `&n=...` mas o redirect ainda funciona pelo
    // boardId/cardId.
    items.forEach((it, i) => {
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
