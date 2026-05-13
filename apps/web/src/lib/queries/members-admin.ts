import { api } from '@/lib/api-client';
import type { OrgRole } from '@ktask/contracts';

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

export function updateMember(userId: string, input: UpdateMemberInput) {
  return api.patch(`/api/v1/admin/members/${userId}`, input);
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
