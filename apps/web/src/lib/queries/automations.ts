import { api } from '@/lib/api-client';

export type AutomationTrigger =
  | 'CARD_ENTERED'
  | 'CARD_LEFT'
  | 'TIME_IN_LIST'
  | 'TIME_NO_INTERACTION'
  | 'DUE_DATE_TODAY'
  | 'DUE_DATE_OVERDUE';

export type AutomationActionType =
  | 'INSERT_TAGS'
  | 'REMOVE_TAGS'
  | 'INSERT_CHECKLIST_ITEMS'
  | 'INSERT_CHECKLIST_GROUP'
  | 'SET_CARD_STATUS'
  | 'FILL_FIELDS'
  | 'SAVE_DESCRIPTION_VERSION'
  | 'SET_LEAD'
  | 'ADD_TEAM'
  | 'POST_COMMENT'
  | 'CREATE_CHILD_CARD'
  | 'SEND_EMAIL'
  | 'SEND_WHATSAPP'
  | 'LINK_FLOW'
  | 'UNLINK_FLOW'
  | 'UPDATE_FLOW_POSITION'
  | 'FLAG_DUE_TODAY'
  | 'FLAG_OVERDUE';

export type AutomationRunStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';

export interface Automation {
  id: string;
  organizationId: string;
  listId: string | null;
  boardId: string | null;
  trigger: AutomationTrigger;
  triggerConfig: Record<string, unknown>;
  actionType: AutomationActionType;
  actionConfig: Record<string, unknown>;
  isActive: boolean;
  label: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string; avatarUrl: string | null };
  _count: { runs: number };
}

export interface AutomationRun {
  id: string;
  automationId: string;
  cardId: string | null;
  status: AutomationRunStatus;
  chainDepth: number;
  error: string | null;
  result: unknown;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  card: { id: string; title: string } | null;
}

export const automationsQueries = {
  byList: (listId: string) => ({
    queryKey: ['automations', 'by-list', listId] as const,
    queryFn: () => api.get<Automation[]>(`/api/v1/lists/${listId}/automations`),
  }),
  runs: (automationId: string) => ({
    queryKey: ['automations', automationId, 'runs'] as const,
    queryFn: () => api.get<AutomationRun[]>(`/api/v1/automations/${automationId}/runs`),
  }),
};

export interface CreateAutomationInput {
  trigger: AutomationTrigger;
  triggerConfig?: Record<string, unknown>;
  actionType: AutomationActionType;
  actionConfig?: Record<string, unknown>;
  label?: string;
  isActive?: boolean;
}

export function createAutomation(listId: string, input: CreateAutomationInput) {
  return api.post<Automation>(`/api/v1/lists/${listId}/automations`, input);
}

export function updateAutomation(
  automationId: string,
  input: Partial<CreateAutomationInput> & { label?: string | null },
) {
  return api.patch<Automation>(`/api/v1/automations/${automationId}`, input);
}

export function deleteAutomation(automationId: string) {
  return api.delete(`/api/v1/automations/${automationId}`);
}
