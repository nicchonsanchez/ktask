import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { TenantGuard } from '@/common/tenant/tenant.guard';
import { CurrentOrg } from '@/common/tenant/current-org.decorator';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '@/modules/auth/auth.types';

import {
  TransferResponsibilitiesSchema,
  type TransferResponsibilitiesInput,
} from '@ktask/contracts';

import { MembersAdminService } from './members-admin.service';
import { ResponsibilityTransferService } from './responsibility-transfer.service';
import {
  UpdateMemberSchema,
  SuspendMemberSchema,
  type UpdateMemberRequest,
  type SuspendMemberRequest,
} from './dto/members-admin.schemas';

/**
 * Endpoints admin pra editar outros members da Org. Mudanca de role
 * continua via /organizations/members/:userId/role (pre-existente).
 *
 *   GET   /v1/admin/members/:userId          -> detalhe completo (modal)
 *   GET   /v1/admin/members/:userId/activity -> ultimas N actions
 *   PATCH /v1/admin/members/:userId          -> nome/phone/email (com fluxo de confirmacao)
 *   POST  /v1/admin/members/:userId/email-change/resend
 *   POST  /v1/admin/members/:userId/email-change/cancel
 *   POST  /v1/admin/members/:userId/force-password-reset
 *   POST  /v1/admin/members/:userId/suspend
 *   POST  /v1/admin/members/:userId/unsuspend
 *   GET   /v1/admin/members/:userId/responsibilities           -> previa (doc 55)
 *   POST  /v1/admin/members/:userId/responsibilities/transfer  -> transfere pendencias
 */
@ApiTags('admin-members')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller({ path: 'admin/members', version: '1' })
export class MembersAdminController {
  constructor(
    private readonly service: MembersAdminService,
    private readonly transfers: ResponsibilityTransferService,
  ) {}

  @Get(':userId')
  @ApiOperation({ summary: 'Detalhe completo do membro (modal admin)' })
  getOne(@CurrentOrg() org: TenantContext, @Param('userId') userId: string) {
    return this.service.getOne(org, userId);
  }

  @Get(':userId/activity')
  @ApiOperation({ summary: 'Ultimas N actions do membro' })
  listActivity(
    @CurrentOrg() org: TenantContext,
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listActivity(org, userId, limit ? Number(limit) : undefined);
  }

  @Patch(':userId')
  @ApiOperation({ summary: 'Atualiza nome / phone / email do membro' })
  update(
    @CurrentUser() actor: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(UpdateMemberSchema)) body: UpdateMemberRequest,
  ) {
    return this.service.update(actor.userId, org, userId, body);
  }

  @Post(':userId/email-change/resend')
  @ApiOperation({ summary: 'Reenvia link de confirmacao da troca de email pendente' })
  resendEmailChange(
    @CurrentUser() actor: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('userId') userId: string,
  ) {
    return this.service.resendEmailChange(actor.userId, org, userId);
  }

  @Post(':userId/email-change/cancel')
  @ApiOperation({ summary: 'Cancela troca de email pendente e invalida links enviados' })
  cancelEmailChange(
    @CurrentUser() actor: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('userId') userId: string,
  ) {
    return this.service.cancelEmailChange(actor.userId, org, userId);
  }

  @Post(':userId/force-password-reset')
  @ApiOperation({ summary: 'Forca redefinicao de senha + invalida sessoes' })
  forcePasswordReset(
    @CurrentUser() actor: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('userId') userId: string,
  ) {
    return this.service.forcePasswordReset(actor.userId, org, userId);
  }

  @Post(':userId/send-password-reset')
  @ApiOperation({
    summary: 'Envia link de redefinicao (email + whatsapp) SEM invalidar sessoes',
  })
  sendPasswordReset(
    @CurrentUser() actor: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('userId') userId: string,
  ) {
    return this.service.sendPasswordResetLink(actor.userId, org, userId);
  }

  @Post(':userId/suspend')
  @ApiOperation({ summary: 'Suspende conta (preserva dados, bloqueia login)' })
  suspend(
    @CurrentUser() actor: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(SuspendMemberSchema)) body: SuspendMemberRequest,
  ) {
    return this.service.suspend(actor.userId, org, userId, body);
  }

  @Post(':userId/unsuspend')
  @ApiOperation({ summary: 'Reativa conta suspensa' })
  unsuspend(
    @CurrentUser() actor: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('userId') userId: string,
  ) {
    return this.service.unsuspend(actor.userId, org, userId);
  }

  @Get(':userId/responsibilities')
  @ApiOperation({ summary: 'Previa das responsabilidades pendentes do membro (doc 55)' })
  responsibilities(@CurrentOrg() org: TenantContext, @Param('userId') userId: string) {
    return this.transfers.preview(org, userId);
  }

  @Post(':userId/responsibilities/transfer')
  @ApiOperation({ summary: 'Transfere as responsabilidades pendentes para outro membro (doc 55)' })
  transferResponsibilities(
    @CurrentUser() actor: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(TransferResponsibilitiesSchema))
    body: TransferResponsibilitiesInput,
  ) {
    return this.transfers.transfer(actor.userId, org, userId, body);
  }
}
