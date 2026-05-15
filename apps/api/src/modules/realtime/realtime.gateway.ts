import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';

import { env } from '@/config/env';
import { PrismaService } from '@/common/prisma/prisma.service';
import { resolveBoardRole } from '@/modules/boards/board-permissions';
import type {
  BoardEventPayload,
  CardMovedPayload,
  CardCreatedPayload,
  CardUpdatedPayload,
  CardArchivedPayload,
  CardCompletedPayload,
  CardUncompletedPayload,
  ListCreatedPayload,
  ListUpdatedPayload,
  CommentAddedPayload,
  CommentReactionUpdatedPayload,
  NotificationCreatedPayload,
  TimeEntryStartedPayload,
  TimeEntryStoppedPayload,
} from './events.types';
import { EVENT_NAMES } from './events.types';

interface AuthedSocket extends Socket {
  data: {
    userId: string;
    email: string;
    organizationId?: string;
  };
}

/**
 * Gateway Socket.IO do KTask.
 *
 * Conexão: cliente envia `auth.token` (access token JWT) no handshake.
 * Namespace padrão `/`. Canais:
 *   - `user:{userId}`  (auto-join no connect): notificações pessoais
 *   - `board:{boardId}`: cliente pede `board.join` com boardId;
 *                        gateway valida acesso via resolveBoardRole e adiciona ao room.
 *
 * Emissão: services disparam eventos via EventEmitter2 (`board.card.moved`, etc);
 * gateway escuta e broadcast no room correspondente.
 */
@WebSocketGateway({
  cors: {
    origin: env.CORS_ORIGINS,
    credentials: true,
  },
  namespace: '/',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() io!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  /**
   * Presença por board: boardId → (userId → set de socketIds).
   * Um mesmo usuário pode ter N abas/dispositivos abertos no mesmo board;
   * só removemos do conjunto quando o último socket sai.
   */
  private readonly presence = new Map<string, Map<string, Set<string>>>();

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: AuthedSocket) {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      extractBearer(client.handshake.headers.authorization);

    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; email: string }>(token, {
        secret: env.JWT_ACCESS_SECRET,
      });
      client.data.userId = payload.sub;
      client.data.email = payload.email;

      // Auto-join ao canal pessoal
      await client.join(`user:${payload.sub}`);

      this.logger.log(`[connect] user=${payload.sub} sid=${client.id}`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthedSocket) {
    if (client.data?.userId) {
      this.logger.log(`[disconnect] user=${client.data.userId} sid=${client.id}`);
      // Limpa presença em todos os boards onde este socket estava
      for (const [boardId, users] of this.presence.entries()) {
        const sockets = users.get(client.data.userId);
        if (!sockets || !sockets.has(client.id)) continue;
        sockets.delete(client.id);
        if (sockets.size === 0) {
          users.delete(client.data.userId);
          this.emitPresence(boardId);
        }
        if (users.size === 0) this.presence.delete(boardId);
      }
    }
  }

  @SubscribeMessage('board.join')
  async onBoardJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { boardId: string; organizationId: string },
  ) {
    const { boardId, organizationId } = data ?? {};
    if (!boardId || !organizationId) {
      throw new UnauthorizedException('boardId e organizationId sao obrigatorios.');
    }

    const [board, membership] = await Promise.all([
      this.prisma.board.findUnique({
        where: { id: boardId },
        include: { members: { where: { userId: client.data.userId } } },
      }),
      this.prisma.membership.findUnique({
        where: {
          userId_organizationId: { userId: client.data.userId, organizationId },
        },
      }),
    ]);

    if (!board || board.organizationId !== organizationId || !membership) {
      return { ok: false, error: 'forbidden' };
    }

    const role = resolveBoardRole({
      orgRole: membership.role,
      boardMemberRole: board.members[0]?.role ?? null,
      boardVisibility: board.visibility,
    });

    if (!role) return { ok: false, error: 'forbidden' };

    await client.join(`board:${boardId}`);
    client.data.organizationId = organizationId;
    this.addPresence(boardId, client.data.userId, client.id);
    this.emitPresence(boardId);
    // Resposta inclui snapshot atual pra cliente popular UI sem esperar broadcast
    return { ok: true, role, online: this.snapshotPresence(boardId) };
  }

  @SubscribeMessage('board.leave')
  async onBoardLeave(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { boardId: string },
  ) {
    if (data?.boardId) {
      await client.leave(`board:${data.boardId}`);
      const removed = this.removePresence(data.boardId, client.data.userId, client.id);
      if (removed) this.emitPresence(data.boardId);
    }
    return { ok: true };
  }

  // ---------------- Presence helpers ----------------

  private addPresence(boardId: string, userId: string, socketId: string) {
    let users = this.presence.get(boardId);
    if (!users) {
      users = new Map();
      this.presence.set(boardId, users);
    }
    let sockets = users.get(userId);
    if (!sockets) {
      sockets = new Set();
      users.set(userId, sockets);
    }
    sockets.add(socketId);
  }

  /** Retorna true se o último socket do user saiu (precisa rebroadcast). */
  private removePresence(boardId: string, userId: string, socketId: string): boolean {
    const users = this.presence.get(boardId);
    if (!users) return false;
    const sockets = users.get(userId);
    if (!sockets) return false;
    sockets.delete(socketId);
    if (sockets.size > 0) return false;
    users.delete(userId);
    if (users.size === 0) this.presence.delete(boardId);
    return true;
  }

  private snapshotPresence(boardId: string): string[] {
    const users = this.presence.get(boardId);
    return users ? Array.from(users.keys()) : [];
  }

  private emitPresence(boardId: string) {
    this.io
      .to(`board:${boardId}`)
      .emit('presence.update', { boardId, userIds: this.snapshotPresence(boardId) });
  }

  // -----------------------------------------------------------------
  // Listeners: Board events → broadcast para room `board:{boardId}`
  // -----------------------------------------------------------------

  @OnEvent(EVENT_NAMES.CARD_CREATED)
  onCardCreated(payload: CardCreatedPayload) {
    this.broadcastBoard(payload, 'card.created', payload);
  }

  @OnEvent(EVENT_NAMES.CARD_MOVED)
  onCardMoved(payload: CardMovedPayload) {
    this.broadcastBoard(payload, 'card.moved', payload);
  }

  @OnEvent(EVENT_NAMES.CARD_UPDATED)
  onCardUpdated(payload: CardUpdatedPayload) {
    this.broadcastBoard(payload, 'card.updated', payload);
  }

  @OnEvent(EVENT_NAMES.CARD_ARCHIVED)
  onCardArchived(payload: CardArchivedPayload) {
    this.broadcastBoard(payload, 'card.archived', payload);
  }

  @OnEvent(EVENT_NAMES.CARD_COMPLETED)
  onCardCompleted(payload: CardCompletedPayload) {
    this.broadcastBoard(payload, 'card.completed', payload);
  }

  @OnEvent(EVENT_NAMES.CARD_UNCOMPLETED)
  onCardUncompleted(payload: CardUncompletedPayload) {
    this.broadcastBoard(payload, 'card.uncompleted', payload);
  }

  @OnEvent(EVENT_NAMES.LIST_CREATED)
  onListCreated(payload: ListCreatedPayload) {
    this.broadcastBoard(payload, 'list.created', payload);
  }

  @OnEvent(EVENT_NAMES.LIST_UPDATED)
  onListUpdated(payload: ListUpdatedPayload) {
    this.broadcastBoard(payload, 'list.updated', payload);
  }

  @OnEvent(EVENT_NAMES.COMMENT_ADDED)
  onCommentAdded(payload: CommentAddedPayload) {
    this.broadcastBoard(payload, 'comment.added', payload);
  }

  @OnEvent(EVENT_NAMES.COMMENT_REACTION_UPDATED)
  onCommentReactionUpdated(payload: CommentReactionUpdatedPayload) {
    this.broadcastBoard(payload, 'comment.reaction.updated', payload);
  }

  @OnEvent(EVENT_NAMES.NOTIFICATION_CREATED)
  onNotificationCreated(payload: NotificationCreatedPayload) {
    this.io.to(`user:${payload.userId}`).emit('notification.created', payload);
  }

  @OnEvent(EVENT_NAMES.TIME_ENTRY_STARTED)
  onTimeEntryStarted(payload: TimeEntryStartedPayload) {
    if (payload.boardId) {
      this.io.to(`board:${payload.boardId}`).emit('time.entry.started', payload);
    }
    this.io.to(`user:${payload.userId}`).emit('time.entry.started', payload);
  }

  @OnEvent(EVENT_NAMES.TIME_ENTRY_STOPPED)
  onTimeEntryStopped(payload: TimeEntryStoppedPayload) {
    if (payload.boardId) {
      this.io.to(`board:${payload.boardId}`).emit('time.entry.stopped', payload);
    }
    this.io.to(`user:${payload.userId}`).emit('time.entry.stopped', payload);
  }

  // -----------------------------------------------------------------

  private broadcastBoard(origin: BoardEventPayload, channel: string, payload: unknown) {
    this.io.to(`board:${origin.boardId}`).emit(channel, payload);
  }
}

function extractBearer(header: string | string[] | undefined): string | null {
  if (!header) return null;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.startsWith('Bearer ')) return null;
  return value.slice('Bearer '.length);
}
