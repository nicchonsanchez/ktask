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
  approvals: (filters: ManagementApprovalsFilters = {}) => ({
    queryKey: ['management', 'approvals', filters] as const,
    queryFn: () => {
      const sp = new URLSearchParams();
      if (filters.reviewerId) sp.set('reviewerId', filters.reviewerId);
      if (filters.ageFilter && filters.ageFilter !== 'all') sp.set('ageFilter', filters.ageFilter);
      const qs = sp.toString();
      return api.get<ManagementApprovalsResponse>(
        `/api/v1/management/approvals${qs ? `?${qs}` : ''}`,
      );
    },
  }),
  approvalDispatches: (filters: ManagementDispatchesFilters = {}) => ({
    queryKey: ['management', 'approval-dispatches', filters] as const,
    queryFn: () => {
      const sp = new URLSearchParams();
      if (filters.status?.length) sp.set('status', filters.status.join(','));
      if (filters.reviewerId) sp.set('reviewerId', filters.reviewerId);
      if (filters.boardId) sp.set('boardId', filters.boardId);
      if (filters.period && filters.period !== 'all') sp.set('period', filters.period);
      if (filters.onlyFailures) sp.set('onlyFailures', 'true');
      if (filters.page) sp.set('page', String(filters.page));
      if (filters.pageSize) sp.set('pageSize', String(filters.pageSize));
      const qs = sp.toString();
      return api.get<ManagementDispatchesResponse>(
        `/api/v1/management/approval-dispatches${qs ? `?${qs}` : ''}`,
      );
    },
  }),
  approvalDispatchTimeline: (approvalId: string) => ({
    queryKey: ['management', 'approval-dispatches', 'timeline', approvalId] as const,
    queryFn: () =>
      api.get<{ items: DispatchTimelineEntry[] }>(
        `/api/v1/management/approval-dispatches/${approvalId}/timeline`,
      ),
  }),
};

// ---- Aprovacoes: historico de envios (aba "Historico") ----

export type DispatchStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED' | 'REVERTED';
export type DispatchChannel = 'WHATSAPP' | 'IN_APP';
export type DispatchKind = 'INITIAL' | 'RESEND' | 'REMINDER';

export interface ManagementDispatchesFilters {
  status?: DispatchStatus[];
  reviewerId?: string;
  boardId?: string;
  period?: '7d' | '30d' | '90d' | 'all';
  onlyFailures?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ManagementDispatchRow {
  approvalId: string;
  cardId: string;
  cardTitle: string;
  board: { id: string; name: string; color: string | null };
  requestedAt: string;
  decidedAt: string | null;
  status: DispatchStatus;
  reviewerUserId: string | null;
  phone: string | null;
  recipientName: string;
  totalDispatches: number;
  autoDispatches: number;
  manualDispatches: number;
  failures: number;
  lastDispatchAt: string;
  lastChannel: DispatchChannel;
  lastSuccess: boolean;
}

export interface ManagementDispatchesResponse {
  items: ManagementDispatchRow[];
  total: number;
  page: number;
  pageSize: number;
  reviewers: Array<{ id: string; name: string }>;
  summary: {
    totalDispatches: number;
    successCount: number;
    failureCount: number;
    whatsappCount: number;
    inAppCount: number;
  };
}

export interface DispatchTimelineEntry {
  id: string;
  reviewerUserId: string | null;
  phone: string | null;
  recipientName: string;
  kind: DispatchKind;
  channel: DispatchChannel;
  success: boolean;
  errorMessage: string | null;
  preview: string | null;
  createdAt: string;
}

// ---- Aprovacoes (visao gerencial) ----

export interface ManagementApprovalsFilters {
  reviewerId?: string;
  /** 'over3d' = >3 dias parada, 'over7d' = >7 dias, 'all' = sem filtro (default). */
  ageFilter?: 'all' | 'over3d' | 'over7d';
}

export interface ManagementApprovalItem {
  id: string;
  cardId: string;
  requestedAt: string;
  requestedBy: { id: string; name: string; avatarUrl: string | null } | null;
  card: {
    id: string;
    title: string;
    boardId: string;
    listId: string;
    board: { id: string; name: string; color: string | null };
    list: { id: string; name: string };
  };
  reviewers: Array<{
    id: string;
    userId: string | null;
    phone: string | null;
    externalName: string | null;
    notifiedAt: string | null;
    user: { id: string; name: string; avatarUrl: string | null } | null;
  }>;
  /** true se o user logado eh reviewer desta aprovacao (pode decidir).
   *  false = somente visualizacao (gestor olhando aprovacao alheia). */
  canDecide: boolean;
}

export interface ManagementApprovalsResponse {
  items: ManagementApprovalItem[];
  /** Lista deduplicada de reviewers que tem pelo menos 1 approval pendente.
   *  Usado pelo dropdown de filtro "Filtrar por aprovador". */
  reviewers: Array<{ id: string; name: string; avatarUrl: string | null }>;
  total: number;
}

// ---- Kanban gerencial (colunas virtuais) ----

export interface KanbanSource {
  id: string;
  boardId: string;
  listId: string;
  boardName: string;
  boardColor: string | null;
  listName: string;
}

/** Card dentro de uma coluna virtual — reusa o shape do management card +
 *  inColumnIds (todas as colunas onde o card aparece; >1 = repetido). */
export interface KanbanCard extends ManagementCardItem {
  inColumnIds: string[];
}

export interface KanbanColumn {
  id: string;
  name: string;
  position: number;
  sources: KanbanSource[];
  cards: KanbanCard[];
}

export interface KanbanResponse {
  boardId: string;
  name: string;
  columns: KanbanColumn[];
}

export const managementKanbanQuery = () => ({
  queryKey: ['management', 'kanban'] as const,
  queryFn: () => api.get<KanbanResponse>('/api/v1/management/kanban'),
});

export function createKanbanColumn(name: string) {
  return api.post<{ id: string }>('/api/v1/management/kanban/columns', { name });
}
export function updateKanbanColumn(columnId: string, input: { name?: string; position?: number }) {
  return api.patch(`/api/v1/management/kanban/columns/${columnId}`, input);
}
export function deleteKanbanColumn(columnId: string) {
  return api.delete(`/api/v1/management/kanban/columns/${columnId}`);
}
export function addKanbanSource(columnId: string, input: { boardId: string; listId: string }) {
  return api.post(`/api/v1/management/kanban/columns/${columnId}/sources`, input);
}
export function removeKanbanSource(sourceId: string) {
  return api.delete(`/api/v1/management/kanban/sources/${sourceId}`);
}

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
