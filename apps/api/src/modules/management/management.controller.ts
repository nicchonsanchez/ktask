import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { TenantGuard } from '@/common/tenant/tenant.guard';
import { CurrentOrg } from '@/common/tenant/current-org.decorator';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '@/modules/auth/auth.types';

import { ManagementService } from './management.service';
import {
  ManagementArchivedQuerySchema,
  ManagementListQuerySchema,
  type ManagementArchivedQuery,
  type ManagementListQuery,
} from './dto/management.schemas';

@ApiTags('management')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller({ path: 'management', version: '1' })
export class ManagementController {
  constructor(private readonly mgmt: ManagementService) {}

  @Get('cards')
  @ApiOperation({ summary: 'Visão Gerencial: lista consolidada de cards ativos' })
  listCards(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Query(new ZodValidationPipe(ManagementListQuerySchema)) query: ManagementListQuery,
  ) {
    return this.mgmt.listCards(user.userId, org, query);
  }

  @Get('cards/archived')
  @ApiOperation({ summary: 'Visão Gerencial: lista cards arquivados' })
  listArchived(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Query(new ZodValidationPipe(ManagementArchivedQuerySchema)) query: ManagementArchivedQuery,
  ) {
    return this.mgmt.listArchivedCards(user.userId, org, query);
  }
}
