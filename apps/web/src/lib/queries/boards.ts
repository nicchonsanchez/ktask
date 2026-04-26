import { api } from '@/lib/api-client';

export type CardOrdering =
  | 'MANUAL'
  | 'TIME_IN_LIST'
  | 'TIME_INTERACTION'
  | 'ALPHABETICAL'
  | 'COMPLETION_DATE'
  | 'CREATION_DATE';

export interface BoardListItem {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  visibility: 'PRIVATE' | 'ORGANIZATION';
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  cardsCount: number;
  membersCount: number;
}

export interface CardListItem {
  id: string;
  title: string;
  position: number;
  priority: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate: string | null;
  isArchived: boolean;
  enteredListAt: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  leadId: string | null;
  /** URL pública da capa do card. Null se não há capa ou capa não é imagem. */
  coverImageUrl: string | null;
  members: Array<{ user: { id: string; name: string; avatarUrl: string | null } }>;
  labels: Array<{ label: { id: string; name: string; color: string } }>;
  _count: { comments: number; attachments: number; checklists: number };
}

export interface ListWithCards {
  id: string;
  name: string;
  position: number;
  color: string | null;
  wipLimit: number | null;
  cards: CardListItem[];
}

export interface BoardDetail {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  color: string | null;
  visibility: 'PRIVATE' | 'ORGANIZATION';
  isArchived: boolean;
  cardOrdering: CardOrdering;
  inheritTeamOnNewCards: boolean;
  createdAt: string;
  createdBy: { id: string; name: string; avatarUrl: string | null };
  completedCount: number;
  lists: ListWithCards[];
  labels: Array<{ id: string; name: string; color: string }>;
  members: Array<{
    id: string;
    role: 'ADMIN' | 'EDITOR' | 'COMMENTER' | 'VIEWER';
    user: { id: string; name: string; email: string; avatarUrl: string | null };
  }>;
}

export interface CompletedCardItem {
  id: string;
  title: string;
  priority: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate: string | null;
  completedAt: string;
  list: { id: string; name: string; isArchived: boolean };
  completedBy: { id: string; name: string; email: string; avatarUrl: string | null } | null;
  labels: Array<{ label: { id: string; name: string; color: string } }>;
  _count: { comments: number; attachments: number; checklists: number };
}

export interface CompletedCardsPage {
  items: CompletedCardItem[];
  nextCursor: string | null;
}

export const boardsQueries = {
  all: () => ({
    queryKey: ['boards'] as const,
    queryFn: () => api.get<BoardListItem[]>('/api/v1/boards'),
  }),
  detail: (boardId: string) => ({
    queryKey: ['boards', boardId] as const,
    queryFn: () => api.get<BoardDetail>(`/api/v1/boards/${boardId}`),
  }),
};

export function createBoard(input: { name: string; description?: string; color?: string }) {
  return api.post<BoardListItem>('/api/v1/boards', input);
}

export function updateBoard(
  boardId: string,
  input: {
    name?: string;
    description?: string | null;
    color?: string | null;
    icon?: string | null;
    visibility?: 'PRIVATE' | 'ORGANIZATION';
    cardOrdering?: CardOrdering;
    inheritTeamOnNewCards?: boolean;
  },
) {
  return api.patch(`/api/v1/boards/${boardId}`, input);
}

export function archiveBoard(boardId: string) {
  return api.delete(`/api/v1/boards/${boardId}`);
}

export function restoreBoard(boardId: string) {
  return api.post(`/api/v1/boards/${boardId}/restore`, {});
}

export function addBoardMember(
  boardId: string,
  userId: string,
  role: 'ADMIN' | 'EDITOR' | 'COMMENTER' | 'VIEWER' = 'EDITOR',
) {
  return api.post(`/api/v1/boards/${boardId}/members`, { userId, role });
}

export function removeBoardMember(boardId: string, userId: string) {
  return api.delete(`/api/v1/boards/${boardId}/members/${userId}`);
}

export function moveCard(cardId: string, input: { toListId: string; afterCardId: string | null }) {
  return api.patch(`/api/v1/cards/${cardId}/move`, input);
}

export function createCard(input: { listId: string; title: string }) {
  return api.post<{ id: string; title: string; listId: string; position: number }>(
    '/api/v1/cards',
    input,
  );
}

/* -------------------------- Listas (colunas) -------------------------- */

export function createList(input: { boardId: string; name: string }) {
  return api.post<{ id: string; name: string; position: number }>('/api/v1/lists', input);
}

export function updateList(listId: string, input: { name?: string; color?: string | null }) {
  return api.patch(`/api/v1/lists/${listId}`, input);
}

export function moveList(listId: string, input: { afterListId: string | null }) {
  return api.patch(`/api/v1/lists/${listId}/move`, input);
}

export interface ArchiveListOptions {
  /**
   * O que fazer com os cards da coluna ao arquivar:
   *   - 'archive': arquiva todos junto (some da listagem do board)
   *   - 'move': move pra outra coluna (`targetListId` obrigatório)
   * Coluna sem cards: pode mandar omitido.
   */
  cardsAction?: 'archive' | 'move';
  targetListId?: string;
}

export function archiveList(listId: string, opts: ArchiveListOptions = {}) {
  return api.delete(`/api/v1/lists/${listId}`, opts);
}

export function restoreList(listId: string) {
  return api.post(`/api/v1/lists/${listId}/restore`, {});
}

export function restoreCard(cardId: string) {
  return api.post(`/api/v1/cards/${cardId}/restore`, {});
}

export interface ArchivedCard {
  id: string;
  title: string;
  priority: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate: string | null;
  updatedAt: string;
  list: { id: string; name: string; isArchived: boolean };
  labels: Array<{ label: { id: string; name: string; color: string } }>;
}

export interface ArchivedList {
  id: string;
  name: string;
  position: number;
  updatedAt: string;
  _count: { cards: number };
}

export interface BoardArchivedResponse {
  lists: ArchivedList[];
  cards: ArchivedCard[];
}

export const boardArchivedQuery = (boardId: string) => ({
  queryKey: ['boards', boardId, 'archived'] as const,
  queryFn: () => api.get<BoardArchivedResponse>(`/api/v1/lists/archived/${boardId}`),
});

export function completeCard(cardId: string) {
  return api.post(`/api/v1/cards/${cardId}/complete`, {});
}

export function uncompleteCard(cardId: string, toListId?: string) {
  return api.post(`/api/v1/cards/${cardId}/uncomplete`, toListId ? { toListId } : {});
}

export function sortCardsForBoard(cards: CardListItem[], ordering: CardOrdering): CardListItem[] {
  if (ordering === 'MANUAL') return cards;
  const copy = [...cards];
  switch (ordering) {
    case 'TIME_IN_LIST':
      copy.sort(
        (a, b) => new Date(a.enteredListAt).getTime() - new Date(b.enteredListAt).getTime(),
      );
      break;
    case 'TIME_INTERACTION':
      copy.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      break;
    case 'ALPHABETICAL':
      copy.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
      break;
    case 'COMPLETION_DATE':
      copy.sort((a, b) => {
        if (!a.completedAt && !b.completedAt) return 0;
        if (!a.completedAt) return 1;
        if (!b.completedAt) return -1;
        return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
      });
      break;
    case 'CREATION_DATE':
      copy.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      break;
  }
  return copy;
}

export function fetchCompletedCards(
  boardId: string,
  params: { limit?: number; cursor?: string | null } = {},
) {
  const qs = new URLSearchParams();
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.cursor) qs.set('cursor', params.cursor);
  const suffix = qs.toString() ? `?${qs}` : '';
  return api.get<CompletedCardsPage>(`/api/v1/boards/${boardId}/completed-cards${suffix}`);
}
