import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { OrgRole } from '@prisma/client';

import { TimeTrackingService } from './time-tracking.service';
import { PrismaService } from '@/common/prisma/prisma.service';
import { BoardAccessService } from '@/modules/boards/board-access.service';
import type { TenantContext } from '@/common/tenant/tenant.types';

/**
 * Specs do TimeTrackingService — cobrem o que mais quebra na pratica:
 * vinculacao correta a card+user, calculo de durationSec, idempotencia
 * do stop, permissoes por role no listTimesheet/manual/update.
 *
 * Mocka Prisma + BoardAccessService. Nao roda banco — sao unit tests.
 */
describe('TimeTrackingService', () => {
  let service: TimeTrackingService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let access: { assertAccess: jest.Mock };
  let events: { emit: jest.Mock };

  const tenant = (role: OrgRole = 'MEMBER'): TenantContext => ({
    organizationId: 'org_1',
    organizationSlug: 'org-1',
    role,
    membershipId: 'mb_1',
  });

  beforeEach(async () => {
    prisma = makePrismaMock();
    access = { assertAccess: jest.fn().mockResolvedValue(undefined) };
    events = { emit: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        TimeTrackingService,
        { provide: PrismaService, useValue: prisma },
        { provide: BoardAccessService, useValue: access },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();

    service = module.get(TimeTrackingService);
  });

  // ---------------- start ----------------

  describe('start', () => {
    it('cria entry com cardId, userId e organizationId vindos do contexto', async () => {
      prisma.card.findUnique.mockResolvedValue({
        id: 'card_1',
        boardId: 'board_1',
        organizationId: 'org_1',
      });
      prisma.timeEntry.create.mockResolvedValue({
        id: 'te_new',
        startedAt: new Date(),
      });

      await service.start('user_1', tenant(), 'card_1');

      expect(prisma.timeEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          cardId: 'card_1',
          userId: 'user_1',
          organizationId: 'org_1',
          source: 'TIMER',
        }),
      });
    });

    it('valida acesso EDITOR no board do card antes de criar', async () => {
      prisma.card.findUnique.mockResolvedValue({
        id: 'card_1',
        boardId: 'board_1',
        organizationId: 'org_1',
      });
      prisma.timeEntry.create.mockResolvedValue({ id: 'te', startedAt: new Date() });

      await service.start('user_1', tenant(), 'card_1');

      expect(access.assertAccess).toHaveBeenCalledWith(
        'user_1',
        'board_1',
        expect.any(Object),
        'EDITOR',
      );
    });

    it('rejeita card de outra organizacao', async () => {
      prisma.card.findUnique.mockResolvedValue({
        id: 'card_1',
        boardId: 'board_1',
        organizationId: 'OUTRA_org',
      });
      await expect(service.start('user_1', tenant(), 'card_1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('aceita cardId null (timer livre) sem validar acesso de board', async () => {
      prisma.timeEntry.create.mockResolvedValue({ id: 'te', startedAt: new Date() });

      await service.start('user_1', tenant(), null);

      expect(access.assertAccess).not.toHaveBeenCalled();
      expect(prisma.timeEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ cardId: null, userId: 'user_1' }),
      });
    });

    it('auto-fecha entry pendente do mesmo user antes de criar a nova', async () => {
      prisma.card.findUnique.mockResolvedValue({
        id: 'card_2',
        boardId: 'board_1',
        organizationId: 'org_1',
      });
      const pendingStart = new Date(Date.now() - 60_000); // 60s atras
      prisma.timeEntry.findFirst.mockResolvedValue({
        id: 'te_old',
        userId: 'user_1',
        startedAt: pendingStart,
        cardId: 'card_old',
      });
      prisma.timeEntry.create.mockResolvedValue({ id: 'te_new', startedAt: new Date() });

      await service.start('user_1', tenant(), 'card_2');

      expect(prisma.timeEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'te_old' },
          data: expect.objectContaining({
            endedAt: expect.any(Date),
            durationSec: expect.any(Number),
          }),
        }),
      );
      // duration deve ser ~60s (com tolerancia de 5s pra evitar flakiness)
      const callArgs = prisma.timeEntry.update.mock.calls[0]?.[0];
      expect(callArgs.data.durationSec).toBeGreaterThanOrEqual(58);
      expect(callArgs.data.durationSec).toBeLessThanOrEqual(65);
    });
  });

  // ---------------- stop ----------------

  describe('stop', () => {
    it('calcula durationSec como endedAt - startedAt em segundos', async () => {
      const startedAt = new Date(Date.now() - 90_000); // 90s atras
      prisma.timeEntry.findUnique.mockResolvedValue({
        id: 'te_1',
        userId: 'user_1',
        organizationId: 'org_1',
        startedAt,
        endedAt: null,
        cardId: 'card_1',
        card: { boardId: 'board_1' },
      });
      prisma.timeEntry.update.mockResolvedValue({
        id: 'te_1',
        endedAt: new Date(),
        durationSec: 90,
      });

      await service.stop('user_1', tenant(), 'te_1');

      const updateArgs = prisma.timeEntry.update.mock.calls[0]?.[0];
      expect(updateArgs.data.durationSec).toBeGreaterThanOrEqual(88);
      expect(updateArgs.data.durationSec).toBeLessThanOrEqual(95);
    });

    it('e idempotente: nao da update se a entry ja foi parada', async () => {
      prisma.timeEntry.findUnique.mockResolvedValue({
        id: 'te_1',
        userId: 'user_1',
        organizationId: 'org_1',
        startedAt: new Date(),
        endedAt: new Date(),
        durationSec: 30,
        cardId: 'card_1',
        card: { boardId: 'board_1' },
      });

      await service.stop('user_1', tenant(), 'te_1');

      expect(prisma.timeEntry.update).not.toHaveBeenCalled();
    });

    it('rejeita user que nao e dono nem OWNER/ADMIN', async () => {
      prisma.timeEntry.findUnique.mockResolvedValue({
        id: 'te_1',
        userId: 'OUTRO_user',
        organizationId: 'org_1',
        startedAt: new Date(),
        endedAt: null,
        cardId: 'card_1',
        card: { boardId: 'board_1' },
      });
      await expect(service.stop('user_1', tenant('MEMBER'), 'te_1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('OWNER pode parar entry de outro user', async () => {
      prisma.timeEntry.findUnique.mockResolvedValue({
        id: 'te_1',
        userId: 'OUTRO_user',
        organizationId: 'org_1',
        startedAt: new Date(Date.now() - 1000),
        endedAt: null,
        cardId: 'card_1',
        card: { boardId: 'board_1' },
      });
      prisma.timeEntry.update.mockResolvedValue({ id: 'te_1' });

      await expect(service.stop('user_1', tenant('OWNER'), 'te_1')).resolves.toBeDefined();
      expect(prisma.timeEntry.update).toHaveBeenCalled();
    });
  });

  // ---------------- createManual ----------------

  describe('createManual', () => {
    const inputBase = {
      cardId: 'card_1',
      startedAt: '2026-04-25T09:00:00.000Z',
      endedAt: '2026-04-25T11:00:00.000Z',
    };

    beforeEach(() => {
      prisma.card.findUnique.mockResolvedValue({
        id: 'card_1',
        boardId: 'board_1',
        organizationId: 'org_1',
      });
      prisma.timeEntry.create.mockResolvedValue({ id: 'te_new' });
    });

    it('calcula durationSec a partir do range (startedAt ate endedAt)', async () => {
      await service.createManual('user_1', tenant(), inputBase);
      // 2 horas = 7200 segundos
      expect(prisma.timeEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          source: 'MANUAL',
          durationSec: 7200,
          userId: 'user_1',
        }),
      });
    });

    it('MEMBER nao pode lancar entry pra outro user', async () => {
      await expect(
        service.createManual('user_1', tenant('MEMBER'), { ...inputBase, userId: 'OUTRO_user' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('OWNER pode lancar entry pra outro user', async () => {
      await service.createManual('user_1', tenant('OWNER'), {
        ...inputBase,
        userId: 'OUTRO_user',
      });
      expect(prisma.timeEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'OUTRO_user' }),
      });
    });
  });

  // ---------------- update ----------------

  describe('update', () => {
    const baseEntry = {
      id: 'te_1',
      userId: 'user_1',
      organizationId: 'org_1',
      startedAt: new Date('2026-04-25T09:00:00.000Z'),
      endedAt: new Date('2026-04-25T10:00:00.000Z'),
      cardId: 'card_1',
      card: { boardId: 'board_1' },
    };

    it('rejeita endedAt anterior ou igual a startedAt', async () => {
      prisma.timeEntry.findUnique.mockResolvedValue(baseEntry);
      await expect(
        service.update('user_1', tenant(), 'te_1', {
          startedAt: '2026-04-25T11:00:00.000Z',
          endedAt: '2026-04-25T10:00:00.000Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recalcula durationSec quando startedAt/endedAt mudam', async () => {
      prisma.timeEntry.findUnique.mockResolvedValue(baseEntry);
      prisma.timeEntry.update.mockResolvedValue({ id: 'te_1' });

      await service.update('user_1', tenant(), 'te_1', {
        startedAt: '2026-04-25T08:00:00.000Z',
        endedAt: '2026-04-25T10:30:00.000Z',
      });

      // 2h30 = 9000s
      expect(prisma.timeEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ durationSec: 9000 }),
        }),
      );
    });

    it('user nao-dono e nao-OWNER nao pode editar', async () => {
      prisma.timeEntry.findUnique.mockResolvedValue({ ...baseEntry, userId: 'OUTRO_user' });
      await expect(
        service.update('user_1', tenant('MEMBER'), 'te_1', { note: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ---------------- listTimesheet ----------------

  describe('listTimesheet', () => {
    beforeEach(() => {
      prisma.timeEntry.findMany.mockResolvedValue([]);
      prisma.board.findMany.mockResolvedValue([{ id: 'board_a' }, { id: 'board_b' }]);
    });

    it('GUEST forca userId = ele mesmo (nao consegue ver de outros)', async () => {
      await service.listTimesheet('user_guest', tenant('GUEST'), { userIds: ['outroUser'] });
      const where = prisma.timeEntry.findMany.mock.calls[0]?.[0]?.where;
      expect(where.userId).toBe('user_guest');
    });

    it('MEMBER filtra por boards acessiveis', async () => {
      await service.listTimesheet('user_1', tenant('MEMBER'), {});
      const where = prisma.timeEntry.findMany.mock.calls[0]?.[0]?.where;
      expect(where.card).toEqual({ boardId: { in: ['board_a', 'board_b'] } });
    });

    it('OWNER nao adiciona filtro de board (ve tudo da org)', async () => {
      await service.listTimesheet('user_1', tenant('OWNER'), {});
      const where = prisma.timeEntry.findMany.mock.calls[0]?.[0]?.where;
      expect(where.card).toBeUndefined();
      expect(where.userId).toBeUndefined();
    });

    it('aplica filtro de userIds quando passado', async () => {
      await service.listTimesheet('user_1', tenant('OWNER'), { userIds: ['u1', 'u2'] });
      const where = prisma.timeEntry.findMany.mock.calls[0]?.[0]?.where;
      expect(where.userId).toEqual({ in: ['u1', 'u2'] });
    });

    it('retorna nextCursor quando ha mais de limit items', async () => {
      const items = Array.from({ length: 21 }, (_, i) => ({ id: `te_${i}` }));
      prisma.timeEntry.findMany.mockResolvedValue(items);
      const result = await service.listTimesheet('user_1', tenant('OWNER'), { limit: 20 });
      expect(result.items).toHaveLength(20);
      expect(result.nextCursor).toBe('te_19');
    });
  });
});

// ---------------- helpers ----------------

function makePrismaMock() {
  // $transaction(fn) executa o callback passando o proprio mock como tx,
  // suficiente pra os caminhos que stoppam pendente + criam nova entry.
  const mock = {
    card: {
      findUnique: jest.fn(),
    },
    timeEntry: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    board: {
      findMany: jest.fn(),
    },
    activity: {
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(),
  };
  // executar callback do $transaction com o proprio mock como tx
  mock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mock));
  return mock as unknown as typeof mock & { card: { findUnique: jest.Mock } };
}
