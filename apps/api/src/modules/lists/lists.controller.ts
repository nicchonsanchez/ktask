import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { TenantGuard } from '@/common/tenant/tenant.guard';
import { CurrentOrg } from '@/common/tenant/current-org.decorator';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '@/modules/auth/auth.types';

import { ListsService } from './lists.service';
import {
  ArchiveListSchema,
  CreateListSchema,
  UpdateListSchema,
  MoveListSchema,
  type ArchiveListRequest,
  type CreateListRequest,
  type UpdateListRequest,
  type MoveListRequest,
} from './dto/list.schemas';

@ApiTags('lists')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller({ path: 'lists', version: '1' })
export class ListsController {
  constructor(private readonly lists: ListsService) {}

  @Post()
  @ApiOperation({ summary: 'Criar lista num quadro' })
  create(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Body(new ZodValidationPipe(CreateListSchema)) body: CreateListRequest,
  ) {
    return this.lists.create(user.userId, org, body);
  }

  @Patch(':listId')
  @ApiOperation({ summary: 'Atualizar lista' })
  update(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('listId') listId: string,
    @Body(new ZodValidationPipe(UpdateListSchema)) body: UpdateListRequest,
  ) {
    return this.lists.update(user.userId, org, listId, body);
  }

  @Patch(':listId/move')
  @ApiOperation({ summary: 'Reordenar lista (após outra ou pro início)' })
  move(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('listId') listId: string,
    @Body(new ZodValidationPipe(MoveListSchema)) body: MoveListRequest,
  ) {
    return this.lists.move(user.userId, org, listId, body);
  }

  @Delete(':listId')
  @ApiOperation({
    summary: 'Arquivar lista (com escolha do que fazer com cards: archive | move)',
  })
  archive(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('listId') listId: string,
    @Body(new ZodValidationPipe(ArchiveListSchema)) body: ArchiveListRequest,
  ) {
    return this.lists.archive(user.userId, org, listId, body);
  }

  @Post(':listId/restore')
  @ApiOperation({ summary: 'Restaurar lista arquivada (reposiciona ao final do quadro)' })
  restore(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('listId') listId: string,
  ) {
    return this.lists.restore(user.userId, org, listId);
  }

  @Get('archived/:boardId')
  @ApiOperation({ summary: 'Lista cards e colunas arquivados de um quadro' })
  listArchived(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('boardId') boardId: string,
  ) {
    return this.lists.listArchived(user.userId, org, boardId);
  }
}
