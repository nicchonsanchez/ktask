import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { BoardsModule } from '@/modules/boards/boards.module';

import { ChecklistTemplatesService } from './checklist-templates.service';
import { ChecklistTemplatesController } from './checklist-templates.controller';

@Module({
  imports: [BoardsModule],
  controllers: [ChecklistTemplatesController],
  providers: [ChecklistTemplatesService, TenantGuard],
  exports: [ChecklistTemplatesService],
})
export class ChecklistTemplatesModule {}
