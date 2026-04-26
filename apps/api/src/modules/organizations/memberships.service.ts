import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Membership, OrgRole } from '@prisma/client';
import { ORG_ROLE_RANK } from '@ktask/contracts';
import { PrismaService } from '@/common/prisma/prisma.service';

export interface UpdateRoleParams {
  organizationId: string;
  targetUserId: string;
  newRole: OrgRole;
  actorRole: OrgRole;
  actorUserId: string;
}

@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Carrega a Membership de um usuário numa organização (ou null).
   * Inclui papel — base do tenant isolation.
   */
  findForUserInOrg(userId: string, organizationId: string) {
    return this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
  }

  /**
   * Lista membros da organização (com dados básicos do usuário).
   */
  listByOrg(organizationId: string) {
    return this.prisma.membership.findMany({
      where: { organizationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
            phone: true,
            notifyApprovalsOnWhatsApp: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Altera papel de um membro. Aplica:
   *   - Teto por rank: actor não pode definir papel > seu próprio rank
   *   - ADMIN não rebaixa outro ADMIN (só OWNER faz)
   *   - Não rebaixa o último OWNER
   *   - GESTOR/MEMBER/GUEST não podem atribuir papéis
   */
  async updateRole(params: UpdateRoleParams): Promise<Membership> {
    const { organizationId, targetUserId, newRole, actorRole, actorUserId } = params;

    const actorRank = ORG_ROLE_RANK[actorRole];
    const targetCurrent = await this.findForUserInOrg(targetUserId, organizationId);

    if (!targetCurrent) {
      throw new NotFoundException('Membro não encontrado na organização.');
    }

    // GESTOR/MEMBER/GUEST não podem promover ninguém
    if (actorRank < ORG_ROLE_RANK.GESTOR) {
      throw new ForbiddenException('Sem permissão para alterar papéis.');
    }

    // Teto: actor não pode atribuir papel acima do seu.
    if (ORG_ROLE_RANK[newRole] > actorRank) {
      throw new ForbiddenException('Não é possível atribuir um papel superior ao seu.');
    }

    // Actor não pode alterar papel de alguém com rank >= seu, exceto a si próprio.
    if (
      targetUserId !== actorUserId &&
      ORG_ROLE_RANK[targetCurrent.role] >= actorRank &&
      actorRole !== 'OWNER'
    ) {
      throw new ForbiddenException(
        'Não é possível alterar o papel de alguém no seu nível ou acima.',
      );
    }

    // ADMIN não rebaixa outro ADMIN — só OWNER faz.
    if (
      actorRole === 'ADMIN' &&
      targetCurrent.role === 'ADMIN' &&
      newRole !== 'ADMIN' &&
      targetUserId !== actorUserId
    ) {
      throw new ForbiddenException('Apenas o Dono pode rebaixar um Administrador.');
    }

    // Proteção: não rebaixar o último OWNER.
    if (targetCurrent.role === 'OWNER' && newRole !== 'OWNER') {
      const ownersCount = await this.prisma.membership.count({
        where: { organizationId, role: 'OWNER' },
      });
      if (ownersCount <= 1) {
        throw new ForbiddenException('Não é possível remover o único Dono da organização.');
      }
    }

    return this.prisma.membership.update({
      where: { userId_organizationId: { userId: targetUserId, organizationId } },
      data: { role: newRole },
    });
  }

  /**
   * Remove um membro da organização. Regras análogas ao updateRole:
   * actor deve ter rank suficiente; não remove o último OWNER.
   */
  async remove(params: {
    organizationId: string;
    targetUserId: string;
    actorRole: OrgRole;
    actorUserId: string;
  }): Promise<void> {
    const { organizationId, targetUserId, actorRole, actorUserId } = params;
    const actorRank = ORG_ROLE_RANK[actorRole];

    const target = await this.findForUserInOrg(targetUserId, organizationId);
    if (!target) throw new NotFoundException('Membro não encontrado.');

    if (actorRank < ORG_ROLE_RANK.ADMIN && targetUserId !== actorUserId) {
      throw new ForbiddenException('Sem permissão para remover membros.');
    }

    if (target.role === 'OWNER') {
      const ownersCount = await this.prisma.membership.count({
        where: { organizationId, role: 'OWNER' },
      });
      if (ownersCount <= 1) {
        throw new ForbiddenException('Não é possível remover o único Dono.');
      }
    }

    if (
      targetUserId !== actorUserId &&
      ORG_ROLE_RANK[target.role] >= actorRank &&
      actorRole !== 'OWNER'
    ) {
      throw new ForbiddenException('Não é possível remover alguém no seu nível ou acima.');
    }

    await this.prisma.membership.delete({
      where: { userId_organizationId: { userId: targetUserId, organizationId } },
    });
  }
}
