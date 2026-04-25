import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { BoardsModule } from '@/modules/boards/boards.module';
import { StorageModule } from '@/modules/storage/storage.module';
import { MeModule } from '@/modules/me/me.module';

import { CardsService } from './cards.service';
import { CardsController } from './cards.controller';

@Module({
  imports: [BoardsModule, StorageModule, MeModule],
  controllers: [CardsController],
  providers: [CardsService, TenantGuard],
  exports: [CardsService],
})
export class CardsModule {}
