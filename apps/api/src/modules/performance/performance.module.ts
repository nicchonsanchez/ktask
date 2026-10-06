import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';

import { PerformanceConfigService } from './performance-config.service';
import { PerformanceController } from './performance.controller';
import { PerformanceReportService } from './performance-report.service';

/** Doc 52 — Desempenho da Equipe (relatorio + configuracao gerencial). */
@Module({
  controllers: [PerformanceController],
  providers: [PerformanceConfigService, PerformanceReportService, TenantGuard],
  exports: [PerformanceConfigService],
})
export class PerformanceModule {}
