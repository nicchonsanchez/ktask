import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { TenantGuard } from '@/common/tenant/tenant.guard';
import { CurrentOrg } from '@/common/tenant/current-org.decorator';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '@/modules/auth/auth.types';

import { ImporterService } from './importer.service';
import {
  ImportUmmenseSchema,
  ImportPreviewSchema,
  ImportExecuteSchema,
  type ImportUmmenseRequest,
  type ImportPreviewRequest,
  type ImportExecuteRequest,
} from './dto/importer.schemas';

@ApiTags('importer')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller({ path: 'admin/import', version: '1' })
export class ImporterController {
  constructor(private readonly importer: ImporterService) {}

  /**
   * Endpoint LEGADO de auto-resolve por nome. Mantido pra
   * compatibilidade e uso programatico (sem UI). Pra fluxo manual
   * interativo, usar /preview + /execute.
   */
  @Post('ummense-flow')
  @ApiOperation({
    summary: 'Importa fluxo do Ummense (auto-resolve por nome — legado)',
  })
  importUmmenseFlow(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Body(new ZodValidationPipe(ImportUmmenseSchema)) body: ImportUmmenseRequest,
  ) {
    return this.importer.importUmmenseFlow(user.userId, org, body);
  }

  /**
   * Wizard V2 — passo de preview. Devolve entidades unicas detectadas
   * (membros + colunas) com sugestoes via fuzzy match + mapeamentos
   * salvos da Org. Sem persistencia.
   */
  @Post('ummense-flow/preview')
  @ApiOperation({
    summary: 'Preview do import: extrai entidades unicas e sugere matches',
  })
  preview(
    @CurrentOrg() org: TenantContext,
    @Body(new ZodValidationPipe(ImportPreviewSchema)) body: ImportPreviewRequest,
  ) {
    return this.importer.preview(org, body);
  }

  /**
   * Wizard V2 — passo de execucao. Recebe CSV + boardId (ou nome de
   * board novo) + mapeamentos explicitos de membros e colunas. Cria
   * cards aplicando os mappings; nomes nao mapeados sao tratados como
   * "ignorar". Persiste mappings novos em OrgImportMapping.
   */
  @Post('ummense-flow/execute')
  @ApiOperation({
    summary: 'Executa import com mapeamento explicito do wizard V2',
  })
  execute(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Body(new ZodValidationPipe(ImportExecuteSchema)) body: ImportExecuteRequest,
  ) {
    return this.importer.executeWithMapping(user.userId, org, body);
  }
}
