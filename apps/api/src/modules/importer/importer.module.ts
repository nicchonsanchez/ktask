import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';

import { ImporterService } from './importer.service';
import { ImporterController } from './importer.controller';

@Module({
  controllers: [ImporterController],
  providers: [ImporterService, TenantGuard],
  exports: [ImporterService],
})
export class ImporterModule {}
