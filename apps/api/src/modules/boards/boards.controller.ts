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

import { BoardsService } from './boards.service';
import {
  AddBoardMemberSchema,
  CreateBoardSchema,
  DeleteBoardStrategySchema,
  UpdateBoardSchema,
  type AddBoardMemberRequest,
  type CreateBoardRequest,
  type DeleteBoardStrategyRequest,
  type UpdateBoardRequest,
} from './dto/board.schemas';

@ApiTags('boards')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller({ path: 'boards', version: '1' })
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar quadros visíveis ao usuário na Org atual' })
  list(@CurrentUser() user: AuthenticatedRequestContext, @CurrentOrg() org: TenantContext) {
    return this.boards.listForUser(user.userId, org);
  }

  @Post()
  @ApiOperation({ summary: 'Criar quadro (com 3 listas default)' })
  create(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Body(new ZodValidationPipe(CreateBoardSchema)) body: CreateBoardRequest,
  ) {
    return this.boards.create({ userId: user.userId, tenant: org, input: body });
  }

  @Get(':boardId')
  @ApiOperation({ summary: 'Detalhe de um quadro (listas + cards)' })
  getOne(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('boardId') boardId: string,
  ) {
    return this.boards.getOne(user.userId, org, boardId);
  }

  @Patch(':boardId')
  @ApiOperation({ summary: 'Atualizar quadro' })
  update(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('boardId') boardId: string,
    @Body(new ZodValidationPipe(UpdateBoardSchema)) body: UpdateBoardRequest,
  ) {
    return this.boards.update(user.userId, org, boardId, body);
  }

  @Delete(':boardId')
  @ApiOperation({ summary: 'Arquivar quadro' })
  archive(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('boardId') boardId: string,
  ) {
    return this.boards.archive(user.userId, org, boardId);
  }

  @Post(':boardId/restore')
  @ApiOperation({ summary: 'Desarquivar quadro' })
  restore(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('boardId') boardId: string,
  ) {
    return this.boards.restore(user.userId, org, boardId);
  }

  @Get(':boardId/delete-preview')
  @ApiOperation({ summary: 'Contagens pra preview de exclusao do board (doc 29)' })
  deletePreview(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('boardId') boardId: string,
  ) {
    return this.boards.deletePreview(user.userId, org, boardId);
  }

  @Post(':boardId/delete')
  @ApiOperation({
    summary: 'Excluir board com estrategia explicita (archive-cascade | delete-all)',
  })
  executeDelete(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('boardId') boardId: string,
    @Body(new ZodValidationPipe(DeleteBoardStrategySchema)) body: DeleteBoardStrategyRequest,
  ) {
    return this.boards.executeDelete(user.userId, org, boardId, body);
  }

  @Get(':boardId/completed-cards')
  @ApiOperation({ summary: 'Listar cards finalizados do quadro (paginado)' })
  listCompleted(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('boardId') boardId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.boards.listCompleted(user.userId, org, boardId, {
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }

  @Post(':boardId/members')
  @ApiOperation({ summary: 'Adicionar membro ao quadro' })
  addMember(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('boardId') boardId: string,
    @Body(new ZodValidationPipe(AddBoardMemberSchema)) body: AddBoardMemberRequest,
  ) {
    return this.boards.addMember(user.userId, org, boardId, body.userId, body.role ?? 'EDITOR');
  }

  @Delete(':boardId/members/:memberUserId')
  @ApiOperation({ summary: 'Remover membro do quadro' })
  removeMember(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('boardId') boardId: string,
    @Param('memberUserId') memberUserId: string,
  ) {
    return this.boards.removeMember(user.userId, org, boardId, memberUserId);
  }
}
