import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';

import { MeService } from './me.service';
import { MeController } from './me.controller';

@Module({
  controllers: [MeController],
  providers: [MeService, TenantGuard],
  exports: [MeService],
})
export class MeModule {}
