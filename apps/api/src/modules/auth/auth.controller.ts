import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { LoginRequestSchema, type LoginRequest, type User as UserContract } from '@ktask/contracts';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { env } from '@/config/env';

import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from './auth.types';

const REFRESH_COOKIE_NAME = 'ktask_refresh';

function cookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    ...(expires ? { expires } : {}),
  };
}

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Bloqueio por IP: 10 tentativas em 15min (900_000 ms). O ThrottlerGuard
  // global do app continua valendo pros outros endpoints. Usa o mesmo
  // backend (memória) — pra produção multi-instância considerar trocar
  // por ThrottlerStorageRedisService.
  @Throttle({ default: { ttl: 900_000, limit: 10 } })
  @ApiOperation({ summary: 'Autenticar com e-mail e senha' })
  async login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login({
      email: body.email,
      password: body.password,
      userAgent: req.headers['user-agent'] ?? undefined,
      ip: req.ip,
      rememberMe: body.rememberMe,
    });

    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, cookieOptions(result.refreshExpiresAt));

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar access token via refresh cookie' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (!raw) {
      throw new UnauthorizedException('Refresh token ausente.');
    }
    const result = await this.auth.refresh(raw);

    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, cookieOptions(result.refreshExpiresAt));

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Encerrar sessão atual' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (raw) await this.auth.logout(raw);
    res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions());
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Encerrar todas as sessões do usuário' })
  async logoutAll(
    @CurrentUser() user: AuthenticatedRequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logoutAll(user.userId);
    res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions());
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dados do usuário autenticado' })
  async me(@CurrentUser() user: AuthenticatedRequestContext): Promise<UserContract> {
    const me = await this.auth.me(user.userId);
    return {
      id: me.id,
      email: me.email,
      name: me.name,
      avatarUrl: me.avatarUrl,
      phone: me.phone,
      notifyApprovalsOnWhatsApp: me.notifyApprovalsOnWhatsApp,
      locale: me.locale,
      timezone: me.timezone,
      twoFactorEnabled: me.twoFactorEnabled,
      createdAt: me.createdAt.toISOString(),
    };
  }
}
