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
import {
  CreateGoalSchema,
  UpdateGoalSchema,
  type CreateGoalRequest,
  type UpdateGoalRequest,
  PerformanceEventsQuerySchema,
  PerformanceFiltersSchema,
  UpsertBoardPerformanceConfigSchema,
  type PerformanceEventsQuery,
  type PerformanceFiltersQuery,
  type UpsertBoardPerformanceConfigRequest,
} from '@ktask/contracts';

import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { TenantGuard } from '@/common/tenant/tenant.guard';
import { CurrentOrg } from '@/common/tenant/current-org.decorator';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '@/modules/auth/auth.types';

import { PerformanceConfigService } from './performance-config.service';
import { PerformanceGoalsService } from './performance-goals.service';
import { PerformanceReportService, type PerformanceFilters } from './performance-report.service';

const csv = (s?: string) =>
  s
    ? s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    : undefined;

function toFilters(q: PerformanceFiltersQuery): PerformanceFilters {
  return {
    from: new Date(q.from),
    to: new Date(q.to),
    boardIds: csv(q.boardIds),
    userIds: csv(q.userIds),
    area: q.area,
    companyId: q.companyId || undefined,
  };
}

/**
 * Doc 52 — Desempenho da Equipe. Todas as rotas exigem OWNER/ADMIN
 * (checado nos services). Relatorio e read-only; so o POST de config escreve
 * (tabelas proprias, nunca Board/List/Card).
 */
@ApiTags('performance')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller({ path: 'performance', version: '1' })
export class PerformanceController {
  constructor(
    private readonly report: PerformanceReportService,
    private readonly config: PerformanceConfigService,
    private readonly goals: PerformanceGoalsService,
  ) {}

  // ---- Metas (Fase 4) ----

  @Get('goals')
  @ApiOperation({ summary: 'Metas com progresso (período atual + 3 anteriores)' })
  listGoals(@CurrentOrg() org: TenantContext) {
    return this.goals.list(org);
  }

  @Post('goals')
  @ApiOperation({ summary: 'Cria meta (métrica de resultado, alcance, período, alvo)' })
  createGoal(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Body(new ZodValidationPipe(CreateGoalSchema)) body: CreateGoalRequest,
  ) {
    return this.goals.create(user.userId, org, body);
  }

  @Patch('goals/:id')
  @ApiOperation({ summary: 'Renomeia, ativa/desativa ou muda o alvo (versionado)' })
  updateGoal(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateGoalSchema)) body: UpdateGoalRequest,
  ) {
    return this.goals.update(user.userId, org, id, body);
  }

  @Delete('goals/:id')
  @ApiOperation({ summary: 'Remove meta (soft delete)' })
  removeGoal(@CurrentOrg() org: TenantContext, @Param('id') id: string) {
    return this.goals.remove(org, id);
  }

  @Get('summary')
  @ApiOperation({ summary: 'KPIs, resumo por colaborador e série diária (OWNER/ADMIN)' })
  summary(
    @CurrentOrg() org: TenantContext,
    @Query(new ZodValidationPipe(PerformanceFiltersSchema)) q: PerformanceFiltersQuery,
  ) {
    return this.report.summary(org, toFilters(q));
  }

  @Get('events')
  @ApiOperation({ summary: 'Drill-down: eventos que compõem um indicador' })
  events(
    @CurrentOrg() org: TenantContext,
    @Query(new ZodValidationPipe(PerformanceEventsQuerySchema)) q: PerformanceEventsQuery,
  ) {
    return this.report.events(org, toFilters(q), q.metric, q.page, q.pageSize);
  }

  @Get('cards')
  @ApiOperation({ summary: 'Drill-down de "Cards trabalhados" (cards distintos)' })
  cards(
    @CurrentOrg() org: TenantContext,
    @Query(new ZodValidationPipe(PerformanceFiltersSchema)) q: PerformanceFiltersQuery,
  ) {
    return this.report.cards(org, toFilters(q));
  }

  @Get('config')
  @ApiOperation({ summary: 'Fluxos e status da configuração dos relatórios' })
  listConfig(@CurrentOrg() org: TenantContext) {
    return this.config.listBoards(org);
  }

  @Get('config/:boardId')
  @ApiOperation({ summary: 'Configuração de um fluxo (colunas atuais + do histórico + versões)' })
  getConfig(@CurrentOrg() org: TenantContext, @Param('boardId') boardId: string) {
    return this.config.getBoardConfig(org, boardId);
  }

  @Post('config/:boardId')
  @ApiOperation({ summary: 'Salva configuração do fluxo (cria versão nova; não altera o quadro)' })
  upsertConfig(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('boardId') boardId: string,
    @Body(new ZodValidationPipe(UpsertBoardPerformanceConfigSchema))
    body: UpsertBoardPerformanceConfigRequest,
  ) {
    return this.config.upsertBoardConfig(user.userId, org, boardId, body);
  }
}
