import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { PushModule } from '@/modules/push/push.module';

import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsScheduler } from './notifications.scheduler';
import { WhatsappOutboxService } from './whatsapp-outbox.service';
import { WhatsappOutboxScheduler } from './whatsapp-outbox.scheduler';

@Module({
  imports: [PushModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsScheduler,
    WhatsappOutboxService,
    WhatsappOutboxScheduler,
    TenantGuard,
  ],
  exports: [NotificationsService, WhatsappOutboxService],
})
export class NotificationsModule {}
