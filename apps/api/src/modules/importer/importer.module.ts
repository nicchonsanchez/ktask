import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { StorageModule } from '@/modules/storage/storage.module';

import { ImporterService } from './importer.service';
import { ImporterController } from './importer.controller';

@Module({
  imports: [StorageModule],
  controllers: [ImporterController],
  providers: [ImporterService, TenantGuard],
  exports: [ImporterService],
})
export class ImporterModule {}
