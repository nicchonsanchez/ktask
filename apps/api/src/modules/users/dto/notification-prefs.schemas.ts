import { z } from 'zod';

/**
 * Schemas Zod das preferências de notificação. Espelha o shape de
 * `preferences.types.ts` do modulo notifications. NÃO importa de la pra
 * evitar acoplamento cruzado (users mexe nos prefs, notifications consome).
 */

const ScopeSchema = z.enum(['leader', 'present']);

const EventPrefSchema = z.object({
  app: z.boolean(),
  whatsapp: z.boolean(),
  scope: ScopeSchema.optional(),
});

const EventKeySchema = z.enum([
  'mention_comment',
  'task_assigned',
  'task_unassigned',
  'task_due_changed',
  'task_due_soon',
  'approval_pending',
  'approval_responded',
  'card_lead_assigned',
  'card_commented',
  'card_completed',
  'card_moved',
  'card_due_changed',
  'card_checklist_changed',
  'card_sla_breach',
]);

/**
 * Body do PATCH /users/me/notification-preferences. Permite atualizar
 * apenas algumas chaves — backend faz merge com o storage atual em vez
 * de exigir o objeto inteiro. Evita race se 2 abas editarem em paralelo.
 */
export const UpdateNotificationPreferencesSchema = z.record(EventKeySchema, EventPrefSchema);
export type UpdateNotificationPreferencesRequest = z.infer<
  typeof UpdateNotificationPreferencesSchema
>;
