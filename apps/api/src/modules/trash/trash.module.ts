import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';

import { TrashController } from './trash.controller';
import { TrashService } from './trash.service';
import { TrashPurgeScheduler } from './trash-purge.scheduler';

@Module({
  controllers: [TrashController],
  providers: [TrashService, TrashPurgeScheduler, TenantGuard],
  exports: [TrashService],
})
export class TrashModule {}
