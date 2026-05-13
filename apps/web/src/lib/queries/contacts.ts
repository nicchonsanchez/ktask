import { api } from '@/lib/api-client';

export type ContactType = 'PERSON' | 'COMPANY';

export interface ContactUserMatch {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface ContactRow {
  id: string;
  organizationId: string;
  type: ContactType;
  name: string;
  email: string | null;
  phone: string | null;
  document: string | null;
  note: string | null;
  parentId: string | null;
  /** FK pra User. Quando setado, name/email/phone vêm do User e são read-only no CRM. */
  userId: string | null;
  createdAt: string;
  updatedAt: string;
  parent?: { id: string; name: string; type: ContactType } | null;
  /** User vinculado via FK direto (Contact.userId). */
  user?: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    avatarUrl: string | null;
  } | null;
  /** Cross-reference por email/phone (NÃO é vínculo formal). Usado em getOne pra sugerir link. */
  userMatch?: ContactUserMatch | null;
  _count?: { cards: number; children: number };
}

export interface ContactDetail extends ContactRow {
  children: Array<{
    id: string;
    name: string;
    type: ContactType;
    email: string | null;
    phone: string | null;
  }>;
  cards: Array<{
    cardId: string;
    contactId: string;
    createdAt: string;
    card: {
      id: string;
      shortCode: string | null;
      title: string;
      boardId: string;
      completedAt: string | null;
      isArchived: boolean;
      board: { id: string; name: string; color: string | null };
      list: { id: string; name: string };
    };
  }>;
}

export interface ListContactsParams {
  type?: ContactType;
  q?: string;
  parentId?: string;
  hasCards?: boolean;
  /** Filtro pelo vínculo a User: 'linked' / 'unlinked' / undefined (todos). */
  linkStatus?: 'linked' | 'unlinked';
}

export const contactsQueries = {
  list: (params?: ListContactsParams) => ({
    queryKey: ['contacts', params ?? {}] as const,
    queryFn: () => {
      const sp = new URLSearchParams();
      if (params?.type) sp.set('type', params.type);
      if (params?.q) sp.set('q', params.q);
      if (params?.parentId) sp.set('parentId', params.parentId);
      if (params?.hasCards !== undefined) sp.set('hasCards', String(params.hasCards));
      if (params?.linkStatus) sp.set('linkStatus', params.linkStatus);
      const qs = sp.toString();
      return api.get<ContactRow[]>(`/api/v1/contacts${qs ? `?${qs}` : ''}`);
    },
  }),
  detail: (id: string) => ({
    queryKey: ['contacts', id] as const,
    queryFn: () => api.get<ContactDetail>(`/api/v1/contacts/${id}`),
  }),
  forCard: (cardId: string) => ({
    queryKey: ['cards', cardId, 'contacts'] as const,
    queryFn: () => api.get<ContactRow[]>(`/api/v1/cards/${cardId}/contacts`),
  }),
};

export interface CreateContactInput {
  type: ContactType;
  name: string;
  email?: string;
  phone?: string;
  document?: string;
  note?: string;
  parentId?: string | null;
  /** Cria + vincula a User existente atomicamente (cria+linka num call). */
  linkToUserId?: string;
}

export function createContact(input: CreateContactInput) {
  return api.post<ContactRow>('/api/v1/contacts', input);
}

export function updateContact(id: string, input: Partial<CreateContactInput>) {
  return api.patch<ContactRow>(`/api/v1/contacts/${id}`, input);
}

export function removeContact(id: string) {
  return api.delete(`/api/v1/contacts/${id}`);
}

export type LinkContactInput = { contactId: string } | CreateContactInput;

export function linkContactToCard(cardId: string, input: LinkContactInput) {
  return api.post<ContactDetail>(`/api/v1/cards/${cardId}/contacts`, input);
}

export function unlinkContactFromCard(cardId: string, contactId: string) {
  return api.delete(`/api/v1/cards/${cardId}/contacts/${contactId}`);
}

export function linkContactToUser(contactId: string, userId: string) {
  return api.post<ContactDetail>(`/api/v1/contacts/${contactId}/link-user`, { userId });
}

export function unlinkContactFromUser(contactId: string) {
  return api.delete<ContactDetail>(`/api/v1/contacts/${contactId}/link-user`);
}
