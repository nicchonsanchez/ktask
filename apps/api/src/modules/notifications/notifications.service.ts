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
   * Resolve uma URL razoável pra clique na push notification, baseada no
   * entityType/Id quando não há URL explícita. Card → /b/{boardId}?card=X
   * é o ideal mas exige lookup; aqui usamos `/?n={notifId}` como fallback,
   * pra um redirect handler client-side decidir o destino.
   */
  private deriveUrl(params: CreateNotificationParams, notificationId: string): string {
    if (params.url) return params.url;
    if (params.entityType === 'Card' && params.entityId) {
      return `/?card=${params.entityId}&n=${notificationId}`;
    }
    return `/?n=${notificationId}`;
  }

  async create(params: CreateNotificationParams) {
    const { url: _omit, ...dbData } = params;
    const created = await this.prisma.notification.create({ data: dbData });

    // Dispara push em background — fire-and-forget, sem bloquear a resposta.
    this.push
      .sendToUser(params.userId, {
        title: params.title,
        body: params.body,
        url: this.deriveUrl(params, created.id),
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

    return created;
  }

  async createMany(items: CreateNotificationParams[]) {
    if (items.length === 0) return { count: 0 };
    const dbItems = items.map(({ url: _omit, ...rest }) => rest);
    const result = await this.prisma.notification.createMany({
      data: dbItems,
      skipDuplicates: true,
    });

    // Push em batch (1 por user — mas createMany não retorna IDs, então vamos
    // mandar genérico sem notificationId). Fire-and-forget também.
    items.forEach((it) => {
      this.push
        .sendToUser(it.userId, {
          title: it.title,
          body: it.body,
          url: it.url ?? '/',
          tag: it.entityType && it.entityId ? `${it.entityType}:${it.entityId}` : undefined,
        })
        .catch(() => undefined);
    });

    return result;
  }

  list(userId: string, opts: { onlyUnread?: boolean; take?: number } = {}) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(opts.onlyUnread ? { isRead: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: opts.take ?? 50,
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
