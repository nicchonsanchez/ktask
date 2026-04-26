import { ForbiddenException, Injectable } from '@nestjs/common';

import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';

/**
 * Stats agregados da Org pra dashboards de operacao / debug.
 * Acesso restrito a OWNER/ADMIN — endpoints leem dados de todos os usuarios
 * da Org (resumido em contagens, sem expor titulo/nota/conteudo).
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Estatisticas de Time Tracking da Org logada.
   * Foco em counts agregados pra responder "ja temos registros?" / "quem mais usa?".
   */
  async timeTrackingStats(tenant: TenantContext) {
    this.assertAdmin(tenant);
    const orgId = tenant.organizationId;

    const [total, active, bySource, topUsers, lastEntries] = await Promise.all([
      this.prisma.timeEntry.count({ where: { organizationId: orgId } }),
      this.prisma.timeEntry.count({
        where: { organizationId: orgId, endedAt: null },
      }),
      this.prisma.timeEntry.groupBy({
        by: ['source'],
        where: { organizationId: orgId },
        _count: { _all: true },
        _sum: { durationSec: true },
      }),
      this.prisma.timeEntry.groupBy({
        by: ['userId'],
        where: { organizationId: orgId, endedAt: { not: null } },
        _count: { _all: true },
        _sum: { durationSec: true },
        orderBy: { _sum: { durationSec: 'desc' } },
        take: 5,
      }),
      this.prisma.timeEntry.findMany({
        where: { organizationId: orgId },
        orderBy: { startedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          userId: true,
          cardId: true,
          source: true,
          startedAt: true,
          endedAt: true,
          durationSec: true,
          user: { select: { id: true, name: true } },
          card: { select: { id: true, title: true, board: { select: { name: true } } } },
        },
      }),
    ]);

    // resolve nomes dos top users
    const userIds = topUsers.map((u) => u.userId);
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true, avatarUrl: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      total,
      active, // entries em andamento (endedAt null)
      bySource: bySource.map((s) => ({
        source: s.source,
        count: s._count._all,
        totalSec: s._sum.durationSec ?? 0,
      })),
      topUsers: topUsers.map((u) => ({
        user: userMap.get(u.userId) ?? { id: u.userId, name: 'Desconhecido' },
        count: u._count._all,
        totalSec: u._sum.durationSec ?? 0,
      })),
      lastEntries,
    };
  }

  /**
   * Stats de cards da Org logada — pra dashboard /indicadores/cards.
   * Aberto pra qualquer membro autenticado (não só ADMIN) já que são contagens
   * agregadas, não dados sensíveis. OWNER/ADMIN/GESTOR/MEMBER veem; GUEST não.
   */
  async cardsStats(tenant: TenantContext) {
    if (tenant.role === 'GUEST') {
      throw new ForbiddenException('Convidados não veem indicadores agregados.');
    }
    const orgId = tenant.organizationId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60_000);
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60_000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60_000);

    const [
      total,
      active,
      archived,
      completedTotal,
      completedThisWeek,
      completedThisMonth,
      overdue,
      dueToday,
      byPriority,
      byBoard,
      topLeads,
      throughput,
    ] = await Promise.all([
      this.prisma.card.count({ where: { organizationId: orgId } }),
      this.prisma.card.count({
        where: { organizationId: orgId, isArchived: false, completedAt: null },
      }),
      this.prisma.card.count({ where: { organizationId: orgId, isArchived: true } }),
      this.prisma.card.count({
        where: { organizationId: orgId, completedAt: { not: null } },
      }),
      this.prisma.card.count({
        where: { organizationId: orgId, completedAt: { gte: weekAgo } },
      }),
      this.prisma.card.count({
        where: { organizationId: orgId, completedAt: { gte: monthAgo } },
      }),
      this.prisma.card.count({
        where: {
          organizationId: orgId,
          isArchived: false,
          completedAt: null,
          dueDate: { lt: today, not: null },
        },
      }),
      this.prisma.card.count({
        where: {
          organizationId: orgId,
          isArchived: false,
          completedAt: null,
          dueDate: { gte: today, lt: tomorrow },
        },
      }),
      this.prisma.card.groupBy({
        by: ['priority'],
        where: { organizationId: orgId, isArchived: false, completedAt: null },
        _count: { _all: true },
      }),
      this.prisma.card.groupBy({
        by: ['boardId'],
        where: { organizationId: orgId, isArchived: false, completedAt: null },
        _count: { _all: true },
        orderBy: { _count: { boardId: 'desc' } },
        take: 8,
      }),
      this.prisma.card.groupBy({
        by: ['leadId'],
        where: {
          organizationId: orgId,
          isArchived: false,
          completedAt: null,
          leadId: { not: null },
        },
        _count: { _all: true },
        orderBy: { _count: { leadId: 'desc' } },
        take: 5,
      }),
      // Throughput: completions agrupadas por dia nos últimos 30 dias.
      // Usa $queryRaw porque Prisma não suporta DATE_TRUNC nativo.
      this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT DATE_TRUNC('day', "completedAt") as day, COUNT(*)::bigint as count
        FROM "Card"
        WHERE "organizationId" = ${orgId}
          AND "completedAt" >= ${monthAgo}
        GROUP BY day
        ORDER BY day ASC
      `,
    ]);

    // Resolve nomes de boards + users
    const boardIds = byBoard.map((b) => b.boardId);
    const leadIds = topLeads.map((l) => l.leadId).filter((id): id is string => Boolean(id));

    const [boards, leads] = await Promise.all([
      boardIds.length
        ? this.prisma.board.findMany({
            where: { id: { in: boardIds } },
            select: { id: true, name: true, color: true, icon: true },
          })
        : Promise.resolve([]),
      leadIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: leadIds } },
            select: { id: true, name: true, avatarUrl: true },
          })
        : Promise.resolve([]),
    ]);
    const boardMap = new Map(boards.map((b) => [b.id, b]));
    const leadMap = new Map(leads.map((l) => [l.id, l]));

    return {
      summary: {
        total,
        active,
        archived,
        completedTotal,
        completedThisWeek,
        completedThisMonth,
        overdue,
        dueToday,
      },
      byPriority: byPriority.map((p) => ({
        priority: p.priority,
        count: p._count._all,
      })),
      byBoard: byBoard.map((b) => ({
        board: boardMap.get(b.boardId) ?? {
          id: b.boardId,
          name: 'Desconhecido',
          color: null,
          icon: null,
        },
        count: b._count._all,
      })),
      topLeads: topLeads.map((l) => ({
        user: l.leadId
          ? (leadMap.get(l.leadId) ?? { id: l.leadId, name: 'Desconhecido', avatarUrl: null })
          : null,
        count: l._count._all,
      })),
      throughput: throughput.map((t) => ({
        day: t.day.toISOString(),
        count: Number(t.count),
      })),
    };
  }

  /**
   * Stats de tarefas (ChecklistItem) — pra dashboard /indicadores/tarefas.
   */
  async tasksStats(tenant: TenantContext) {
    if (tenant.role === 'GUEST') {
      throw new ForbiddenException('Convidados não veem indicadores agregados.');
    }
    const orgId = tenant.organizationId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60_000);

    // Tasks vivem em ChecklistItem ligado a Checklist → Card → orgId.
    // Não tem orgId direto na tabela; filtramos via card.organizationId.
    const baseWhere = {
      checklist: { card: { organizationId: orgId } },
    };

    const [total, done, overdue, byPriority, byAssignee, doneByDay] = await Promise.all([
      this.prisma.checklistItem.count({ where: baseWhere }),
      this.prisma.checklistItem.count({ where: { ...baseWhere, isDone: true } }),
      this.prisma.checklistItem.count({
        where: {
          ...baseWhere,
          isDone: false,
          dueDate: { lt: today, not: null },
        },
      }),
      this.prisma.checklistItem.groupBy({
        by: ['priority'],
        where: { ...baseWhere, isDone: false },
        _count: { _all: true },
      }),
      this.prisma.checklistItem.groupBy({
        by: ['assigneeId'],
        where: { ...baseWhere, isDone: false, assigneeId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { assigneeId: 'desc' } },
        take: 5,
      }),
      this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT DATE_TRUNC('day', ci."doneAt") as day, COUNT(*)::bigint as count
        FROM "ChecklistItem" ci
        JOIN "Checklist" cl ON cl.id = ci."checklistId"
        JOIN "Card" c ON c.id = cl."cardId"
        WHERE c."organizationId" = ${orgId}
          AND ci."doneAt" >= ${monthAgo}
        GROUP BY day
        ORDER BY day ASC
      `,
    ]);

    const assigneeIds = byAssignee
      .map((a) => a.assigneeId)
      .filter((id): id is string => Boolean(id));
    const assignees = assigneeIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: assigneeIds } },
          select: { id: true, name: true, avatarUrl: true },
        })
      : [];
    const assigneeMap = new Map(assignees.map((a) => [a.id, a]));

    return {
      summary: {
        total,
        done,
        active: total - done,
        overdue,
        completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
      },
      byPriority: byPriority.map((p) => ({
        priority: p.priority,
        count: p._count._all,
      })),
      byAssignee: byAssignee.map((a) => ({
        user: a.assigneeId
          ? (assigneeMap.get(a.assigneeId) ?? {
              id: a.assigneeId,
              name: 'Desconhecido',
              avatarUrl: null,
            })
          : null,
        count: a._count._all,
      })),
      doneByDay: doneByDay.map((t) => ({
        day: t.day.toISOString(),
        count: Number(t.count),
      })),
    };
  }

  private assertAdmin(tenant: TenantContext) {
    if (tenant.role !== 'OWNER' && tenant.role !== 'ADMIN') {
      throw new ForbiddenException('Apenas OWNER ou ADMIN da organização pode ver stats.');
    }
  }
}
