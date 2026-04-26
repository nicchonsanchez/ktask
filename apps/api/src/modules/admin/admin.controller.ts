import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { CurrentOrg } from '@/common/tenant/current-org.decorator';
import type { TenantContext } from '@/common/tenant/tenant.types';

import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Get('stats/time-tracking')
  @ApiOperation({
    summary: 'Stats agregados de Time Tracking da Org (apenas OWNER/ADMIN)',
  })
  timeTrackingStats(@CurrentOrg() org: TenantContext) {
    return this.service.timeTrackingStats(org);
  }
}
