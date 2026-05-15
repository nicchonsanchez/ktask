import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { BoardsModule } from '@/modules/boards/boards.module';

import { ManagementController } from './management.controller';
import { ManagementService } from './management.service';

@Module({
  imports: [BoardsModule],
  controllers: [ManagementController],
  providers: [ManagementService, TenantGuard],
})
export class ManagementModule {}
