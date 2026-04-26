import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { TenantGuard } from '@/common/tenant/tenant.guard';
import { CurrentOrg } from '@/common/tenant/current-org.decorator';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '@/modules/auth/auth.types';

import { AutomationsService } from './automations.service';
import {
  CreateAutomationSchema,
  UpdateAutomationSchema,
  type CreateAutomationRequest,
  type UpdateAutomationRequest,
} from './dto/automation.schemas';

@ApiTags('automations')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller({ version: '1' })
export class AutomationsController {
  constructor(private readonly automations: AutomationsService) {}

  @Get('lists/:listId/automations')
  @ApiOperation({ summary: 'Lista automações configuradas na coluna' })
  listByList(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('listId') listId: string,
  ) {
    return this.automations.listByList(user.userId, org, listId);
  }

  @Post('lists/:listId/automations')
  @ApiOperation({ summary: 'Cria automação vinculada à coluna' })
  create(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('listId') listId: string,
    @Body(new ZodValidationPipe(CreateAutomationSchema)) body: CreateAutomationRequest,
  ) {
    return this.automations.create(user.userId, org, listId, body);
  }

  @Patch('automations/:automationId')
  @ApiOperation({ summary: 'Atualiza automação (toggle isActive, alterar config, etc.)' })
  update(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('automationId') automationId: string,
    @Body(new ZodValidationPipe(UpdateAutomationSchema)) body: UpdateAutomationRequest,
  ) {
    return this.automations.update(user.userId, org, automationId, body);
  }

  @Delete('automations/:automationId')
  @ApiOperation({ summary: 'Exclui automação (cascateia runs)' })
  remove(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('automationId') automationId: string,
  ) {
    return this.automations.remove(user.userId, org, automationId);
  }

  @Get('automations/:automationId/runs')
  @ApiOperation({ summary: 'Lista as últimas runs (logs) da automação' })
  listRuns(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('automationId') automationId: string,
    @Query('limit') limit?: string,
  ) {
    return this.automations.listRuns(
      user.userId,
      org,
      automationId,
      limit ? parseInt(limit, 10) : 50,
    );
  }
}
