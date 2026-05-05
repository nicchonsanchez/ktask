import type { Prisma } from '@prisma/client';
import { ORG_ROLES_WITH_BOARD_BYPASS } from '@ktask/contracts';

/**
 * Doc 25: fragment Prisma `where` que filtra cards visiveis pro user.
 *
 * Regras:
 *   - PUBLIC: visivel pra todos
 *   - TEAM_ONLY: so lider (Card.leadId == userId) ou membro (CardMember)
 *   - OWNER/ADMIN/GESTOR da Org: bypass (vem todos)
 *
 * Uso: combinar com outras condicoes via `AND`. Exemplo:
 *
 *   const where: Prisma.CardWhereInput = {
 *     boardId,
 *     ...cardVisibilityWhere(userId, role),
 *   };
 */
export function cardVisibilityWhere(userId: string, orgRole: string): Prisma.CardWhereInput {
  if ((ORG_ROLES_WITH_BOARD_BYPASS as readonly string[]).includes(orgRole)) {
    return {}; // bypass — sem filtro de privacidade
  }
  return {
    OR: [{ privacy: 'PUBLIC' }, { leadId: userId }, { members: { some: { userId } } }],
  };
}

/**
 * Doc 25: helper pra checar visibilidade de um card ja carregado em
 * memoria (sem ir ao DB). Util em GET /cards/:id depois do findUnique.
 */
export function canViewCard(
  card: {
    privacy: string;
    leadId: string | null;
    members?: Array<{ userId: string }>;
  },
  userId: string,
  orgRole: string,
): boolean {
  if ((ORG_ROLES_WITH_BOARD_BYPASS as readonly string[]).includes(orgRole)) return true;
  if (card.privacy === 'PUBLIC') return true;
  if (card.leadId === userId) return true;
  if (card.members?.some((m) => m.userId === userId)) return true;
  return false;
}
