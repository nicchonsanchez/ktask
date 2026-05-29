import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { BoardsModule } from '@/modules/boards/boards.module';
import { CardStatusSyncService } from '@/modules/cards/card-status-sync';
import { NotificationsModule } from '@/modules/notifications/notifications.module';

import { AutomationsService } from './automations.service';
import { AutomationsController } from './automations.controller';
import { AutomationsEngine } from './automations.engine';
import { AutomationsScheduler } from './automations.scheduler';
import { AutomationsOutboxService } from './automations.outbox.service';

@Module({
  imports: [BoardsModule, NotificationsModule],
  controllers: [AutomationsController],
  providers: [
    AutomationsService,
    AutomationsEngine,
    AutomationsScheduler,
    AutomationsOutboxService,
    CardStatusSyncService,
    TenantGuard,
  ],
  // Outbox precisa ser exportado pra cards/approvals/checklists fazerem
  // enqueue dentro da TXN deles.
  exports: [AutomationsService, AutomationsEngine, AutomationsOutboxService],
})
export class AutomationsModule {}
