import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { BoardRole } from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';

import { hasAtLeastBoardRole, resolveBoardRole } from './board-permissions';

/**
 * Centraliza o check de acesso a um board específico para o usuário autenticado.
 * Use em qualquer service que manipula List/Card/Comment/etc.
 */
@Injectable()
export class BoardAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAccess(
    userId: string,
    boardId: string,
    tenant: TenantContext,
    required: BoardRole = 'VIEWER',
  ): Promise<{ role: BoardRole }> {
    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      include: {
        members: { where: { userId } },
      },
    });

    if (!board || board.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Quadro não encontrado.');
    }

    const boardMemberRole = board.members[0]?.role ?? null;
    const role = resolveBoardRole({
      orgRole: tenant.role,
      boardMemberRole,
      boardVisibility: board.visibility,
    });

    if (!role) {
      throw new ForbiddenException('Sem acesso a este quadro.');
    }

    if (!hasAtLeastBoardRole(role, required)) {
      throw new ForbiddenException(`Permissão insuficiente (requer ${required}).`);
    }

    return { role };
  }

  /**
   * Doc 40: lista IDs de boards onde o user tem pelo menos VIEWER.
   * OWNER/ADMIN/GESTOR tem bypass — veem todos da Org.
   * Usado pra filtrar dados ao "ver como" outro membro: gestor so ve
   * cards do membro nos boards que ele proprio tambem tem acesso.
   */
  async listAccessibleBoardIds(userId: string, tenant: TenantContext): Promise<string[]> {
    const bypass = tenant.role === 'OWNER' || tenant.role === 'ADMIN' || tenant.role === 'GESTOR';
    const where = bypass
      ? { organizationId: tenant.organizationId, isArchived: false }
      : {
          organizationId: tenant.organizationId,
          isArchived: false,
          OR: [{ members: { some: { userId } } }, { visibility: 'ORGANIZATION' as const }],
        };
    const boards = await this.prisma.board.findMany({ where, select: { id: true } });
    return boards.map((b) => b.id);
  }
}
