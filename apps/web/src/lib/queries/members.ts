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
  /** Doc 35: telefone opcional do convidado pra envio via WhatsApp. */
  phone: string | null;
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

export function inviteMember(input: { email: string; role: OrgRole; phone?: string }) {
  return api.post<{
    invitation: {
      id: string;
      email: string;
      phone: string | null;
      role: OrgRole;
      expiresAt: string;
    };
    rawToken: string;
  }>('/api/v1/organizations/invitations', input);
}

export function revokeInvitation(invitationId: string) {
  return api.delete(`/api/v1/organizations/invitations/${invitationId}`);
}

export interface InvitePreview {
  email: string;
  role: OrgRole;
  expiresAt: string;
  organization: { id: string; name: string; slug: string; logoUrl: string | null };
  /** Doc 34: false = email novo, mostra form de cadastro inline. */
  userExists: boolean;
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

/**
 * Doc 34: cria conta a partir do convite e loga automaticamente.
 * Backend cria User + Membership + marca convite aceito em transacao.
 */
export interface SignupFromInviteInput {
  token: string;
  name: string;
  password: string;
}

export interface SignupFromInviteResult {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    phone: string | null;
    notifyApprovalsOnWhatsApp: boolean;
    locale: string;
    timezone: string;
    twoFactorEnabled: boolean;
    createdAt: string;
  };
}

export function signupFromInvite(input: SignupFromInviteInput) {
  return api.post<SignupFromInviteResult>('/api/v1/auth/signup-from-invite', input, {
    skipAuth: true,
    skipAuthRefresh: true,
  });
}
