import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { AuthService } from './auth.service';
import { PasswordService } from '@/common/crypto/password.service';
import { TokenService } from '@/common/crypto/token.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { UsersService } from '@/modules/users/users.service';
import { InvitationsService } from '@/modules/organizations/invitations.service';
import { MailService } from '@/modules/mail/mail.service';
import { WhatsAppHelper } from '@/modules/whatsapp/whatsapp.helper';

/**
 * Doc 53: confirmacao de troca de email pedida por admin.
 */
describe('AuthService — troca de email', () => {
  let service: AuthService;
  let prisma: {
    $transaction: jest.Mock;
    emailChangeToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    user: { findUnique: jest.Mock; update: jest.Mock };
    activity: { create: jest.Mock };
  };
  let mail: { sendEmailChangeConfirmation: jest.Mock };
  let events: { emit: jest.Mock };

  const future = () => new Date(Date.now() + 60 * 60_000);
  const validRecord = () => ({
    id: 'tok_1',
    userId: 'user_1',
    newEmail: 'novo@kharis.com.br',
    expiresAt: future(),
    usedAt: null,
    organizationId: 'org_1',
    requestedById: 'admin_1',
    user: {
      id: 'user_1',
      email: 'antigo@gmail.com',
      pendingEmail: 'novo@kharis.com.br',
      deletedAt: null,
      suspendedAt: null,
    },
  });

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn().mockResolvedValue([]),
      emailChangeToken: {
        create: jest.fn().mockReturnValue('create-op'),
        findUnique: jest.fn(),
        update: jest.fn().mockReturnValue('token-update-op'),
        updateMany: jest.fn().mockReturnValue('invalidate-op'),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockReturnValue('user-update-op'),
      },
      activity: { create: jest.fn().mockReturnValue('activity-op') },
    };
    mail = { sendEmailChangeConfirmation: jest.fn().mockResolvedValue(true) };
    events = { emit: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: {} },
        { provide: PasswordService, useValue: {} },
        {
          provide: TokenService,
          useValue: {
            generate: jest.fn().mockReturnValue('raw-token'),
            hash: jest.fn((t: string) => `hash(${t})`),
          },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: {} },
        { provide: InvitationsService, useValue: {} },
        { provide: MailService, useValue: mail },
        { provide: WhatsAppHelper, useValue: {} },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('dispatchEmailChangeConfirmation', () => {
    it('invalida links anteriores, cria token e envia pro NOVO email', async () => {
      const result = await service.dispatchEmailChangeConfirmation({
        user: { id: 'user_1', name: 'Taiane' },
        newEmail: 'novo@kharis.com.br',
        organizationId: 'org_1',
        requestedById: 'admin_1',
      });

      expect(prisma.emailChangeToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user_1', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.emailChangeToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user_1',
          newEmail: 'novo@kharis.com.br',
          tokenHash: 'hash(raw-token)',
          organizationId: 'org_1',
          requestedById: 'admin_1',
        }),
      });
      expect(prisma.$transaction).toHaveBeenCalledWith(['invalidate-op', 'create-op']);
      expect(mail.sendEmailChangeConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'novo@kharis.com.br',
          confirmUrl: expect.stringMatching(/\/confirmar-email\/raw-token$/),
        }),
      );
      expect(result.sent).toBe(true);
    });

    it('retorna sent=false quando o envio falha (sem lançar)', async () => {
      mail.sendEmailChangeConfirmation.mockRejectedValue(new Error('smtp down'));
      const result = await service.dispatchEmailChangeConfirmation({
        user: { id: 'user_1', name: 'Taiane' },
        newEmail: 'novo@kharis.com.br',
        organizationId: 'org_1',
        requestedById: 'admin_1',
      });
      expect(result.sent).toBe(false);
    });
  });

  describe('confirmEmailChange', () => {
    it('troca o email, marca token usado, registra Activity e emite evento', async () => {
      prisma.emailChangeToken.findUnique.mockResolvedValue(validRecord());

      const result = await service.confirmEmailChange({ token: 'raw-token' });

      expect(prisma.emailChangeToken.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: 'hash(raw-token)' } }),
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user_1' },
        data: { email: 'novo@kharis.com.br', pendingEmail: null },
      });
      expect(prisma.emailChangeToken.update).toHaveBeenCalledWith({
        where: { id: 'tok_1' },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.activity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org_1',
          type: 'MEMBER_EMAIL_CHANGED',
        }),
      });
      expect(prisma.$transaction).toHaveBeenCalledWith([
        'user-update-op',
        'token-update-op',
        'activity-op',
      ]);
      expect(events.emit).toHaveBeenCalledWith('usuario.email_alterado', {
        userId: 'user_1',
        emailAntigo: 'antigo@gmail.com',
        emailNovo: 'novo@kharis.com.br',
      });
      expect(result).toEqual({ ok: true, email: 'novo@kharis.com.br' });
    });

    it('rejeita token inexistente', async () => {
      prisma.emailChangeToken.findUnique.mockResolvedValue(null);
      await expect(service.confirmEmailChange({ token: 'x'.repeat(20) })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejeita token já usado (ou substituído por reenvio)', async () => {
      prisma.emailChangeToken.findUnique.mockResolvedValue({
        ...validRecord(),
        usedAt: new Date(),
      });
      await expect(service.confirmEmailChange({ token: 'raw-token' })).rejects.toThrow(
        /já foi usado/,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejeita token expirado', async () => {
      prisma.emailChangeToken.findUnique.mockResolvedValue({
        ...validRecord(),
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.confirmEmailChange({ token: 'raw-token' })).rejects.toThrow(/expirado/);
    });

    it('rejeita quando a pendência foi cancelada pelo admin', async () => {
      const record = validRecord();
      record.user.pendingEmail = null as unknown as string;
      prisma.emailChangeToken.findUnique.mockResolvedValue(record);
      await expect(service.confirmEmailChange({ token: 'raw-token' })).rejects.toThrow(/cancelada/);
    });

    it('rejeita quando outra conta passou a usar o email', async () => {
      prisma.emailChangeToken.findUnique.mockResolvedValue(validRecord());
      prisma.user.findUnique.mockResolvedValue({ id: 'outro_user' });
      await expect(service.confirmEmailChange({ token: 'raw-token' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
