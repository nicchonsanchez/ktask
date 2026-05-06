import { api } from '@/lib/api-client';

export type Priority = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface CardsStats {
  summary: {
    total: number;
    active: number;
    archived: number;
    completedTotal: number;
    completedThisWeek: number;
    completedThisMonth: number;
    overdue: number;
    dueToday: number;
  };
  byPriority: Array<{ priority: Priority; count: number }>;
  byBoard: Array<{
    board: { id: string; name: string; color: string | null; icon: string | null };
    count: number;
  }>;
  topLeads: Array<{
    user: { id: string; name: string; avatarUrl: string | null } | null;
    count: number;
  }>;
  throughput: Array<{ day: string; count: number }>;
}

export interface TasksStats {
  summary: {
    total: number;
    done: number;
    active: number;
    overdue: number;
    completionRate: number; // 0-100
  };
  byPriority: Array<{ priority: Priority; count: number }>;
  byAssignee: Array<{
    user: { id: string; name: string; avatarUrl: string | null } | null;
    count: number;
  }>;
  doneByDay: Array<{ day: string; count: number }>;
}

export interface CompaniesStatsParams {
  from?: string; // ISO date
  to?: string; // ISO date
  boardId?: string;
}

export interface CompaniesStatsRow {
  company: { id: string; name: string };
  cardsCreated: number;
  cardsCompleted: number;
  /** Soma dos durationSec dos TimeEntry no periodo. */
  hoursSeconds: number;
  cardsOpen: number;
}

export interface CompaniesStats {
  period: { from: string; to: string };
  boardId: string | null;
  rows: CompaniesStatsRow[];
  noCompany: {
    cardsCreated: number;
    cardsCompleted: number;
    hoursSeconds: number;
    cardsOpen: number;
  };
}

export const indicatorsQueries = {
  cards: () => ({
    queryKey: ['indicators', 'cards'] as const,
    queryFn: () => api.get<CardsStats>('/api/v1/admin/stats/cards'),
  }),
  tasks: () => ({
    queryKey: ['indicators', 'tasks'] as const,
    queryFn: () => api.get<TasksStats>('/api/v1/admin/stats/tasks'),
  }),
  companies: (params: CompaniesStatsParams) => ({
    queryKey: ['indicators', 'companies', params] as const,
    queryFn: () => {
      const sp = new URLSearchParams();
      if (params.from) sp.set('from', params.from);
      if (params.to) sp.set('to', params.to);
      if (params.boardId) sp.set('boardId', params.boardId);
      const qs = sp.toString();
      return api.get<CompaniesStats>(`/api/v1/admin/stats/companies${qs ? `?${qs}` : ''}`);
    },
  }),
};
