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
  priority: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  list: { id: string; name: string };
  board: { id: string; name: string; color: string | null };
}

export interface MeTask {
  id: string;
  text: string;
  isDone: boolean;
  position: number;
  dueDate: string | null;
  assigneeId: string | null;
  doneAt: string | null;
  doneById: string | null;
  checklistId: string;
  checklist: {
    id: string;
    title: string;
    cardId: string;
    card: MeTaskCardSummary;
  };
}

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
    priority: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
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

export const meQueries = {
  tasks: () => ({
    queryKey: ['me', 'tasks'] as const,
    queryFn: () => api.get<MeTasksResponse>('/api/v1/me/tasks'),
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
};

export function bulkRescheduleToday(ids: string[]) {
  return api.post<{ updated: number }>('/api/v1/me/tasks/bulk-reschedule-today', { ids });
}
