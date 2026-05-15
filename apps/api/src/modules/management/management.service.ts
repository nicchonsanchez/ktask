import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';
import { cardVisibilityWhere } from '@/common/util/card-privacy';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { BoardAccessService } from '@/modules/boards/board-access.service';

import type { ManagementArchivedQuery, ManagementListQuery } from './dto/management.schemas';

/**
 * Roles que conseguem abrir a Visao Gerencial. Membros comuns nao —
 * a tela mostra dados consolidados que so faz sentido pra quem gerencia.
 */
const MANAGEMENT_ROLES = new Set(['OWNER', 'ADMIN', 'GESTOR']);

@Injectable()
export class ManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BoardAccessService,
  ) {}

  // ============================================================
  // Listar cards consolidados (visao principal)
  // ============================================================
  async listCards(userId: string, tenant: TenantContext, query: ManagementListQuery) {
    this.assertManagementAccess(tenant);

    const boardIds = await this.access.listAccessibleBoardIds(userId, tenant);
    if (boardIds.length === 0) {
      return {
        items: [],
        total: 0,
        page: query.page,
        pageSize: query.pageSize,
        metrics: emptyMetrics(),
      };
    }

    const where = this.buildWhere(userId, tenant, boardIds, query, /*archived*/ false);

    const [total, items, metrics] = await Promise.all([
      this.prisma.card.count({ where }),
      this.prisma.card.findMany({
        where,
        orderBy: [
          // Atrasados primeiro: dueDate ASC com nulls last
          { dueDate: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: this.cardSelect(),
      }),
      this.computeMetrics(where),
    ]);

    return {
      items: items.map((c) => this.shapeCardItem(c)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      metrics,
    };
  }

  // ============================================================
  // Listar cards arquivados (tela separada)
  // ============================================================
  async listArchivedCards(userId: string, tenant: TenantContext, query: ManagementArchivedQuery) {
    this.assertManagementAccess(tenant);

    const boardIds = await this.access.listAccessibleBoardIds(userId, tenant);
    if (boardIds.length === 0) {
      return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
    }

    const where = this.buildWhere(userId, tenant, boardIds, query, /*archived*/ true);

    // Filtro periodo: usa updatedAt como proxy de archivedAt (KTask nao
    // guarda archivedAt explicito ainda — follow-up).
    if (query.archivedSince !== 'all') {
      const days = { '7d': 7, '30d': 30, '90d': 90 }[query.archivedSince];
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      where.updatedAt = { gte: since };
    }

    const [total, items] = await Promise.all([
      this.prisma.card.count({ where }),
      this.prisma.card.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: { ...this.cardSelect(), updatedAt: true },
      }),
    ]);

    return {
      items: items.map((c) => ({
        ...this.shapeCardItem(c),
        archivedAt: c.updatedAt.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  // ============================================================
  // Internos
  // ============================================================
  private assertManagementAccess(tenant: TenantContext) {
    if (!MANAGEMENT_ROLES.has(tenant.role)) {
      throw new ForbiddenException('Apenas gestores acessam a Visão Gerencial.');
    }
  }

  /**
   * Monta o WHERE consolidado: organizationId + boards acessíveis +
   * visibility filter (privacy) + filtros do query string.
   */
  private buildWhere(
    userId: string,
    tenant: TenantContext,
    boardIds: string[],
    query: ManagementListQuery,
    archived: boolean,
  ): Prisma.CardWhereInput {
    const and: Prisma.CardWhereInput[] = [
      { organizationId: tenant.organizationId },
      { boardId: { in: boardIds } },
      { isArchived: archived },
      cardVisibilityWhere(userId, tenant.role),
    ];

    if (query.q) {
      and.push({ title: { contains: query.q, mode: 'insensitive' } });
    }

    const companyIds = parseCsv(query.companyIds);
    if (companyIds.length > 0) {
      and.push({ contacts: { some: { contactId: { in: companyIds } } } });
    }

    const userIds = parseCsv(query.userIds);
    if (userIds.length > 0) {
      // Match em lead OR member — cobre os 2 papéis que "respondem" pelo card
      and.push({
        OR: [{ leadId: { in: userIds } }, { members: { some: { userId: { in: userIds } } } }],
      });
    }

    const labelIds = parseCsv(query.labelIds);
    if (labelIds.length > 0) {
      and.push({ labels: { some: { labelId: { in: labelIds } } } });
    }

    const filterBoardIds = parseCsv(query.boardIds);
    if (filterBoardIds.length > 0) {
      // Intersecta com os acessiveis — frontend nao deveria mandar boards
      // fora do escopo, mas defesa em profundidade
      and.push({ boardId: { in: filterBoardIds.filter((id) => boardIds.includes(id)) } });
    }

    if (query.dueStatus) {
      and.push(this.dueStatusWhere(query.dueStatus));
    }

    return { AND: and };
  }

  private dueStatusWhere(
    status: NonNullable<ManagementListQuery['dueStatus']>,
  ): Prisma.CardWhereInput {
    const today = startOfDayBRT(new Date());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60_000);
    const in7 = new Date(today.getTime() + 7 * 24 * 60 * 60_000);

    switch (status) {
      case 'noDate':
        return { dueDate: null };
      case 'overdue':
        // dueDate < hoje E nao COMPLETED (atrasado de verdade)
        return { dueDate: { lt: today }, status: { not: 'COMPLETED' } };
      case 'today':
        return { dueDate: { gte: today, lt: tomorrow } };
      case 'next7':
        return { dueDate: { gte: today, lt: in7 } };
    }
  }

  /**
   * Select enxuto pra evitar trazer dados desnecessarios (description,
   * comments, etc). Tabela mostra apenas o que cabe na linha + popovers.
   */
  private cardSelect() {
    return {
      id: true,
      shortCode: true,
      title: true,
      dueDate: true,
      completedAt: true,
      isArchived: true,
      cardColor: true,
      status: true,
      createdAt: true,
      board: { select: { id: true, name: true, color: true } },
      list: { select: { id: true, name: true } },
      lead: { select: { id: true, name: true, avatarUrl: true } },
      members: {
        select: { user: { select: { id: true, name: true, avatarUrl: true } } },
        take: 5,
      },
      labels: {
        select: { label: { select: { id: true, name: true, color: true } } },
        take: 5,
      },
      contacts: {
        where: { contact: { type: 'COMPANY' as const, deletedAt: null } },
        select: { contact: { select: { id: true, name: true } } },
        take: 3,
      },
      _count: { select: { presences: true } },
    } satisfies Prisma.CardSelect;
  }

  private shapeCardItem(
    c: Prisma.CardGetPayload<{ select: ReturnType<ManagementService['cardSelect']> }>,
  ) {
    return {
      id: c.id,
      shortCode: c.shortCode,
      title: c.title,
      dueDate: c.dueDate?.toISOString() ?? null,
      completedAt: c.completedAt?.toISOString() ?? null,
      isArchived: c.isArchived,
      cardColor: c.cardColor,
      status: c.status,
      board: c.board,
      list: c.list,
      lead: c.lead,
      members: c.members.map((m) => m.user),
      labels: c.labels.map((l) => l.label),
      companies: c.contacts.map((x) => x.contact),
      // -1 porque o proprio board primary conta. >1 implica multi-fluxo.
      otherFlowsCount: Math.max(0, c._count.presences - 1),
    };
  }

  /**
   * Metricas no topo da tela: contadores agregados que refletem os
   * mesmos filtros aplicados aos resultados. 4 contagens em paralelo.
   */
  private async computeMetrics(where: Prisma.CardWhereInput) {
    const today = startOfDayBRT(new Date());

    const [total, overdue, distinct] = await Promise.all([
      this.prisma.card.count({ where }),
      this.prisma.card.count({
        where: { AND: [where, { dueDate: { lt: today } }, { status: { not: 'COMPLETED' } }] },
      }),
      this.prisma.card.findMany({
        where,
        select: {
          leadId: true,
          members: { select: { userId: true } },
          contacts: {
            where: { contact: { type: 'COMPANY', deletedAt: null } },
            select: { contactId: true },
          },
        },
      }),
    ]);

    const collaboratorIds = new Set<string>();
    const clientIds = new Set<string>();
    for (const c of distinct) {
      if (c.leadId) collaboratorIds.add(c.leadId);
      for (const m of c.members) collaboratorIds.add(m.userId);
      for (const k of c.contacts) clientIds.add(k.contactId);
    }

    return {
      total,
      overdue,
      collaborators: collaboratorIds.size,
      clients: clientIds.size,
    };
  }
}

function emptyMetrics() {
  return { total: 0, overdue: 0, collaborators: 0, clients: 0 };
}

function parseCsv(s: string | undefined): string[] {
  if (!s) return [];
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Retorna meia-noite BRT (UTC-3) do dia atual. */
function startOfDayBRT(now: Date): Date {
  const brtMs = now.getTime() - 3 * 60 * 60_000;
  const brt = new Date(brtMs);
  brt.setUTCHours(0, 0, 0, 0);
  return new Date(brt.getTime() + 3 * 60 * 60_000);
}
