import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
  /** Se setado, marca este comment como reply do parent. Flatten aplicado abaixo. */
  parentCommentId?: string;
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
    await this.access.assertCardAccess(userId, card.id, tenant, 'COMMENTER');

    const mentionUserIds = await this.resolveMentions(tenant.organizationId, input.plainText);

    // Reply: valida parent + faz flatten pra raiz se parent ja eh reply.
    // Resultado: threads sempre tem 1 nivel de indentacao (parent -> filhos).
    let parentCommentId: string | null = null;
    let parentAuthorId: string | null = null;
    if (input.parentCommentId) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: input.parentCommentId },
        select: { id: true, cardId: true, authorId: true, parentCommentId: true, deletedAt: true },
      });
      if (!parent || parent.cardId !== input.cardId) {
        throw new NotFoundException('Comentário-pai não encontrado neste card.');
      }
      if (parent.deletedAt) {
        throw new BadRequestException('Não é possível responder a um comentário removido.');
      }
      // Flatten: se o parent ja eh reply de outro, vira filho da raiz
      parentCommentId = parent.parentCommentId ?? parent.id;
      // Pra notif: usa o autor do parent direto (nao da raiz), pois e quem
      // o user esta respondendo. Quando flatten move pra raiz, o autor da
      // raiz pode ser diferente — quem deve receber notif e quem foi
      // respondido visualmente.
      parentAuthorId = parent.authorId;
    }

    const comment = await this.prisma.comment.create({
      data: {
        cardId: input.cardId,
        authorId: userId,
        body: input.body,
        mentions: mentionUserIds,
        parentCommentId,
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

    // Reply: autor do parent recebe notif "respondeu seu comentário",
    // exceto: (a) for ele mesmo respondendo, (b) ja esta em mentions
    // (evita duplicata), (c) ja esta em assigneeIds (idem).
    const replyTargetId =
      parentAuthorId &&
      parentAuthorId !== userId &&
      !mentionUserIds.includes(parentAuthorId) &&
      !assigneeIds.includes(parentAuthorId)
        ? parentAuthorId
        : null;

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
      ...(replyTargetId
        ? [
            {
              userId: replyTargetId,
              organizationId: tenant.organizationId,
              type: 'COMMENT' as const,
              title: `${comment.author.name} respondeu seu comentário`,
              body: this.truncate(input.plainText, 140),
              entityType: 'card',
              entityId: card.id,
            },
          ]
        : []),
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
      await this.access.assertCardAccess(userId, existing.card.id, tenant, 'EDITOR');
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
      await this.access.assertCardAccess(userId, existing.card.id, tenant, 'EDITOR');
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

  /**
   * Toggle de reacao emoji num comment. Idempotente: cria a entry se nao
   * existe, deleta se ja existe (do mesmo user + mesmo emoji). Permissao
   * minima eh VIEWER no board do card — qualquer um que ve o card pode
   * reagir.
   *
   * Retorna o estado pos-toggle pra UI fazer optimistic update com
   * verificacao. Emite COMMENT_REACTION_UPDATED pro room do board.
   */
  async toggleReaction(
    userId: string,
    tenant: TenantContext,
    commentId: string,
    emoji: string,
  ): Promise<{ commentId: string; emoji: string; userId: string; active: boolean }> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { card: { select: { id: true, boardId: true, organizationId: true } } },
    });
    if (!comment || comment.card.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Comentário não encontrado.');
    }
    if (comment.deletedAt) {
      throw new BadRequestException('Comentário foi removido.');
    }
    await this.access.assertCardAccess(userId, comment.card.id, tenant, 'VIEWER');

    const existing = await this.prisma.commentReaction.findUnique({
      where: { commentId_userId_emoji: { commentId, userId, emoji } },
      select: { id: true },
    });

    let active: boolean;
    if (existing) {
      await this.prisma.commentReaction.delete({ where: { id: existing.id } });
      active = false;
    } else {
      await this.prisma.commentReaction.create({
        data: { commentId, userId, emoji },
      });
      active = true;
    }

    this.events.emit(EVENT_NAMES.COMMENT_REACTION_UPDATED, {
      boardId: comment.card.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      cardId: comment.cardId,
      commentId,
    });

    return { commentId, emoji, userId, active };
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
