import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import webpush from 'web-push';

import { env } from '@/config/env';
import { PrismaService } from '@/common/prisma/prisma.service';

/**
 * Web Push payload — texto livre serializado em JSON.
 * O service worker no cliente lê e renderiza como notificação nativa.
 */
export interface PushPayload {
  title: string;
  body?: string;
  /** URL pra abrir quando o usuário clica na notificação. */
  url?: string;
  /** Tag pra agrupar/replace de notificações relacionadas (ex: 1 por card). */
  tag?: string;
  /** ID do banco — útil pra marcar como lida ao clicar. */
  notificationId?: string;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
      this.enabled = true;
      this.logger.log('Web Push habilitado.');
    } else {
      this.logger.warn(
        'VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY ausentes — push notifications desabilitadas.',
      );
    }
  }

  isEnabled() {
    return this.enabled;
  }

  getPublicKey() {
    return env.VAPID_PUBLIC_KEY ?? null;
  }

  /**
   * Registra ou atualiza uma subscription. Se o `endpoint` já existir,
   * atualiza as chaves e o userId (caso o usuário tenha trocado de conta
   * no mesmo dispositivo). lastUsedAt vira now em qualquer cenário.
   */
  async subscribe(input: {
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string;
  }) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      update: {
        userId: input.userId,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent,
        lastUsedAt: new Date(),
      },
      create: {
        userId: input.userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
      },
    });
  }

  async unsubscribe(userId: string, endpoint: string) {
    // delete só se for do user (segurança — não dá pra remover sub de outro user)
    const sub = await this.prisma.pushSubscription.findUnique({ where: { endpoint } });
    if (!sub || sub.userId !== userId) return { ok: false };
    await this.prisma.pushSubscription.delete({ where: { endpoint } });
    return { ok: true };
  }

  async listForUser(userId: string) {
    return this.prisma.pushSubscription.findMany({
      where: { userId },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        endpoint: true,
        userAgent: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });
  }

  /**
   * Envia o payload pra TODAS as subs do user. Erros 404/410 (sub gone)
   * removem o registro automaticamente. Outros erros são logados mas não
   * propagam — push é fire-and-forget.
   */
  async sendToUser(
    userId: string,
    payload: PushPayload,
  ): Promise<{ sent: number; pruned: number }> {
    if (!this.enabled) return { sent: 0, pruned: 0 };

    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return { sent: 0, pruned: 0 };

    const data = JSON.stringify(payload);
    let sent = 0;
    let pruned = 0;

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            data,
            { TTL: 60 * 60 * 24 }, // 24h — após isso o push service descarta
          );
          sent++;
          // Atualiza lastUsedAt em background, sem bloquear
          this.prisma.pushSubscription
            .update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } })
            .catch(() => undefined);
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            // Subscription expirou — remove do banco
            await this.prisma.pushSubscription
              .delete({ where: { id: sub.id } })
              .catch(() => undefined);
            pruned++;
          } else {
            this.logger.warn(
              `Falha ao enviar push pra ${sub.endpoint.slice(0, 60)}…: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }
      }),
    );

    return { sent, pruned };
  }
}
