import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';

import { PushService } from './push.service';
import { PushController } from './push.controller';

@Module({
  controllers: [PushController],
  providers: [PushService, TenantGuard],
  exports: [PushService],
})
export class PushModule {}
