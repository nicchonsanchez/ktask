import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { TenantGuard } from '@/common/tenant/tenant.guard';
import { CurrentOrg } from '@/common/tenant/current-org.decorator';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '@/modules/auth/auth.types';

import { LabelsService } from './labels.service';
import {
  CreateLabelSchema,
  UpdateLabelSchema,
  type CreateLabelRequest,
  type UpdateLabelRequest,
} from './dto/label.schemas';

@ApiTags('labels')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller({ version: '1' })
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Get('boards/:boardId/labels')
  @ApiOperation({ summary: 'Listar etiquetas do quadro' })
  list(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('boardId') boardId: string,
  ) {
    return this.labels.list(user.userId, org, boardId);
  }

  @Post('boards/:boardId/labels')
  @ApiOperation({ summary: 'Criar etiqueta no quadro' })
  create(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('boardId') boardId: string,
    @Body(new ZodValidationPipe(CreateLabelSchema)) body: CreateLabelRequest,
  ) {
    return this.labels.create(user.userId, org, boardId, body);
  }

  @Patch('labels/:labelId')
  @ApiOperation({ summary: 'Atualizar etiqueta (nome / cor)' })
  update(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('labelId') labelId: string,
    @Body(new ZodValidationPipe(UpdateLabelSchema)) body: UpdateLabelRequest,
  ) {
    return this.labels.update(user.userId, org, labelId, body);
  }

  @Delete('labels/:labelId')
  @ApiOperation({ summary: 'Excluir etiqueta (cascateia em todos os cards)' })
  remove(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('labelId') labelId: string,
  ) {
    return this.labels.remove(user.userId, org, labelId);
  }
}
