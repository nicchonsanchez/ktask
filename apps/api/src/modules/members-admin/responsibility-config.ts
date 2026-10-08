/**
 * Doc 55 — troca de usuario dentro do `actionConfig` (JSON) das automacoes.
 *
 * So mexe nas chaves que guardam usuario (userId, userIds, assigneeUserId),
 * em qualquer nivel (itens de checklist e automacoes aninhadas incluidos).
 * Outros campos com o mesmo texto (ex.: corpo de mensagem) ficam intactos.
 */

const SINGLE_KEYS = new Set(['userId', 'assigneeUserId']);
const LIST_KEYS = new Set(['userIds']);

export function configMentionsUser(value: unknown, userId: string): boolean {
  if (Array.isArray(value)) return value.some((v) => configMentionsUser(v, userId));
  if (!value || typeof value !== 'object') return false;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SINGLE_KEYS.has(k) && v === userId) return true;
    if (LIST_KEYS.has(k) && Array.isArray(v) && v.includes(userId)) return true;
    if (typeof v === 'object' && configMentionsUser(v, userId)) return true;
  }
  return false;
}

/** Retorna uma copia com `fromId` trocado por `toId` (sem duplicar em listas). */
export function replaceUserInConfig<T>(value: T, fromId: string, toId: string): T {
  if (Array.isArray(value)) {
    return value.map((v) => replaceUserInConfig(v, fromId, toId)) as unknown as T;
  }
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SINGLE_KEYS.has(k) && v === fromId) {
      out[k] = toId;
    } else if (LIST_KEYS.has(k) && Array.isArray(v)) {
      const next: unknown[] = [];
      for (const id of v) {
        const mapped = id === fromId ? toId : id;
        if (!next.includes(mapped)) next.push(mapped);
      }
      out[k] = next;
    } else {
      out[k] = replaceUserInConfig(v, fromId, toId);
    }
  }
  return out as T;
}

const BOARD_ROLE_RANK = { VIEWER: 0, COMMENTER: 1, EDITOR: 2, ADMIN: 3 } as const;
export type BoardRoleKey = keyof typeof BOARD_ROLE_RANK;

/** Papel mais alto entre dois (quem assume nunca perde acesso que ja tinha). */
export function higherBoardRole(a: BoardRoleKey, b: BoardRoleKey): BoardRoleKey {
  return BOARD_ROLE_RANK[a] >= BOARD_ROLE_RANK[b] ? a : b;
}
