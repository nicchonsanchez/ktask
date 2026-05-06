import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

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
}
