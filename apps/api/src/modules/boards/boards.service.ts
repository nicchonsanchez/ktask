import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Board, BoardRole, BoardVisibility, CardOrdering, Prisma } from '@prisma/client';
import { ORG_ROLES_WITH_BOARD_BYPASS } from '@ktask/contracts';

import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { StorageService } from '@/modules/storage/storage.service';

import { BoardAccessService } from './board-access.service';

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

    const boards = await this.prisma.board.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        _count: { select: { cards: true, members: true } },
      },
    });

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
    }));
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
    const [board, completedCount] = await Promise.all([
      this.prisma.board.findUnique({
        where: { id: boardId },
        include: {
          createdBy: { select: { id: true, name: true, avatarUrl: true } },
          lists: {
            where: { isArchived: false },
            orderBy: { position: 'asc' },
            include: {
              cards: {
                where: { isArchived: false, completedAt: null },
                orderBy: { position: 'asc' },
                include: {
                  members: {
                    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
                  },
                  labels: { include: { label: true } },
                  cover: { select: { id: true, storageKey: true, mimeType: true } },
                  _count: { select: { comments: true, attachments: true, checklists: true } },
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
      this.prisma.card.count({
        where: { boardId, isArchived: false, completedAt: { not: null } },
      }),
    ]);
    if (!board) return null;
    return this.hydrateCoverInListResult({ ...board, completedCount, myRole });
  }

  async listCompleted(
    userId: string,
    tenant: TenantContext,
    boardId: string,
    params: { limit?: number; cursor?: string } = {},
  ) {
    await this.access.assertAccess(userId, boardId, tenant, 'VIEWER');
    const limit = Math.min(params.limit ?? 30, 100);

    const items = await this.prisma.card.findMany({
      where: {
        boardId,
        organizationId: tenant.organizationId,
        isArchived: false,
        completedAt: { not: null },
      },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      include: {
        list: { select: { id: true, name: true, isArchived: true } },
        completedBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
        labels: { include: { label: true } },
        _count: { select: { comments: true, attachments: true, checklists: true } },
      },
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    return { items: page, nextCursor };
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
