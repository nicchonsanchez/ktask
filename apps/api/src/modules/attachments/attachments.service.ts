import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { BoardAccessService } from '@/modules/boards/board-access.service';
import { EVENT_NAMES } from '@/modules/realtime/events.types';
import { StorageService } from '@/modules/storage/storage.service';

import { MAX_ATTACHMENT_SIZE } from './dto/attachment.schemas';

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BoardAccessService,
    private readonly events: EventEmitter2,
    private readonly storage: StorageService,
  ) {}

  /**
   * Gera URL pré-assinada pra upload direto no storage.
   * Cliente faz PUT na uploadUrl; depois confirma com create().
   */
  async presignUpload(
    userId: string,
    tenant: TenantContext,
    cardId: string,
    input: { fileName: string; contentType: string; sizeBytes: number },
  ) {
    if (input.sizeBytes > MAX_ATTACHMENT_SIZE) {
      throw new BadRequestException('Arquivo grande demais (máx. 25MB).');
    }
    if (!this.storage.isEnabled()) {
      throw new ServiceUnavailableException('Armazenamento de arquivos não configurado.');
    }
    const card = await this.getCardOrThrow(cardId, tenant.organizationId);
    await this.access.assertCardAccess(userId, card.id, tenant, 'EDITOR');

    return this.storage.presignUpload({
      keyPrefix: `attachments/${card.boardId}/${cardId}`,
      contentType: input.contentType,
      maxSize: MAX_ATTACHMENT_SIZE,
      ttl: 300, // 5 min: arquivos maiores que avatar precisam de tempo
    });
  }

  async create(
    userId: string,
    tenant: TenantContext,
    cardId: string,
    input: {
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      storageKey: string;
      commentId?: string | null;
      embedded?: boolean;
    },
  ) {
    const card = await this.getCardOrThrow(cardId, tenant.organizationId);
    await this.access.assertCardAccess(userId, card.id, tenant, 'EDITOR');

    // Se commentId vier, valida que o comment pertence ao card e está visível.
    if (input.commentId) {
      const comment = await this.prisma.comment.findUnique({
        where: { id: input.commentId },
        select: { cardId: true, deletedAt: true },
      });
      if (!comment || comment.cardId !== cardId || comment.deletedAt) {
        throw new BadRequestException('Comentário inválido para este card.');
      }
    }

    const kind = input.mimeType.startsWith('image/') ? 'IMAGE' : 'FILE';

    const attachment = await this.prisma.attachment.create({
      data: {
        cardId,
        commentId: input.commentId ?? null,
        uploaderId: userId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        storageKey: input.storageKey,
        kind,
        embedded: input.embedded ?? false,
      },
      include: { uploader: { select: { id: true, name: true, avatarUrl: true } } },
    });
    const hydrated = { ...attachment, publicUrl: this.storage.publicUrlFor(attachment.storageKey) };

    // Activity ATTACHMENT_ADDED só pra anexos diretos do card (na seção de anexos).
    // Anexo vinculado a um comentário NÃO gera entrada na timeline — o COMMENT_ADDED
    // já está lá representando o evento, e o anexo aparece visualmente no comentário.
    if (!attachment.commentId) {
      await this.prisma.activity.create({
        data: {
          organizationId: tenant.organizationId,
          boardId: card.boardId,
          cardId,
          actorId: userId,
          type: 'ATTACHMENT_ADDED',
          payload: {
            attachmentId: attachment.id,
            fileName: attachment.fileName,
          },
        },
      });
    }

    this.events.emit(EVENT_NAMES.CARD_UPDATED, {
      boardId: card.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      cardId,
    });

    return hydrated;
  }

  async remove(userId: string, tenant: TenantContext, attachmentId: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        card: true,
        comment: { select: { authorId: true } },
      },
    });
    if (!attachment || attachment.card.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Anexo não encontrado.');
    }

    // Anexo de comment: dono do comment OU OWNER/ADMIN da Org.
    if (attachment.commentId && attachment.comment) {
      const isOwner = attachment.comment.authorId === userId;
      const isOrgAdmin = tenant.role === 'OWNER' || tenant.role === 'ADMIN';
      if (!isOwner && !isOrgAdmin) {
        throw new ForbiddenException('Apenas o autor do comentário ou OWNER/ADMIN pode remover.');
      }
    } else {
      // Anexo direto do card: requer EDITOR no board.
      await this.access.assertCardAccess(userId, attachment.card.id, tenant, 'EDITOR');
    }

    await this.prisma.attachment.delete({ where: { id: attachmentId } });

    // Mesma logica do create: anexo vinculado a comentario nao polui a timeline
    // do card com ATTACHMENT_REMOVED. Apenas anexos diretos do card geram activity.
    if (!attachment.commentId) {
      await this.prisma.activity.create({
        data: {
          organizationId: tenant.organizationId,
          boardId: attachment.card.boardId,
          cardId: attachment.cardId,
          actorId: userId,
          type: 'ATTACHMENT_REMOVED',
          payload: { attachmentId, fileName: attachment.fileName },
        },
      });
    }

    this.events.emit(EVENT_NAMES.CARD_UPDATED, {
      boardId: attachment.card.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      cardId: attachment.cardId,
    });

    // Obs: o objeto no storage não é deletado aqui (bucket cresce; aceitável
    // por ora, depois colocamos job de GC pra remover órfãos)

    return { ok: true };
  }

  /**
   * Presign upload pra anexo de COMMENT (timeline).
   * Resolve o card a partir do comment e reusa a mesma lógica de checagem.
   */
  async presignUploadForComment(
    userId: string,
    tenant: TenantContext,
    commentId: string,
    input: { fileName: string; contentType: string; sizeBytes: number },
  ) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { card: true },
    });
    if (!comment || comment.card.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Comentário não encontrado.');
    }
    return this.presignUpload(userId, tenant, comment.cardId, input);
  }

  /**
   * Cria anexo vinculado a um comment. O cardId é resolvido a partir do
   * comment (não vem do client) pra evitar inconsistência.
   */
  async createForComment(
    userId: string,
    tenant: TenantContext,
    commentId: string,
    input: {
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      storageKey: string;
      embedded?: boolean;
    },
  ) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { card: true },
    });
    if (!comment || comment.card.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Comentário não encontrado.');
    }
    if (comment.deletedAt) {
      throw new BadRequestException('Não é possível anexar a um comentário removido.');
    }
    return this.create(userId, tenant, comment.cardId, { ...input, commentId });
  }

  private async getCardOrThrow(cardId: string, organizationId: string) {
    const card = await this.prisma.card.findUnique({ where: { id: cardId } });
    if (!card || card.organizationId !== organizationId) {
      throw new NotFoundException('Card não encontrado.');
    }
    return card;
  }
}
