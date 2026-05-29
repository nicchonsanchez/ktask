import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';
import { cardVisibilityWhere } from '@/common/util/card-privacy';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { BoardAccessService } from '@/modules/boards/board-access.service';

import type {
  ManagementApprovalsQuery,
  ManagementArchivedQuery,
  ManagementListQuery,
} from './dto/management.schemas';

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
  // Aprovacoes (visao gerencial — todas pendentes da org)
  // ============================================================

  /**
   * Lista TODAS as aprovacoes pendentes da org, restritas aos boards que
   * o gestor tem acesso. Diferente de `/me/pending-approvals` (que filtra
   * `reviewers.userId = me`), aqui ele ve aprovacoes de qualquer revisor.
   *
   * Permissao: OWNER/ADMIN/GESTOR (assertManagementAccess).
   * Escopo: cards de boards retornados por `listAccessibleBoardIds` —
   * gestor sem acesso a board X nao ve approvals de cards desse board.
   *
   * Retorna o mesmo shape do `listPendingForUser` pro frontend reusar o
   * componente de card, MAIS um `canDecide: boolean` indicando se o user
   * eh reviewer (front desabilita botoes quando false).
   */
  async listApprovals(userId: string, tenant: TenantContext, query: ManagementApprovalsQuery) {
    this.assertManagementAccess(tenant);

    const boardIds = await this.access.listAccessibleBoardIds(userId, tenant);
    if (boardIds.length === 0) {
      return { items: [], reviewers: [], total: 0 };
    }

    const where: Prisma.CardApprovalWhereInput = {
      organizationId: tenant.organizationId,
      status: 'PENDING',
      card: { boardId: { in: boardIds } },
    };

    // Filtro de idade: requestedAt < (now - N dias)
    if (query.ageFilter !== 'all') {
      const days = query.ageFilter === 'over3d' ? 3 : 7;
      where.requestedAt = { lt: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
    }

    // Filtro por reviewer especifico (dropdown do front)
    if (query.reviewerId) {
      where.reviewers = { some: { userId: query.reviewerId } };
    }

    const approvals = await this.prisma.cardApproval.findMany({
      where,
      orderBy: { requestedAt: 'asc' }, // mais antigas primeiro = mais atrasadas
      include: {
        card: {
          select: {
            id: true,
            title: true,
            boardId: true,
            listId: true,
            board: { select: { id: true, name: true, color: true } },
            list: { select: { id: true, name: true } },
          },
        },
        requestedBy: { select: { id: true, name: true, avatarUrl: true } },
        reviewers: {
          select: {
            id: true,
            userId: true,
            phone: true,
            externalName: true,
            notifiedAt: true,
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    });

    // Lista deduplicada de reviewers internos pendentes — usada pelo
    // dropdown "Filtrar por aprovador" no front. So users (nao phones
    // externos) entram aqui pra simplificar a UX do filtro.
    const reviewerMap = new Map<string, { id: string; name: string; avatarUrl: string | null }>();
    for (const a of approvals) {
      for (const r of a.reviewers) {
        if (r.user && !reviewerMap.has(r.user.id)) {
          reviewerMap.set(r.user.id, r.user);
        }
      }
    }

    // Anexa `canDecide` em cada approval: true se userId logado eh reviewer.
    const items = approvals.map((a) => ({
      ...a,
      canDecide: a.reviewers.some((r) => r.userId === userId),
    }));

    return {
      items,
      reviewers: Array.from(reviewerMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      total: approvals.length,
    };
  }

  // ============================================================
  // Kanban gerencial (colunas virtuais cross-fluxo)
  // ============================================================

  /**
   * Get-or-create da visao Kanban da org (v1: 1 por org). Lazy — primeira
   * vez que alguem abre, cria vazia.
   */
  private async ensureKanbanBoard(userId: string, tenant: TenantContext) {
    const existing = await this.prisma.managementBoard.findFirst({
      where: { organizationId: tenant.organizationId },
      orderBy: { position: 'asc' },
    });
    if (existing) return existing;
    return this.prisma.managementBoard.create({
      data: { organizationId: tenant.organizationId, createdById: userId },
    });
  }

  /**
   * Retorna a config (colunas + fontes) + os cards reais agrupados por
   * coluna virtual. Read-only. Respeita acesso a board + privacidade do card
   * pro viewer. Card que casa em N colunas aparece em todas (D4) com a lista
   * de colunas computada no campo `inColumnIds` de cada item.
   */
  async getKanban(userId: string, tenant: TenantContext) {
    this.assertManagementAccess(tenant);
    const board = await this.ensureKanbanBoard(userId, tenant);

    const columns = await this.prisma.managementColumn.findMany({
      where: { managementBoardId: board.id },
      orderBy: { position: 'asc' },
      include: {
        sources: {
          select: {
            id: true,
            boardId: true,
            listId: true,
            board: { select: { id: true, name: true, color: true } },
            list: { select: { id: true, name: true } },
          },
        },
      },
    });

    const accessibleBoardIds = new Set(await this.access.listAccessibleBoardIds(userId, tenant));

    // Pares (boardId, listId) acessiveis -> colunas que os usam.
    const pairToColumnIds = new Map<string, string[]>();
    const matchPairs: Array<{ boardId: string; listId: string }> = [];
    for (const col of columns) {
      for (const src of col.sources) {
        if (!accessibleBoardIds.has(src.boardId)) continue;
        const key = `${src.boardId}:${src.listId}`;
        const arr = pairToColumnIds.get(key);
        if (arr) {
          arr.push(col.id);
        } else {
          pairToColumnIds.set(key, [col.id]);
          matchPairs.push({ boardId: src.boardId, listId: src.listId });
        }
      }
    }

    // Sem fontes acessiveis: devolve colunas vazias (UI mostra empty/config).
    let cardsByColumn = new Map<string, ReturnType<ManagementService['shapeCardItem']>[]>();
    if (matchPairs.length > 0) {
      const presences = await this.prisma.cardPresence.findMany({
        where: {
          removedAt: null,
          OR: matchPairs.map((p) => ({ boardId: p.boardId, listId: p.listId })),
          card: {
            AND: [
              { organizationId: tenant.organizationId },
              { isArchived: false },
              cardVisibilityWhere(userId, tenant.role),
            ],
          },
        },
        select: {
          boardId: true,
          listId: true,
          card: { select: this.cardSelect() },
        },
      });

      // cardId -> set de colunas onde aparece (pra indicador "também em").
      const columnsByCard = new Map<string, Set<string>>();
      // colId -> (cardId -> shapedCard) pra dedup dentro da coluna.
      const perColumn = new Map<
        string,
        Map<string, ReturnType<ManagementService['shapeCardItem']>>
      >();

      for (const p of presences) {
        const colIds = pairToColumnIds.get(`${p.boardId}:${p.listId}`) ?? [];
        for (const colId of colIds) {
          let cardMap = perColumn.get(colId);
          if (!cardMap) {
            cardMap = new Map();
            perColumn.set(colId, cardMap);
          }
          if (!cardMap.has(p.card.id)) {
            cardMap.set(p.card.id, this.shapeCardItem(p.card));
          }
          let set = columnsByCard.get(p.card.id);
          if (!set) {
            set = new Set();
            columnsByCard.set(p.card.id, set);
          }
          set.add(colId);
        }
      }

      cardsByColumn = new Map(
        [...perColumn.entries()].map(([colId, cardMap]) => [
          colId,
          [...cardMap.values()].map((card) => ({
            ...card,
            // ids de TODAS as colunas onde o card aparece (>1 => repetido).
            inColumnIds: [...(columnsByCard.get(card.id) ?? [])],
          })),
        ]),
      );
    }

    return {
      boardId: board.id,
      name: board.name,
      columns: columns.map((col) => ({
        id: col.id,
        name: col.name,
        position: col.position,
        sources: col.sources.map((s) => ({
          id: s.id,
          boardId: s.boardId,
          listId: s.listId,
          boardName: s.board.name,
          boardColor: s.board.color,
          listName: s.list.name,
        })),
        cards: cardsByColumn.get(col.id) ?? [],
      })),
    };
  }

  // ---- CRUD da config (colunas + fontes) ----

  /** Verifica que a coluna pertence a uma visao da org do user. */
  private async assertColumnInOrg(columnId: string, tenant: TenantContext) {
    const col = await this.prisma.managementColumn.findUnique({
      where: { id: columnId },
      select: { id: true, managementBoard: { select: { organizationId: true } } },
    });
    if (!col || col.managementBoard.organizationId !== tenant.organizationId) {
      throw new ForbiddenException('Coluna não encontrada nesta organização.');
    }
  }

  async createColumn(userId: string, tenant: TenantContext, name: string) {
    this.assertManagementAccess(tenant);
    const board = await this.ensureKanbanBoard(userId, tenant);
    const last = await this.prisma.managementColumn.findFirst({
      where: { managementBoardId: board.id },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    return this.prisma.managementColumn.create({
      data: {
        managementBoardId: board.id,
        name: name.trim() || 'Nova coluna',
        position: (last?.position ?? 0) + 1000,
      },
    });
  }

  async updateColumn(
    _userId: string,
    tenant: TenantContext,
    columnId: string,
    input: { name?: string; position?: number },
  ) {
    this.assertManagementAccess(tenant);
    await this.assertColumnInOrg(columnId, tenant);
    return this.prisma.managementColumn.update({
      where: { id: columnId },
      data: {
        name: input.name?.trim() || undefined,
        position: input.position,
      },
    });
  }

  async deleteColumn(_userId: string, tenant: TenantContext, columnId: string) {
    this.assertManagementAccess(tenant);
    await this.assertColumnInOrg(columnId, tenant);
    await this.prisma.managementColumn.delete({ where: { id: columnId } });
    return { ok: true };
  }

  async addSource(
    _userId: string,
    tenant: TenantContext,
    columnId: string,
    input: { boardId: string; listId: string },
  ) {
    this.assertManagementAccess(tenant);
    await this.assertColumnInOrg(columnId, tenant);
    // Valida que a lista existe, pertence ao board informado e a org.
    const list = await this.prisma.list.findUnique({
      where: { id: input.listId },
      select: { id: true, boardId: true, organizationId: true },
    });
    if (!list || list.boardId !== input.boardId || list.organizationId !== tenant.organizationId) {
      throw new ForbiddenException('Lista inválida pra esta organização.');
    }
    // Idempotente: @@unique(columnId, boardId, listId).
    return this.prisma.managementColumnSource.upsert({
      where: {
        columnId_boardId_listId: { columnId, boardId: input.boardId, listId: input.listId },
      },
      update: {},
      create: { columnId, boardId: input.boardId, listId: input.listId },
    });
  }

  async removeSource(_userId: string, tenant: TenantContext, sourceId: string) {
    this.assertManagementAccess(tenant);
    const src = await this.prisma.managementColumnSource.findUnique({
      where: { id: sourceId },
      select: {
        id: true,
        column: { select: { managementBoard: { select: { organizationId: true } } } },
      },
    });
    if (!src || src.column.managementBoard.organizationId !== tenant.organizationId) {
      throw new ForbiddenException('Fonte não encontrada nesta organização.');
    }
    await this.prisma.managementColumnSource.delete({ where: { id: sourceId } });
    return { ok: true };
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

    // Filtro final-list multi-fluxo: a regra olha pra `CardPresence`, nao
    // pra `Card.listId` (primary). Card pode estar em N boards, em
    // colunas diferentes em cada — basta UM fluxo nao-final pra ser
    // considerado "em aberto" (visao principal). So entra em "finalizado"
    // quando TODOS os fluxos ativos estao em colunas isFinalList=true.
    if (!archived) {
      if (query.onlyFinalLists) {
        // Tem ao menos 1 presence ativa E nenhuma presence ativa em
        // coluna nao-final. (Cards sem presence sao "fantasmas" — fora.)
        and.push({ presences: { some: { removedAt: null } } });
        and.push({
          presences: {
            none: {
              removedAt: null,
              list: { isFinalList: false },
            },
          },
        });
      } else {
        // Tem ao menos 1 presence ativa em coluna nao-final, em qualquer fluxo.
        and.push({
          presences: {
            some: {
              removedAt: null,
              list: { isFinalList: false },
            },
          },
        });
      }
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
