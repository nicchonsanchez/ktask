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
   * Resolve URL pra clique na notif (sino e push). Card → /b/{boardId}?card=X
   * faz lookup do boardId pra que o front (que ja tem CardModal montado em
   * /b/[boardId]) abra o modal direto. Se o card foi deletado entre criar a
   * notif e clicar, fallback pra home com /n={id}.
   */
  private async deriveUrl(
    params: CreateNotificationParams,
    notificationId: string,
  ): Promise<string> {
    if (params.url) return params.url;
    const isCard =
      (params.entityType === 'card' || params.entityType === 'Card') && params.entityId;
    if (isCard) {
      const card = await this.prisma.card.findUnique({
        where: { id: params.entityId },
        select: { boardId: true },
      });
      if (card) {
        return `/b/${card.boardId}?card=${params.entityId}&n=${notificationId}`;
      }
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

    // Resolve cardId → boardId em batch pra evitar N+1
    const cardIds = items
      .filter((n) => (n.entityType === 'card' || n.entityType === 'Card') && n.entityId)
      .map((n) => n.entityId as string);
    const cardMap = cardIds.length
      ? new Map(
          (
            await this.prisma.card.findMany({
              where: { id: { in: cardIds } },
              select: { id: true, boardId: true },
            })
          ).map((c) => [c.id, c.boardId]),
        )
      : new Map<string, string>();

    return items.map((n) => {
      const boardId =
        (n.entityType === 'card' || n.entityType === 'Card') && n.entityId
          ? cardMap.get(n.entityId)
          : undefined;
      const url = boardId ? `/b/${boardId}?card=${n.entityId}&n=${n.id}` : `/?n=${n.id}`;
      return { ...n, url };
    });
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
