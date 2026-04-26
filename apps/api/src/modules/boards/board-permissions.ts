import type { BoardRole, OrgRole } from '@prisma/client';
import { BOARD_ROLE_RANK, ORG_ROLES_WITH_BOARD_BYPASS } from '@ktask/contracts';

/**
 * MODELO UNIFICADO DE PERMISSÕES (decidido em 2026-04-25).
 *
 * O sistema usa APENAS OrgRole pra decidir capacidades. BoardRole continua
 * existindo no enum por compat retroativa, mas sua interpretação é derivada
 * 100% do OrgRole + flag de acesso (BoardMember). Isso evita a confusão de
 * ter dois níveis de hierarquia (Org × Board).
 *
 * Mapa OrgRole → BoardRole efetivo:
 *   OWNER/ADMIN/GESTOR  →  ADMIN  (configura, gerencia, automações, exclusões)
 *   MEMBER              →  EDITOR (move/edita/comenta/cronômetro/anexa)
 *   GUEST               →  VIEWER (só lê)
 *
 * Acesso ao board:
 *   - Board ORGANIZATION: qualquer membro da Org acessa (com seu role efetivo)
 *   - Board PRIVATE: precisa de BoardMember entry (lista de acesso) OU ser
 *                    OWNER/ADMIN/GESTOR (bypass implícito)
 *
 * O campo BoardMember.role NÃO é mais consultado — é vestigial. Migration
 * pra remover ficou pra depois (tarefa 23 ou similar). Quem é BoardMember
 * só serve como flag de "tem acesso" pra boards PRIVATE.
 */
export function resolveBoardRole(params: {
  orgRole: OrgRole;
  boardMemberRole: BoardRole | null;
  boardVisibility: 'PRIVATE' | 'ORGANIZATION';
}): BoardRole | null {
  const { orgRole, boardMemberRole, boardVisibility } = params;

  // OWNER/ADMIN/GESTOR sempre ADMIN, em qualquer board (mesmo PRIVATE)
  if ((ORG_ROLES_WITH_BOARD_BYPASS as readonly OrgRole[]).includes(orgRole)) {
    return 'ADMIN';
  }

  // Board PRIVATE: sem BoardMember entry → sem acesso
  if (boardVisibility === 'PRIVATE' && !boardMemberRole) {
    return null;
  }

  // A partir daqui: tem acesso (board ORG ou BoardMember entry em PRIVATE).
  // Capacidade vem do OrgRole, não do BoardMember.role.
  if (orgRole === 'MEMBER') return 'EDITOR';
  if (orgRole === 'GUEST') return 'VIEWER';

  return null;
}

export function hasAtLeastBoardRole(actual: BoardRole, required: BoardRole): boolean {
  return BOARD_ROLE_RANK[actual] >= BOARD_ROLE_RANK[required];
}
