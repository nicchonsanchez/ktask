import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { CurrentOrg } from '@/common/tenant/current-org.decorator';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '@/modules/auth/auth.types';

import { ApprovalsService } from './approvals.service';
import {
  RequestApprovalSchema,
  DecideApprovalSchema,
  UndoApprovalSchema,
  CancelApprovalSchema,
  ResendApprovalSchema,
  type RequestApprovalRequest,
  type DecideApprovalRequest,
  type UndoApprovalRequest,
  type CancelApprovalRequest,
  type ResendApprovalRequest,
} from './dto/approvals.schemas';

/**
 * Endpoints internos (autenticados) das aprovações.
 *
 *   POST /v1/cards/:id/approvals       — pede aprovação
 *   GET  /v1/cards/:id/approvals       — histórico de aprovações do card
 *   POST /v1/approvals/:id/decide      — reviewer interno decide
 *   POST /v1/approvals/:id/undo        — desfaz decisão (5min ou ADMIN+)
 *   GET  /v1/me/pending-approvals      — inbox de aprovações pendentes do user
 */
@ApiTags('approvals')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller({ version: '1' })
export class ApprovalsController {
  constructor(private readonly service: ApprovalsService) {}

  @Post('cards/:id/approvals')
  @ApiOperation({ summary: 'Pede aprovação no card pra 1+ revisores' })
  request(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('id') cardId: string,
    @Body(new ZodValidationPipe(RequestApprovalSchema)) body: RequestApprovalRequest,
  ) {
    return this.service.request(user.userId, org, cardId, body);
  }

  @Get('cards/:id/approvals')
  @ApiOperation({ summary: 'Histórico de aprovações do card' })
  listForCard(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('id') cardId: string,
  ) {
    return this.service.listForCard(cardId, org, user.userId);
  }

  @Post('approvals/:id/decide')
  @ApiOperation({ summary: 'Reviewer interno aprova ou reprova' })
  decide(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('id') approvalId: string,
    @Body(new ZodValidationPipe(DecideApprovalSchema)) body: DecideApprovalRequest,
  ) {
    return this.service.decideAsUser(user.userId, org, approvalId, body);
  }

  @Post('approvals/:id/undo')
  @ApiOperation({ summary: 'Desfaz decisão dentro da janela de 5min' })
  undo(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('id') approvalId: string,
    @Body(new ZodValidationPipe(UndoApprovalSchema)) body: UndoApprovalRequest,
  ) {
    return this.service.undo(user.userId, org, approvalId, body);
  }

  @Get('me/pending-approvals')
  @ApiOperation({ summary: 'Aprovações pendentes do user logado' })
  myPending(@CurrentUser() user: AuthenticatedRequestContext, @CurrentOrg() org: TenantContext) {
    return this.service.listPendingForUser(user.userId, org);
  }

  @Delete('approvals/:id')
  @ApiOperation({ summary: 'Cancela pedido de aprovação pendente' })
  cancel(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('id') approvalId: string,
    @Body(new ZodValidationPipe(CancelApprovalSchema)) body: CancelApprovalRequest,
  ) {
    return this.service.cancel(user.userId, org, approvalId, body);
  }

  @Post('approvals/:id/resend')
  @ApiOperation({ summary: 'Reenvia notificação WhatsApp+in-app pros revisores' })
  resend(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('id') approvalId: string,
    @Body(new ZodValidationPipe(ResendApprovalSchema)) body: ResendApprovalRequest,
  ) {
    return this.service.resend(user.userId, org, approvalId, body);
  }

  @Delete('approvals/:id/reviewers/:reviewerId')
  @ApiOperation({ summary: 'Remove revisor individual sem cancelar o pedido' })
  removeReviewer(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('id') approvalId: string,
    @Param('reviewerId') reviewerId: string,
  ) {
    return this.service.removeReviewer(user.userId, org, approvalId, reviewerId);
  }
}
