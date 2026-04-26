import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { TenantGuard } from '@/common/tenant/tenant.guard';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '@/modules/auth/auth.types';

import { PushService } from './push.service';
import { SubscribePushSchema, type SubscribePushRequest } from './dto/push.schemas';

@ApiTags('push')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller({ path: 'push', version: '1' })
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('vapid-public-key')
  @ApiOperation({
    summary: 'Retorna a VAPID public key (necessária pro browser subscribe)',
  })
  getVapidKey() {
    const key = this.push.getPublicKey();
    if (!key) {
      throw new ServiceUnavailableException(
        'Push notifications não estão configuradas neste ambiente.',
      );
    }
    return { publicKey: key };
  }

  @Post('subscriptions')
  @ApiOperation({
    summary: 'Registra (ou reativa) uma push subscription do dispositivo atual',
  })
  subscribe(
    @CurrentUser() user: AuthenticatedRequestContext,
    @Body(new ZodValidationPipe(SubscribePushSchema)) body: SubscribePushRequest,
  ) {
    return this.push.subscribe({
      userId: user.userId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: body.userAgent,
    });
  }

  @Delete('subscriptions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a subscription correspondente ao endpoint informado' })
  async unsubscribe(
    @CurrentUser() user: AuthenticatedRequestContext,
    @Body() body: { endpoint: string },
  ) {
    await this.push.unsubscribe(user.userId, body.endpoint);
  }

  @Delete('subscriptions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove uma subscription específica do user (por id)' })
  async unsubscribeById(@CurrentUser() user: AuthenticatedRequestContext, @Param('id') id: string) {
    // delete by id requer validar dono — fetch + filter
    const subs = await this.push.listForUser(user.userId);
    const target = subs.find((s) => s.id === id);
    if (!target) return;
    await this.push.unsubscribe(user.userId, target.endpoint);
  }

  @Get('subscriptions')
  @ApiOperation({ summary: 'Lista os dispositivos com push ativo do usuário logado' })
  list(@CurrentUser() user: AuthenticatedRequestContext) {
    return this.push.listForUser(user.userId);
  }
}
