import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';

import { MessageTemplatesController } from './message-templates.controller';
import { MessageTemplatesService } from './message-templates.service';

@Module({
  controllers: [MessageTemplatesController],
  providers: [MessageTemplatesService, TenantGuard],
  exports: [MessageTemplatesService],
})
export class MessageTemplatesModule {}
