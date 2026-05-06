import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { MeModule } from '@/modules/me/me.module';

import { UsersViewService } from './users-view.service';
import { UsersViewController } from './users-view.controller';

@Module({
  imports: [MeModule],
  controllers: [UsersViewController],
  providers: [UsersViewService, TenantGuard],
  exports: [UsersViewService],
})
export class UsersViewModule {}
