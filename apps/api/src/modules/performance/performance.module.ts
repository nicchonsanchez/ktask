import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { BoardsModule } from '@/modules/boards/boards.module';
import { ChecklistsModule } from '@/modules/checklists/checklists.module';

import { ContactLoggingController } from './contact-logging.controller';
import { ContactLoggingService } from './contact-logging.service';

import { PerformanceConfigService } from './performance-config.service';
import { PerformanceController } from './performance.controller';
import { PerformanceReportService } from './performance-report.service';

/** Doc 52 — Desempenho da Equipe (relatorio + configuracao gerencial). */
@Module({
  imports: [BoardsModule, ChecklistsModule],
  controllers: [PerformanceController, ContactLoggingController],
  providers: [
    PerformanceConfigService,
    PerformanceReportService,
    ContactLoggingService,
    TenantGuard,
  ],
  exports: [PerformanceConfigService, ContactLoggingService],
})
export class PerformanceModule {}
