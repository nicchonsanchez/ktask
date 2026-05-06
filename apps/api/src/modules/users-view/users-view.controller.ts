import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { CurrentOrg } from '@/common/tenant/current-org.decorator';
import type { TenantContext } from '@/common/tenant/tenant.types';

import { UsersViewService } from './users-view.service';

/**
 * Rotas paralelas a /me/* mas pra um targetUserId arbitrário, com
 * permissão GESTOR+ pra visualizar dados de outros membros.
 *
 * Endpoint agregado /organizations/members/summary mora aqui também
 * (mais coeso) — alimenta os contadores na lista de /empresa.
 */
@ApiTags('users-view')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller({ path: 'users', version: '1' })
export class UsersViewController {
  constructor(private readonly view: UsersViewService) {}

  @Get('members-summary')
  @ApiOperation({ summary: 'Resumo agregado (overdue/today/pending) por membro da org' })
  getMembersSummary(@CurrentOrg() viewer: TenantContext) {
    return this.view.getMembersSummary(viewer);
  }

  @Get(':userId/summary')
  @ApiOperation({ summary: 'Resumo de tarefas + atividade recente do membro' })
  getSummary(@Param('userId') userId: string, @CurrentOrg() viewer: TenantContext) {
    return this.view.getSummary(userId, viewer);
  }

  @Get(':userId/tasks')
  @ApiOperation({ summary: 'Tarefas do membro agrupadas por prazo (visão GESTOR+)' })
  getTasks(@Param('userId') userId: string, @CurrentOrg() viewer: TenantContext) {
    return this.view.getTasks(userId, viewer);
  }

  @Get(':userId/recent-cards')
  @ApiOperation({ summary: 'Cards recentes do membro' })
  getRecentCards(@Param('userId') userId: string, @CurrentOrg() viewer: TenantContext) {
    return this.view.getRecentCards(userId, viewer);
  }

  @Get(':userId/calendar')
  @ApiOperation({ summary: 'Calendário do membro (count por dia)' })
  getCalendar(
    @Param('userId') userId: string,
    @CurrentOrg() viewer: TenantContext,
    @Query('month') month?: string,
  ) {
    return this.view.getCalendar(userId, viewer, month);
  }

  @Get(':userId/recent-activity')
  @ApiOperation({ summary: 'Últimas atividades do membro (limit 10 default)' })
  getRecentActivity(
    @Param('userId') userId: string,
    @CurrentOrg() viewer: TenantContext,
    @Query('limit') limit?: string,
  ) {
    const n = limit ? Math.max(1, Math.min(50, Number(limit) || 10)) : 10;
    return this.view.getRecentActivity(userId, viewer, n);
  }
}
