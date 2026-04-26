import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { BoardsModule } from '@/modules/boards/boards.module';

import { AutomationsService } from './automations.service';
import { AutomationsController } from './automations.controller';
import { AutomationsEngine } from './automations.engine';

@Module({
  imports: [BoardsModule],
  controllers: [AutomationsController],
  providers: [AutomationsService, AutomationsEngine, TenantGuard],
  exports: [AutomationsService, AutomationsEngine],
})
export class AutomationsModule {}
