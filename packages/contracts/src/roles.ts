import { z } from 'zod';

export const OrgRoleSchema = z.enum(['OWNER', 'ADMIN', 'GESTOR', 'MEMBER', 'GUEST']);
export type OrgRole = z.infer<typeof OrgRoleSchema>;

export const BoardRoleSchema = z.enum(['ADMIN', 'EDITOR', 'COMMENTER', 'VIEWER']);
export type BoardRole = z.infer<typeof BoardRoleSchema>;

export const OrgPlanSchema = z.enum(['INTERNAL', 'FREE', 'PRO', 'ENTERPRISE']);
export type OrgPlan = z.infer<typeof OrgPlanSchema>;

/**
 * Ranking de papéis de Org (maior = mais poder). Usado na regra de teto por rank.
 */
export const ORG_ROLE_RANK: Record<OrgRole, number> = {
  OWNER: 100,
  ADMIN: 80,
  GESTOR: 60,
  MEMBER: 40,
  GUEST: 20,
};

export const BOARD_ROLE_RANK: Record<BoardRole, number> = {
  ADMIN: 100,
  EDITOR: 80,
  COMMENTER: 60,
  VIEWER: 40,
};

/**
 * Papéis de Org que têm acesso implícito (BoardAdmin) a todos os quadros da Org.
 */
export const ORG_ROLES_WITH_BOARD_BYPASS: readonly OrgRole[] = ['OWNER', 'ADMIN', 'GESTOR'];

/**
 * Papéis de Org que podem administrar a Organização (convidar, integrações, billing).
 */
export const ORG_ROLES_ADMIN_ORG: readonly OrgRole[] = ['OWNER', 'ADMIN'];

/**
 * Ator tem bypass administrativo em qualquer quadro da Org (dono/adm/gestor)?
 * Usar em todo lugar que hoje tem `role === 'OWNER' || role === 'ADMIN' || role === 'GESTOR'`
 * pra evitar drift — antes cada callsite reimplementava e alguns esqueciam GESTOR.
 */
export function isOrgAdmin(role: OrgRole): boolean {
  return (ORG_ROLES_WITH_BOARD_BYPASS as readonly OrgRole[]).includes(role);
}

/**
 * Ator pode executar operacoes IRREVERSIVEIS (excluir permanente, purge, deletar
 * template de outro usuario etc.). Mais restrito que isOrgAdmin — deliberadamente
 * exclui GESTOR (gestor gerencia dia-a-dia mas nao apaga). Alinha com
 * ORG_ROLES_ADMIN_ORG. Use em vez de inline `role === 'OWNER' || role === 'ADMIN'`.
 */
export function canPermanentlyDelete(role: OrgRole): boolean {
  return (ORG_ROLES_ADMIN_ORG as readonly OrgRole[]).includes(role);
}

/**
 * Teto por rank: verdadeiro se `actor` pode atribuir/definir papel `target`.
 * Regras extras (ex: ADMIN não rebaixa outro ADMIN) ficam no service de membership.
 */
export function canAssignRole(actorRole: OrgRole, targetRole: OrgRole): boolean {
  return ORG_ROLE_RANK[actorRole] >= ORG_ROLE_RANK[targetRole];
}

/**
 * Nomes das papéis em pt-BR (para UI).
 */
export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  OWNER: 'Dono',
  ADMIN: 'Administrador',
  GESTOR: 'Gestor',
  MEMBER: 'Membro',
  GUEST: 'Convidado',
};

export const BOARD_ROLE_LABELS: Record<BoardRole, string> = {
  ADMIN: 'Admin do quadro',
  EDITOR: 'Editor',
  COMMENTER: 'Comentarista',
  VIEWER: 'Observador',
};
