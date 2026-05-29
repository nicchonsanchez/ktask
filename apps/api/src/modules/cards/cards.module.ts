import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { BoardsModule } from '@/modules/boards/boards.module';
import { StorageModule } from '@/modules/storage/storage.module';
import { MeModule } from '@/modules/me/me.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { AutomationsModule } from '@/modules/automations/automations.module';

import { CardsService } from './cards.service';
import { CardsController } from './cards.controller';
import { CardStatusSyncService } from './card-status-sync';

@Module({
  imports: [BoardsModule, StorageModule, MeModule, NotificationsModule, AutomationsModule],
  controllers: [CardsController],
  providers: [CardsService, CardStatusSyncService, TenantGuard],
  exports: [CardsService, CardStatusSyncService],
})
export class CardsModule {}
