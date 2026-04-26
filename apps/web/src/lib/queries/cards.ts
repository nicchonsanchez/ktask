import { api } from '@/lib/api-client';
import type { CardListItem } from './boards';

export interface CardDetail {
  id: string;
  boardId: string;
  listId: string;
  title: string;
  description: unknown | null;
  priority: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  estimateMinutes: number | null;
  isArchived: boolean;
  coverAttachmentId: string | null;
  createdAt: string;
  updatedAt: string;
  leadId: string | null;
  lead: { id: string; name: string; email: string; avatarUrl: string | null } | null;
  list: { id: string; name: string; boardId: string };
  members: Array<{
    cardId: string;
    userId: string;
    user: { id: string; name: string; email: string; avatarUrl: string | null };
  }>;
  labels: Array<{
    cardId: string;
    labelId: string;
    label: { id: string; name: string; color: string };
  }>;
  checklists: Checklist[];
  attachments: Attachment[];
  comments: CommentNode[];
  activities: ActivityNode[];
  _count: { children: number };
}

export interface CommentNode {
  id: string;
  cardId: string;
  authorId: string;
  body: unknown;
  mentions: string[];
  editedAt: string | null;
  createdAt: string;
  deletedAt: string | null;
  author: { id: string; name: string; email: string; avatarUrl: string | null };
  attachments?: Attachment[];
}

export interface ActivityNode {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  actor: { id: string; name: string; email: string; avatarUrl: string | null } | null;
}

export const cardsQueries = {
  detail: (cardId: string) => ({
    queryKey: ['cards', cardId] as const,
    queryFn: () => api.get<CardDetail>(`/api/v1/cards/${cardId}`),
    enabled: Boolean(cardId),
  }),
};

export interface UpdateCardInput {
  title?: string;
  description?: unknown | null;
  priority?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  startDate?: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
  estimateMinutes?: number | null;
  leadId?: string | null;
  coverAttachmentId?: string | null;
}

export function updateCard(cardId: string, input: UpdateCardInput) {
  return api.patch<CardListItem>(`/api/v1/cards/${cardId}`, input);
}

export function archiveCard(cardId: string) {
  return api.delete(`/api/v1/cards/${cardId}`);
}

export interface DuplicateCardOptions {
  copyDescription?: boolean;
  copyLead?: boolean;
  copyTeam?: boolean;
  copyTags?: boolean;
  copyDueDate?: boolean;
  copyChecklists?: boolean;
  copyAttachments?: boolean;
  copyParent?: boolean;
  count?: number;
  targetBoardId?: string | null;
  targetListId?: string | null;
}

export function duplicateCard(cardId: string, options: DuplicateCardOptions = {}) {
  return api.post<{ count: number; cards: Array<{ id: string; title: string }> }>(
    `/api/v1/cards/${cardId}/duplicate`,
    options,
  );
}

export function deleteCardPermanent(cardId: string) {
  return api.delete(`/api/v1/cards/${cardId}/permanent`);
}

/* ----------------- Família (pai/filho) ----------------- */

export interface FamilyCard {
  id: string;
  title: string;
  boardId: string;
  listId: string;
  parentCardId: string | null;
  priority: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate: string | null;
  completedAt: string | null;
  updatedAt: string;
  list: { id: string; name: string; isArchived: boolean };
  board: { id: string; name: string; color: string | null; icon: string | null };
  members: Array<{
    cardId: string;
    userId: string;
    user: { id: string; name: string; email: string; avatarUrl: string | null };
  }>;
  lead: { id: string; name: string; email: string; avatarUrl: string | null } | null;
}

export interface FamilyDescendant extends FamilyCard {
  depth: number; // 1 = filho direto, 2 = neto, 3 = bisneto, ...
}

export interface CardFamily {
  parent: FamilyCard | null;
  siblings: FamilyCard[];
  descendants: FamilyDescendant[];
}

export const cardFamilyQuery = (cardId: string) => ({
  queryKey: ['cards', cardId, 'family'] as const,
  queryFn: () => api.get<CardFamily>(`/api/v1/cards/${cardId}/family`),
});

export interface CreateChildInput {
  title: string;
  description?: unknown | null;
  copyDescription?: boolean;
  copyLead?: boolean;
  copyTeam?: boolean;
  copyTags?: boolean;
  copyDueDate?: boolean;
  copyAttachments?: boolean;
  targetBoardId?: string | null;
  targetListId?: string | null;
}

export function createChildCard(parentId: string, input: CreateChildInput) {
  return api.post<{ id: string; title: string; listId: string; boardId: string }>(
    `/api/v1/cards/${parentId}/children`,
    input,
  );
}

export function setCardParent(cardId: string, parentCardId: string | null) {
  return api.patch(`/api/v1/cards/${cardId}/parent`, { parentCardId });
}

export function assignMember(cardId: string, userId: string) {
  return api.post(`/api/v1/cards/${cardId}/members`, { userId });
}

export function unassignMember(cardId: string, userId: string) {
  return api.delete(`/api/v1/cards/${cardId}/members/${userId}`);
}

export interface OrgMember {
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'GESTOR' | 'MEMBER' | 'GUEST';
  user: { id: string; name: string; email: string; avatarUrl: string | null };
}

export const orgMembersQuery = {
  queryKey: ['org-members'] as const,
  queryFn: () => api.get<OrgMember[]>('/api/v1/organizations/members'),
};

/* ----------------- Checklists ----------------- */

export interface ChecklistItem {
  id: string;
  checklistId: string;
  text: string;
  isDone: boolean;
  position: number;
  dueDate: string | null;
  assigneeId: string | null;
  doneAt: string | null;
  doneById: string | null;
}

export interface Checklist {
  id: string;
  cardId: string;
  title: string;
  position: number;
  items: ChecklistItem[];
}

export function createChecklist(input: { cardId: string; title?: string }) {
  return api.post<Checklist>('/api/v1/checklists', {
    cardId: input.cardId,
    title: input.title ?? 'Tarefas',
  });
}

export function renameChecklist(checklistId: string, title: string) {
  return api.patch(`/api/v1/checklists/${checklistId}`, { title });
}

export function removeChecklist(checklistId: string) {
  return api.delete(`/api/v1/checklists/${checklistId}`);
}

export function addChecklistItem(checklistId: string, text: string) {
  return api.post<ChecklistItem>(`/api/v1/checklists/${checklistId}/items`, { text });
}

export function updateChecklistItem(
  itemId: string,
  input: { text?: string; isDone?: boolean; dueDate?: string | null; assigneeId?: string | null },
) {
  return api.patch<ChecklistItem>(`/api/v1/checklists/items/${itemId}`, input);
}

export function removeChecklistItem(itemId: string) {
  return api.delete(`/api/v1/checklists/items/${itemId}`);
}

export function addLabelToCard(cardId: string, labelId: string) {
  return api.post(`/api/v1/cards/${cardId}/labels`, { labelId });
}

export function removeLabelFromCard(cardId: string, labelId: string) {
  return api.delete(`/api/v1/cards/${cardId}/labels/${labelId}`);
}

export function moveChecklistItem(
  itemId: string,
  input: { afterItemId: string | null; toChecklistId?: string },
) {
  return api.patch(`/api/v1/checklists/items/${itemId}/move`, input);
}

/* ----------------- Attachments ----------------- */

export interface Attachment {
  id: string;
  cardId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  kind: 'FILE' | 'IMAGE' | 'LINK';
  publicUrl: string | null;
  createdAt: string;
  uploader: { id: string; name: string; avatarUrl: string | null };
}

export interface AttachmentPresign {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresIn: number;
}

export function presignAttachment(
  cardId: string,
  input: { fileName: string; contentType: string; sizeBytes: number },
) {
  return api.post<AttachmentPresign>(`/api/v1/cards/${cardId}/attachments/presign`, input);
}

export function createAttachment(
  cardId: string,
  input: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
    embedded?: boolean;
  },
) {
  return api.post<Attachment>(`/api/v1/cards/${cardId}/attachments`, input);
}

export function removeAttachment(attachmentId: string) {
  return api.delete(`/api/v1/attachments/${attachmentId}`);
}

/**
 * Upload completo: presign → PUT direto no storage → create registro.
 * Devolve o Attachment criado (com publicUrl).
 *
 * Quando `embedded=true`, o anexo nao aparece na lista visivel do card —
 * usado pra imagens inseridas diretamente no editor rich (descricao/comments).
 */
export async function uploadAttachment(
  cardId: string,
  file: File,
  options?: { embedded?: boolean },
): Promise<Attachment> {
  const presign = await presignAttachment(cardId, {
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
  });

  try {
    const res = await fetch(presign.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
    if (!res.ok) {
      throw new Error(`Falha no upload (servidor de arquivos respondeu HTTP ${res.status}).`);
    }
  } catch (err) {
    if (err instanceof Error && !/HTTP\s/.test(err.message)) {
      throw new Error(
        'Não foi possível enviar o arquivo pro servidor. Verifique sua conexão e tente de novo.',
      );
    }
    throw err;
  }

  return createAttachment(cardId, {
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    storageKey: presign.key,
    embedded: options?.embedded ?? false,
  });
}

export function presignAttachmentForComment(
  commentId: string,
  input: { fileName: string; contentType: string; sizeBytes: number },
) {
  return api.post<AttachmentPresign>(`/api/v1/comments/${commentId}/attachments/presign`, input);
}

export function createAttachmentForComment(
  commentId: string,
  input: { fileName: string; mimeType: string; sizeBytes: number; storageKey: string },
) {
  return api.post<Attachment>(`/api/v1/comments/${commentId}/attachments`, input);
}

/**
 * Upload completo pra anexo de COMMENT (timeline).
 * Mesmo fluxo de presign → PUT → create, mas com endpoints específicos do comment.
 */
export async function uploadAttachmentForComment(
  commentId: string,
  file: File,
): Promise<Attachment> {
  const presign = await presignAttachmentForComment(commentId, {
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
  });

  try {
    const res = await fetch(presign.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
    if (!res.ok) {
      throw new Error(`Falha no upload (servidor de arquivos respondeu HTTP ${res.status}).`);
    }
  } catch (err) {
    if (err instanceof Error && !/HTTP\s/.test(err.message)) {
      throw new Error(
        'Não foi possível enviar o arquivo pro servidor. Verifique sua conexão e tente de novo.',
      );
    }
    throw err;
  }

  return createAttachmentForComment(commentId, {
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    storageKey: presign.key,
  });
}

/* ----------------- Comments ----------------- */

export function createComment(input: { cardId: string; plainText: string }) {
  return api.post<CommentNode>('/api/v1/comments', input);
}

export function updateComment(commentId: string, input: { plainText: string }) {
  return api.patch<CommentNode>(`/api/v1/comments/${commentId}`, input);
}

export function deleteComment(commentId: string) {
  return api.delete(`/api/v1/comments/${commentId}`);
}
