import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  InviteMemberRequestSchema,
  type InviteMemberRequest,
  UpdateOrganizationRequestSchema,
  type UpdateOrganizationRequest,
  UpdateMemberRoleRequestSchema,
  type UpdateMemberRoleRequest,
} from '@ktask/contracts';

import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { TenantGuard } from '@/common/tenant/tenant.guard';
import { RequireOrgRole } from '@/common/tenant/require-org-role.decorator';
import { CurrentOrg } from '@/common/tenant/current-org.decorator';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '@/modules/auth/auth.types';

import { OrganizationsService } from './organizations.service';
import { MembershipsService } from './memberships.service';
import { InvitationsService } from './invitations.service';

@ApiTags('organizations')
@ApiBearerAuth()
@Controller({ path: 'organizations', version: '1' })
@UseGuards(TenantGuard)
export class OrganizationsController {
  constructor(
    private readonly orgs: OrganizationsService,
    private readonly memberships: MembershipsService,
    private readonly invitations: InvitationsService,
  ) {}

  // ----- Org atual ------------------------------------------------

  @Get('current')
  @ApiOperation({ summary: 'Dados da organização atual do usuário' })
  async current(@CurrentOrg() org: TenantContext) {
    const data = await this.orgs.getOrThrow(org.organizationId);
    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      logoUrl: data.logoUrl,
      timezone: data.timezone,
      locale: data.locale,
      plan: data.plan,
      myRole: org.role,
    };
  }

  @Patch('current')
  @RequireOrgRole('ADMIN')
  @ApiOperation({ summary: 'Atualizar organização atual (nome, logo, timezone, locale)' })
  async update(
    @CurrentOrg() org: TenantContext,
    @Body(new ZodValidationPipe(UpdateOrganizationRequestSchema)) body: UpdateOrganizationRequest,
  ) {
    return this.orgs.update(org.organizationId, {
      name: body.name,
      logoUrl: body.logoUrl ?? null,
      timezone: body.timezone,
      locale: body.locale,
    });
  }

  // ----- Membros --------------------------------------------------

  @Get('members')
  @ApiOperation({ summary: 'Listar membros da organização atual' })
  async listMembers(@CurrentOrg() org: TenantContext) {
    return this.memberships.listByOrg(org.organizationId);
  }

  @Patch('members/:userId/role')
  @RequireOrgRole('GESTOR')
  @ApiOperation({ summary: 'Alterar papel de um membro (aplica teto por rank)' })
  async updateMemberRole(
    @CurrentOrg() org: TenantContext,
    @CurrentUser() user: AuthenticatedRequestContext,
    @Param('userId') targetUserId: string,
    @Body(new ZodValidationPipe(UpdateMemberRoleRequestSchema)) body: UpdateMemberRoleRequest,
  ) {
    return this.memberships.updateRole({
      organizationId: org.organizationId,
      targetUserId,
      newRole: body.role,
      actorRole: org.role,
      actorUserId: user.userId,
    });
  }

  @Delete('members/:userId')
  @RequireOrgRole('ADMIN')
  @ApiOperation({ summary: 'Remover membro da organização' })
  async removeMember(
    @CurrentOrg() org: TenantContext,
    @CurrentUser() user: AuthenticatedRequestContext,
    @Param('userId') targetUserId: string,
  ) {
    await this.memberships.remove({
      organizationId: org.organizationId,
      targetUserId,
      actorRole: org.role,
      actorUserId: user.userId,
    });
    return { ok: true };
  }

  // ----- Convites -------------------------------------------------

  @Get('invitations')
  @RequireOrgRole('ADMIN')
  @ApiOperation({ summary: 'Listar convites pendentes' })
  async listInvitations(@CurrentOrg() org: TenantContext) {
    return this.invitations.listPending(org.organizationId);
  }

  @Post('invitations')
  @RequireOrgRole('ADMIN')
  @ApiOperation({ summary: 'Enviar convite a um novo e-mail' })
  async createInvitation(
    @CurrentOrg() org: TenantContext,
    @CurrentUser() user: AuthenticatedRequestContext,
    @Body(new ZodValidationPipe(InviteMemberRequestSchema)) body: InviteMemberRequest,
  ) {
    const { invitation, rawToken } = await this.invitations.create({
      organizationId: org.organizationId,
      email: body.email,
      phone: body.phone,
      role: body.role,
      invitedById: user.userId,
      actorRole: org.role,
    });
    // Doc 34/35: dispatch de email + WhatsApp ja roda fire-and-forget no
    // service. Devolvemos o link copiavel pro admin como fallback (caso
    // o convidado nao receba os canais automaticos).
    return {
      invitation: {
        id: invitation.id,
        email: invitation.email,
        phone: invitation.phone,
        role: invitation.role,
        expiresAt: invitation.expiresAt.toISOString(),
      },
      rawToken,
    };
  }

  @Delete('invitations/:invitationId')
  @RequireOrgRole('ADMIN')
  @ApiOperation({ summary: 'Revogar convite pendente' })
  async revokeInvitation(
    @CurrentOrg() org: TenantContext,
    @Param('invitationId') invitationId: string,
  ) {
    await this.invitations.revoke(invitationId, org.organizationId);
    return { ok: true };
  }
}
