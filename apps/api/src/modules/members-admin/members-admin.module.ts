import { forwardRef, Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { AuthModule } from '@/modules/auth/auth.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';

import { MembersAdminService } from './members-admin.service';
import { MembersAdminController } from './members-admin.controller';
import { ResponsibilityTransferService } from './responsibility-transfer.service';

@Module({
  imports: [forwardRef(() => AuthModule), NotificationsModule],
  controllers: [MembersAdminController],
  providers: [MembersAdminService, ResponsibilityTransferService, TenantGuard],
  exports: [MembersAdminService],
})
export class MembersAdminModule {}
