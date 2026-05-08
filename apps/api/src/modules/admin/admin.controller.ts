import { BadRequestException, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { CurrentOrg } from '@/common/tenant/current-org.decorator';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { ListsService } from '@/modules/lists/lists.service';

import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(
    private readonly service: AdminService,
    private readonly lists: ListsService,
  ) {}

  @Post('boards/ensure-final-lists')
  @ApiOperation({
    summary:
      'Backfill: garante que todo board da Org tenha 1 coluna isFinalList=true. Idempotente.',
  })
  ensureFinalLists(@CurrentOrg() org: TenantContext) {
    return this.service.ensureFinalListsAcrossOrg(org, this.lists);
  }

  @Get('stats/time-tracking')
  @ApiOperation({
    summary: 'Stats agregados de Time Tracking da Org (apenas OWNER/ADMIN)',
  })
  timeTrackingStats(@CurrentOrg() org: TenantContext) {
    return this.service.timeTrackingStats(org);
  }

  @Get('stats/cards')
  @ApiOperation({ summary: 'Stats agregados de cards da Org (todos exceto GUEST)' })
  cardsStats(
    @CurrentOrg() org: TenantContext,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
    @Query('boardIds') boardIdsStr?: string,
    @Query('leadId') leadId?: string,
    @Query('priorities') prioritiesStr?: string,
  ) {
    const now = new Date();
    const from = fromStr ? new Date(fromStr) : new Date(now.getTime() - 30 * 24 * 60 * 60_000);
    const to = toStr ? new Date(toStr) : now;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('from/to devem ser datas ISO válidas.');
    }
    if (from > to) {
      throw new BadRequestException('from precisa ser anterior a to.');
    }
    const boardIds = boardIdsStr
      ? boardIdsStr
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    const priorities = prioritiesStr
      ? prioritiesStr
          .split(',')
          .map((s) => s.trim())
          .filter((s): s is 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' =>
            ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(s),
          )
      : undefined;
    return this.service.cardsStats(org, {
      from,
      to,
      boardIds,
      leadId: leadId || undefined,
      priorities,
    });
  }

  @Get('stats/tasks')
  @ApiOperation({ summary: 'Stats agregados de tarefas (ChecklistItem) da Org' })
  tasksStats(@CurrentOrg() org: TenantContext) {
    return this.service.tasksStats(org);
  }

  @Get('stats/companies')
  @ApiOperation({
    summary: 'Doc 38: Stats por empresa cliente (Contact COMPANY) — cards e horas',
  })
  companiesStats(
    @CurrentOrg() org: TenantContext,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
    @Query('boardId') boardId?: string,
  ) {
    // Defaults: ultimos 30 dias se nao passado.
    const now = new Date();
    const from = fromStr ? new Date(fromStr) : new Date(now.getTime() - 30 * 24 * 60 * 60_000);
    const to = toStr ? new Date(toStr) : now;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Parametros from/to devem ser datas ISO validas.');
    }
    if (from > to) {
      throw new BadRequestException('from precisa ser anterior a to.');
    }
    return this.service.companiesStats(org, { from, to, boardId: boardId || undefined });
  }
}
