/**
 * Eventos de dominio emitidos via Nest EventEmitter2.
 * O RealtimeGateway escuta todos os eventos `board.*` e faz broadcast
 * para o room `board:{boardId}`. Clientes na sala recebem via Socket.IO.
 *
 * Nome do evento tem sufixo que vira o canal Socket.IO para o cliente
 * (ex: 'board.card.moved' → cliente ouve 'card.moved').
 */
export interface BoardEventPayload {
  boardId: string;
  organizationId: string;
  actorId?: string;
}

export interface CardMovedPayload extends BoardEventPayload {
  cardId: string;
  fromListId: string;
  toListId: string;
  position: number;
}

export interface CardCreatedPayload extends BoardEventPayload {
  cardId: string;
  listId: string;
  title: string;
}

export interface CardUpdatedPayload extends BoardEventPayload {
  cardId: string;
}

export interface CardArchivedPayload extends BoardEventPayload {
  cardId: string;
}

export interface CardCompletedPayload extends BoardEventPayload {
  cardId: string;
  listId: string;
}

export interface CardUncompletedPayload extends BoardEventPayload {
  cardId: string;
  listId: string;
}

export interface ListCreatedPayload extends BoardEventPayload {
  listId: string;
}

export interface ListUpdatedPayload extends BoardEventPayload {
  listId: string;
}

export interface CommentAddedPayload extends BoardEventPayload {
  cardId: string;
  commentId: string;
}

/**
 * Eventos pessoais direcionados a usuário específico.
 * Room Socket.IO: `user:{userId}`.
 */
export interface UserEventPayload {
  userId: string;
  organizationId: string;
}

export interface NotificationCreatedPayload extends UserEventPayload {
  notificationId: string;
}

// Timer livre (cardId/boardId null) ainda dispara o evento mas não vai pro
// room de board nenhum — o gateway broadcasta só pra `user:{userId}`. Por
// isso esses payloads aceitam null em ambos.
export interface TimeEntryStartedPayload {
  boardId: string | null;
  cardId: string | null;
  organizationId: string;
  actorId?: string;
  entryId: string;
  userId: string;
  startedAt: string;
}

export interface TimeEntryStoppedPayload {
  boardId: string | null;
  cardId: string | null;
  organizationId: string;
  actorId?: string;
  entryId: string;
  userId: string;
  durationSec: number;
}

// Mapping helper — normaliza nome do evento para o canal do cliente
export const EVENT_NAMES = {
  CARD_CREATED: 'board.card.created',
  CARD_MOVED: 'board.card.moved',
  CARD_UPDATED: 'board.card.updated',
  CARD_ARCHIVED: 'board.card.archived',
  CARD_COMPLETED: 'board.card.completed',
  CARD_UNCOMPLETED: 'board.card.uncompleted',
  LIST_CREATED: 'board.list.created',
  LIST_UPDATED: 'board.list.updated',
  COMMENT_ADDED: 'board.comment.added',
  NOTIFICATION_CREATED: 'user.notification.created',
  TIME_ENTRY_STARTED: 'board.time.entry.started',
  TIME_ENTRY_STOPPED: 'board.time.entry.stopped',
} as const;
