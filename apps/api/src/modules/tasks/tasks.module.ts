import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';

import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';

@Module({
  controllers: [TasksController],
  providers: [TasksService, TenantGuard],
  exports: [TasksService],
})
export class TasksModule {}
