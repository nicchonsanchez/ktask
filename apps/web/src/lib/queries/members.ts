import { api } from '@/lib/api-client';
import type { OrgRole } from '@ktask/contracts';

export interface MemberRow {
  id: string;
  userId: string;
  organizationId: string;
  role: OrgRole;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    phone: string | null;
    notifyApprovalsOnWhatsApp: boolean;
  };
}

export interface InvitationRow {
  id: string;
  organizationId: string;
  email: string;
  role: OrgRole;
  expiresAt: string;
  createdAt: string;
  invitedBy: { id: string; name: string; email: string };
}

export const membersQueries = {
  all: () => ({
    queryKey: ['org', 'members'] as const,
    queryFn: () => api.get<MemberRow[]>('/api/v1/organizations/members'),
  }),
  pendingInvitations: () => ({
    queryKey: ['org', 'invitations'] as const,
    queryFn: () => api.get<InvitationRow[]>('/api/v1/organizations/invitations'),
  }),
};

export function updateMemberRole(userId: string, role: OrgRole) {
  return api.patch(`/api/v1/organizations/members/${userId}/role`, { role });
}

export function removeMember(userId: string) {
  return api.delete(`/api/v1/organizations/members/${userId}`);
}

export function inviteMember(email: string, role: OrgRole) {
  return api.post<{
    invitation: { id: string; email: string; role: OrgRole; expiresAt: string };
    rawToken: string;
  }>('/api/v1/organizations/invitations', { email, role });
}

export function revokeInvitation(invitationId: string) {
  return api.delete(`/api/v1/organizations/invitations/${invitationId}`);
}

export interface InvitePreview {
  email: string;
  role: OrgRole;
  expiresAt: string;
  organization: { id: string; name: string; slug: string; logoUrl: string | null };
}

export function previewInvitation(token: string) {
  return api.get<InvitePreview>(`/api/v1/invitations/${encodeURIComponent(token)}`, {
    skipAuth: true,
    skipAuthRefresh: true,
  });
}

export function acceptInvitation(token: string) {
  return api.post<{ organization: { id: string; name: string; slug: string } }>(
    '/api/v1/invitations/accept',
    { token },
  );
}
