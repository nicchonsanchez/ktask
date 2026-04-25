import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { TenantGuard } from '@/common/tenant/tenant.guard';
import { CurrentOrg } from '@/common/tenant/current-org.decorator';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '@/modules/auth/auth.types';

import { MeService } from './me.service';
import { BulkRescheduleTodaySchema, type BulkRescheduleTodayRequest } from './dto/me.schemas';

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller({ path: 'me', version: '1' })
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get('tasks')
  @ApiOperation({
    summary: 'Tarefas do usuário agrupadas por prazo (overdue/today/next7/noDate)',
  })
  getTasks(@CurrentUser() user: AuthenticatedRequestContext, @CurrentOrg() org: TenantContext) {
    return this.me.getTasks(user.userId, org);
  }

  @Post('tasks/bulk-reschedule-today')
  @ApiOperation({ summary: 'Move o dueDate de várias tarefas pra hoje (00:00 BRT)' })
  bulkRescheduleToday(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Body(new ZodValidationPipe(BulkRescheduleTodaySchema)) body: BulkRescheduleTodayRequest,
  ) {
    return this.me.bulkRescheduleToday(user.userId, org, body.ids);
  }

  @Get('recent-cards')
  @ApiOperation({ summary: 'Cards visitados recentemente pelo usuário (até 12)' })
  getRecentCards(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
  ) {
    return this.me.getRecentCards(user.userId, org);
  }

  @Get('calendar')
  @ApiOperation({ summary: 'Pontos do calendário do mês (count de tarefas por dia)' })
  getCalendar(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Query('month') month?: string,
  ) {
    return this.me.getCalendar(user.userId, org, month);
  }
}
