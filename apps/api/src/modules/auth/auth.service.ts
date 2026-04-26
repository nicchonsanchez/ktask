import { Injectable, Logger, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { env } from '@/config/env';
import { PrismaService } from '@/common/prisma/prisma.service';
import { PasswordService } from '@/common/crypto/password.service';
import { TokenService } from '@/common/crypto/token.service';
import { UsersService, type PublicUser } from '@/modules/users/users.service';

import type { JwtAccessPayload, LoginResult } from './auth.types';

/**
 * Converte duração textual tipo "15m", "7d", "30d", "12h" em milissegundos.
 * Suporta: s (seconds), m (minutes), h (hours), d (days), w (weeks).
 */
function parseDurationMs(input: string): number {
  const match = /^(\d+)\s*(s|m|h|d|w)$/i.exec(input.trim());
  if (!match) {
    throw new Error(`Duração inválida: "${input}". Formato esperado: <n><s|m|h|d|w>`);
  }
  const [, n, unitRaw] = match;
  const value = Number(n);
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };
  const unit = unitRaw!.toLowerCase();
  const mult = multipliers[unit];
  if (!mult) throw new Error(`Unidade desconhecida: "${unit}"`);
  return value * mult;
}

interface LoginParams {
  email: string;
  password: string;
  userAgent?: string;
  ip?: string;
}

/**
 * Limites do bloqueio por conta (complementa o ThrottlerGuard que bloqueia
 * por IP). Funciona separado: 10 tentativas em 30min na mesma conta — mesmo
 * que o atacante use IPs diferentes — viram um lock de 15min.
 */
const FAIL_LIMIT = 10;
const LOCK_DURATION_MS = 15 * 60_000;
const ATTEMPT_WINDOW_MS = 30 * 60_000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly password: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  async login({ email, password, userAgent, ip }: LoginParams): Promise<LoginResult> {
    const user = await this.users.findByEmail(email);

    // Conta bloqueada — recusa antes de verificar senha. Não vazamos
    // existência: a mesma mensagem genérica é usada quando user é null e
    // como fallback abaixo.
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000));
      throw new UnauthorizedException(
        `Conta temporariamente bloqueada por excesso de tentativas. Tente novamente em ${minutes} minuto(s).`,
      );
    }

    // Timing: fazemos verify sempre (mesmo com hash fake) para não vazar existência.
    const hash = user?.passwordHash ?? '$argon2id$v=19$m=65536,t=3,p=4$dummydummydummy$dummy';
    const verified = await this.password.verify(hash, password);

    if (!verified || !user) {
      if (user) {
        // Tentativa falhou em conta existente — incrementa contador. Janela
        // deslizante: se a última falha foi antes do ATTEMPT_WINDOW_MS, o
        // contador é resetado pra 1 ao invés de incrementado.
        const now = new Date();
        const inWindow =
          user.lastFailedAt && now.getTime() - user.lastFailedAt.getTime() < ATTEMPT_WINDOW_MS;
        const newCount = inWindow ? user.failedLoginCount + 1 : 1;
        const shouldLock = newCount >= FAIL_LIMIT;
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: shouldLock ? 0 : newCount,
            lastFailedAt: now,
            lockedUntil: shouldLock ? new Date(now.getTime() + LOCK_DURATION_MS) : null,
          },
        });
        if (shouldLock) {
          this.logger.warn(
            `Conta bloqueada por excesso de tentativas: userId=${user.id} email=${email}`,
          );
        }
      }
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    if (user.deletedAt) {
      throw new ForbiddenException('Conta desativada.');
    }

    // Login bem-sucedido — limpa contadores se houver algum estado pendente
    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastFailedAt: null },
      });
    }

    // Re-hash se parâmetros mudaram
    if (this.password.needsRehash(user.passwordHash)) {
      const newHash = await this.password.hash(password);
      await this.users.updatePasswordHash(user.id, newHash);
    }

    return this.issueTokens(user.id, user.email, { userAgent, ip });
  }

  async refresh(rawRefreshToken: string): Promise<LoginResult> {
    const tokenHash = this.tokens.hash(rawRefreshToken);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }

    if (session.user.deletedAt) {
      throw new ForbiddenException('Conta desativada.');
    }

    // Rotação: revoga a sessão atual e emite uma nova.
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(session.userId, session.user.email, {
      userAgent: session.userAgent ?? undefined,
      ip: session.ip ?? undefined,
    });
  }

  async logout(rawRefreshToken: string): Promise<void> {
    if (!rawRefreshToken) return;
    const tokenHash = this.tokens.hash(rawRefreshToken);
    await this.prisma.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async logoutAll(userId: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async validateAccessToken(token: string): Promise<JwtAccessPayload> {
    try {
      return await this.jwt.verifyAsync<JwtAccessPayload>(token, {
        secret: env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }
  }

  async me(userId: string): Promise<PublicUser> {
    return this.users.findPublicById(userId);
  }

  /**
   * Troca a senha do usuário autenticado. Invalida todas as sessões
   * (refresh tokens) pra forçar re-login em outros dispositivos.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Sessão inválida.');
    }
    const ok = await this.password.verify(user.passwordHash, currentPassword);
    if (!ok) {
      throw new UnauthorizedException('Senha atual incorreta.');
    }
    const newHash = await this.password.hash(newPassword);
    await this.users.updatePasswordHash(userId, newHash);
    // Revoga todas as sessões exceto possivelmente a atual — seguro assumir
    // que o user vai re-logar se desejar. Revoga todas pra simplificar.
    await this.prisma.session.deleteMany({ where: { userId } });
    return { ok: true };
  }

  // -----------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------

  private async issueTokens(
    userId: string,
    email: string,
    opts: { userAgent?: string; ip?: string },
  ): Promise<LoginResult> {
    const payload: JwtAccessPayload = { sub: userId, email };
    // JwtModule.register já define secret + expiresIn nos defaults;
    // evita conflito de tipos com StringValue do ms.
    const accessToken = await this.jwt.signAsync(payload);

    const refreshToken = this.tokens.generate();
    const tokenHash = this.tokens.hash(refreshToken);

    const expiresAt = new Date(Date.now() + parseDurationMs(env.JWT_REFRESH_TTL));

    await this.prisma.session.create({
      data: {
        userId,
        tokenHash,
        userAgent: opts.userAgent,
        ip: opts.ip,
        expiresAt,
      },
    });

    const user = await this.users.findPublicById(userId);

    this.logger.log({ userId, sessionExpiresAt: expiresAt.toISOString() }, 'session issued');

    return {
      accessToken,
      refreshToken,
      refreshExpiresAt: expiresAt,
      user,
    };
  }
}
