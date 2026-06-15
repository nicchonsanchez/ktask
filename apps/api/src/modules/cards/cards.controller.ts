import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { TenantGuard } from '@/common/tenant/tenant.guard';
import { CurrentOrg } from '@/common/tenant/current-org.decorator';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '@/modules/auth/auth.types';

import { CardsService } from './cards.service';
import { MeService } from '@/modules/me/me.service';
import {
  CreateCardSchema,
  UpdateCardSchema,
  MoveCardSchema,
  MemberIdSchema,
  LabelIdSchema,
  DuplicateCardSchema,
  CreateChildCardSchema,
  SetParentSchema,
  LinkFlowSchema,
  MoveInFlowSchema,
  type CreateCardRequest,
  type UpdateCardRequest,
  type MoveCardRequest,
  type DuplicateCardRequest,
  type CreateChildCardRequest,
  type SetParentRequest,
  type LinkFlowRequest,
  type MoveInFlowRequest,
} from './dto/card.schemas';

@ApiTags('cards')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller({ path: 'cards', version: '1' })
export class CardsController {
  constructor(
    private readonly cards: CardsService,
    private readonly me: MeService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Criar card numa lista' })
  create(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Body(new ZodValidationPipe(CreateCardSchema)) body: CreateCardRequest,
  ) {
    return this.cards.create(user.userId, org, body);
  }

  @Get('by-code/:code')
  @ApiOperation({
    summary: 'Resolve shortCode (#412) -> { id, boardId } pra redirect',
  })
  byCode(@CurrentOrg() org: TenantContext, @Param('code') code: string) {
    return this.cards.findByShortCode(org, code.replace(/^#/, ''));
  }

  @Get(':cardId')
  @ApiOperation({ summary: 'Detalhe do card (com comentários, labels, etc)' })
  async getOne(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
  ) {
    const card = await this.cards.getOne(user.userId, org, cardId);
    // Registra a visita pra alimentar a "Cards recentes" da home pessoal.
    // Fire-and-forget: erro aqui não pode quebrar o GET do card.
    void this.me.recordVisit(user.userId, cardId).catch(() => undefined);
    return card;
  }

  @Patch(':cardId')
  @ApiOperation({ summary: 'Atualizar campos do card' })
  update(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
    @Body(new ZodValidationPipe(UpdateCardSchema)) body: UpdateCardRequest,
  ) {
    return this.cards.update(user.userId, org, cardId, body);
  }

  @Patch(':cardId/move')
  @ApiOperation({ summary: 'Mover card entre listas / reordenar' })
  move(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
    @Body(new ZodValidationPipe(MoveCardSchema)) body: MoveCardRequest,
  ) {
    return this.cards.move(user.userId, org, cardId, body);
  }

  @Delete(':cardId')
  @ApiOperation({ summary: 'Arquivar card' })
  archive(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
  ) {
    return this.cards.archive(user.userId, org, cardId);
  }

  @Post(':cardId/restore')
  @ApiOperation({ summary: 'Restaurar card arquivado' })
  restore(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
  ) {
    return this.cards.restore(user.userId, org, cardId);
  }

  @Get(':cardId/family')
  @ApiOperation({ summary: 'Pai e filhos diretos do card' })
  getFamily(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
  ) {
    return this.cards.getFamily(user.userId, org, cardId);
  }

  @Post(':cardId/children')
  @ApiOperation({ summary: 'Cria filho a partir do card atual' })
  createChild(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
    @Body(new ZodValidationPipe(CreateChildCardSchema)) body: CreateChildCardRequest,
  ) {
    return this.cards.createChild(user.userId, org, cardId, body);
  }

  @Patch(':cardId/parent')
  @ApiOperation({ summary: 'Vincula/desvincula card pai (parentCardId)' })
  setParent(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
    @Body(new ZodValidationPipe(SetParentSchema)) body: SetParentRequest,
  ) {
    return this.cards.setParent(user.userId, org, cardId, body.parentCardId);
  }

  @Post(':cardId/duplicate')
  @ApiOperation({ summary: 'Duplica o card N vezes com flags do que copiar' })
  duplicate(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
    @Body(new ZodValidationPipe(DuplicateCardSchema)) body: DuplicateCardRequest,
  ) {
    return this.cards.duplicate(user.userId, org, cardId, body);
  }

  @Post(':cardId/trash')
  @ApiOperation({ summary: 'Mover card pra lixeira (soft delete, recuperável 90 dias)' })
  trash(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
  ) {
    return this.cards.trash(user.userId, org, cardId);
  }

  @Post(':cardId/restore-from-trash')
  @ApiOperation({ summary: 'Restaurar card da lixeira' })
  restoreFromTrash(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
  ) {
    return this.cards.restoreFromTrash(user.userId, org, cardId);
  }

  @Delete(':cardId/permanent')
  @ApiOperation({
    summary: 'Excluir card permanentemente (exige lixeira + OWNER/ADMIN)',
  })
  deletePermanent(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
  ) {
    return this.cards.deletePermanent(user.userId, org, cardId);
  }

  @Post(':cardId/complete')
  @ApiOperation({ summary: 'Finalizar card (entra no histórico do quadro)' })
  complete(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
  ) {
    return this.cards.complete(user.userId, org, cardId);
  }

  @Post(':cardId/uncomplete')
  @ApiOperation({ summary: 'Reabrir card finalizado (volta para uma lista ativa)' })
  uncomplete(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
    @Body() body: { toListId?: string },
  ) {
    return this.cards.uncomplete(user.userId, org, cardId, body?.toListId);
  }

  @Post(':cardId/members')
  @ApiOperation({ summary: 'Atribuir membro ao card' })
  assign(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
    @Body(new ZodValidationPipe(MemberIdSchema)) body: { userId: string },
  ) {
    return this.cards.assignMember(user.userId, org, cardId, body.userId);
  }

  @Delete(':cardId/members/:memberUserId')
  @ApiOperation({ summary: 'Remover membro do card' })
  unassign(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
    @Param('memberUserId') memberUserId: string,
  ) {
    return this.cards.unassignMember(user.userId, org, cardId, memberUserId);
  }

  @Post(':cardId/labels')
  @ApiOperation({ summary: 'Vincular label ao card' })
  addLabel(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
    @Body(new ZodValidationPipe(LabelIdSchema)) body: { labelId: string },
  ) {
    return this.cards.addLabel(user.userId, org, cardId, body.labelId);
  }

  @Delete(':cardId/labels/:labelId')
  @ApiOperation({ summary: 'Desvincular label do card' })
  removeLabel(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
    @Param('labelId') labelId: string,
  ) {
    return this.cards.removeLabel(user.userId, org, cardId, labelId);
  }

  @Get(':cardId/flows')
  @ApiOperation({ summary: 'Lista os fluxos onde o card tem presença ativa' })
  listFlows(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
  ) {
    return this.cards.listFlows(user.userId, org, cardId);
  }

  @Get(':cardId/visits')
  @ApiOperation({
    summary: 'Lista quem já visualizou este card (auditoria minimalista)',
    description:
      'Retorna 1 entry por user que abriu o card pelo menos 1 vez. Não conta vezes — só "abriu ou não abriu" + timestamp da última visita.',
  })
  listVisits(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
  ) {
    return this.cards.listVisits(user.userId, org, cardId);
  }

  @Post(':cardId/flows')
  @ApiOperation({ summary: 'Vincula o card a outro fluxo (cria CardPresence)' })
  linkFlow(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
    @Body(new ZodValidationPipe(LinkFlowSchema)) body: LinkFlowRequest,
  ) {
    return this.cards.linkToFlow(user.userId, org, cardId, body);
  }

  @Delete(':cardId/flows/:boardId')
  @ApiOperation({ summary: 'Desvincula o card de um fluxo (soft-delete da CardPresence)' })
  unlinkFlow(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
    @Param('boardId') boardId: string,
  ) {
    return this.cards.unlinkFromFlow(user.userId, org, cardId, boardId);
  }

  @Patch(':cardId/flows/:boardId/primary')
  @ApiOperation({
    summary: 'Torna esse fluxo o primário do card (caso de uso: card criado no board errado)',
  })
  setPrimaryFlow(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
    @Param('boardId') boardId: string,
  ) {
    return this.cards.setPrimaryFlow(user.userId, org, cardId, boardId);
  }

  @Patch(':cardId/flows/:boardId/move')
  @ApiOperation({ summary: 'Move o card pra outra coluna dentro de um fluxo específico' })
  moveInFlow(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
    @Param('boardId') boardId: string,
    @Body(new ZodValidationPipe(MoveInFlowSchema)) body: MoveInFlowRequest,
  ) {
    return this.cards.moveInFlow(user.userId, org, cardId, boardId, body);
  }
}
