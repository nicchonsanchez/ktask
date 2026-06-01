import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AutomationOutboxScope, AutomationTrigger } from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { AutomationsOutboxService } from '@/modules/automations/automations.outbox.service';

/**
 * Stats agregados da Org pra dashboards de operacao / debug.
 * Acesso restrito a OWNER/ADMIN — endpoints leem dados de todos os usuarios
 * da Org (resumido em contagens, sem expor titulo/nota/conteudo).
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: AutomationsOutboxService,
  ) {}

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
   *
   * Aceita filtros (from/to/boardIds/leadId) — todos opcionais.
   * Métricas "absolutas" (WIP, atrasados, byColumn, aging) ignoram from/to —
   * são fotos do agora. Métricas "no período" (throughput, completedInPeriod,
   * onTimeRate, reopened) usam from/to.
   */
  async cardsStats(
    tenant: TenantContext,
    params: {
      from?: Date;
      to?: Date;
      boardIds?: string[];
      leadId?: string;
    } = {},
  ) {
    if (tenant.role === 'GUEST') {
      throw new ForbiddenException('Convidados não veem indicadores agregados.');
    }
    const orgId = tenant.organizationId;
    const now = new Date();
    const from = params.from ?? new Date(now.getTime() - 30 * 24 * 60 * 60_000);
    const to = params.to ?? now;
    const periodMs = Math.max(1, to.getTime() - from.getTime());
    const prevFrom = new Date(from.getTime() - periodMs);
    const prevTo = from;

    // Filtros aplicáveis em todas as queries de Card
    const cardFilter: Prisma.CardWhereInput = { organizationId: orgId };
    if (params.boardIds && params.boardIds.length > 0) {
      cardFilter.boardId = { in: params.boardIds };
    }
    if (params.leadId) {
      cardFilter.leadId = params.leadId;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60_000);
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60_000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60_000);

    // Filtros derivados pra ativos / no período
    const activeFilter: Prisma.CardWhereInput = {
      ...cardFilter,
      isArchived: false,
      completedAt: null,
    };
    const completedInPeriodFilter: Prisma.CardWhereInput = {
      ...cardFilter,
      completedAt: { gte: from, lte: to, not: null },
    };
    const completedInPrevFilter: Prisma.CardWhereInput = {
      ...cardFilter,
      completedAt: { gte: prevFrom, lte: prevTo, not: null },
    };

    const [
      total,
      active,
      archived,
      completedTotal,
      completedThisWeek,
      completedThisMonth,
      completedInPeriod,
      completedInPrevPeriod,
      overdue,
      dueToday,
      byBoard,
      topLeads,
      byLabel,
      throughput,
      flowInOut,
      sparkRaw,
      leadTimeRows,
      // Reabertura no período
      reopenedInPeriod,
      reopenedInPrev,
      // Para taxa de "no prazo": cards completados no período com dueDate
      onTimeRows,
      // Aging buckets
      stale7,
      stale30,
      stale60,
      // Top 10 cards mais antigos sem update
      agingSamples,
      // WIP por coluna + última movedAt
      byColumn,
    ] = await Promise.all([
      this.prisma.card.count({ where: cardFilter }),
      this.prisma.card.count({ where: activeFilter }),
      this.prisma.card.count({ where: { ...cardFilter, isArchived: true } }),
      this.prisma.card.count({
        where: { ...cardFilter, completedAt: { not: null } },
      }),
      this.prisma.card.count({
        where: { ...cardFilter, completedAt: { gte: weekAgo } },
      }),
      this.prisma.card.count({
        where: { ...cardFilter, completedAt: { gte: monthAgo } },
      }),
      this.prisma.card.count({ where: completedInPeriodFilter }),
      this.prisma.card.count({ where: completedInPrevFilter }),
      this.prisma.card.count({
        where: {
          ...activeFilter,
          dueDate: { lt: today, not: null },
        },
      }),
      this.prisma.card.count({
        where: {
          ...activeFilter,
          dueDate: { gte: today, lt: tomorrow },
        },
      }),
      this.prisma.card.groupBy({
        by: ['boardId'],
        where: activeFilter,
        _count: { _all: true },
        orderBy: { _count: { boardId: 'desc' } },
        take: 8,
      }),
      this.prisma.card.groupBy({
        by: ['leadId'],
        where: { ...activeFilter, leadId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { leadId: 'desc' } },
        take: 5,
      }),
      this.prisma.cardLabel.groupBy({
        by: ['labelId'],
        where: { card: activeFilter },
        _count: { _all: true },
        orderBy: { _count: { labelId: 'desc' } },
        take: 10,
      }),
      // Throughput diário: completions por dia no período (limitado a 90 dias pra payload).
      this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT DATE_TRUNC('day', "completedAt") as day, COUNT(*)::bigint as count
        FROM "Card"
        WHERE "organizationId" = ${orgId}
          AND "completedAt" >= ${from}
          AND "completedAt" <= ${to}
          ${
            params.boardIds && params.boardIds.length > 0
              ? Prisma.sql`AND "boardId" IN (${Prisma.join(params.boardIds)})`
              : Prisma.empty
          }
        GROUP BY day
        ORDER BY day ASC
      `,
      // Entrada vs saída por dia no período
      this.prisma.$queryRaw<Array<{ day: Date; created: bigint; completed: bigint }>>`
        WITH days AS (
          SELECT generate_series(
            DATE_TRUNC('day', ${from}::timestamp),
            DATE_TRUNC('day', ${to}::timestamp),
            INTERVAL '1 day'
          ) AS day
        ),
        c_created AS (
          SELECT DATE_TRUNC('day', "createdAt") d, COUNT(*)::bigint n
          FROM "Card"
          WHERE "organizationId" = ${orgId}
            AND "createdAt" >= ${from}
            AND "createdAt" <= ${to}
            ${
              params.boardIds && params.boardIds.length > 0
                ? Prisma.sql`AND "boardId" IN (${Prisma.join(params.boardIds)})`
                : Prisma.empty
            }
          GROUP BY d
        ),
        c_completed AS (
          SELECT DATE_TRUNC('day', "completedAt") d, COUNT(*)::bigint n
          FROM "Card"
          WHERE "organizationId" = ${orgId}
            AND "completedAt" >= ${from}
            AND "completedAt" <= ${to}
            ${
              params.boardIds && params.boardIds.length > 0
                ? Prisma.sql`AND "boardId" IN (${Prisma.join(params.boardIds)})`
                : Prisma.empty
            }
          GROUP BY d
        )
        SELECT
          days.day AS day,
          COALESCE(c_created.n, 0) AS created,
          COALESCE(c_completed.n, 0) AS completed
        FROM days
        LEFT JOIN c_created ON c_created.d = days.day
        LEFT JOIN c_completed ON c_completed.d = days.day
        ORDER BY days.day ASC
      `,
      // Sparkline: últimos 7 dias finalizados (granularidade diária).
      this.prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        WITH days AS (
          SELECT generate_series(
            DATE_TRUNC('day', NOW() - INTERVAL '6 days'),
            DATE_TRUNC('day', NOW()),
            INTERVAL '1 day'
          ) AS day
        )
        SELECT days.day AS day,
          COALESCE((
            SELECT COUNT(*)::bigint FROM "Card"
            WHERE "organizationId" = ${orgId}
              AND DATE_TRUNC('day', "completedAt") = days.day
          ), 0) AS count
        FROM days
        ORDER BY days.day ASC
      `,
      // Lead time: ms entre createdAt e completedAt, dos completados no período
      this.prisma.card.findMany({
        where: completedInPeriodFilter,
        select: { createdAt: true, completedAt: true },
      }),
      // Reaberturas: Activity CARD_REOPENED no período
      this.prisma.activity.count({
        where: {
          organizationId: orgId,
          type: 'CARD_UNCOMPLETED',
          createdAt: { gte: from, lte: to },
          ...(params.boardIds && params.boardIds.length > 0
            ? { boardId: { in: params.boardIds } }
            : {}),
        },
      }),
      this.prisma.activity.count({
        where: {
          organizationId: orgId,
          type: 'CARD_UNCOMPLETED',
          createdAt: { gte: prevFrom, lte: prevTo },
          ...(params.boardIds && params.boardIds.length > 0
            ? { boardId: { in: params.boardIds } }
            : {}),
        },
      }),
      this.prisma.card.findMany({
        where: { ...completedInPeriodFilter, dueDate: { not: null } },
        select: { dueDate: true, completedAt: true },
      }),
      this.prisma.card.count({
        where: { ...activeFilter, updatedAt: { lt: weekAgo } },
      }),
      this.prisma.card.count({
        where: {
          ...activeFilter,
          updatedAt: { lt: new Date(today.getTime() - 30 * 24 * 60 * 60_000) },
        },
      }),
      this.prisma.card.count({
        where: {
          ...activeFilter,
          updatedAt: { lt: new Date(today.getTime() - 60 * 24 * 60 * 60_000) },
        },
      }),
      this.prisma.card.findMany({
        where: { ...activeFilter, updatedAt: { lt: weekAgo } },
        orderBy: { updatedAt: 'asc' },
        take: 10,
        select: {
          id: true,
          title: true,
          updatedAt: true,
          board: { select: { id: true, name: true, color: true } },
        },
      }),
      this.prisma.card.findMany({
        where: activeFilter,
        select: {
          id: true,
          updatedAt: true,
          createdAt: true,
          listId: true,
          list: { select: { id: true, name: true, boardId: true } },
        },
      }),
    ]);

    // Resolve nomes de boards + users
    const boardIds = byBoard.map((b) => b.boardId);
    const leadIds = topLeads.map((l) => l.leadId).filter((id): id is string => Boolean(id));
    const labelIds = byLabel.map((l) => l.labelId);

    const [boards, leads, labels, listsBoards] = await Promise.all([
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
      labelIds.length
        ? this.prisma.label.findMany({
            where: { id: { in: labelIds } },
            select: { id: true, name: true, color: true },
          })
        : Promise.resolve([]),
      // Pra agrupar byColumn precisamos do nome do board de cada list distinta
      Promise.resolve([] as Array<{ id: string; name: string }>),
    ]);
    void listsBoards;
    const boardMap = new Map(boards.map((b) => [b.id, b]));
    const leadMap = new Map(leads.map((l) => [l.id, l]));
    const labelMap = new Map(labels.map((l) => [l.id, l]));

    // Lead time stats (em dias)
    const leadTimeDays = leadTimeRows
      .filter((c) => c.completedAt)
      .map((c) => (c.completedAt!.getTime() - c.createdAt.getTime()) / 86_400_000);
    const leadTimeAvg = leadTimeDays.length
      ? leadTimeDays.reduce((a, b) => a + b, 0) / leadTimeDays.length
      : 0;
    const sortedLt = [...leadTimeDays].sort((a, b) => a - b);
    const leadTimeMedian = sortedLt.length ? sortedLt[Math.floor(sortedLt.length / 2)]! : 0;
    const leadTimeP95 = sortedLt.length
      ? sortedLt[Math.min(sortedLt.length - 1, Math.floor(sortedLt.length * 0.95))]!
      : 0;

    // Taxa "no prazo": completedAt <= dueDate
    const onTimeCount = onTimeRows.filter(
      (c) => c.completedAt && c.dueDate && c.completedAt.getTime() <= c.dueDate.getTime(),
    ).length;
    const onTimeDenom = onTimeRows.length;
    const onTimeRate = onTimeDenom > 0 ? onTimeCount / onTimeDenom : null;

    // Tempo médio "desde createdAt" pra cards atualmente em cada lista (proxy
    // de "tempo na coluna atual" — sem snapshot de movements).
    const byColumnAgg = new Map<
      string,
      { listId: string; listName: string; boardId: string; wip: number; sumDays: number }
    >();
    const NOW = Date.now();
    for (const c of byColumn) {
      const k = c.list.id;
      const cur =
        byColumnAgg.get(k) ??
        ({
          listId: c.list.id,
          listName: c.list.name,
          boardId: c.list.boardId,
          wip: 0,
          sumDays: 0,
        } as const);
      const days = (NOW - c.createdAt.getTime()) / 86_400_000;
      byColumnAgg.set(k, { ...cur, wip: cur.wip + 1, sumDays: cur.sumDays + days });
    }
    const boardNamesNeeded = new Set<string>();
    for (const v of byColumnAgg.values()) boardNamesNeeded.add(v.boardId);
    const extraBoards = boardNamesNeeded.size
      ? await this.prisma.board.findMany({
          where: { id: { in: Array.from(boardNamesNeeded) } },
          select: { id: true, name: true, color: true },
        })
      : [];
    const extraBoardMap = new Map(extraBoards.map((b) => [b.id, b]));

    const byColumnOut = Array.from(byColumnAgg.values())
      .map((v) => ({
        list: { id: v.listId, name: v.listName, boardId: v.boardId },
        board: extraBoardMap.get(v.boardId) ?? null,
        wip: v.wip,
        avgDaysInColumn: v.wip ? v.sumDays / v.wip : 0,
      }))
      .sort((a, b) => b.wip - a.wip)
      .slice(0, 12);

    // Sparkline normalizado (7 valores de count diário)
    const sparkThroughput = sparkRaw.map((r) => Number(r.count));
    while (sparkThroughput.length < 7) sparkThroughput.unshift(0);

    // Deltas vs período anterior
    function pct(curr: number, prev: number): number {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 100);
    }

    return {
      summary: {
        total,
        active,
        archived,
        completedTotal,
        completedThisWeek,
        completedThisMonth,
        completedInPeriod,
        wip: active,
        overdue,
        dueToday,
        reopenedInPeriod,
        onTimeRate,
        onTimeNumerator: onTimeCount,
        onTimeDenominator: onTimeDenom,
      },
      period: { from: from.toISOString(), to: to.toISOString() },
      delta: {
        throughput: pct(completedInPeriod, completedInPrevPeriod),
        reopened: pct(reopenedInPeriod, reopenedInPrev),
      },
      sparkline: {
        throughput: sparkThroughput.slice(-7),
      },
      leadTime: {
        avgDays: Math.round(leadTimeAvg * 10) / 10,
        medianDays: Math.round(leadTimeMedian * 10) / 10,
        p95Days: Math.round(leadTimeP95 * 10) / 10,
        sampleSize: leadTimeDays.length,
      },
      aging: {
        buckets: { stale7, stale30, stale60 },
        samples: agingSamples.map((c) => ({
          id: c.id,
          title: c.title,
          board: c.board,
          lastUpdateDays: Math.floor((NOW - c.updatedAt.getTime()) / 86_400_000),
        })),
      },
      byColumn: byColumnOut,
      flowInOut: flowInOut.map((r) => ({
        day: r.day.toISOString(),
        created: Number(r.created),
        completed: Number(r.completed),
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
      byLabel: byLabel.map((l) => ({
        label: labelMap.get(l.labelId) ?? { id: l.labelId, name: 'Desconhecido', color: '#888' },
        count: l._count._all,
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

  /**
   * Doc 38: Stats agregados por Empresa (Contact type=COMPANY).
   * Retorna por empresa: cards criados, cards finalizados, horas
   * registradas (via TimeEntry), cards abertos hoje. Filtros opcionais
   * de periodo e boardId. Inclui linha "(sem empresa)" pra cards sem
   * vinculo, util pra detectar trabalho nao-categorizado.
   *
   * Como CardContact e M:N, um card vinculado a 2 empresas conta nas
   * duas — feature, nao bug (mostra envolvimento real).
   */
  async companiesStats(tenant: TenantContext, params: { from: Date; to: Date; boardId?: string }) {
    if (tenant.role === 'GUEST') {
      throw new ForbiddenException('Convidados não veem indicadores agregados.');
    }
    const orgId = tenant.organizationId;
    const { from, to, boardId } = params;

    // Filtro extra de board (parametrizado pra evitar SQL injection).
    const boardFilter = boardId ? Prisma.sql`AND c."boardId" = ${boardId}` : Prisma.empty;

    // Cards criados no periodo, agrupados por empresa.
    // DISTINCT garante que card com 2 empresas conta em cada uma uma vez,
    // mas nao duplica dentro da mesma empresa (raro mas possivel via legado).
    const created = await this.prisma.$queryRaw<Array<{ contactId: string; count: bigint }>>`
      SELECT cc."contactId", COUNT(DISTINCT c.id)::bigint AS count
      FROM "CardContact" cc
      JOIN "Card" c ON c.id = cc."cardId"
      JOIN "Contact" co ON co.id = cc."contactId"
      WHERE c."organizationId" = ${orgId}
        AND co.type = 'COMPANY' AND co."deletedAt" IS NULL
        AND c."createdAt" >= ${from} AND c."createdAt" <= ${to}
        ${boardFilter}
      GROUP BY cc."contactId"
    `;

    const completed = await this.prisma.$queryRaw<Array<{ contactId: string; count: bigint }>>`
      SELECT cc."contactId", COUNT(DISTINCT c.id)::bigint AS count
      FROM "CardContact" cc
      JOIN "Card" c ON c.id = cc."cardId"
      JOIN "Contact" co ON co.id = cc."contactId"
      WHERE c."organizationId" = ${orgId}
        AND co.type = 'COMPANY' AND co."deletedAt" IS NULL
        AND c."completedAt" IS NOT NULL
        AND c."completedAt" >= ${from} AND c."completedAt" <= ${to}
        ${boardFilter}
      GROUP BY cc."contactId"
    `;

    // Horas: soma durationSec dos TimeEntry encerrados no periodo, do
    // card vinculado a empresa. startedAt usado como referencia
    // temporal (consistente com timesheet).
    const hours = await this.prisma.$queryRaw<Array<{ contactId: string; seconds: bigint }>>`
      SELECT cc."contactId", COALESCE(SUM(te."durationSec"), 0)::bigint AS seconds
      FROM "CardContact" cc
      JOIN "Card" c ON c.id = cc."cardId"
      JOIN "Contact" co ON co.id = cc."contactId"
      JOIN "TimeEntry" te ON te."cardId" = c.id
      WHERE c."organizationId" = ${orgId}
        AND co.type = 'COMPANY' AND co."deletedAt" IS NULL
        AND te."endedAt" IS NOT NULL
        AND te."startedAt" >= ${from} AND te."startedAt" <= ${to}
        ${boardFilter}
      GROUP BY cc."contactId"
    `;

    // Cards atualmente abertos (nao arquivados, nao finalizados) por empresa.
    // Snapshot — nao depende do periodo.
    const open = await this.prisma.$queryRaw<Array<{ contactId: string; count: bigint }>>`
      SELECT cc."contactId", COUNT(DISTINCT c.id)::bigint AS count
      FROM "CardContact" cc
      JOIN "Card" c ON c.id = cc."cardId"
      JOIN "Contact" co ON co.id = cc."contactId"
      WHERE c."organizationId" = ${orgId}
        AND co.type = 'COMPANY' AND co."deletedAt" IS NULL
        AND c."isArchived" = false
        AND c."completedAt" IS NULL
        ${boardFilter}
      GROUP BY cc."contactId"
    `;

    // Linha agregada "sem empresa": cards sem nenhum CardContact COMPANY.
    const noCompanyBoardWhere = boardId ? { boardId } : {};
    const [noCompanyCreated, noCompanyCompleted, noCompanyOpen, noCompanyTime] = await Promise.all([
      this.prisma.card.count({
        where: {
          organizationId: orgId,
          ...noCompanyBoardWhere,
          createdAt: { gte: from, lte: to },
          contacts: { none: { contact: { type: 'COMPANY', deletedAt: null } } },
        },
      }),
      this.prisma.card.count({
        where: {
          organizationId: orgId,
          ...noCompanyBoardWhere,
          completedAt: { gte: from, lte: to, not: null },
          contacts: { none: { contact: { type: 'COMPANY', deletedAt: null } } },
        },
      }),
      this.prisma.card.count({
        where: {
          organizationId: orgId,
          ...noCompanyBoardWhere,
          isArchived: false,
          completedAt: null,
          contacts: { none: { contact: { type: 'COMPANY', deletedAt: null } } },
        },
      }),
      this.prisma.timeEntry.aggregate({
        _sum: { durationSec: true },
        where: {
          organizationId: orgId,
          startedAt: { gte: from, lte: to },
          endedAt: { not: null },
          card: {
            ...(boardId ? { boardId } : {}),
            contacts: { none: { contact: { type: 'COMPANY', deletedAt: null } } },
          },
        },
      }),
    ]);

    // Resolve nomes das empresas que apareceram em qualquer agregacao.
    const contactIds = new Set<string>();
    for (const r of created) contactIds.add(r.contactId);
    for (const r of completed) contactIds.add(r.contactId);
    for (const r of hours) contactIds.add(r.contactId);
    for (const r of open) contactIds.add(r.contactId);

    const companies = contactIds.size
      ? await this.prisma.contact.findMany({
          where: { id: { in: [...contactIds] }, organizationId: orgId },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = new Map(companies.map((c) => [c.id, c.name]));

    const createdMap = new Map(created.map((r) => [r.contactId, Number(r.count)]));
    const completedMap = new Map(completed.map((r) => [r.contactId, Number(r.count)]));
    const hoursMap = new Map(hours.map((r) => [r.contactId, Number(r.seconds)]));
    const openMap = new Map(open.map((r) => [r.contactId, Number(r.count)]));

    const rows = [...contactIds].map((id) => ({
      company: { id, name: nameMap.get(id) ?? 'Desconhecida' },
      cardsCreated: createdMap.get(id) ?? 0,
      cardsCompleted: completedMap.get(id) ?? 0,
      hoursSeconds: hoursMap.get(id) ?? 0,
      cardsOpen: openMap.get(id) ?? 0,
    }));

    // Ordena por horas trabalhadas desc (mais relevante operacionalmente),
    // tie-break por nome.
    rows.sort((a, b) => {
      if (b.hoursSeconds !== a.hoursSeconds) return b.hoursSeconds - a.hoursSeconds;
      return a.company.name.localeCompare(b.company.name, 'pt-BR');
    });

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      boardId: boardId ?? null,
      rows,
      noCompany: {
        cardsCreated: noCompanyCreated,
        cardsCompleted: noCompanyCompleted,
        hoursSeconds: noCompanyTime._sum.durationSec ?? 0,
        cardsOpen: noCompanyOpen,
      },
    };
  }

  private assertAdmin(tenant: TenantContext) {
    if (tenant.role !== 'OWNER' && tenant.role !== 'ADMIN') {
      throw new ForbiddenException('Apenas OWNER ou ADMIN da organização pode ver stats.');
    }
  }

  /**
   * Backfill: garante que todos os boards (nao arquivados) da Org tenham
   * uma coluna isFinalList=true. Idempotente — boards que ja tem nao mudam.
   * Usado pra normalizar boards antigos (importados ou pre-doc-42) que
   * nasceram sem a coluna especial.
   *
   * Importa ListsService como argumento pra evitar circular dependency
   * (Admin <-> Lists). Chamado pelo controller que ja tem ambos injetados.
   */
  async ensureFinalListsAcrossOrg(
    tenant: TenantContext,
    lists: {
      ensureFinalList: (
        boardId: string,
        orgId: string,
      ) => Promise<{ listId: string; created: boolean }>;
      ensureBacklogList: (
        boardId: string,
        orgId: string,
      ) => Promise<{ listId: string; created: boolean }>;
    },
  ) {
    this.assertAdmin(tenant);
    const orgId = tenant.organizationId;
    const boards = await this.prisma.board.findMany({
      where: { organizationId: orgId, isArchived: false },
      select: { id: true, name: true },
    });
    const results = [];
    for (const b of boards) {
      const final = await lists.ensureFinalList(b.id, orgId);
      const backlog = await lists.ensureBacklogList(b.id, orgId);
      results.push({
        boardId: b.id,
        name: b.name,
        finalCreated: final.created,
        backlogCreated: backlog.created,
      });
    }
    return {
      total: boards.length,
      finalCreated: results.filter((r) => r.finalCreated).length,
      backlogCreated: results.filter((r) => r.backlogCreated).length,
      details: results,
    };
  }

  // ========================================================
  // Saude das Automacoes (painel /configuracoes/automacoes)
  // ========================================================

  /**
   * Snapshot consolidado pro painel admin. Retorna:
   *   - 3 contadores (failures 7d, runs RUNNING travados, outbox backlog)
   *   - Lista de AutomationFailure nao-resolvidas (max 50)
   *   - Lista de runs FAILED/ABANDONED recentes (max 50)
   *   - Lista de outbox entries pendentes ha mais tempo (max 20)
   *
   * Tudo em 1 endpoint pra simplificar o frontend — payload total ~50KB.
   */
  async automationsHealth(tenant: TenantContext) {
    this.assertAdmin(tenant);
    const orgId = tenant.organizationId;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

    const [failuresCount, stuckRunsCount, outboxBacklog, failures, recentRuns, outboxPending] =
      await Promise.all([
        this.prisma.automationFailure.count({
          where: { organizationId: orgId, resolvedAt: null, createdAt: { gte: sevenDaysAgo } },
        }),
        this.prisma.automationRun.count({
          where: {
            automation: { organizationId: orgId },
            status: 'RUNNING',
            startedAt: { lt: fiveMinAgo },
          },
        }),
        this.prisma.automationOutbox.count({
          where: { organizationId: orgId, processedAt: null },
        }),
        this.prisma.automationFailure.findMany({
          where: { organizationId: orgId, resolvedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            automation: { select: { id: true, label: true, actionType: true, trigger: true } },
          },
        }),
        this.prisma.automationRun.findMany({
          where: {
            automation: { organizationId: orgId },
            status: { in: ['FAILED', 'ABANDONED'] },
            startedAt: { gte: sevenDaysAgo },
          },
          orderBy: { startedAt: 'desc' },
          take: 50,
          include: {
            automation: { select: { id: true, label: true, actionType: true, trigger: true } },
          },
        }),
        this.prisma.automationOutbox.findMany({
          where: { organizationId: orgId, processedAt: null },
          orderBy: { createdAt: 'asc' }, // mais antigos primeiro (problemas reais)
          take: 20,
        }),
      ]);

    return {
      counters: {
        failures7d: failuresCount,
        stuckRuns: stuckRunsCount,
        outboxBacklog,
      },
      failures: failures.map((f) => ({
        id: f.id,
        automationId: f.automationId,
        automationLabel: f.automation.label,
        automationActionType: f.automation.actionType,
        cardId: f.cardId,
        trigger: f.trigger,
        actionType: f.actionType,
        attempts: f.attempts,
        errorMessage: f.errorMessage,
        createdAt: f.createdAt.toISOString(),
      })),
      recentRuns: recentRuns.map((r) => ({
        id: r.id,
        automationId: r.automationId,
        automationLabel: r.automation.label,
        automationActionType: r.automation.actionType,
        cardId: r.cardId,
        status: r.status,
        error: r.error,
        startedAt: r.startedAt?.toISOString() ?? null,
        finishedAt: r.finishedAt?.toISOString() ?? null,
        chainDepth: r.chainDepth,
      })),
      outboxPending: outboxPending.map((o) => ({
        id: o.id,
        trigger: o.trigger,
        cardId: o.cardId,
        scopeKind: o.scopeKind,
        attempts: o.attempts,
        lastError: o.lastError,
        nextAttemptAt: o.nextAttemptAt.toISOString(),
        createdAt: o.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Reprocessa uma AutomationFailure: cria nova entry na outbox com o
   * payloadSnapshot original (trigger, scopeKind, scopeId, chainDepth)
   * e marca a failure como resolved. Outbox cron pega na proxima rodada.
   *
   * Retorna o ID do novo outbox row pra rastreabilidade.
   */
  async reprocessFailure(tenant: TenantContext, failureId: string) {
    this.assertAdmin(tenant);
    const failure = await this.prisma.automationFailure.findUnique({
      where: { id: failureId },
    });
    if (!failure || failure.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Falha não encontrada.');
    }
    if (failure.resolvedAt) {
      throw new ForbiddenException('Esta falha já foi resolvida.');
    }
    const snap = failure.payloadSnapshot as {
      trigger?: string;
      scopeKind?: string;
      scopeId?: string;
      cardId?: string;
      chainDepth?: number;
    } | null;
    if (!snap || !snap.trigger || !snap.scopeKind || !snap.scopeId || !snap.cardId) {
      throw new ForbiddenException('Snapshot incompleto — não dá pra reprocessar automaticamente.');
    }

    const outbox = await this.outbox.enqueue(this.prisma, {
      organizationId: failure.organizationId,
      trigger: snap.trigger as AutomationTrigger,
      cardId: snap.cardId,
      scopeKind: snap.scopeKind as AutomationOutboxScope,
      scopeId: snap.scopeId,
      chainDepth: snap.chainDepth ?? 0,
    });

    await this.prisma.automationFailure.update({
      where: { id: failureId },
      data: { resolvedAt: new Date() },
    });

    // Push imediato pra latencia baixa — cron pega se falhar.
    void this.outbox.processOne(outbox.id);

    return { ok: true, outboxId: outbox.id };
  }

  /**
   * Marca AutomationFailure como resolvida manualmente (sem reprocessar).
   * Útil pra falhas onde o problema foi corrigido externamente (ex: card
   * foi deletado e a automação não faz mais sentido).
   */
  async resolveFailure(tenant: TenantContext, failureId: string) {
    this.assertAdmin(tenant);
    const failure = await this.prisma.automationFailure.findUnique({
      where: { id: failureId },
      select: { id: true, organizationId: true, resolvedAt: true },
    });
    if (!failure || failure.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Falha não encontrada.');
    }
    if (failure.resolvedAt) {
      return { ok: true, alreadyResolved: true };
    }
    await this.prisma.automationFailure.update({
      where: { id: failureId },
      data: { resolvedAt: new Date() },
    });
    return { ok: true };
  }
}
