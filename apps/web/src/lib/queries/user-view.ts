import { api } from '@/lib/api-client';
import type { CalendarResponse, MeTasksResponse, RecentCardItem } from '@/lib/queries/me';

/**
 * Queries paralelas a meQueries pra GESTOR+ visualizar dados de outros
 * membros (módulo /users-view no backend).
 *
 * Reaproveita os tipos do meQueries (mesmo shape de retorno) — só muda
 * a URL e a queryKey, que recebem userId.
 */

export interface UserSummary {
  overdue: number;
  today: number;
  next7: number;
  noDate: number;
  recentActivityCount: number;
}

export interface MemberSummaryRow {
  userId: string;
  overdue: number;
  today: number;
  pending: number;
}

export interface RecentActivityItem {
  id: string;
  type: string;
  payload: unknown;
  createdAt: string;
  cardId: string | null;
  boardId: string | null;
  card: {
    id: string;
    title: string;
    board: { id: string; name: string; color: string | null };
  } | null;
}

export const userViewQueries = {
  tasks: (userId: string) => ({
    queryKey: ['user-view', userId, 'tasks'] as const,
    queryFn: () => api.get<MeTasksResponse>(`/api/v1/users/${userId}/tasks`),
  }),
  recentCards: (userId: string) => ({
    queryKey: ['user-view', userId, 'recent-cards'] as const,
    queryFn: () => api.get<RecentCardItem[]>(`/api/v1/users/${userId}/recent-cards`),
  }),
  calendar: (userId: string, month?: string) => ({
    queryKey: ['user-view', userId, 'calendar', month ?? 'current'] as const,
    queryFn: () =>
      api.get<CalendarResponse>(
        month
          ? `/api/v1/users/${userId}/calendar?month=${month}`
          : `/api/v1/users/${userId}/calendar`,
      ),
  }),
  summary: (userId: string) => ({
    queryKey: ['user-view', userId, 'summary'] as const,
    queryFn: () => api.get<UserSummary>(`/api/v1/users/${userId}/summary`),
  }),
  recentActivity: (userId: string, limit = 10) => ({
    queryKey: ['user-view', userId, 'recent-activity', limit] as const,
    queryFn: () =>
      api.get<RecentActivityItem[]>(`/api/v1/users/${userId}/recent-activity?limit=${limit}`),
  }),
};

export const orgMembersSummaryQuery = {
  queryKey: ['users-view', 'members-summary'] as const,
  queryFn: () => api.get<MemberSummaryRow[]>('/api/v1/users/members-summary'),
};
