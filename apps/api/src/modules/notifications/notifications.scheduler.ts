import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '@/common/prisma/prisma.service';
import { NotificationsService } from './notifications.service';

/**
 * Cron diario que dispara notificacoes de prazo:
 *   - DUE_SOON: cards que vencem nas proximas 24h (hoje + amanha cedo)
 *   - DUE_SOON (forma OVERDUE): cards que venceram ontem ou anteontem e ainda
 *     estao abertos. Usamos o tipo DUE_SOON tambem porque o enum
 *     NotificationType nao tem OVERDUE; o titulo deixa claro.
 *
 * Roda 8h BRT (= 11h UTC). Dedupe simples: nao recria notif do mesmo
 * (cardId, userId, dia BRT) — evita spam quando o cron roda mais de uma vez
 * por dia (ex: redeploy reinicia o agendador).
 *
 * Notifica:
 *   - leadId do card
 *   - membros do card (CardMember)
 */
@Injectable()
export class NotificationsScheduler {
  private readonly logger = new Logger(NotificationsScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // Roda todo dia as 11:00 UTC (8:00 BRT)
  @Cron('0 11 * * *', { timeZone: 'UTC' })
  async dailyDueDateCheck() {
    const now = new Date();
    const todayBRT = new Date(now);
    todayBRT.setUTCHours(0, 0, 0, 0);
    // Comparações usam BRT (UTC-3) — adiciona offset
    const startOfTodayBRT = new Date(todayBRT.getTime() + 3 * 60 * 60_000);
    const endOfTodayBRT = new Date(startOfTodayBRT.getTime() + 24 * 60 * 60_000);
    const twoDaysAgo = new Date(startOfTodayBRT.getTime() - 2 * 24 * 60 * 60_000);

    // 1) DUE_SOON — cards com dueDate hoje (BRT)
    const dueToday = await this.prisma.card.findMany({
      where: {
        isArchived: false,
        completedAt: null,
        dueDate: { gte: startOfTodayBRT, lt: endOfTodayBRT },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        organizationId: true,
        leadId: true,
        members: { select: { userId: true } },
        list: { select: { name: true } },
        board: { select: { name: true } },
      },
    });

    for (const card of dueToday) {
      const where = card.list?.name ? ` (na coluna "${card.list.name}")` : '';
      await this.notifyCardRecipients(card, {
        type: 'DUE_SOON',
        title: `Prazo do card é hoje`,
        body: `O card "${card.title}" vence hoje${where}.`,
      });
    }

    // 2) OVERDUE — cards atrasados (dueDate < hoje BRT, ainda nao completos)
    // Limita aos vencidos nos ultimos 2 dias pra evitar spam de cards velhos esquecidos.
    const overdue = await this.prisma.card.findMany({
      where: {
        isArchived: false,
        completedAt: null,
        dueDate: { gte: twoDaysAgo, lt: startOfTodayBRT },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        organizationId: true,
        leadId: true,
        members: { select: { userId: true } },
        list: { select: { name: true } },
        board: { select: { name: true } },
      },
    });

    for (const card of overdue) {
      const days = card.dueDate
        ? Math.max(1, Math.floor((startOfTodayBRT.getTime() - card.dueDate.getTime()) / 86_400_000))
        : 1;
      const dayLabel = days === 1 ? '1 dia' : `${days} dias`;
      const where = card.list?.name ? ` na coluna "${card.list.name}"` : '';
      await this.notifyCardRecipients(card, {
        type: 'DUE_SOON', // enum nao tem OVERDUE — titulo diferencia
        title: `Card está atrasado`,
        body: `"${card.title}" venceu há ${dayLabel}${where}.`,
      });
    }

    this.logger.log(
      `Daily due check: ${dueToday.length} due-today + ${overdue.length} overdue cards processados`,
    );
  }

  /**
   * Notifica lead + membros de um card. Aplica dedupe por (userId, cardId, type, dia).
   */
  private async notifyCardRecipients(
    card: {
      id: string;
      title: string;
      organizationId: string;
      leadId: string | null;
      members: Array<{ userId: string }>;
    },
    payload: { type: 'DUE_SOON'; title: string; body: string },
  ) {
    const recipientIds = new Set<string>();
    if (card.leadId) recipientIds.add(card.leadId);
    card.members.forEach((m) => recipientIds.add(m.userId));

    if (recipientIds.size === 0) return;

    const since = new Date(Date.now() - 20 * 60 * 60_000); // ultimas 20h
    const existing = await this.prisma.notification.findMany({
      where: {
        userId: { in: [...recipientIds] },
        entityType: 'card',
        entityId: card.id,
        type: payload.type,
        title: payload.title, // dedupe inclui titulo pra differenciar due-today vs overdue
        createdAt: { gte: since },
      },
      select: { userId: true },
    });
    const alreadyNotified = new Set(existing.map((n) => n.userId));

    const toNotify = [...recipientIds].filter((id) => !alreadyNotified.has(id));
    if (toNotify.length === 0) return;

    await Promise.all(
      toNotify.map((userId) =>
        this.notifications.create({
          userId,
          organizationId: card.organizationId,
          type: payload.type,
          title: payload.title,
          body: payload.body,
          entityType: 'card',
          entityId: card.id,
        }),
      ),
    );
  }
}
