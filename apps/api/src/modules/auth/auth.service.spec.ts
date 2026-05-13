import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';

import { AuthService } from './auth.service';
import { PasswordService } from '@/common/crypto/password.service';
import { TokenService } from '@/common/crypto/token.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { UsersService } from '@/modules/users/users.service';
import { InvitationsService } from '@/modules/organizations/invitations.service';
import { MailService } from '@/modules/mail/mail.service';
import { WhatsAppHelper } from '@/modules/whatsapp/whatsapp.helper';

type MockedUser = {
  id: string;
  email: string;
  passwordHash: string;
  deletedAt: Date | null;
  failedLoginCount: number;
  lastFailedAt: Date | null;
  lockedUntil: Date | null;
};

describe('AuthService', () => {
  let service: AuthService;
  let users: jest.Mocked<
    Pick<UsersService, 'findByEmail' | 'findById' | 'findPublicById' | 'updatePasswordHash'>
  >;
  let password: jest.Mocked<Pick<PasswordService, 'verify' | 'hash' | 'needsRehash'>>;
  let tokens: jest.Mocked<Pick<TokenService, 'generate' | 'hash'>>;
  let prisma: {
    session: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    user: {
      update: jest.Mock;
    };
  };
  let jwt: jest.Mocked<Pick<JwtService, 'signAsync' | 'verifyAsync'>>;

  const mockUser: MockedUser = {
    id: 'user_1',
    email: 'admin@kharis.local',
    passwordHash: '$argon2id$...',
    deletedAt: null,
    failedLoginCount: 0,
    lastFailedAt: null,
    lockedUntil: null,
  };

  beforeEach(async () => {
    users = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findPublicById: jest.fn(),
      updatePasswordHash: jest.fn(),
    } as never;
    password = {
      verify: jest.fn(),
      hash: jest.fn(),
      needsRehash: jest.fn().mockReturnValue(false),
    } as never;
    tokens = {
      generate: jest.fn().mockReturnValue('raw-refresh-token'),
      hash: jest.fn((t: string) => `hash(${t})`),
    } as never;
    prisma = {
      session: {
        create: jest.fn().mockResolvedValue({ id: 'sess_1' }),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      user: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    jwt = {
      signAsync: jest.fn().mockResolvedValue('jwt-access-token'),
      verifyAsync: jest.fn(),
    } as never;

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: users },
        { provide: PasswordService, useValue: password },
        { provide: TokenService, useValue: tokens },
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        // Doc 34: AuthService passou a depender de InvitationsService
        // para o fluxo signupFromInvite. Mock vazio cobre os testes
        // existentes (login/refresh/logout) que nao tocam essa rota.
        {
          provide: InvitationsService,
          useValue: {
            previewByRawToken: jest.fn(),
          },
        },
        // Doc 43: AuthService passou a depender de MailService para o
        // fluxo de recuperacao de senha. Mock vazio cobre os testes
        // existentes que nao chamam essa rota.
        {
          provide: MailService,
          useValue: {
            sendPasswordResetEmail: jest.fn(),
            sendPasswordReset: jest.fn().mockResolvedValue(undefined),
          },
        },
        // Doc 43+: WhatsApp como canal adicional do reset (forgotPassword).
        // Mock vazio cobre testes que nao chamam forgotPassword.
        {
          provide: WhatsAppHelper,
          useValue: {
            sendText: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('login', () => {
    it('retorna access + refresh para credenciais válidas', async () => {
      users.findByEmail.mockResolvedValue(mockUser as never);
      password.verify.mockResolvedValue(true);
      users.findPublicById.mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
        name: 'Admin',
        avatarUrl: null,
        phone: null,
        notifyApprovalsOnWhatsApp: false,
        locale: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        twoFactorEnabled: false,
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.login({
        email: 'admin@kharis.local',
        password: 'ktask123',
      });

      expect(result.accessToken).toBe('jwt-access-token');
      expect(result.refreshToken).toBe('raw-refresh-token');
      expect(result.user.id).toBe('user_1');
      expect(prisma.session.create).toHaveBeenCalledTimes(1);
      expect(prisma.session.create.mock.calls[0]![0].data.tokenHash).toBe(
        'hash(raw-refresh-token)',
      );
    });

    it('rejeita credenciais inválidas com 401 (mesmo para e-mail inexistente)', async () => {
      users.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'ghost@kharis.local', password: 'x' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      // Garante que tentou verify mesmo sem user (timing attack protection)
      expect(password.verify).toHaveBeenCalledTimes(1);
    });

    it('rejeita senha errada', async () => {
      users.findByEmail.mockResolvedValue(mockUser as never);
      password.verify.mockResolvedValue(false);

      await expect(
        service.login({ email: mockUser.email, password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejeita conta desativada com 403', async () => {
      users.findByEmail.mockResolvedValue({
        ...mockUser,
        deletedAt: new Date(),
      } as never);
      password.verify.mockResolvedValue(true);

      await expect(
        service.login({ email: mockUser.email, password: 'ktask123' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('re-hasheia a senha se os parâmetros mudaram', async () => {
      users.findByEmail.mockResolvedValue(mockUser as never);
      password.verify.mockResolvedValue(true);
      password.needsRehash.mockReturnValue(true);
      password.hash.mockResolvedValue('$argon2id$NEW');
      users.findPublicById.mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
        name: 'Admin',
        avatarUrl: null,
        phone: null,
        notifyApprovalsOnWhatsApp: false,
        locale: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        twoFactorEnabled: false,
        createdAt: new Date('2026-01-01'),
      });

      await service.login({ email: mockUser.email, password: 'ktask123' });

      expect(users.updatePasswordHash).toHaveBeenCalledWith(mockUser.id, '$argon2id$NEW');
    });

    it('incrementa failedLoginCount em senha errada e nao bloqueia antes de 10', async () => {
      users.findByEmail.mockResolvedValue({
        ...mockUser,
        failedLoginCount: 4,
        lastFailedAt: new Date(),
      } as never);
      password.verify.mockResolvedValue(false);

      await expect(
        service.login({ email: mockUser.email, password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: expect.objectContaining({
          failedLoginCount: 5,
          lockedUntil: null,
        }),
      });
    });

    it('bloqueia conta apos 10 tentativas dentro da janela', async () => {
      users.findByEmail.mockResolvedValue({
        ...mockUser,
        failedLoginCount: 9,
        lastFailedAt: new Date(),
      } as never);
      password.verify.mockResolvedValue(false);

      await expect(
        service.login({ email: mockUser.email, password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      const call = prisma.user.update.mock.calls[0]![0];
      expect(call.data.failedLoginCount).toBe(0);
      expect(call.data.lockedUntil).toBeInstanceOf(Date);
      expect((call.data.lockedUntil as Date).getTime()).toBeGreaterThan(Date.now());
    });

    it('reseta contador se ultima falha foi fora da janela de 30min', async () => {
      const longAgo = new Date(Date.now() - 31 * 60_000);
      users.findByEmail.mockResolvedValue({
        ...mockUser,
        failedLoginCount: 9,
        lastFailedAt: longAgo,
      } as never);
      password.verify.mockResolvedValue(false);

      await expect(
        service.login({ email: mockUser.email, password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      // Como esta fora da janela, conta como tentativa #1, nao bloqueia
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: expect.objectContaining({ failedLoginCount: 1, lockedUntil: null }),
      });
    });

    it('rejeita login se conta esta com lockedUntil no futuro', async () => {
      const future = new Date(Date.now() + 5 * 60_000);
      users.findByEmail.mockResolvedValue({
        ...mockUser,
        lockedUntil: future,
      } as never);

      await expect(service.login({ email: mockUser.email, password: 'ktask123' })).rejects.toThrow(
        /bloqueada/i,
      );

      // Nao chega a fazer verify nem incrementar
      expect(password.verify).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('reseta failedLoginCount em login bem-sucedido', async () => {
      users.findByEmail.mockResolvedValue({
        ...mockUser,
        failedLoginCount: 3,
        lastFailedAt: new Date(),
      } as never);
      password.verify.mockResolvedValue(true);
      users.findPublicById.mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
        name: 'Admin',
        avatarUrl: null,
        phone: null,
        notifyApprovalsOnWhatsApp: false,
        locale: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        twoFactorEnabled: false,
        createdAt: new Date('2026-01-01'),
      });

      await service.login({ email: mockUser.email, password: 'ktask123' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastFailedAt: null },
      });
    });
  });

  describe('refresh', () => {
    it('rotaciona a sessão e emite novo par de tokens', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 'sess_1',
        userId: mockUser.id,
        tokenHash: 'hash(raw-refresh-token)',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        userAgent: null,
        ip: null,
        user: mockUser,
      });
      prisma.session.update.mockResolvedValue({ id: 'sess_1' });
      users.findPublicById.mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
        name: 'Admin',
        avatarUrl: null,
        phone: null,
        notifyApprovalsOnWhatsApp: false,
        locale: 'pt-BR',
        timezone: 'America/Sao_Paulo',
        twoFactorEnabled: false,
        createdAt: new Date('2026-01-01'),
      });
      tokens.generate.mockReturnValueOnce('new-refresh-token');

      const result = await service.refresh('raw-refresh-token');

      expect(prisma.session.update).toHaveBeenCalledWith({
        where: { id: 'sess_1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.session.create).toHaveBeenCalledTimes(1);
      expect(result.refreshToken).toBe('new-refresh-token');
    });

    it('rejeita sessão inexistente', async () => {
      prisma.session.findUnique.mockResolvedValue(null);
      await expect(service.refresh('bogus')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejeita sessão revogada', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 'sess_1',
        userId: mockUser.id,
        tokenHash: 'hash(raw)',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        user: mockUser,
      });
      await expect(service.refresh('raw')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejeita sessão expirada', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 'sess_1',
        userId: mockUser.id,
        tokenHash: 'hash(raw)',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1),
        user: mockUser,
      });
      await expect(service.refresh('raw')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('marca a sessão correspondente como revogada', async () => {
      await service.logout('raw-refresh-token');
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: 'hash(raw-refresh-token)', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('é no-op se não houver token', async () => {
      await service.logout('');
      expect(prisma.session.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('logoutAll', () => {
    it('revoga todas as sessões do usuário e retorna contagem', async () => {
      prisma.session.updateMany.mockResolvedValue({ count: 3 });
      const count = await service.logoutAll(mockUser.id);
      expect(count).toBe(3);
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
