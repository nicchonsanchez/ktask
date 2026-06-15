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

import { ManagementService } from './management.service';
import {
  AddSourceSchema,
  CreateColumnSchema,
  ManagementApprovalDispatchesQuerySchema,
  ManagementApprovalsQuerySchema,
  ManagementArchivedQuerySchema,
  ManagementListQuerySchema,
  ManagementTasksQuerySchema,
  UpdateColumnSchema,
  type AddSourceRequest,
  type CreateColumnRequest,
  type ManagementApprovalDispatchesQuery,
  type ManagementApprovalsQuery,
  type ManagementArchivedQuery,
  type ManagementListQuery,
  type ManagementTasksQuery,
  type UpdateColumnRequest,
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

  @Get('cards/finalized')
  @ApiOperation({
    summary: 'Visão Gerencial: cards em colunas finais (isFinalList=true)',
    description:
      'Atalho que força onlyFinalLists=true. Aceita os mesmos filtros do endpoint principal.',
  })
  listFinalized(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Query(new ZodValidationPipe(ManagementListQuerySchema)) query: ManagementListQuery,
  ) {
    return this.mgmt.listCards(user.userId, org, { ...query, onlyFinalLists: true });
  }

  @Get('tasks')
  @ApiOperation({
    summary: 'Visão Gerencial: lista consolidada de tarefas (checklist items)',
    description:
      'Diferente de /management/cards (1 linha = 1 card), aqui 1 linha = 1 ChecklistItem. Foco em responsável da tarefa (assignee), não do card. Default: pendentes apenas.',
  })
  listTasks(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Query(new ZodValidationPipe(ManagementTasksQuerySchema)) query: ManagementTasksQuery,
  ) {
    return this.mgmt.listTasks(user.userId, org, query);
  }

  // ---- Aprovacoes (visao gerencial) ----

  @Get('approvals')
  @ApiOperation({
    summary: 'Visão Gerencial: todas as aprovações pendentes da org',
    description:
      'Diferente de /me/pending-approvals, lista approvals de qualquer reviewer (não só do user logado). Restrito a OWNER/ADMIN/GESTOR e escopado aos boards acessíveis.',
  })
  listApprovals(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Query(new ZodValidationPipe(ManagementApprovalsQuerySchema))
    query: ManagementApprovalsQuery,
  ) {
    return this.mgmt.listApprovals(user.userId, org, query);
  }

  @Get('approval-dispatches')
  @ApiOperation({
    summary: 'Visão Gerencial: histórico agregado de envios de cobrança',
    description:
      '1 linha por (approval × reviewer) com count + breakdown auto/manual + último canal/sucesso. Filtros: status, reviewer, board, período, só falhas.',
  })
  listApprovalDispatches(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Query(new ZodValidationPipe(ManagementApprovalDispatchesQuerySchema))
    query: ManagementApprovalDispatchesQuery,
  ) {
    return this.mgmt.listApprovalDispatches(user.userId, org, query);
  }

  @Get('approval-dispatches/:approvalId/timeline')
  @ApiOperation({
    summary: 'Timeline detalhada de envios de uma aprovação (drill-down)',
  })
  getApprovalDispatchTimeline(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('approvalId') approvalId: string,
  ) {
    return this.mgmt.getApprovalDispatchTimeline(user.userId, org, approvalId);
  }

  // ---- Kanban gerencial (colunas virtuais) ----

  @Get('kanban')
  @ApiOperation({ summary: 'Kanban gerencial: colunas virtuais + cards agregados' })
  getKanban(@CurrentUser() user: AuthenticatedRequestContext, @CurrentOrg() org: TenantContext) {
    return this.mgmt.getKanban(user.userId, org);
  }

  @Post('kanban/columns')
  @ApiOperation({ summary: 'Cria coluna virtual no Kanban gerencial' })
  createColumn(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Body(new ZodValidationPipe(CreateColumnSchema)) body: CreateColumnRequest,
  ) {
    return this.mgmt.createColumn(user.userId, org, body.name);
  }

  @Patch('kanban/columns/:columnId')
  @ApiOperation({ summary: 'Renomeia/reordena coluna virtual' })
  updateColumn(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('columnId') columnId: string,
    @Body(new ZodValidationPipe(UpdateColumnSchema)) body: UpdateColumnRequest,
  ) {
    return this.mgmt.updateColumn(user.userId, org, columnId, body);
  }

  @Delete('kanban/columns/:columnId')
  @ApiOperation({ summary: 'Remove coluna virtual' })
  deleteColumn(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('columnId') columnId: string,
  ) {
    return this.mgmt.deleteColumn(user.userId, org, columnId);
  }

  @Post('kanban/columns/:columnId/sources')
  @ApiOperation({ summary: 'Adiciona fonte (board+lista) a uma coluna virtual' })
  addSource(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('columnId') columnId: string,
    @Body(new ZodValidationPipe(AddSourceSchema)) body: AddSourceRequest,
  ) {
    return this.mgmt.addSource(user.userId, org, columnId, body);
  }

  @Delete('kanban/sources/:sourceId')
  @ApiOperation({ summary: 'Remove fonte de uma coluna virtual' })
  removeSource(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('sourceId') sourceId: string,
  ) {
    return this.mgmt.removeSource(user.userId, org, sourceId);
  }
}
