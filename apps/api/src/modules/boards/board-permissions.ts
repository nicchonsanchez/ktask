import type { BoardRole, OrgRole } from '@prisma/client';
import { BOARD_ROLE_RANK, ORG_ROLES_WITH_BOARD_BYPASS } from '@ktask/contracts';

/**
 * Resolve o BoardRole efetivo do usuário em um quadro específico.
 *
 * Regras:
 * - OWNER/ADMIN/GESTOR da Org têm BoardRole=ADMIN implícito em qualquer quadro.
 * - BoardMember explícito sempre prevalece (independente do orgRole) — exceto
 *   quando o orgRole já daria ADMIN implícito acima.
 * - Em board.visibility=ORGANIZATION (sem BoardMember explícito):
 *   - MEMBER recebe EDITOR (pode mover, editar, comentar — não pode mexer em
 *     configurações do board, que requerem ADMIN).
 *   - GUEST recebe VIEWER (só lê).
 * - Em board.visibility=PRIVATE: precisa de BoardMember explícito; senão null.
 * - Retorna null se o usuário não pode acessar.
 */
export function resolveBoardRole(params: {
  orgRole: OrgRole;
  boardMemberRole: BoardRole | null;
  boardVisibility: 'PRIVATE' | 'ORGANIZATION';
}): BoardRole | null {
  const { orgRole, boardMemberRole, boardVisibility } = params;

  if ((ORG_ROLES_WITH_BOARD_BYPASS as readonly OrgRole[]).includes(orgRole)) {
    return 'ADMIN';
  }

  if (boardMemberRole) return boardMemberRole;

  if (boardVisibility === 'ORGANIZATION') {
    if (orgRole === 'MEMBER') return 'EDITOR';
    if (orgRole === 'GUEST') return 'VIEWER';
  }

  return null;
}

export function hasAtLeastBoardRole(actual: BoardRole, required: BoardRole): boolean {
  return BOARD_ROLE_RANK[actual] >= BOARD_ROLE_RANK[required];
}
