import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { Public } from '@/modules/auth/decorators/public.decorator';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';

import { SupportService } from './support.service';
import {
  CreateSupportTicketSchema,
  type CreateSupportTicketDto,
} from './dto/create-support-ticket.schema';

/**
 * Endpoint público (sem auth) usado pelo formulário em /ajuda/suporte. Rate
 * limit de 5 req/min/IP por cima do default global (100/min). Honeypot inline
 * — campo `website` que bots preenchem; o service rejeita silenciosamente.
 */
@ApiTags('support')
@Controller({ path: 'support-tickets', version: '1' })
export class SupportController {
  constructor(private readonly service: SupportService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cria ticket de suporte via formulário público.' })
  create(
    @Body(new ZodValidationPipe(CreateSupportTicketSchema))
    body: CreateSupportTicketDto,
  ) {
    return this.service.createTicket(body);
  }
}
