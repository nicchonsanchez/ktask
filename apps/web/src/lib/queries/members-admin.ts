import { api } from '@/lib/api-client';
import type {
  OrgRole,
  ResponsibilityPreviewDto,
  ResponsibilityTransferResultDto,
  TransferResponsibilitiesInput,
} from '@ktask/contracts';

export interface MemberDetail {
  id: string;
  email: string;
  pendingEmail: string | null;
  name: string;
  avatarUrl: string | null;
  phone: string | null;
  notifyApprovalsOnWhatsApp: boolean;
  twoFactorEnabled: boolean;
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  lockedUntil: string | null;
  failedLoginCount: number;
  role: OrgRole;
  lastActivity: { createdAt: string; type: string } | null;
  activeSessions: number;
}

export interface MemberActivityItem {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  boardId: string | null;
  cardId: string | null;
  createdAt: string;
}

export const membersAdminQueries = {
  /** Doc 55: previa das responsabilidades pendentes. */
  responsibilities: (userId: string) => ({
    queryKey: ['admin', 'members', userId, 'responsibilities'] as const,
    queryFn: () =>
      api.get<ResponsibilityPreviewDto>(`/api/v1/admin/members/${userId}/responsibilities`),
  }),
  detail: (userId: string) => ({
    queryKey: ['admin', 'members', userId] as const,
    queryFn: () => api.get<MemberDetail>(`/api/v1/admin/members/${userId}`),
  }),
  activity: (userId: string, limit = 30) => ({
    queryKey: ['admin', 'members', userId, 'activity', limit] as const,
    queryFn: () =>
      api.get<MemberActivityItem[]>(`/api/v1/admin/members/${userId}/activity?limit=${limit}`),
  }),
};

export interface UpdateMemberInput {
  name?: string;
  email?: string;
  phone?: string | null;
}

export interface UpdateMemberResult {
  ok: boolean;
  changed: boolean;
  /** Presente quando o email mudou: link de confirmação enviado pro novo endereço. */
  emailChange?: { to: string; sent: boolean };
}

export function updateMember(userId: string, input: UpdateMemberInput) {
  return api.patch<UpdateMemberResult>(`/api/v1/admin/members/${userId}`, input);
}

/** Doc 53: reenvia o link de confirmação da troca de e-mail pendente. */
export function resendEmailChange(userId: string) {
  return api.post<{ ok: boolean; sent: boolean; message: string }>(
    `/api/v1/admin/members/${userId}/email-change/resend`,
  );
}

/** Doc 53: cancela a troca de e-mail pendente e invalida os links enviados. */
export function cancelEmailChange(userId: string) {
  return api.post<{ ok: boolean; changed: boolean }>(
    `/api/v1/admin/members/${userId}/email-change/cancel`,
  );
}

export function forcePasswordReset(userId: string) {
  return api.post<{ ok: boolean; message: string }>(
    `/api/v1/admin/members/${userId}/force-password-reset`,
  );
}

/** Envia link de redefinição (email + WhatsApp se phone) SEM invalidar sessões ativas. */
export function sendPasswordResetLink(userId: string) {
  return api.post<{ ok: boolean; message: string }>(
    `/api/v1/admin/members/${userId}/send-password-reset`,
  );
}

export function suspendMember(userId: string, reason: string) {
  return api.post(`/api/v1/admin/members/${userId}/suspend`, { reason });
}

export function unsuspendMember(userId: string) {
  return api.post(`/api/v1/admin/members/${userId}/unsuspend`);
}

/** Doc 55: transfere as responsabilidades pendentes para outro membro. */
export function transferResponsibilities(userId: string, input: TransferResponsibilitiesInput) {
  return api.post<ResponsibilityTransferResultDto>(
    `/api/v1/admin/members/${userId}/responsibilities/transfer`,
    input,
  );
}
