import { api } from '@/lib/api-client';

/**
 * Queries da home pessoal (módulo /me no backend).
 *
 * Schema dos retornos casado com `apps/api/src/modules/me/me.service.ts`.
 * Mantém includes mínimos pra reduzir payload.
 */

export interface MeTaskCardSummary {
  id: string;
  title: string;
  boardId: string;
  cardColor: string | null;
  list: { id: string; name: string };
  board: { id: string; name: string; color: string | null };
}

export interface MeTaskBase {
  id: string;
  text: string;
  isDone: boolean;
  position: number;
  dueDate: string | null;
  assigneeId: string | null;
  doneAt: string | null;
  doneById: string | null;
}

export interface MeTaskChecklist extends MeTaskBase {
  kind: 'checklist';
  checklistId: string;
  checklist: {
    id: string;
    title: string;
    cardId: string;
    card: MeTaskCardSummary;
  };
}

export interface MeTaskStandalone extends MeTaskBase {
  kind: 'standalone';
}

export type MeTask = MeTaskChecklist | MeTaskStandalone;

export interface MeTasksResponse {
  overdue: MeTask[];
  today: MeTask[];
  next7: MeTask[];
  noDate: MeTask[];
}

export interface RecentCardItem {
  visitedAt: string;
  card: {
    id: string;
    title: string;
    cardColor: string | null;
    dueDate: string | null;
    list: { id: string; name: string };
    board: {
      id: string;
      name: string;
      color: string | null;
      visibility: 'PRIVATE' | 'ORGANIZATION';
    };
    members: Array<{ user: { id: string; name: string; avatarUrl: string | null } }>;
    labels: Array<{ label: { id: string; name: string; color: string } }>;
  };
}

export interface CalendarDay {
  date: string; // YYYY-MM-DD (BRT)
  total: number;
  pending: number;
}

export interface CalendarResponse {
  month: string; // YYYY-MM
  days: CalendarDay[];
}

/** Doc 41: feed de atividade da Org pra mostrar pulso na pagina /quadros. */
export interface OrgActivityItem {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  cardId: string | null;
  boardId: string | null;
  actor: { id: string; name: string; avatarUrl: string | null } | null;
  card: {
    id: string;
    title: string;
    shortCode: string | null;
    board: { id: string; name: string; color: string | null };
  } | null;
}

export const meQueries = {
  tasks: () => ({
    queryKey: ['me', 'tasks'] as const,
    queryFn: () => api.get<MeTasksResponse>('/api/v1/me/tasks'),
  }),
  tasksDone: (day: string) => ({
    queryKey: ['me', 'tasks', 'done', day] as const,
    queryFn: () => api.get<MeTask[]>(`/api/v1/me/tasks/done?day=${day}`),
    enabled: Boolean(day),
  }),
  recentCards: () => ({
    queryKey: ['me', 'recent-cards'] as const,
    queryFn: () => api.get<RecentCardItem[]>('/api/v1/me/recent-cards'),
  }),
  calendar: (month?: string) => ({
    queryKey: ['me', 'calendar', month ?? 'current'] as const,
    queryFn: () =>
      api.get<CalendarResponse>(
        month ? `/api/v1/me/calendar?month=${month}` : '/api/v1/me/calendar',
      ),
  }),
  orgActivity: (limit = 10) => ({
    queryKey: ['me', 'org-activity', limit] as const,
    queryFn: () => api.get<OrgActivityItem[]>(`/api/v1/me/org-activity?limit=${limit}`),
  }),
};

export function bulkRescheduleToday(ids: string[]) {
  return api.post<{ updated: number }>('/api/v1/me/tasks/bulk-reschedule-today', { ids });
}

/* -------------------------- Standalone tasks -------------------------- */

export interface StandaloneTask {
  id: string;
  text: string;
  isDone: boolean;
  dueDate: string | null;
  assigneeId: string | null;
  createdById: string;
  doneAt: string | null;
  doneById: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: { id: string; name: string; email: string; avatarUrl: string | null } | null;
  createdBy: { id: string; name: string; email: string; avatarUrl: string | null };
}

export function createStandaloneTask(input: {
  text: string;
  dueDate?: string | null;
  assigneeId?: string | null; // undefined = caller (default), null = sem assignee
}) {
  return api.post<StandaloneTask>('/api/v1/tasks', input);
}

export function updateStandaloneTask(
  taskId: string,
  input: {
    text?: string;
    dueDate?: string | null;
    assigneeId?: string | null;
    isDone?: boolean;
  },
) {
  return api.patch<StandaloneTask>(`/api/v1/tasks/${taskId}`, input);
}

export function deleteStandaloneTask(taskId: string) {
  return api.delete<{ ok: true }>(`/api/v1/tasks/${taskId}`);
}
