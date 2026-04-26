import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { TenantGuard } from '@/common/tenant/tenant.guard';
import { CurrentOrg } from '@/common/tenant/current-org.decorator';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '@/modules/auth/auth.types';

import { TasksService } from './tasks.service';
import {
  CreateTaskSchema,
  UpdateTaskSchema,
  type CreateTaskRequest,
  type UpdateTaskRequest,
} from './dto/task.schemas';

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller({ path: 'tasks', version: '1' })
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Criar tarefa standalone (default assignee = caller)' })
  create(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Body(new ZodValidationPipe(CreateTaskSchema)) body: CreateTaskRequest,
  ) {
    return this.tasks.create(user.userId, org, body);
  }

  @Patch(':taskId')
  @ApiOperation({ summary: 'Atualizar tarefa standalone' })
  update(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('taskId') taskId: string,
    @Body(new ZodValidationPipe(UpdateTaskSchema)) body: UpdateTaskRequest,
  ) {
    return this.tasks.update(user.userId, org, taskId, body);
  }

  @Delete(':taskId')
  @ApiOperation({ summary: 'Excluir tarefa standalone' })
  remove(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('taskId') taskId: string,
  ) {
    return this.tasks.remove(user.userId, org, taskId);
  }
}
