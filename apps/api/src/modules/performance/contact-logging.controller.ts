import { Body, Controller, Delete, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { InteractionTypeSchema } from '@ktask/contracts';

import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { TenantGuard } from '@/common/tenant/tenant.guard';
import { CurrentOrg } from '@/common/tenant/current-org.decorator';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '@/modules/auth/auth.types';

import { ContactLoggingService } from './contact-logging.service';

const UpdateInteractionSchema = z.object({
  type: InteractionTypeSchema,
  outcome: z.string().min(1).max(40),
  customLabel: z.string().trim().max(60).optional(),
});
type UpdateInteractionRequest = z.infer<typeof UpdateInteractionSchema>;

/**
 * Doc 52 (Fase 3) — registros de contato. Leitura pra quem acessa o card;
 * a criacao acontece junto do comentario (POST /comments com `interaction`).
 */
@ApiTags('performance')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller({ version: '1' })
export class ContactLoggingController {
  constructor(private readonly contacts: ContactLoggingService) {}

  @Get('cards/:cardId/interactions')
  @ApiOperation({ summary: 'Registros de contato do card + se o registro está habilitado' })
  list(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
    @Query('boardId') boardId?: string,
  ) {
    return this.contacts.listForCard(user.userId, org, cardId, boardId || undefined);
  }

  @Patch('interactions/:id')
  @ApiOperation({ summary: 'Corrige tipo/resultado de um registro de contato' })
  update(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateInteractionSchema)) body: UpdateInteractionRequest,
  ) {
    return this.contacts.update(user.userId, org, id, body);
  }

  @Delete('interactions/:id')
  @ApiOperation({ summary: 'Remove um registro de contato (o comentário fica)' })
  remove(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('id') id: string,
  ) {
    return this.contacts.remove(user.userId, org, id);
  }
}
