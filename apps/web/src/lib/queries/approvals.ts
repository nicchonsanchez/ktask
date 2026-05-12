import { api } from '@/lib/api-client';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVERTED';

export interface ApprovalReviewer {
  id: string;
  userId: string | null;
  phone: string | null;
  externalName: string | null;
  notifiedAt: string | null;
  expiresAt?: string;
  user: { id: string; name: string; avatarUrl: string | null } | null;
}

export interface CardApproval {
  id: string;
  cardId: string;
  organizationId: string;
  requestedById: string;
  status: ApprovalStatus;
  requestedAt: string;
  decidedAt: string | null;
  decidedById: string | null;
  decidedByExternalName: string | null;
  note: string | null;
  defaultOnApproveListId: string | null;
  defaultOnRejectListId: string | null;
  sideEffects: Record<string, unknown> | null;
  revertedAt: string | null;
  revertedById: string | null;
  revertReason: string | null;
  reviewers: ApprovalReviewer[];
  requestedBy?: { id: string; name: string; avatarUrl: string | null };
  decidedBy?: { id: string; name: string; avatarUrl: string | null } | null;
  revertedBy?: { id: string; name: string; avatarUrl: string | null } | null;
  defaultApproveList?: { id: string; name: string } | null;
  defaultRejectList?: { id: string; name: string } | null;
}

export interface PendingApprovalForUser extends CardApproval {
  card: {
    id: string;
    title: string;
    boardId: string;
    listId: string;
    board: { id: string; name: string; color: string | null };
    list: { id: string; name: string };
  };
}

export interface ReviewerInputDTO {
  userId?: string;
  phone?: string;
  externalName?: string;
}

export interface ApprovalActionsDTO {
  addTagIds?: string[];
  removeTagIds?: string[];
}

export interface RequestApprovalInput {
  reviewers: ReviewerInputDTO[];
  message?: string;
  defaultOnApproveListId?: string;
  defaultOnRejectListId?: string;
  onApproveActions?: ApprovalActionsDTO;
  onRejectActions?: ApprovalActionsDTO;
  notifyOnWhatsApp?: boolean;
}

export interface DecideApprovalInput {
  decision: 'APPROVE' | 'REJECT';
  note?: string;
}

export interface PublicApprovalAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  kind: 'FILE' | 'IMAGE' | 'LINK';
  externalUrl: string | null;
  createdAt: string;
  /** URL publica resolvida pelo backend (storageKey ou externalUrl). */
  publicUrl: string | null;
}

export interface PublicApprovalChecklistItem {
  id: string;
  text: string;
  isDone: boolean;
  position: number;
  dueDate: string | null;
}

export interface PublicApprovalChecklist {
  id: string;
  title: string;
  position: number;
  items: PublicApprovalChecklistItem[];
}

export interface PublicApprovalComment {
  id: string;
  body: unknown;
  editedAt: string | null;
  createdAt: string;
  author: { id: string; name: string; avatarUrl: string | null };
}

export interface PublicApprovalActivity {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; name: string; avatarUrl: string | null } | null;
}

export interface PublicApprovalView {
  reviewer: {
    id: string;
    userId: string | null;
    externalName: string | null;
    user: { id: string; name: string; avatarUrl: string | null } | null;
    expiresAt: string;
    expired: boolean;
  };
  approval: CardApproval & {
    card: {
      id: string;
      title: string;
      description: unknown;
      cardColor: string | null;
      startDate: string | null;
      dueDate: string | null;
      completedAt: string | null;
      estimateMinutes: number | null;
      board: { id: string; name: string; color: string | null };
      list: { id: string; name: string };
      lead: { id: string; name: string; avatarUrl: string | null } | null;
      labels: Array<{ label: { id: string; name: string; color: string } }>;
      members: Array<{
        role: 'MEMBER' | 'REVIEWER';
        user: { id: string; name: string; avatarUrl: string | null };
      }>;
      checklists: PublicApprovalChecklist[];
      attachments: PublicApprovalAttachment[];
      comments: PublicApprovalComment[];
      activities: PublicApprovalActivity[];
    };
  };
}

export const approvalsQueries = {
  forCard: (cardId: string) => ({
    queryKey: ['cards', cardId, 'approvals'] as const,
    queryFn: () => api.get<CardApproval[]>(`/api/v1/cards/${cardId}/approvals`),
  }),
  myPending: () => ({
    queryKey: ['me', 'pending-approvals'] as const,
    queryFn: () => api.get<PendingApprovalForUser[]>('/api/v1/me/pending-approvals'),
  }),
  publicView: (token: string) => ({
    queryKey: ['public', 'approvals', token] as const,
    queryFn: () => api.get<PublicApprovalView>(`/api/v1/public/approvals/${token}`),
  }),
};

export function requestApproval(cardId: string, input: RequestApprovalInput) {
  return api.post<CardApproval>(`/api/v1/cards/${cardId}/approvals`, input);
}

export function decideApproval(approvalId: string, input: DecideApprovalInput) {
  return api.post<CardApproval>(`/api/v1/approvals/${approvalId}/decide`, input);
}

export function undoApproval(approvalId: string, reason?: string) {
  return api.post<CardApproval>(`/api/v1/approvals/${approvalId}/undo`, { reason });
}

export function publicDecideApproval(token: string, input: DecideApprovalInput) {
  return api.post<CardApproval>(`/api/v1/public/approvals/${token}/decide`, input);
}
