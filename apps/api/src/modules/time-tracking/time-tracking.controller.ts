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

import { TimeTrackingService } from './time-tracking.service';
import {
  StartTimerSchema,
  ManualEntrySchema,
  UpdateTimeEntrySchema,
  TimesheetFilterSchema,
  type StartTimerRequest,
  type ManualEntryRequest,
  type UpdateTimeEntryRequest,
  type TimesheetFilterRequest,
} from './dto/time-entry.schemas';

@ApiTags('time-tracking')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller({ version: '1' })
export class TimeTrackingController {
  constructor(private readonly service: TimeTrackingService) {}

  @Post('cards/:cardId/time/start')
  @ApiOperation({ summary: 'Inicia cronômetro num card (fecha entry pendente do user antes)' })
  start(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
    @Body(new ZodValidationPipe(StartTimerSchema)) body: StartTimerRequest,
  ) {
    return this.service.start(user.userId, org, cardId, body.note);
  }

  @Post('time-entries/start')
  @ApiOperation({
    summary: 'Inicia cronômetro livre (sem card vinculado, criado pelo botão do header)',
  })
  startFree(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Body(new ZodValidationPipe(StartTimerSchema)) body: StartTimerRequest,
  ) {
    return this.service.start(user.userId, org, null, body.note);
  }

  @Post('time-entries/:entryId/stop')
  @ApiOperation({ summary: 'Para uma entry específica' })
  stop(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('entryId') entryId: string,
  ) {
    return this.service.stop(user.userId, org, entryId);
  }

  @Get('users/me/time/active')
  @ApiOperation({ summary: 'Entry ativa do usuário logado (ou null)' })
  getActive(@CurrentUser() user: AuthenticatedRequestContext, @CurrentOrg() org: TenantContext) {
    return this.service.getActiveForUser(user.userId, org);
  }

  @Post('time-entries')
  @ApiOperation({ summary: 'Cria entry manual ("trabalhei de X a Y")' })
  createManual(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Body(new ZodValidationPipe(ManualEntrySchema)) body: ManualEntryRequest,
  ) {
    if (!body.cardId) throw new Error('cardId é obrigatório'); // schema garante presença na rota
    return this.service.createManual(user.userId, org, {
      cardId: body.cardId,
      startedAt: body.startedAt,
      endedAt: body.endedAt,
      note: body.note,
      userId: body.userId,
    });
  }

  @Patch('time-entries/:entryId')
  @ApiOperation({ summary: 'Edita uma entry' })
  update(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('entryId') entryId: string,
    @Body(new ZodValidationPipe(UpdateTimeEntrySchema)) body: UpdateTimeEntryRequest,
  ) {
    return this.service.update(user.userId, org, entryId, body);
  }

  @Delete('time-entries/:entryId')
  @ApiOperation({ summary: 'Remove uma entry' })
  remove(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('entryId') entryId: string,
  ) {
    return this.service.remove(user.userId, org, entryId);
  }

  @Get('cards/:cardId/time')
  @ApiOperation({ summary: 'Lista entries do card' })
  listByCard(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
  ) {
    return this.service.listByCard(user.userId, org, cardId);
  }

  @Get('organizations/me/timesheet')
  @ApiOperation({ summary: 'Timesheet da Org com filtros (paginado)' })
  timesheet(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Query(new ZodValidationPipe(TimesheetFilterSchema)) query: TimesheetFilterRequest,
  ) {
    return this.service.listTimesheet(user.userId, org, query);
  }

  @Get('organizations/me/timesheet/summary')
  @ApiOperation({ summary: 'Totais agregados do timesheet' })
  summary(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Query(new ZodValidationPipe(TimesheetFilterSchema)) query: TimesheetFilterRequest,
  ) {
    return this.service.getTimesheetSummary(user.userId, org, query);
  }
}
