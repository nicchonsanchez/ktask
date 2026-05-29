import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { BoardsModule } from '@/modules/boards/boards.module';
import { CardStatusSyncService } from '@/modules/cards/card-status-sync';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { StorageModule } from '@/modules/storage/storage.module';
import { AutomationsModule } from '@/modules/automations/automations.module';

import { ApprovalsService } from './approvals.service';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsPublicController } from './approvals-public.controller';

@Module({
  imports: [BoardsModule, NotificationsModule, StorageModule, AutomationsModule],
  controllers: [ApprovalsController, ApprovalsPublicController],
  providers: [ApprovalsService, CardStatusSyncService, TenantGuard],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
