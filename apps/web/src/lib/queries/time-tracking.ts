import { api } from '@/lib/api-client';

export type TimeEntrySource = 'TIMER' | 'MANUAL';

export interface TimeEntry {
  id: string;
  cardId: string | null; // null = timer livre (sem card vinculado)
  userId: string;
  organizationId: string;
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
  source: TimeEntrySource;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActiveTimer extends TimeEntry {
  card: {
    id: string;
    title: string;
    boardId: string;
    board: { id: string; name: string; color: string | null; icon: string | null };
    list: { id: string; name: string };
  } | null;
}

export interface TimeEntryWithUser extends TimeEntry {
  user: { id: string; name: string; email: string; avatarUrl: string | null };
}

export interface TimesheetItem extends TimeEntryWithUser {
  // Null quando a entry foi criada como timer livre (sem card vinculado)
  card: {
    id: string;
    title: string;
    boardId: string;
    board: { id: string; name: string };
    labels: Array<{ label: { id: string; name: string; color: string } }>;
    members: Array<{ user: { id: string; name: string; avatarUrl: string | null } }>;
  } | null;
}

export interface TimesheetPage {
  items: TimesheetItem[];
  nextCursor: string | null;
}

export interface TimesheetSummary {
  totalSec: number;
  byUser: Array<{
    user: { id: string; name: string; email: string; avatarUrl: string | null };
    totalSec: number;
    activeNow: {
      id: string;
      userId: string;
      cardId: string;
      startedAt: string;
      card: { id: string; title: string; board: { id: string; name: string } };
    } | null;
  }>;
  activeNow: Array<{
    id: string;
    userId: string;
    cardId: string;
    startedAt: string;
    card: { id: string; title: string; board: { id: string; name: string } };
  }>;
}

export const timeTrackingQueries = {
  active: () => ({
    queryKey: ['time-tracking', 'active'] as const,
    queryFn: () => api.get<ActiveTimer | null>('/api/v1/users/me/time/active'),
  }),
  byCard: (cardId: string) => ({
    queryKey: ['time-tracking', 'card', cardId] as const,
    queryFn: () => api.get<TimeEntryWithUser[]>(`/api/v1/cards/${cardId}/time`),
  }),
  timesheet: (filter: TimesheetFilter = {}) => ({
    queryKey: ['time-tracking', 'timesheet', filter] as const,
    queryFn: () => {
      const qs = new URLSearchParams();
      if (filter.userIds) filter.userIds.forEach((u) => qs.append('userIds', u));
      if (filter.cardId) qs.set('cardId', filter.cardId);
      if (filter.boardId) qs.set('boardId', filter.boardId);
      if (filter.source) qs.set('source', filter.source);
      if (filter.dateFrom) qs.set('dateFrom', filter.dateFrom);
      if (filter.dateTo) qs.set('dateTo', filter.dateTo);
      if (filter.limit) qs.set('limit', String(filter.limit));
      if (filter.cursor) qs.set('cursor', filter.cursor);
      const suffix = qs.toString() ? `?${qs}` : '';
      return api.get<TimesheetPage>(`/api/v1/organizations/me/timesheet${suffix}`);
    },
  }),
  summary: (filter: TimesheetFilter = {}) => ({
    queryKey: ['time-tracking', 'summary', filter] as const,
    queryFn: () => {
      const qs = new URLSearchParams();
      if (filter.userIds) filter.userIds.forEach((u) => qs.append('userIds', u));
      if (filter.dateFrom) qs.set('dateFrom', filter.dateFrom);
      if (filter.dateTo) qs.set('dateTo', filter.dateTo);
      const suffix = qs.toString() ? `?${qs}` : '';
      return api.get<TimesheetSummary>(`/api/v1/organizations/me/timesheet/summary${suffix}`);
    },
  }),
};

export interface TimesheetFilter {
  userIds?: string[];
  cardId?: string;
  boardId?: string;
  source?: TimeEntrySource;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  cursor?: string;
}

export function startTimer(cardId: string, note?: string | null) {
  return api.post<{ entry: ActiveTimer; autoStoppedEntryId: string | null }>(
    `/api/v1/cards/${cardId}/time/start`,
    { note: note ?? null },
  );
}

/**
 * Inicia um cronômetro "livre" — sem card vinculado. Usado pelo botão Play
 * do header global quando o usuário não tem nenhum card aberto. O timer
 * conta normalmente e fica disponível na lista pessoal de timers; pode ser
 * editado depois pra atribuir um card.
 */
export function startFreeTimer(note?: string | null) {
  return api.post<{ entry: ActiveTimer; autoStoppedEntryId: string | null }>(
    '/api/v1/time-entries/start',
    { note: note ?? null },
  );
}

export function stopTimer(entryId: string) {
  return api.post<TimeEntry>(`/api/v1/time-entries/${entryId}/stop`, {});
}

export function createManualEntry(input: {
  cardId: string;
  startedAt: string;
  endedAt: string;
  note?: string | null;
  userId?: string | null;
}) {
  return api.post<TimeEntry>('/api/v1/time-entries', input);
}

export function updateTimeEntry(
  entryId: string,
  input: { startedAt?: string; endedAt?: string | null; note?: string | null },
) {
  return api.patch<TimeEntry>(`/api/v1/time-entries/${entryId}`, input);
}

export function deleteTimeEntry(entryId: string) {
  return api.delete(`/api/v1/time-entries/${entryId}`);
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
