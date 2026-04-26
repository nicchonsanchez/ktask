import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { BoardAccessService } from '@/modules/boards/board-access.service';

/**
 * CRUD de etiquetas (labels) por board. Hoje toda label pertence a um
 * board específico (boardId NOT NULL no MVP). Labels globais da Org
 * (boardId = null) ficam pra futuro.
 *
 * Permissões:
 *   - Listar: qualquer um com VIEWER no board
 *   - Criar/atualizar/excluir: precisa EDITOR no board
 */
@Injectable()
export class LabelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BoardAccessService,
  ) {}

  async list(userId: string, tenant: TenantContext, boardId: string) {
    await this.access.assertAccess(userId, boardId, tenant, 'VIEWER');
    return this.prisma.label.findMany({
      where: { boardId, organizationId: tenant.organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async create(
    userId: string,
    tenant: TenantContext,
    boardId: string,
    input: { name: string; color: string },
  ) {
    await this.access.assertAccess(userId, boardId, tenant, 'EDITOR');
    return this.prisma.label.create({
      data: {
        organizationId: tenant.organizationId,
        boardId,
        name: input.name,
        color: input.color,
      },
    });
  }

  async update(
    userId: string,
    tenant: TenantContext,
    labelId: string,
    input: { name?: string; color?: string },
  ) {
    const label = await this.prisma.label.findUnique({ where: { id: labelId } });
    if (!label) throw new NotFoundException('Etiqueta não encontrada.');
    if (label.organizationId !== tenant.organizationId) {
      throw new ForbiddenException('Acesso negado.');
    }
    if (label.boardId) {
      await this.access.assertAccess(userId, label.boardId, tenant, 'EDITOR');
    }
    return this.prisma.label.update({
      where: { id: labelId },
      data: { name: input.name, color: input.color },
    });
  }

  async remove(userId: string, tenant: TenantContext, labelId: string) {
    const label = await this.prisma.label.findUnique({ where: { id: labelId } });
    if (!label) throw new NotFoundException('Etiqueta não encontrada.');
    if (label.organizationId !== tenant.organizationId) {
      throw new ForbiddenException('Acesso negado.');
    }
    if (label.boardId) {
      await this.access.assertAccess(userId, label.boardId, tenant, 'EDITOR');
    }
    // CardLabel cascateia (FK ON DELETE CASCADE no schema), então só remover
    // a label já desvincula de todos os cards.
    await this.prisma.label.delete({ where: { id: labelId } });
    return { ok: true };
  }
}
