import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { TenantGuard } from '@/common/tenant/tenant.guard';
import { CurrentOrg } from '@/common/tenant/current-org.decorator';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '@/modules/auth/auth.types';

import { ImporterService } from './importer.service';
import { ImportUmmenseSchema, type ImportUmmenseRequest } from './dto/importer.schemas';

@ApiTags('importer')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller({ path: 'admin/import', version: '1' })
export class ImporterController {
  constructor(private readonly importer: ImporterService) {}

  @Post('ummense-flow')
  @ApiOperation({
    summary: 'Importa fluxo do Ummense (JSON-array-of-arrays exportado como .csv)',
  })
  importUmmenseFlow(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Body(new ZodValidationPipe(ImportUmmenseSchema)) body: ImportUmmenseRequest,
  ) {
    return this.importer.importUmmenseFlow(user.userId, org, body);
  }
}
