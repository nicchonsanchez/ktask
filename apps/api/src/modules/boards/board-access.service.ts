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
   * Check de acesso a um card considerando multi-fluxo (`CardPresence`) e
   * privacidade (`CardPrivacy`). Use em vez de assertAccess(card.boardId)
   * em operacoes que partem do card (getOne, comentar, anexar, checklist).
   *
   * Regras:
   *  - OWNER/ADMIN/GESTOR da Org: bypass sempre.
   *  - card.privacy = TEAM_ONLY: user precisa ser `leadId` ou estar em
   *    `CardMember`. Board e ignorado.
   *  - card.privacy = PUBLIC: user precisa ter acesso (>= required) a
   *    pelo menos um board onde o card tem `CardPresence` ativa OU ao
   *    `card.boardId` legacy (presenca primaria).
   *
   * Retorna a maior role que o user tem entre os boards acessiveis (so
   * usado por callers que querem saber se podem editar/etc — quem so
   * precisa "passou ou nao" ignora).
   */
  async assertCardAccess(
    userId: string,
    cardId: string,
    tenant: TenantContext,
    required: BoardRole = 'VIEWER',
    // BUG FIX: por padrao, a soft-delete extension injeta `deletedAt: null`
    // nas queries de `prisma.card`. Isso fazia restoreFromTrash quebrar:
    // o card EXISTE no DB (com deletedAt != null), mas assertCardAccess o
    // achava como inexistente -> NotFoundException -> ninguem conseguia
    // restaurar. Passar `includeTrashed: true` em endpoints que precisam
    // operar SOBRE o card na lixeira (restoreFromTrash). Os demais
    // callers seguem com o default (so cards vivos).
    options: { includeTrashed?: boolean } = {},
  ): Promise<{ role: BoardRole }> {
    const cardDelegate = options.includeTrashed ? this.prisma.raw.card : this.prisma.card;
    const card = await cardDelegate.findUnique({
      where: { id: cardId },
      select: {
        id: true,
        organizationId: true,
        boardId: true,
        privacy: true,
        leadId: true,
        members: { where: { userId }, select: { userId: true } },
        presences: {
          where: { removedAt: null },
          select: { boardId: true },
        },
      },
    });

    if (!card || card.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Card não encontrado.');
    }

    const isOrgAdmin =
      tenant.role === 'OWNER' || tenant.role === 'ADMIN' || tenant.role === 'GESTOR';

    // TEAM_ONLY: so lider, membros do card ou admin da Org veem.
    if (card.privacy === 'TEAM_ONLY' && !isOrgAdmin) {
      const isLead = card.leadId === userId;
      const isMember = card.members.length > 0;
      if (!isLead && !isMember) {
        throw new ForbiddenException('Card privado — apenas líder e equipe.');
      }
      // TEAM_ONLY: returna role do board primario pra honrar required
      // (lider pode editar; membro pode comentar etc.). Se nao tiver
      // acesso ao board primario, devolve EDITOR como minimo (lider sempre
      // pode mexer no card; membros podem comentar). Mantemos verificacao
      // de `required` abaixo via assertAccess.
      try {
        return await this.assertAccess(userId, card.boardId, tenant, required);
      } catch {
        // Lider/membro do card sem acesso ao board: ainda permite VIEWER
        // (modal abre). EDITOR e acima exigem acesso ao board.
        if (required === 'VIEWER') return { role: 'VIEWER' };
        throw new ForbiddenException(`Permissão insuficiente (requer ${required}).`);
      }
    }

    // PUBLIC (ou admin Org passa por cima): user precisa ter acesso a
    // pelo menos UM board onde o card aparece. Inclui card.boardId
    // legacy + presencas ativas.
    const candidateBoardIds = new Set<string>([
      card.boardId,
      ...card.presences.map((p) => p.boardId),
    ]);

    let lastError: Error | null = null;
    for (const boardId of candidateBoardIds) {
      try {
        return await this.assertAccess(userId, boardId, tenant, required);
      } catch (err) {
        lastError = err as Error;
      }
    }

    // Nenhum board acessivel
    throw lastError ?? new ForbiddenException('Sem acesso a nenhum quadro deste card.');
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
