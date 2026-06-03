import { api } from '@/lib/api-client';

export interface TrashCounts {
  cards: number;
  lists: number;
  total: number;
}

export interface TrashCardRow {
  id: string;
  title: string;
  shortCode: string | null;
  boardId: string;
  listId: string;
  deletedAt: string;
  purgeAt: string | null;
  list: { id: string; name: string; deletedAt: string | null } | null;
  board: { id: string; name: string } | null;
  deletedBy: { id: string; name: string; email: string } | null;
}

export interface TrashListRow {
  id: string;
  name: string;
  boardId: string;
  deletedAt: string;
  purgeAt: string | null;
  board: { id: string; name: string } | null;
  deletedBy: { id: string; name: string; email: string } | null;
  _count: { cards: number };
}

export interface TrashPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface TrashListParams {
  cursor?: string;
  limit?: number;
  search?: string;
  boardId?: string;
}

function buildQuery(params: TrashListParams): string {
  const qs = new URLSearchParams();
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.search) qs.set('search', params.search);
  if (params.boardId) qs.set('boardId', params.boardId);
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export const trashCountsQuery = () => ({
  queryKey: ['trash', 'count'] as const,
  queryFn: () => api.get<TrashCounts>('/api/v1/trash/count'),
});

export const trashCardsQuery = (params: TrashListParams = {}) => ({
  queryKey: ['trash', 'cards', params] as const,
  queryFn: () => api.get<TrashPage<TrashCardRow>>(`/api/v1/trash/cards${buildQuery(params)}`),
});

export const trashListsQuery = (params: TrashListParams = {}) => ({
  queryKey: ['trash', 'lists', params] as const,
  queryFn: () => api.get<TrashPage<TrashListRow>>(`/api/v1/trash/lists${buildQuery(params)}`),
});
