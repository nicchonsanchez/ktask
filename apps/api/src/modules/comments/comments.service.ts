import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { EVENT_NAMES } from '@/modules/realtime/events.types';
import { BoardAccessService } from '@/modules/boards/board-access.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';

interface CreateCommentInput {
  cardId: string;
  body: Prisma.InputJsonValue; // Tiptap JSON (ou texto simples no MVP)
  plainText: string; // versão texto puro para extrair menções
}

interface UpdateCommentInput {
  body: Prisma.InputJsonValue;
  plainText: string;
}

/**
 * Extrai @menções por padrão `@usuario` ou `@usuario.domain` dentro do texto.
 * Retorna lista de handles (parte antes do domínio) — a resolução para userIds
 * é feita no service por email.
 */
export function extractMentionHandles(text: string): string[] {
  const re = /(?:^|\s)@([a-z0-9][a-z0-9._-]{1,63})(?=\b)/gi;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.add(m[1]!.toLowerCase());
  }
  return [...out];
}

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BoardAccessService,
    private readonly notifications: NotificationsService,
    private readonly events: EventEmitter2,
  ) {}

  async create(userId: string, tenant: TenantContext, input: CreateCommentInput) {
    const card = await this.getCardOrThrow(input.cardId, tenant.organizationId);
    await this.access.assertAccess(userId, card.boardId, tenant, 'COMMENTER');

    const mentionUserIds = await this.resolveMentions(tenant.organizationId, input.plainText);

    const comment = await this.prisma.comment.create({
      data: {
        cardId: input.cardId,
        authorId: userId,
        body: input.body,
        mentions: mentionUserIds,
      },
      include: { author: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: card.boardId,
        cardId: card.id,
        actorId: userId,
        type: 'COMMENT_ADDED',
        payload: { cardId: card.id, commentId: comment.id },
      },
    });

    // Notificações:
    //   - mentionUserIds -> MENTION
    //   - assignees do card (que nao sao o autor nem ja mencionados) -> COMMENT
    const assignees = await this.prisma.cardMember.findMany({
      where: { cardId: input.cardId },
      select: { userId: true },
    });

    const assigneeIds = assignees
      .map((a) => a.userId)
      .filter((id) => id !== userId && !mentionUserIds.includes(id));

    const notifications = [
      ...mentionUserIds
        .filter((id) => id !== userId)
        .map((uid) => ({
          userId: uid,
          organizationId: tenant.organizationId,
          type: 'MENTION' as const,
          title: `${comment.author.name} mencionou você`,
          body: this.truncate(input.plainText, 140),
          entityType: 'card',
          entityId: card.id,
        })),
      ...assigneeIds.map((uid) => ({
        userId: uid,
        organizationId: tenant.organizationId,
        type: 'COMMENT' as const,
        title: `${comment.author.name} comentou em "${card.title}"`,
        body: this.truncate(input.plainText, 140),
        entityType: 'card',
        entityId: card.id,
      })),
    ];

    await this.notifications.createMany(notifications);

    // Eventos real-time: card.comment.added pro board + notification.created para cada destinatario
    this.events.emit(EVENT_NAMES.COMMENT_ADDED, {
      boardId: card.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      cardId: card.id,
      commentId: comment.id,
    });

    for (const n of notifications) {
      this.events.emit(EVENT_NAMES.NOTIFICATION_CREATED, {
        userId: n.userId,
        organizationId: tenant.organizationId,
        notificationId: '', // o gateway não precisa do id aqui; cliente faz refetch
      });
    }

    return comment;
  }

  async update(
    userId: string,
    tenant: TenantContext,
    commentId: string,
    input: UpdateCommentInput,
  ) {
    const existing = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { card: true },
    });
    if (!existing) throw new NotFoundException('Comentário não encontrado.');
    if (existing.card.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Comentário não encontrado.');
    }
    if (existing.authorId !== userId) {
      // Modelo unificado: autor sempre pode; ou EDITOR+ no board (MEMBER ou superior).
      await this.access.assertAccess(userId, existing.card.boardId, tenant, 'EDITOR');
    }
    if (existing.deletedAt) {
      throw new BadRequestException('Comentário já foi excluído.');
    }

    const mentionUserIds = await this.resolveMentions(tenant.organizationId, input.plainText);

    const updated = await this.prisma.comment.update({
      where: { id: commentId },
      data: {
        body: input.body,
        mentions: mentionUserIds,
        editedAt: new Date(),
      },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: existing.card.boardId,
        cardId: existing.cardId,
        actorId: userId,
        type: 'COMMENT_EDITED',
        payload: { cardId: existing.cardId, commentId },
      },
    });

    return updated;
  }

  async delete(userId: string, tenant: TenantContext, commentId: string) {
    const existing = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { card: true },
    });
    if (!existing) throw new NotFoundException('Comentário não encontrado.');
    if (existing.card.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Comentário não encontrado.');
    }
    if (existing.authorId !== userId) {
      // Modelo unificado: autor sempre pode; ou EDITOR+ no board (MEMBER ou superior).
      await this.access.assertAccess(userId, existing.card.boardId, tenant, 'EDITOR');
    }

    await this.prisma.comment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: existing.card.boardId,
        cardId: existing.cardId,
        actorId: userId,
        type: 'COMMENT_DELETED',
        payload: { cardId: existing.cardId, commentId },
      },
    });

    return { ok: true };
  }

  // -----------------------------------------------------------------

  private async resolveMentions(organizationId: string, plainText: string): Promise<string[]> {
    const handles = extractMentionHandles(plainText);
    if (handles.length === 0) return [];

    // Menções batem com a parte antes do @ do e-mail do usuário na Org.
    const users = await this.prisma.user.findMany({
      where: {
        memberships: { some: { organizationId } },
      },
      select: { id: true, email: true },
    });

    const matches = users
      .filter((u) => {
        const localPart = u.email.split('@')[0]?.toLowerCase();
        return localPart && handles.includes(localPart);
      })
      .map((u) => u.id);

    return matches;
  }

  private async getCardOrThrow(cardId: string, organizationId: string) {
    const card = await this.prisma.card.findUnique({ where: { id: cardId } });
    if (!card || card.organizationId !== organizationId) {
      throw new NotFoundException('Card não encontrado.');
    }
    return card;
  }

  private truncate(s: string, max: number): string {
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + '…';
  }
}
