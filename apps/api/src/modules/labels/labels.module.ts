import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { BoardsModule } from '@/modules/boards/boards.module';

import { LabelsService } from './labels.service';
import { LabelsController } from './labels.controller';

@Module({
  imports: [BoardsModule],
  controllers: [LabelsController],
  providers: [LabelsService, TenantGuard],
  exports: [LabelsService],
})
export class LabelsModule {}
