import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { PushModule } from '@/modules/push/push.module';

import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [PushModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, TenantGuard],
  exports: [NotificationsService],
})
export class NotificationsModule {}
