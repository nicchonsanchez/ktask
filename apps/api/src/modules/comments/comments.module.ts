import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { BoardsModule } from '@/modules/boards/boards.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { PerformanceModule } from '@/modules/performance/performance.module';

import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';

@Module({
  imports: [BoardsModule, NotificationsModule, PerformanceModule],
  controllers: [CommentsController],
  providers: [CommentsService, TenantGuard],
  exports: [CommentsService],
})
export class CommentsModule {}
