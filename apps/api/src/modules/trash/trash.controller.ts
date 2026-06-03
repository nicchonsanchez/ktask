import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { CurrentOrg } from '@/common/tenant/current-org.decorator';
import type { TenantContext } from '@/common/tenant/tenant.types';

import { TrashService } from './trash.service';

@ApiTags('trash')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller({ path: 'trash', version: '1' })
export class TrashController {
  constructor(private readonly trash: TrashService) {}

  @Get('cards')
  @ApiOperation({ summary: 'Lista cards na lixeira da org (paginação por cursor)' })
  listCards(
    @CurrentOrg() org: TenantContext,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('boardId') boardId?: string,
  ) {
    return this.trash.listCards(org, {
      cursor,
      limit: limit ? Number(limit) : undefined,
      search,
      boardId,
    });
  }

  @Get('lists')
  @ApiOperation({ summary: 'Lista colunas na lixeira da org (paginação por cursor)' })
  listLists(
    @CurrentOrg() org: TenantContext,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('boardId') boardId?: string,
  ) {
    return this.trash.listLists(org, {
      cursor,
      limit: limit ? Number(limit) : undefined,
      search,
      boardId,
    });
  }

  @Get('count')
  @ApiOperation({ summary: 'Contadores da lixeira (cards, lists, total)' })
  counts(@CurrentOrg() org: TenantContext) {
    return this.trash.counts(org);
  }
}
