import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { Board, BoardRole, BoardVisibility, CardOrdering, Prisma } from '@prisma/client';
import { ORG_ROLES_WITH_BOARD_BYPASS } from '@ktask/contracts';

import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { StorageService } from '@/modules/storage/storage.service';

import { BoardAccessService } from './board-access.service';
import type { DeleteBoardStrategyRequest } from './dto/board.schemas';
import { cardVisibilityWhere } from '@/common/util/card-privacy';

interface CreateBoardInput {
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  visibility?: BoardVisibility;
}

interface UpdateBoardInput {
  name?: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  visibility?: BoardVisibility;
  cardOrdering?: CardOrdering;
  inheritTeamOnNewCards?: boolean;
}

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BoardAccessService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Hidrata `coverImageUrl` em cards do listing — a coluna do Prisma traz
   * só `cover.storageKey` (FK pra Attachment); pra renderizar imagem no
   * frontend, calculamos a URL pública aqui.
   */
  private hydrateCoverInListResult<
    T extends { lists: Array<{ cards: Array<Record<string, unknown>> }> },
  >(board: T): T {
    for (const list of board.lists) {
      list.cards = list.cards.map((c) => {
        const cover = c.cover as { storageKey: string; mimeType: string } | null | undefined;
        if (cover?.storageKey && cover.mimeType.startsWith('image/')) {
          return { ...c, coverImageUrl: this.storage.publicUrlFor(cover.storageKey) };
        }
        return { ...c, coverImageUrl: null };
      });
    }
    return board;
  }

  /**
   * Lista os quadros visíveis ao usuário na Org atual.
   * OWNER/ADMIN/GESTOR veem todos (bypass).
   * MEMBER e GUEST veem BoardMember explícito + qualquer board ORGANIZATION-visible
   * (a diferença está no role efetivo: MEMBER → EDITOR, GUEST → VIEWER, conforme
   * resolveBoardRole). Board PRIVATE só aparece via BoardMember explícito.
   */
  async listForUser(userId: string, tenant: TenantContext) {
    const bypass = (ORG_ROLES_WITH_BOARD_BYPASS as readonly string[]).includes(tenant.role);

    const where: Prisma.BoardWhereInput = bypass
      ? { organizationId: tenant.organizationId, isArchived: false }
      : {
          organizationId: tenant.organizationId,
          isArchived: false,
          OR: [{ members: { some: { userId } } }, { visibility: 'ORGANIZATION' as const }],
        };

    const [boards, favorites] = await Promise.all([
      this.prisma.board.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        include: {
          _count: { select: { cards: true, members: true } },
        },
      }),
      // Doc 36: favoritos do user atual. Usado pra injetar isFavorite no
      // resultado e permitir que o frontend agrupe Favoritos vs Todos.
      this.prisma.boardFavorite.findMany({
        where: { userId },
        select: { boardId: true },
      }),
    ]);
    const favSet = new Set(favorites.map((f) => f.boardId));

    return boards.map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      color: b.color,
      icon: b.icon,
      visibility: b.visibility,
      isArchived: b.isArchived,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      cardsCount: b._count.cards,
      membersCount: b._count.members,
      isFavorite: favSet.has(b.id),
    }));
  }

  /**
   * Doc 36: favorita um board pro user atual. Idempotente — re-favoritar
   * nao duplica nem erra.
   */
  async favorite(userId: string, tenant: TenantContext, boardId: string) {
    // Reaproveita assertAccess: nao deixa favoritar board que o user nao
    // pode ver. VIEWER eh suficiente.
    await this.access.assertAccess(userId, boardId, tenant, 'VIEWER');
    await this.prisma.boardFavorite.upsert({
      where: { userId_boardId: { userId, boardId } },
      update: {},
      create: { userId, boardId },
    });
    return { ok: true };
  }

  async unfavorite(userId: string, _tenant: TenantContext, boardId: string) {
    await this.prisma.boardFavorite
      .delete({ where: { userId_boardId: { userId, boardId } } })
      .catch(() => undefined);
    return { ok: true };
  }

  async create(params: {
    userId: string;
    tenant: TenantContext;
    input: CreateBoardInput;
  }): Promise<Board> {
    const { userId, tenant, input } = params;

    // Quem pode criar fluxo? GESTOR+ apenas (decisão do modelo unificado de roles).
    // MEMBER trabalha nos fluxos existentes mas não cria estrutura nova.
    const allowed: (typeof tenant.role)[] = ['OWNER', 'ADMIN', 'GESTOR'];
    if (!allowed.includes(tenant.role)) {
      throw new ForbiddenException('Apenas Gestor, Administrador ou Dono podem criar fluxos.');
    }

    return this.prisma.$transaction(async (tx) => {
      const board = await tx.board.create({
        data: {
          organizationId: tenant.organizationId,
          name: input.name,
          description: input.description ?? null,
          color: input.color ?? null,
          icon: input.icon ?? null,
          visibility: input.visibility ?? 'PRIVATE',
          createdById: userId,
        },
      });

      // O criador vira BoardMember ADMIN explícito, independente do papel na Org.
      await tx.boardMember.create({
        data: {
          boardId: board.id,
          userId,
          role: 'ADMIN',
        },
      });

      // Listas default
      await tx.list.createMany({
        data: [
          {
            organizationId: tenant.organizationId,
            boardId: board.id,
            name: 'A Fazer',
            position: 1024,
          },
          {
            organizationId: tenant.organizationId,
            boardId: board.id,
            name: 'Fazendo',
            position: 2048,
          },
          {
            organizationId: tenant.organizationId,
            boardId: board.id,
            name: 'Concluído',
            position: 3072,
          },
        ],
      });

      await tx.activity.create({
        data: {
          organizationId: tenant.organizationId,
          boardId: board.id,
          actorId: userId,
          type: 'BOARD_CREATED',
          payload: { boardId: board.id, name: board.name },
        },
      });

      return board;
    });
  }

  async getOne(userId: string, tenant: TenantContext, boardId: string) {
    const { role: myRole } = await this.access.assertAccess(userId, boardId, tenant, 'VIEWER');
    // Cards multi-fluxo (iteração 2): kanban lê de CardPresence em vez de
    // Card.boardId direto. Assim cards vinculados a este board via linkToFlow
    // aparecem aqui mesmo se o Card.boardId primário for outro.
    // Cada presença carrega os dados do Card; a posição/coluna/finalização é
    // por presença (não por Card legacy).
    const [board, completedCount] = await Promise.all([
      this.prisma.board.findUnique({
        where: { id: boardId },
        include: {
          createdBy: { select: { id: true, name: true, avatarUrl: true } },
          lists: {
            where: { isArchived: false },
            orderBy: { position: 'asc' },
            include: {
              cardPresences: {
                where: {
                  removedAt: null,
                  completedAt: null,
                  // Doc 25: filtra cards privados que o user nao pode ver.
                  card: { isArchived: false, ...cardVisibilityWhere(userId, tenant.role) },
                },
                orderBy: { position: 'asc' },
                include: {
                  card: {
                    include: {
                      members: {
                        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
                      },
                      labels: { include: { label: true } },
                      // Doc 38: contatos (incluindo empresas) aparecem no
                      // mini-card e alimentam o filtro "Empresa" do board.
                      contacts: {
                        include: {
                          contact: { select: { id: true, name: true, type: true } },
                        },
                      },
                      cover: { select: { id: true, storageKey: true, mimeType: true } },
                      _count: {
                        select: {
                          comments: true,
                          attachments: true,
                          checklists: true,
                          approvals: { where: { status: 'PENDING' } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          labels: true,
          members: {
            include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
          },
        },
      }),
      this.prisma.cardPresence.count({
        where: {
          boardId,
          removedAt: null,
          completedAt: { not: null },
          card: { isArchived: false },
        },
      }),
    ]);
    if (!board) return null;

    // Transforma list.cardPresences[] em list.cards[] mantendo o contrato
    // antigo da API. Sobrescreve listId/position/completedAt/completedById
    // com valores da PRESENÇA (não do Card legacy), pra refletir o estado
    // independente de cada fluxo.
    const transformedLists = board.lists.map((list) => {
      const cards = list.cardPresences.map((p) => ({
        ...p.card,
        listId: p.listId,
        position: p.position,
        completedAt: p.completedAt,
        completedById: p.completedById,
      }));
      // Remove cardPresences do response (não é parte do contrato público)
      const { cardPresences: _, ...rest } = list;
      return { ...rest, cards };
    });

    return this.hydrateCoverInListResult({
      ...board,
      lists: transformedLists,
      completedCount,
      myRole,
    });
  }

  async listCompleted(
    userId: string,
    tenant: TenantContext,
    boardId: string,
    params: { limit?: number; cursor?: string } = {},
  ) {
    await this.access.assertAccess(userId, boardId, tenant, 'VIEWER');
    const limit = Math.min(params.limit ?? 30, 100);

    // Multi-fluxo: lista as presenças finalizadas neste board (não o Card.completedAt
    // legacy). Assim o "Concluído" deste fluxo só conta o que foi finalizado AQUI,
    // não o que foi finalizado em outro fluxo onde o card também tem presença.
    // Cursor = "{cardId}:{boardId}" pra paginar via composite key.
    const cursorKeys = params.cursor ? params.cursor.split(':') : null;
    const cursorWhere =
      cursorKeys && cursorKeys.length === 2
        ? { cardId_boardId: { cardId: cursorKeys[0]!, boardId: cursorKeys[1]! } }
        : undefined;

    const presences = await this.prisma.cardPresence.findMany({
      where: {
        boardId,
        removedAt: null,
        completedAt: { not: null },
        card: { isArchived: false, organizationId: tenant.organizationId },
      },
      orderBy: [{ completedAt: 'desc' }, { cardId: 'desc' }],
      take: limit + 1,
      ...(cursorWhere ? { cursor: cursorWhere, skip: 1 } : {}),
      include: {
        list: { select: { id: true, name: true, isArchived: true } },
        completedBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
        card: {
          include: {
            labels: { include: { label: true } },
            _count: {
              select: {
                comments: true,
                attachments: true,
                checklists: true,
                approvals: { where: { status: 'PENDING' } },
              },
            },
          },
        },
      },
    });

    const hasMore = presences.length > limit;
    const page = hasMore ? presences.slice(0, limit) : presences;
    const nextCursor = hasMore
      ? (() => {
          const last = page[page.length - 1];
          return last ? `${last.cardId}:${last.boardId}` : null;
        })()
      : null;

    // Transforma em formato de Card (com overrides do presence) pra manter contrato.
    const items = page.map((p) => ({
      ...p.card,
      listId: p.listId,
      list: p.list,
      completedAt: p.completedAt,
      completedById: p.completedById,
      completedBy: p.completedBy,
    }));

    return { items, nextCursor };
  }

  async update(userId: string, tenant: TenantContext, boardId: string, input: UpdateBoardInput) {
    await this.access.assertAccess(userId, boardId, tenant, 'ADMIN');

    const updated = await this.prisma.board.update({
      where: { id: boardId },
      data: {
        name: input.name,
        description: input.description,
        color: input.color,
        icon: input.icon,
        visibility: input.visibility,
        cardOrdering: input.cardOrdering,
        inheritTeamOnNewCards: input.inheritTeamOnNewCards,
      },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId,
        actorId: userId,
        type: 'BOARD_UPDATED',
        payload: { boardId, input } as unknown as Prisma.InputJsonValue,
      },
    });

    return updated;
  }

  async archive(userId: string, tenant: TenantContext, boardId: string) {
    await this.access.assertAccess(userId, boardId, tenant, 'ADMIN');
    const updated = await this.prisma.board.update({
      where: { id: boardId },
      data: { isArchived: true },
    });
    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId,
        actorId: userId,
        type: 'BOARD_ARCHIVED',
        payload: { boardId },
      },
    });
    return updated;
  }

  async restore(userId: string, tenant: TenantContext, boardId: string) {
    await this.access.assertAccess(userId, boardId, tenant, 'ADMIN');
    return this.prisma.board.update({
      where: { id: boardId },
      data: { isArchived: false },
    });
  }

  /**
   * Pre-visualizacao de exclusao (doc 29). Retorna contagens que ajudam o
   * usuario a entender o impacto antes de confirmar. Nao muta nada.
   *
   * exclusiveCards: cards cujo Card.boardId aponta SO pra este board e nao
   *                 tem CardPresence ativa em outro board (orfaos se removido).
   * multiFlowCards: cards deste board que tambem aparecem em outros boards
   *                 via CardPresence. Sao os "preservaveis".
   */
  async deletePreview(userId: string, tenant: TenantContext, boardId: string) {
    await this.access.assertAccess(userId, boardId, tenant, 'ADMIN');

    const board = await this.prisma.board.findFirst({
      where: { id: boardId, organizationId: tenant.organizationId },
      select: { id: true, name: true, isArchived: true },
    });
    if (!board) throw new BadRequestException('Board nao encontrado.');

    // Cards cujo board PRIMARIO eh este. Card.boardId eh NOT NULL no schema,
    // entao todo card "pertence" a um board principal mesmo no modo multi-fluxo.
    const cardsHere = await this.prisma.card.findMany({
      where: { boardId, organizationId: tenant.organizationId },
      select: {
        id: true,
        presences: {
          where: { removedAt: null, boardId: { not: boardId } },
          select: { boardId: true },
        },
      },
    });

    let exclusiveCards = 0;
    let multiFlowCards = 0;
    for (const card of cardsHere) {
      if (card.presences.length > 0) multiFlowCards++;
      else exclusiveCards++;
    }

    const [totalLists, totalActivities] = await Promise.all([
      this.prisma.list.count({ where: { boardId } }),
      this.prisma.activity.count({ where: { boardId } }),
    ]);

    return {
      boardId: board.id,
      boardName: board.name,
      isAlreadyArchived: board.isArchived,
      totalCards: cardsHere.length,
      exclusiveCards,
      multiFlowCards,
      totalLists,
      totalActivities,
    };
  }

  /**
   * Executa exclusao de board com estrategia explicita (doc 29).
   *
   * archive-cascade: marca board.isArchived = true E arquiva cards exclusivos.
   *                  Cards multi-fluxo NAO sao arquivados (continuam vivos
   *                  pelos outros boards). Reversivel via /restore + desarquivar
   *                  cards manualmente.
   * delete-all:      hard delete. Cascade FK do Postgres remove cards,
   *                  presences, listas. Activities com boardId viram orfas
   *                  (campo eh denormalizado, sem FK). Activities ligadas a
   *                  cards apagados vao junto via Card.activities cascade.
   *                  IRREVERSIVEL.
   */
  async executeDelete(
    userId: string,
    tenant: TenantContext,
    boardId: string,
    body: DeleteBoardStrategyRequest,
  ) {
    await this.access.assertAccess(userId, boardId, tenant, 'ADMIN');

    const board = await this.prisma.board.findFirst({
      where: { id: boardId, organizationId: tenant.organizationId },
      select: { id: true, name: true },
    });
    if (!board) throw new BadRequestException('Board nao encontrado.');

    if (body.strategy === 'archive-cascade') {
      // Arquiva cards exclusivos antes de arquivar o board.
      const cardsHere = await this.prisma.card.findMany({
        where: { boardId, organizationId: tenant.organizationId, isArchived: false },
        select: {
          id: true,
          presences: {
            where: { removedAt: null, boardId: { not: boardId } },
            select: { boardId: true },
            take: 1,
          },
        },
      });
      const exclusiveIds = cardsHere.filter((c) => c.presences.length === 0).map((c) => c.id);

      let archivedCards = 0;
      await this.prisma.$transaction(async (tx) => {
        if (exclusiveIds.length > 0) {
          const result = await tx.card.updateMany({
            where: { id: { in: exclusiveIds } },
            data: { isArchived: true },
          });
          archivedCards = result.count;
        }
        await tx.board.update({ where: { id: boardId }, data: { isArchived: true } });
        await tx.activity.create({
          data: {
            organizationId: tenant.organizationId,
            boardId,
            actorId: userId,
            type: 'BOARD_ARCHIVED',
            payload: {
              boardId,
              strategy: 'archive-cascade',
              archivedCards,
            } as unknown as Prisma.InputJsonValue,
          },
        });
      });

      return {
        ok: true,
        strategy: 'archive-cascade' as const,
        archivedCards,
        deletedCards: 0,
      };
    }

    // delete-all: requer confirmacao por nome
    if (body.confirmName.trim() !== board.name.trim()) {
      throw new BadRequestException(
        `Nome de confirmacao nao confere. Digite exatamente "${board.name}".`,
      );
    }

    const [totalCards, totalLists] = await Promise.all([
      this.prisma.card.count({ where: { boardId } }),
      this.prisma.list.count({ where: { boardId } }),
    ]);

    // Activity ANTES do delete pra preservar registro forense — Activity nao
    // tem FK pra Board (boardId eh string denormalizada), entao sobrevive.
    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId,
        actorId: userId,
        type: 'BOARD_DELETED',
        payload: {
          boardId,
          boardName: board.name,
          strategy: 'delete-all',
          deletedCards: totalCards,
          deletedLists: totalLists,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    // Cascade FK no schema cuida do resto: cards, presences, listas, members,
    // labels, automations, comments, attachments, etc.
    await this.prisma.board.delete({ where: { id: boardId } });

    return {
      ok: true,
      strategy: 'delete-all' as const,
      archivedCards: 0,
      deletedCards: totalCards,
      deletedLists: totalLists,
    };
  }

  async addMember(
    userId: string,
    tenant: TenantContext,
    boardId: string,
    memberUserId: string,
    role: BoardRole = 'EDITOR',
  ) {
    await this.access.assertAccess(userId, boardId, tenant, 'ADMIN');

    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId: memberUserId, organizationId: tenant.organizationId },
      },
    });
    if (!membership) {
      throw new BadRequestException('Usuário não pertence à organização.');
    }

    await this.prisma.boardMember.upsert({
      where: { boardId_userId: { boardId, userId: memberUserId } },
      update: { role },
      create: { boardId, userId: memberUserId, role },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId,
        actorId: userId,
        type: 'MEMBER_JOINED_BOARD',
        payload: { boardId, memberId: memberUserId, role },
      },
    });

    return { ok: true };
  }

  async removeMember(userId: string, tenant: TenantContext, boardId: string, memberUserId: string) {
    await this.access.assertAccess(userId, boardId, tenant, 'ADMIN');

    await this.prisma.boardMember
      .delete({ where: { boardId_userId: { boardId, userId: memberUserId } } })
      .catch(() => undefined);

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId,
        actorId: userId,
        type: 'MEMBER_LEFT_BOARD',
        payload: { boardId, memberId: memberUserId },
      },
    });

    return { ok: true };
  }
}
