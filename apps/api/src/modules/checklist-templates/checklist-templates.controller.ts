import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { TenantGuard } from '@/common/tenant/tenant.guard';
import { CurrentOrg } from '@/common/tenant/current-org.decorator';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '@/modules/auth/auth.types';

import { ChecklistTemplatesService } from './checklist-templates.service';
import {
  CreateChecklistTemplateSchema,
  UpdateChecklistTemplateSchema,
  SaveFromChecklistSchema,
  ApplyTemplateSchema,
  type CreateChecklistTemplateRequest,
  type UpdateChecklistTemplateRequest,
  type SaveFromChecklistRequest,
  type ApplyTemplateRequest,
} from './dto/checklist-template.schemas';

@ApiTags('checklist-templates')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller({ path: 'checklist-templates', version: '1' })
export class ChecklistTemplatesController {
  constructor(private readonly service: ChecklistTemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista templates da Org' })
  list(@CurrentOrg() org: TenantContext) {
    return this.service.list(org);
  }

  @Post()
  @ApiOperation({ summary: 'Cria template do zero (título + items)' })
  create(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Body(new ZodValidationPipe(CreateChecklistTemplateSchema))
    body: CreateChecklistTemplateRequest,
  ) {
    return this.service.create(user.userId, org, body);
  }

  @Post('from-checklist')
  @ApiOperation({ summary: 'Salva uma checklist existente como template' })
  saveFromChecklist(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Body(new ZodValidationPipe(SaveFromChecklistSchema)) body: SaveFromChecklistRequest,
  ) {
    return this.service.saveFromChecklist(user.userId, org, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita um template' })
  update(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateChecklistTemplateSchema))
    body: UpdateChecklistTemplateRequest,
  ) {
    return this.service.update(user.userId, org, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um template' })
  async remove(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('id') id: string,
  ) {
    await this.service.remove(user.userId, org, id);
  }

  @Post('apply')
  @ApiOperation({ summary: 'Aplica template a um card (cria checklist nova)' })
  apply(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Body(new ZodValidationPipe(ApplyTemplateSchema)) body: ApplyTemplateRequest,
  ) {
    return this.service.applyToCard(user.userId, org, body);
  }
}
