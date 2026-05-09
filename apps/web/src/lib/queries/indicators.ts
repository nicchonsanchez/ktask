import { api } from '@/lib/api-client';

export type Priority = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface CardsStatsParams {
  from?: string;
  to?: string;
  boardIds?: string[];
  leadId?: string;
}

export interface CardsStats {
  summary: {
    total: number;
    active: number;
    archived: number;
    completedTotal: number;
    completedThisWeek: number;
    completedThisMonth: number;
    completedInPeriod: number;
    wip: number;
    overdue: number;
    dueToday: number;
    reopenedInPeriod: number;
    onTimeRate: number | null;
    onTimeNumerator: number;
    onTimeDenominator: number;
  };
  period: { from: string; to: string };
  delta: {
    throughput: number;
    reopened: number;
  };
  sparkline: {
    throughput: number[];
  };
  leadTime: {
    avgDays: number;
    medianDays: number;
    p95Days: number;
    sampleSize: number;
  };
  aging: {
    buckets: { stale7: number; stale30: number; stale60: number };
    samples: Array<{
      id: string;
      title: string;
      board: { id: string; name: string; color: string | null } | null;
      lastUpdateDays: number;
    }>;
  };
  byColumn: Array<{
    list: { id: string; name: string; boardId: string };
    board: { id: string; name: string; color: string | null } | null;
    wip: number;
    avgDaysInColumn: number;
  }>;
  flowInOut: Array<{ day: string; created: number; completed: number }>;
  byBoard: Array<{
    board: { id: string; name: string; color: string | null; icon: string | null };
    count: number;
  }>;
  byLabel: Array<{
    label: { id: string; name: string; color: string };
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

function serializeCardsParams(params: CardsStatsParams): string {
  const sp = new URLSearchParams();
  if (params.from) sp.set('from', params.from);
  if (params.to) sp.set('to', params.to);
  if (params.boardIds?.length) sp.set('boardIds', params.boardIds.join(','));
  if (params.leadId) sp.set('leadId', params.leadId);
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export const indicatorsQueries = {
  cards: (params: CardsStatsParams = {}) => ({
    queryKey: ['indicators', 'cards', params] as const,
    queryFn: () => api.get<CardsStats>(`/api/v1/admin/stats/cards${serializeCardsParams(params)}`),
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
