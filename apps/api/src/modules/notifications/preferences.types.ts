/**
 * Tipos canônicos das preferências de notificação por usuário.
 *
 * O storage real é `User.notificationPreferences: Json?` (Prisma). Esse
 * arquivo concentra os shapes, defaults, e helper de merge — pra que o
 * resto do código não precise se preocupar com "quando a chave existe ou
 * não". Sempre se consulta via `resolveNotificationPrefs(user)`.
 */

/**
 * Eventos que geram notificação. Cada um corresponde a uma chamada de
 * `notifications.create(...)` em algum service. NÃO usar NotificationType
 * (enum do Prisma) — esse é o canal de exibição (in-app), não o evento.
 *
 * Convenção: snake_case derivado de "o que aconteceu".
 */
export type NotificationEventKey =
  // Sem escopo — sempre direcionado pra você
  | 'mention_comment' // Mencionaram você em um comentário
  | 'task_assigned' // Tarefa de checklist atribuída a você
  | 'task_unassigned' // Tarefa removida/desatribuída
  | 'task_due_changed' // Prazo da sua tarefa mudou
  | 'task_due_soon' // Sua tarefa vence em breve
  | 'approval_pending' // Aprovação pendente pra você
  | 'approval_responded' // Aprovação que você pediu foi respondida
  | 'card_lead_assigned' // Você virou líder de um card
  // Com escopo (líder/presente) — você precisa estar relacionado ao card
  | 'card_commented' // Comentaram em card
  | 'card_completed' // Card foi concluído
  | 'card_moved' // Card mudou de coluna
  | 'card_due_changed' // Prazo do card mudou
  | 'card_checklist_changed' // Adicionaram/removeram item no checklist
  | 'card_sla_breach'; // Card ficou atrasado (só `leader`)

/**
 * Eventos que SUPORTAM canal WhatsApp. Outros eventos exibem o toggle
 * mas o backend nunca dispara — a UI mostra como "indisponivel".
 *
 * Critério de inclusão: evento é dirigido a você, urgente E acionável.
 */
export const WHATSAPP_ELIGIBLE_EVENTS = new Set<NotificationEventKey>([
  'mention_comment',
  'task_assigned',
  'task_due_soon',
  'approval_pending',
  'approval_responded',
  'card_lead_assigned',
  'card_sla_breach',
]);

/**
 * Eventos que aceitam escopo "leader|present". Outros ignoram o campo.
 */
export const SCOPED_EVENTS = new Set<NotificationEventKey>([
  'card_commented',
  'card_completed',
  'card_moved',
  'card_due_changed',
  'card_checklist_changed',
  'card_sla_breach',
]);

export type NotificationScope = 'leader' | 'present';

export interface EventPref {
  /** Recebe in-app (sininho + push browser, indistintos). */
  app: boolean;
  /**
   * Recebe via WhatsApp. Sempre `false` pra eventos fora de
   * WHATSAPP_ELIGIBLE_EVENTS, mesmo que o storage diga true (defensivo).
   */
  whatsapp: boolean;
  /**
   * Pros eventos em SCOPED_EVENTS: filtra quando dispara.
   * - `leader`: só quando user é Card.leadId
   * - `present`: quando user é leadId OU member do card (lead implica present)
   *
   * Ignorado pros eventos sem escopo.
   */
  scope?: NotificationScope;
}

export type NotificationPreferences = Partial<Record<NotificationEventKey, EventPref>>;

/**
 * Defaults aplicados quando a chave não existe no JSON do user. Filosofia:
 * - In-app: tudo ligado (descobrir na prática o que silenciar)
 * - WhatsApp: tudo DESLIGADO (opt-in consciente — evita ruído)
 * - Escopo: `present` (cobre lead + member)
 */
export const DEFAULT_PREFS: Record<NotificationEventKey, EventPref> = {
  mention_comment: { app: true, whatsapp: false },
  task_assigned: { app: true, whatsapp: false },
  task_unassigned: { app: true, whatsapp: false },
  task_due_changed: { app: true, whatsapp: false },
  task_due_soon: { app: true, whatsapp: false },
  approval_pending: { app: true, whatsapp: false },
  approval_responded: { app: true, whatsapp: false },
  card_lead_assigned: { app: true, whatsapp: false },
  card_commented: { app: true, whatsapp: false, scope: 'present' },
  card_completed: { app: true, whatsapp: false, scope: 'present' },
  card_moved: { app: true, whatsapp: false, scope: 'present' },
  card_due_changed: { app: true, whatsapp: false, scope: 'present' },
  card_checklist_changed: { app: true, whatsapp: false, scope: 'present' },
  card_sla_breach: { app: true, whatsapp: false, scope: 'leader' },
};

/**
 * Mescla as prefs do user com defaults. Sempre usa essa fn antes de
 * decidir entrega — evita N callers tendo que lidar com "chave ausente".
 *
 * Compat: lê o campo legado `notifyApprovalsOnWhatsApp` (boolean) como
 * fallback de `approval_pending.whatsapp` quando a chave nova não foi
 * setada ainda. Pode ser removido após migração de dados.
 */
export function resolveNotificationPrefs(user: {
  notificationPreferences: unknown;
  notifyApprovalsOnWhatsApp?: boolean;
}): Record<NotificationEventKey, EventPref> {
  const stored = (user.notificationPreferences ?? {}) as NotificationPreferences;
  const result = { ...DEFAULT_PREFS };
  for (const key of Object.keys(DEFAULT_PREFS) as NotificationEventKey[]) {
    if (stored[key]) {
      const def = DEFAULT_PREFS[key];
      const ovr = stored[key]!;
      result[key] = {
        app: typeof ovr.app === 'boolean' ? ovr.app : def.app,
        whatsapp:
          typeof ovr.whatsapp === 'boolean' && WHATSAPP_ELIGIBLE_EVENTS.has(key)
            ? ovr.whatsapp
            : false,
        ...(SCOPED_EVENTS.has(key) ? { scope: ovr.scope ?? def.scope } : {}),
      };
    } else if (key === 'approval_pending' && user.notifyApprovalsOnWhatsApp) {
      // Migração suave do campo legado.
      result[key] = { app: true, whatsapp: true };
    }
  }
  return result;
}

/**
 * Saber se um evento deve gerar entrega num canal especifico.
 * Conveniente pros services:
 *
 *   if (shouldNotify(user, 'mention_comment', 'whatsapp')) { ... }
 */
export function shouldNotify(
  user: { notificationPreferences: unknown; notifyApprovalsOnWhatsApp?: boolean },
  event: NotificationEventKey,
  channel: 'app' | 'whatsapp',
): boolean {
  const prefs = resolveNotificationPrefs(user);
  const pref = prefs[event];
  if (!pref) return false;
  if (channel === 'whatsapp' && !WHATSAPP_ELIGIBLE_EVENTS.has(event)) return false;
  return Boolean(pref[channel]);
}

/**
 * Aplicavel a eventos com escopo: o user esta no escopo certo pra esse card?
 * - leader: user.id === card.leadId
 * - present: user.id === card.leadId OR user esta em CardMember
 *
 * Caller passa `leadId` e `memberUserIds` do card. Se o user nem é lead
 * nem member, retorna false independente da pref.
 */
export function passesScope(
  scope: NotificationScope | undefined,
  userId: string,
  card: { leadId: string | null; memberUserIds: string[] },
): boolean {
  if (!scope) return true;
  const isLead = card.leadId === userId;
  if (scope === 'leader') return isLead;
  if (scope === 'present') return isLead || card.memberUserIds.includes(userId);
  return false;
}
