import type {
  CardInteractionsResponse,
  CreateGoalRequest,
  GoalDto,
  UpdateGoalRequest,
  PerformanceArea,
  PerformanceBoardConfigDto,
  PerformanceBoardSummaryDto,
  PerformanceCardsResponse,
  PerformanceEventsResponse,
  PerformanceFlowResponse,
  PerformanceMetric,
  PerformanceSummaryResponse,
  UpsertBoardPerformanceConfigRequest,
} from '@ktask/contracts';

import { api } from '@/lib/api-client';

/** Doc 52 — Desempenho da Equipe. */

export interface PerformanceParams {
  from: string;
  to: string;
  boardIds?: string[];
  userIds?: string[];
  area?: PerformanceArea;
  companyId?: string;
}

function qs(params: PerformanceParams, extra: Record<string, string | number> = {}): string {
  const sp = new URLSearchParams();
  sp.set('from', params.from);
  sp.set('to', params.to);
  if (params.boardIds?.length) sp.set('boardIds', params.boardIds.join(','));
  if (params.userIds?.length) sp.set('userIds', params.userIds.join(','));
  if (params.area) sp.set('area', params.area);
  if (params.companyId) sp.set('companyId', params.companyId);
  for (const [k, v] of Object.entries(extra)) sp.set(k, String(v));
  return `?${sp.toString()}`;
}

export const performanceQueries = {
  summary: (params: PerformanceParams) => ({
    queryKey: ['performance', 'summary', params] as const,
    queryFn: () => api.get<PerformanceSummaryResponse>(`/api/v1/performance/summary${qs(params)}`),
  }),
  events: (params: PerformanceParams, metric: PerformanceMetric, page: number) => ({
    queryKey: ['performance', 'events', params, metric, page] as const,
    queryFn: () =>
      api.get<PerformanceEventsResponse>(
        `/api/v1/performance/events${qs(params, { metric, page, pageSize: 50 })}`,
      ),
  }),
  /** Fase 5: fluxo do trabalho por quadro (exige area ou fluxos no filtro). */
  flow: (params: PerformanceParams) => ({
    queryKey: ['performance', 'flow', params] as const,
    queryFn: () => api.get<PerformanceFlowResponse>(`/api/v1/performance/flow${qs(params)}`),
  }),
  cards: (params: PerformanceParams) => ({
    queryKey: ['performance', 'cards', params] as const,
    queryFn: () => api.get<PerformanceCardsResponse>(`/api/v1/performance/cards${qs(params)}`),
  }),
  configList: () => ({
    queryKey: ['performance', 'config'] as const,
    queryFn: () => api.get<PerformanceBoardSummaryDto[]>('/api/v1/performance/config'),
  }),
  configBoard: (boardId: string) => ({
    queryKey: ['performance', 'config', boardId] as const,
    queryFn: () => api.get<PerformanceBoardConfigDto>(`/api/v1/performance/config/${boardId}`),
  }),
};

/** Fase 4: metas com progresso. */
export const goalsQuery = () => ({
  queryKey: ['performance', 'goals'] as const,
  queryFn: () => api.get<GoalDto[]>('/api/v1/performance/goals'),
});

export function createGoal(body: CreateGoalRequest) {
  return api.post<GoalDto>('/api/v1/performance/goals', body);
}

export function updateGoal(id: string, body: UpdateGoalRequest) {
  return api.patch<GoalDto>(`/api/v1/performance/goals/${id}`, body);
}

export function deleteGoal(id: string) {
  return api.delete<{ ok: true }>(`/api/v1/performance/goals/${id}`);
}

/** Fase 3: registros de contato do card + se os botoes aparecem. */
export const cardInteractionsQuery = (cardId: string, boardId: string) => ({
  queryKey: ['performance', 'interactions', cardId, boardId] as const,
  queryFn: () =>
    api.get<CardInteractionsResponse>(
      `/api/v1/cards/${cardId}/interactions?boardId=${encodeURIComponent(boardId)}`,
    ),
});

export function saveBoardPerformanceConfig(
  boardId: string,
  body: UpsertBoardPerformanceConfigRequest,
) {
  return api.post<PerformanceBoardConfigDto>(`/api/v1/performance/config/${boardId}`, body);
}
