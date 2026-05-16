import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';

import { env } from '@/config/env';
import { PrismaService } from '@/common/prisma/prisma.service';
import { PasswordService } from '@/common/crypto/password.service';
import { TokenService } from '@/common/crypto/token.service';
import { UsersService, type PublicUser } from '@/modules/users/users.service';
import { InvitationsService } from '@/modules/organizations/invitations.service';
import { MailService } from '@/modules/mail/mail.service';
import { SP_EVENT_NAMES } from '@/modules/webhooks-outbound/webhooks-outbound.module';
import { WhatsAppHelper } from '@/modules/whatsapp/whatsapp.helper';

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
  /**
   * Se true (default), refresh token vale JWT_REFRESH_TTL (90d). Se false,
   * vale JWT_REFRESH_TTL_SHORT (1d) — pra equipamentos compartilhados onde
   * o usuário desmarcou "Permanecer logado".
   */
  rememberMe?: boolean;
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
    private readonly invitations: InvitationsService,
    private readonly mail: MailService,
    private readonly whatsapp: WhatsAppHelper,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Doc 34: cria User a partir de um convite valido + cria Membership +
   * marca convite aceito + retorna sessao logada. Usado pra fluxo de
   * cadastro inline na pagina /convite/[token] quando email do convite
   * ainda nao tem User cadastrado.
   *
   * Race: se outro signup com mesmo email aconteceu enquanto o user digitava,
   * lanca 409 (frontend mostra "ja tem conta, peca pra logar").
   */
  async signupFromInvite(params: {
    token: string;
    name: string;
    password: string;
    userAgent?: string;
    ip?: string;
  }): Promise<LoginResult> {
    const { token, name, password, userAgent, ip } = params;

    if (password.length < 8) {
      throw new BadRequestException('Senha precisa de pelo menos 8 caracteres.');
    }

    const invitation = await this.invitations.previewByRawToken(token);
    const email = invitation.email.toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictException(
        'Já existe uma conta com este e-mail. Faça login e abra o link novamente para aceitar o convite.',
      );
    }

    const passwordHash = await this.password.hash(password);

    const userId = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name: name.trim(),
          passwordHash,
        },
        select: { id: true },
      });
      await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: invitation.organizationId,
          role: invitation.role,
        },
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      return user.id;
    });

    return this.issueTokens(userId, email, { userAgent, ip, rememberMe: true });
  }

  async login({
    email,
    password,
    userAgent,
    ip,
    rememberMe = true,
  }: LoginParams): Promise<LoginResult> {
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

    if (user.suspendedAt) {
      throw new ForbiddenException(
        user.suspendedReason
          ? `Conta suspensa: ${user.suspendedReason}`
          : 'Conta suspensa. Entre em contato com o administrador.',
      );
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

    return this.issueTokens(user.id, user.email, { userAgent, ip, rememberMe });
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
      // Preserva escolha do user no login original. Sem isso, todo refresh
      // reverteria pra TTL longa — burlando "sessão curta".
      rememberMe: session.rememberMe,
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
  // Doc 43: recuperacao de senha por email
  // -----------------------------------------------------------------

  /**
   * Cria token de reset (1h TTL) e dispara email pro user. Sempre retorna
   * sucesso, mesmo se email nao existir — anti-enumeracao.
   *
   * Rate-limit no controller (3 requests por 15min por IP).
   */
  async forgotPassword(params: { email: string; ip?: string; userAgent?: string }) {
    const email = params.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Anti-enumeracao: comportamento identico pra existente vs nao-existente.
    if (!user || user.deletedAt) {
      this.logger.log(`[forgotPassword] no-op pra ${email} (sem user ativo)`);
      return { ok: true };
    }
    if (user.suspendedAt) {
      this.logger.log(`[forgotPassword] no-op pra ${email} (suspenso)`);
      return { ok: true };
    }

    await this.dispatchPasswordResetForUser(user, {
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
      source: 'self',
    });
    return { ok: true };
  }

  /**
   * Helper compartilhado entre forgotPassword (publico, anti-enumeracao) e
   * forcePasswordReset (admin via members-admin). Gera token + persiste +
   * dispara email + WhatsApp (se phone). Fire-and-forget nos canais —
   * falha de envio nao bloqueia (token continua valido).
   *
   * `source` aparece nos logs e diferencia caminho 'self' (user pediu) de
   * 'admin' (forcado por OWNER/ADMIN). Mensagens podem variar levemente
   * baseado nisso no futuro; hoje uso o mesmo template.
   */
  async dispatchPasswordResetForUser(
    user: { id: string; email: string; name: string; phone: string | null },
    opts: { ip?: string | null; userAgent?: string | null; source: 'self' | 'admin' },
  ): Promise<void> {
    const rawToken = this.tokens.generate();
    const tokenHash = this.tokens.hash(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60_000); // 1h

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        requestIp: opts.ip ?? null,
        userAgent: opts.userAgent ?? null,
      },
    });

    const resetUrl = `${env.APP_URL.replace(/\/$/, '')}/redefinir-senha/${rawToken}`;
    const logPrefix = `[dispatchPasswordReset:${opts.source}]`;

    // Email — fire-and-forget; SMTP caindo nao quebra o flow.
    this.mail
      .sendPasswordReset({ to: user.email, name: user.name, resetUrl, expiresAt })
      .catch((err) => {
        this.logger.error(`${logPrefix} mail failed pra ${user.email}: ${err.message}`);
      });

    // WhatsApp — canal adicional. Cenario "esqueci senha" tambem inclui
    // "perdi acesso ao email", entao WhatsApp e a 2a chance.
    if (user.phone) {
      const firstName = user.name.split(' ')[0] || user.name;
      const msg =
        `Olá *${firstName}*, recebemos um pedido de *redefinição da sua senha* no KTask.\n\n` +
        `Clique pra criar uma nova senha (válido por 1h):\n${resetUrl}\n\n` +
        `Se não foi você, pode ignorar esta mensagem — sua senha atual continua valendo.\n\n` +
        `> Esta é uma mensagem automática.`;
      this.whatsapp.sendText(user.phone, msg).catch((err) => {
        this.logger.error(`${logPrefix} whatsapp failed pra ${user.phone}: ${err.message ?? err}`);
      });
    }
  }

  /**
   * Valida token + troca senha. Marca token usado, revoga todas as sessoes
   * (forca relogin) e zera tentativas falhas / lock.
   */
  async resetPassword(params: { token: string; newPassword: string }) {
    const { token, newPassword } = params;
    const tokenHash = this.tokens.hash(token);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!record) {
      throw new BadRequestException('Link inválido ou expirado.');
    }
    if (record.usedAt) {
      throw new BadRequestException('Este link já foi usado. Solicite um novo.');
    }
    if (record.expiresAt < new Date()) {
      throw new BadRequestException('Link expirado. Solicite um novo.');
    }
    if (record.user.deletedAt || record.user.suspendedAt) {
      throw new BadRequestException('Conta indisponível.');
    }

    const newHash = await this.password.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash: newHash,
          failedLoginCount: 0,
          lockedUntil: null,
          lastFailedAt: null,
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Revoga todas as sessoes — forca relogin pra todos os devices.
      this.prisma.session.deleteMany({ where: { userId: record.userId } }),
    ]);

    this.logger.log(`[resetPassword] senha redefinida pra ${record.user.email}`);
    return { ok: true };
  }

  // -----------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------

  private async issueTokens(
    userId: string,
    email: string,
    opts: { userAgent?: string; ip?: string; rememberMe?: boolean },
  ): Promise<LoginResult> {
    const payload: JwtAccessPayload = { sub: userId, email };
    // JwtModule.register já define secret + expiresIn nos defaults;
    // evita conflito de tipos com StringValue do ms.
    const accessToken = await this.jwt.signAsync(payload);

    const refreshToken = this.tokens.generate();
    const tokenHash = this.tokens.hash(refreshToken);

    const rememberMe = opts.rememberMe ?? true;
    const ttlString = rememberMe ? env.JWT_REFRESH_TTL : env.JWT_REFRESH_TTL_SHORT;
    const expiresAt = new Date(Date.now() + parseDurationMs(ttlString));

    await this.prisma.session.create({
      data: {
        userId,
        tokenHash,
        userAgent: opts.userAgent,
        ip: opts.ip,
        rememberMe,
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

  /**
   * Validacao de credenciais pra federacao OAuth2/OIDC com Service Provider
   * externo (ex: Ogma). Diferente do login normal:
   *   - NAO persiste Session (sem refresh token)
   *   - NAO usa rate limit por conta (apenas por IP via Throttler)
   *   - Retorna access token + memberships pra que o SP possa autorizar
   *     acoes na org correta
   *
   * Aplica as mesmas regras de bloqueio por conta (FAIL_LIMIT/LOCK) e
   * verificacao de timing (hash dummy quando user nao existe) pra nao
   * vazar existencia de email.
   *
   * Etapa 1 do plano em tarefas-md/51-federacao-idp-para-ogma.md.
   */
  async validateForSp({ email, password }: { email: string; password: string }): Promise<{
    valido: true;
    accessToken: string;
    user: PublicUser;
    memberships: Array<{ organizationId: string; slug: string; role: string }>;
  }> {
    const user = await this.users.findByEmail(email);

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000));
      throw new UnauthorizedException(
        `Conta temporariamente bloqueada. Tente novamente em ${minutes} minuto(s).`,
      );
    }

    const hash = user?.passwordHash ?? '$argon2id$v=19$m=65536,t=3,p=4$dummydummydummy$dummy';
    const verified = await this.password.verify(hash, password);

    if (!verified || !user) {
      if (user) {
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
      }
      throw new UnauthorizedException('Credenciais invalidas.');
    }

    if (user.deletedAt) {
      throw new ForbiddenException('Conta desativada.');
    }
    if (user.suspendedAt) {
      throw new ForbiddenException('Conta suspensa.');
    }

    // Limpa contadores em sucesso
    if (user.failedLoginCount > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastFailedAt: null },
      });
    }

    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id, organization: { deletedAt: null } },
      select: {
        organizationId: true,
        role: true,
        organization: { select: { slug: true } },
      },
    });

    const payload: JwtAccessPayload = { sub: user.id, email: user.email };
    const accessToken = await this.jwt.signAsync(payload);

    const publicUser = await this.users.findPublicById(user.id);

    return {
      valido: true,
      accessToken,
      user: publicUser,
      memberships: memberships.map((m) => ({
        organizationId: m.organizationId,
        slug: m.organization.slug,
        role: m.role,
      })),
    };
  }

  /**
   * Revoga sessoes ativas do usuario e emite evento pra SPs externos.
   * Chamado por POST /auth/revoke/:userId (admin de plataforma).
   *
   * Etapa 4 do plano em tarefas-md/51-federacao-idp-para-ogma.md.
   */
  async revokeForSp(userId: string, motivo?: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) return; // idempotente

    await this.logoutAll(userId);
    this.events.emit(SP_EVENT_NAMES.USUARIO_DESATIVADO, {
      userId,
      motivo: motivo ?? null,
    });
    this.logger.warn(`Sessoes do user ${userId} revogadas por admin de plataforma.`);
  }
}
