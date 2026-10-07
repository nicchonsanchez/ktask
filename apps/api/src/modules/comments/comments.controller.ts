import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';

import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { TenantGuard } from '@/common/tenant/tenant.guard';
import { CurrentOrg } from '@/common/tenant/current-org.decorator';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '@/modules/auth/auth.types';

import { ContactLoggingService } from '@/modules/performance/contact-logging.service';

import { CommentsService } from './comments.service';
import {
  CreateCommentSchema,
  ToggleReactionSchema,
  UpdateCommentSchema,
  type CreateCommentRequest,
  type ToggleReactionRequest,
  type UpdateCommentRequest,
} from './dto/comment.schemas';

/**
 * Gera um doc ProseMirror mínimo a partir de texto puro.
 * No MVP o editor envia plainText; a v1 (Tiptap completo) enviará body JSON já formatado.
 */
function plainTextToDoc(text: string): Prisma.InputJsonValue {
  const paragraphs = text.split(/\n{2,}/).map((p) => ({
    type: 'paragraph',
    content: p.length > 0 ? [{ type: 'text', text: p }] : [],
  }));
  return { type: 'doc', content: paragraphs } as unknown as Prisma.InputJsonValue;
}

@ApiTags('comments')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller({ path: 'comments', version: '1' })
export class CommentsController {
  constructor(
    private readonly comments: CommentsService,
    private readonly contactLogging: ContactLoggingService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Criar comentário num card' })
  async create(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Body(new ZodValidationPipe(CreateCommentSchema)) body: CreateCommentRequest,
  ) {
    // Doc 52 (Fase 3): registro de contato opcional. Validado ANTES do
    // comentario (erro barra tudo); gravado logo depois. Sem `interaction`,
    // o fluxo abaixo e exatamente o de sempre.
    const contact = body.interaction
      ? await this.contactLogging.prepare(user.userId, org, body.cardId, body.interaction)
      : null;

    const comment = await this.comments.create(user.userId, org, {
      cardId: body.cardId,
      plainText: body.plainText,
      body: (body.body as Prisma.InputJsonValue) ?? plainTextToDoc(body.plainText),
      parentCommentId: body.parentCommentId,
    });

    if (!contact || !body.interaction) return comment;
    const interaction = await this.contactLogging.createForComment(user.userId, org, {
      cardId: body.cardId,
      commentId: comment.id,
      boardId: contact.boardId,
      input: body.interaction,
    });
    return { ...comment, interaction };
  }

  @Post(':commentId/reactions')
  @ApiOperation({ summary: 'Toggle reação emoji num comentário' })
  toggleReaction(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('commentId') commentId: string,
    @Body(new ZodValidationPipe(ToggleReactionSchema)) body: ToggleReactionRequest,
  ) {
    return this.comments.toggleReaction(user.userId, org, commentId, body.emoji);
  }

  @Patch(':commentId')
  @ApiOperation({ summary: 'Editar comentário (apenas o autor)' })
  update(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('commentId') commentId: string,
    @Body(new ZodValidationPipe(UpdateCommentSchema)) body: UpdateCommentRequest,
  ) {
    return this.comments.update(user.userId, org, commentId, {
      plainText: body.plainText,
      body: (body.body as Prisma.InputJsonValue) ?? plainTextToDoc(body.plainText),
    });
  }

  @Delete(':commentId')
  @ApiOperation({ summary: 'Excluir comentário (autor ou BoardAdmin)' })
  remove(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('commentId') commentId: string,
  ) {
    return this.comments.delete(user.userId, org, commentId);
  }
}
