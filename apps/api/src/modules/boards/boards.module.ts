import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { StorageModule } from '@/modules/storage/storage.module';

import { BoardsService } from './boards.service';
import { BoardAccessService } from './board-access.service';
import { BoardsController } from './boards.controller';

@Module({
  imports: [StorageModule],
  controllers: [BoardsController],
  providers: [BoardsService, BoardAccessService, TenantGuard],
  exports: [BoardsService, BoardAccessService],
})
export class BoardsModule {}
