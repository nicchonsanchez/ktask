import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { ORG_ROLES_WITH_BOARD_BYPASS } from '@ktask/contracts';
import { PrismaService } from '@/common/prisma/prisma.service';
import { cardVisibilityWhere } from '@/common/util/card-privacy';
import type { TenantContext } from '@/common/tenant/tenant.types';

export interface SearchResult {
  cards: Array<{
    id: string;
    title: string;
    boardId: string;
    boardName: string;
    listName: string;
    isCompleted: boolean;
  }>;
  boards: Array<{
    id: string;
    name: string;
    color: string | null;
    icon: string | null;
  }>;
  users: Array<{
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  }>;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async global(userId: string, tenant: TenantContext, queryRaw: string): Promise<SearchResult> {
    const q = queryRaw.trim();
    if (q.length < 2) {
      return { cards: [], boards: [], users: [] };
    }

    const bypass = (ORG_ROLES_WITH_BOARD_BYPASS as readonly string[]).includes(tenant.role);

    // Boards visíveis ao user (mesma regra de listForUser)
    const boardWhereBase: Prisma.BoardWhereInput = bypass
      ? { organizationId: tenant.organizationId, isArchived: false }
      : {
          organizationId: tenant.organizationId,
          isArchived: false,
          OR: [
            { members: { some: { userId } } },
            ...(tenant.role !== 'GUEST' ? [{ visibility: 'ORGANIZATION' as const }] : []),
          ],
        };

    const visibleBoards = await this.prisma.board.findMany({
      where: boardWhereBase,
      select: { id: true },
    });
    const visibleBoardIds = visibleBoards.map((b) => b.id);

    // Cards: título contendo q, em boards visíveis, não arquivado.
    // Doc 25: filtra cards privados que o user nao pode ver.
    const cards = visibleBoardIds.length
      ? await this.prisma.card.findMany({
          where: {
            organizationId: tenant.organizationId,
            isArchived: false,
            boardId: { in: visibleBoardIds },
            title: { contains: q, mode: 'insensitive' },
            ...cardVisibilityWhere(userId, tenant.role),
          },
          orderBy: [{ updatedAt: 'desc' }],
          take: 10,
          include: {
            board: { select: { id: true, name: true } },
            list: { select: { name: true } },
          },
        })
      : [];

    // Boards: nome contendo q
    const boards = await this.prisma.board.findMany({
      where: {
        ...boardWhereBase,
        name: { contains: q, mode: 'insensitive' },
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true, name: true, color: true, icon: true },
    });

    // Users: membros da Org com nome/email contendo q
    const users = await this.prisma.user.findMany({
      where: {
        memberships: { some: { organizationId: tenant.organizationId } },
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: { name: 'asc' },
      take: 5,
      select: { id: true, name: true, email: true, avatarUrl: true },
    });

    return {
      cards: cards.map((c) => ({
        id: c.id,
        title: c.title,
        boardId: c.board.id,
        boardName: c.board.name,
        listName: c.list.name,
        isCompleted: !!c.completedAt,
      })),
      boards,
      users,
    };
  }
}
