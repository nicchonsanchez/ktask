import { z } from 'zod';

const TagsConditionSchema = z.object({
  field: z.literal('tags'),
  operator: z.enum(['containsAny', 'notContainsAny', 'containsAll', 'notContainsAll']),
  value: z.array(z.string().cuid()).min(1),
});

const LeadConditionSchema = z.object({
  field: z.literal('lead'),
  operator: z.enum(['is', 'isNot', 'isAny', 'isSet', 'isNotSet']),
  value: z.array(z.string().cuid()).optional(),
});

const DueDateConditionSchema = z.object({
  field: z.literal('dueDate'),
  operator: z.enum([
    'overdue',
    'dueToday',
    'dueWithinDays',
    'dueAfterDays',
    'hasDueDate',
    'noDueDate',
  ]),
  value: z.number().int().min(0).max(365).optional(),
});

export const AutomationConditionSchema = z.discriminatedUnion('field', [
  TagsConditionSchema,
  LeadConditionSchema,
  DueDateConditionSchema,
]);

export const AutomationConditionsSchema = z.array(AutomationConditionSchema).max(10);

export const AutomationTriggerSchema = z.enum([
  'CARD_ENTERED',
  'CARD_LEFT',
  'TIME_IN_LIST',
  'TIME_NO_INTERACTION',
  'DUE_DATE_TODAY',
  'DUE_DATE_OVERDUE',
  'CARD_APPROVED',
  'CARD_REJECTED',
]);

export const AutomationActionTypeSchema = z.enum([
  'INSERT_TAGS',
  'REMOVE_TAGS',
  'INSERT_CHECKLIST_ITEMS',
  'INSERT_CHECKLIST_GROUP',
  'SET_CARD_STATUS',
  'FILL_FIELDS',
  'SAVE_DESCRIPTION_VERSION',
  'SET_LEAD',
  'ADD_TEAM',
  'POST_COMMENT',
  'CREATE_CHILD_CARD',
  'SEND_EMAIL',
  'SEND_WHATSAPP',
  'LINK_FLOW',
  'UNLINK_FLOW',
  'UPDATE_FLOW_POSITION',
  'FLAG_DUE_TODAY',
  'FLAG_OVERDUE',
  'SET_PRIVACY',
]);

/**
 * Body do POST /lists/:listId/automations.
 *
 * triggerConfig e actionConfig são JSON livres por enquanto — cada
 * action handler valida o seu próprio shape no momento da execução.
 * Validação estrita por action type entra na Fase B (engine).
 */
export const CreateAutomationSchema = z.object({
  trigger: AutomationTriggerSchema,
  triggerConfig: z.record(z.string(), z.unknown()).optional(),
  actionType: AutomationActionTypeSchema,
  actionConfig: z.record(z.string(), z.unknown()).optional(),
  label: z.string().max(120).trim().optional(),
  isActive: z.boolean().optional(),
  conditions: AutomationConditionsSchema.optional().nullable(),
});
export type CreateAutomationRequest = z.infer<typeof CreateAutomationSchema>;

export const UpdateAutomationSchema = z.object({
  trigger: AutomationTriggerSchema.optional(),
  triggerConfig: z.record(z.string(), z.unknown()).optional(),
  actionType: AutomationActionTypeSchema.optional(),
  actionConfig: z.record(z.string(), z.unknown()).optional(),
  label: z.string().max(120).trim().nullable().optional(),
  isActive: z.boolean().optional(),
  conditions: AutomationConditionsSchema.optional().nullable(),
});
export type UpdateAutomationRequest = z.infer<typeof UpdateAutomationSchema>;
