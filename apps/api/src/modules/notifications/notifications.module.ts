import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { PushModule } from '@/modules/push/push.module';

import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsScheduler } from './notifications.scheduler';

@Module({
  imports: [PushModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsScheduler, TenantGuard],
  exports: [NotificationsService],
})
export class NotificationsModule {}
