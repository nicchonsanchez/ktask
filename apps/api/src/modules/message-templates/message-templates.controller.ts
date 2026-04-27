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

import { MessageTemplatesService } from './message-templates.service';
import {
  CreateMessageTemplateSchema,
  UpdateMessageTemplateSchema,
  ListMessageTemplatesQuerySchema,
  type CreateMessageTemplateRequest,
  type UpdateMessageTemplateRequest,
  type ListMessageTemplatesQuery,
} from './dto/message-template.schemas';

@ApiTags('message-templates')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller({ version: '1' })
export class MessageTemplatesController {
  constructor(private readonly service: MessageTemplatesService) {}

  @Get('organizations/me/message-templates')
  @ApiOperation({ summary: 'Lista modelos da Org (filtro opcional por tipo)' })
  list(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Query(new ZodValidationPipe(ListMessageTemplatesQuerySchema)) query: ListMessageTemplatesQuery,
  ) {
    return this.service.list(user.userId, org, query.type);
  }

  @Post('organizations/me/message-templates')
  @ApiOperation({ summary: 'Cria modelo de mensagem' })
  create(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Body(new ZodValidationPipe(CreateMessageTemplateSchema)) body: CreateMessageTemplateRequest,
  ) {
    return this.service.create(user.userId, org, body);
  }

  @Patch('message-templates/:id')
  @ApiOperation({ summary: 'Edita modelo (criador ou OWNER/ADMIN)' })
  update(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateMessageTemplateSchema)) body: UpdateMessageTemplateRequest,
  ) {
    return this.service.update(user.userId, org, id, body);
  }

  @Delete('message-templates/:id')
  @ApiOperation({ summary: 'Remove modelo (criador ou OWNER/ADMIN)' })
  remove(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('id') id: string,
  ) {
    return this.service.remove(user.userId, org, id);
  }
}
