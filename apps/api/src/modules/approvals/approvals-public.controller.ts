import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { Public } from '@/modules/auth/decorators/public.decorator';

import { ApprovalsService } from './approvals.service';
import { PublicDecideSchema, type PublicDecideRequest } from './dto/approvals.schemas';

/**
 * Endpoints PÚBLICOS — sem autenticação. O acesso é controlado pelo
 * `accessToken` do CardApprovalReviewer (gerado por reviewer ao criar
 * uma aprovação).
 *
 *   GET  /v1/public/approvals/:token         — visão pública do card pra decidir
 *   POST /v1/public/approvals/:token/decide  — aprova ou reprova
 *
 * Token expira em 7 dias por padrão. Após decisão, o token continua
 * válido (a página pode mostrar "já decidida"), mas POST decide retorna
 * erro pra evitar votos múltiplos pelo mesmo link.
 */
@ApiTags('approvals-public')
@Controller({ path: 'public/approvals', version: '1' })
export class ApprovalsPublicController {
  constructor(private readonly service: ApprovalsService) {}

  @Public()
  @Get(':token')
  @ApiOperation({ summary: 'Visão pública da aprovação (sem login)' })
  view(@Param('token') token: string) {
    return this.service.getPublicView(token);
  }

  @Public()
  @Post(':token/decide')
  @ApiOperation({ summary: 'Decide aprovação via link tokenizado' })
  decide(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(PublicDecideSchema)) body: PublicDecideRequest,
  ) {
    return this.service.decideByToken(token, body);
  }
}
