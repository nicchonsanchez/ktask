import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';

import { MembersAdminService } from './members-admin.service';
import { MembersAdminController } from './members-admin.controller';

@Module({
  controllers: [MembersAdminController],
  providers: [MembersAdminService, TenantGuard],
  exports: [MembersAdminService],
})
export class MembersAdminModule {}
