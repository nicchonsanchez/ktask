import { api } from '@/lib/api-client';

export interface ManagementCardCompany {
  id: string;
  name: string;
}

export interface ManagementCardUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface ManagementCardLabel {
  id: string;
  name: string;
  color: string;
}

export interface ManagementCardItem {
  id: string;
  shortCode: string | null;
  title: string;
  dueDate: string | null;
  completedAt: string | null;
  isArchived: boolean;
  cardColor: string | null;
  status: 'ACTIVE' | 'COMPLETED' | 'WAITING' | 'CANCELED';
  board: { id: string; name: string; color: string | null };
  list: { id: string; name: string };
  lead: ManagementCardUser | null;
  members: ManagementCardUser[];
  labels: ManagementCardLabel[];
  companies: ManagementCardCompany[];
  /** Numero de outros fluxos onde o card tem presenca (alem do primary). */
  otherFlowsCount: number;
  /** Apenas no endpoint /archived. */
  archivedAt?: string;
}

export interface ManagementMetrics {
  total: number;
  overdue: number;
  collaborators: number;
  clients: number;
}

export interface ManagementListResponse {
  items: ManagementCardItem[];
  total: number;
  page: number;
  pageSize: number;
  metrics: ManagementMetrics;
}

export interface ManagementArchivedResponse {
  items: ManagementCardItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ManagementFilters {
  q?: string;
  companyIds?: string[];
  userIds?: string[];
  labelIds?: string[];
  boardIds?: string[];
  dueStatus?: 'overdue' | 'today' | 'next7' | 'noDate';
  /** Quando true, mostra apenas cards em colunas finais (Finalizado etc). */
  onlyFinalLists?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ManagementArchivedFilters extends ManagementFilters {
  archivedSince?: '7d' | '30d' | '90d' | 'all';
}

function buildQuery(filters: ManagementFilters | ManagementArchivedFilters): string {
  const sp = new URLSearchParams();
  if (filters.q) sp.set('q', filters.q);
  if (filters.companyIds?.length) sp.set('companyIds', filters.companyIds.join(','));
  if (filters.userIds?.length) sp.set('userIds', filters.userIds.join(','));
  if (filters.labelIds?.length) sp.set('labelIds', filters.labelIds.join(','));
  if (filters.boardIds?.length) sp.set('boardIds', filters.boardIds.join(','));
  if (filters.dueStatus) sp.set('dueStatus', filters.dueStatus);
  if ('onlyFinalLists' in filters && filters.onlyFinalLists) sp.set('onlyFinalLists', 'true');
  if (filters.page) sp.set('page', String(filters.page));
  if (filters.pageSize) sp.set('pageSize', String(filters.pageSize));
  if ('archivedSince' in filters && filters.archivedSince)
    sp.set('archivedSince', filters.archivedSince);
  return sp.toString();
}

export const managementQueries = {
  cards: (filters: ManagementFilters = {}) => ({
    queryKey: ['management', 'cards', filters] as const,
    queryFn: () => {
      const qs = buildQuery(filters);
      return api.get<ManagementListResponse>(`/api/v1/management/cards${qs ? `?${qs}` : ''}`);
    },
  }),
  archived: (filters: ManagementArchivedFilters = {}) => ({
    queryKey: ['management', 'cards', 'archived', filters] as const,
    queryFn: () => {
      const qs = buildQuery(filters);
      return api.get<ManagementArchivedResponse>(
        `/api/v1/management/cards/archived${qs ? `?${qs}` : ''}`,
      );
    },
  }),
  finalized: (filters: ManagementFilters = {}) => ({
    queryKey: ['management', 'cards', 'finalized', filters] as const,
    queryFn: () => {
      const qs = buildQuery(filters);
      return api.get<ManagementListResponse>(
        `/api/v1/management/cards/finalized${qs ? `?${qs}` : ''}`,
      );
    },
  }),
};

export interface CardVisitNode {
  userId: string;
  visitedAt: string;
  role: 'LEAD' | 'MEMBER' | 'OTHER';
  user: { id: string; name: string; avatarUrl: string | null };
}

export const cardVisitsQuery = (cardId: string) => ({
  queryKey: ['cards', cardId, 'visits'] as const,
  queryFn: () => api.get<CardVisitNode[]>(`/api/v1/cards/${cardId}/visits`),
  enabled: Boolean(cardId),
});
