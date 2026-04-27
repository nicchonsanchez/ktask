import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { BoardsModule } from '@/modules/boards/boards.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';

import { ApprovalsService } from './approvals.service';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsPublicController } from './approvals-public.controller';

@Module({
  imports: [BoardsModule, NotificationsModule],
  controllers: [ApprovalsController, ApprovalsPublicController],
  providers: [ApprovalsService, TenantGuard],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
