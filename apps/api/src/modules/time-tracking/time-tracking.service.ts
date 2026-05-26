import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma, TimeEntrySource } from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { BoardAccessService } from '@/modules/boards/board-access.service';
import { EVENT_NAMES } from '@/modules/realtime/events.types';

interface ManualEntryInput {
  cardId: string;
  startedAt: string;
  endedAt: string;
  note?: string | null;
  userId?: string | null; // alvo (admin pode lançar pra outro)
}

interface UpdateEntryInput {
  startedAt?: string;
  endedAt?: string | null;
  note?: string | null;
}

interface TimesheetFilter {
  userIds?: string[];
  cardId?: string;
  boardId?: string;
  source?: TimeEntrySource;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  cursor?: string;
}

@Injectable()
export class TimeTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BoardAccessService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Inicia um cronômetro no card. Antes, fecha qualquer entry pendente do mesmo
   * usuário (defesa contra requests concorrentes — o client deve ter pedido
   * confirmação via ActiveTimerConflictDialog).
   */
  async start(userId: string, tenant: TenantContext, cardId: string | null, note?: string | null) {
    // cardId null = timer "livre" (sem vinculo). Aceito quando o usuario clica
    // no play do header sem ter um card aberto. Assim o timer ja comeca a contar
    // e fica disponivel na lista pessoal de timers; ele pode editar depois.
    let card: { id: string; boardId: string } | null = null;
    if (cardId) {
      const found = await this.prisma.card.findUnique({ where: { id: cardId } });
      if (!found || found.organizationId !== tenant.organizationId) {
        throw new NotFoundException('Card não encontrado.');
      }
      await this.access.assertCardAccess(userId, found.id, tenant, 'EDITOR');
      card = { id: found.id, boardId: found.boardId };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Fecha qualquer entry pendente do user
      const pending = await tx.timeEntry.findFirst({
        where: { userId, endedAt: null },
      });
      if (pending) {
        const now = new Date();
        const durationSec = Math.max(
          0,
          Math.floor((now.getTime() - pending.startedAt.getTime()) / 1000),
        );
        await tx.timeEntry.update({
          where: { id: pending.id },
          data: { endedAt: now, durationSec },
        });
        const pendingBoardId = pending.cardId
          ? ((await tx.card.findUnique({ where: { id: pending.cardId } }))?.boardId ?? null)
          : null;
        await tx.activity.create({
          data: {
            organizationId: tenant.organizationId,
            boardId: pendingBoardId,
            cardId: pending.cardId,
            actorId: userId,
            type: 'TIME_ENTRY_STOPPED',
            payload: { entryId: pending.id, durationSec, autoStopped: true },
          },
        });
      }

      // Cria nova entry (cardId pode ser null = timer livre)
      const created = await tx.timeEntry.create({
        data: {
          cardId: card?.id ?? null,
          userId,
          organizationId: tenant.organizationId,
          startedAt: new Date(),
          source: 'TIMER',
          note: note ?? null,
        },
      });

      await tx.activity.create({
        data: {
          organizationId: tenant.organizationId,
          boardId: card?.boardId ?? null,
          cardId: card?.id ?? null,
          actorId: userId,
          type: 'TIME_ENTRY_STARTED',
          payload: { entryId: created.id, startedAt: created.startedAt.toISOString() },
        },
      });

      return { created, autoStoppedId: pending?.id ?? null };
    });

    this.events.emit(EVENT_NAMES.TIME_ENTRY_STARTED, {
      boardId: card?.boardId ?? null,
      organizationId: tenant.organizationId,
      actorId: userId,
      userId,
      cardId: card?.id ?? null,
      entryId: result.created.id,
      startedAt: result.created.startedAt.toISOString(),
    });

    return { entry: result.created, autoStoppedEntryId: result.autoStoppedId };
  }

  /**
   * Para uma entry específica. O usuário só pode parar entries próprias OU se
   * for OWNER/ADMIN da Org pode parar entries de qualquer um.
   */
  async stop(userId: string, tenant: TenantContext, entryId: string) {
    const entry = await this.prisma.timeEntry.findUnique({
      where: { id: entryId },
      include: { card: { select: { boardId: true } } },
    });
    if (!entry || entry.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Entry não encontrada.');
    }

    if (entry.userId !== userId && tenant.role !== 'OWNER' && tenant.role !== 'ADMIN') {
      throw new ForbiddenException('Você só pode parar suas próprias entries.');
    }

    if (entry.endedAt) return entry; // já parada (idempotente)

    const now = new Date();
    const durationSec = Math.max(0, Math.floor((now.getTime() - entry.startedAt.getTime()) / 1000));

    const updated = await this.prisma.timeEntry.update({
      where: { id: entryId },
      data: { endedAt: now, durationSec },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: entry.card?.boardId ?? null,
        cardId: entry.cardId,
        actorId: userId,
        type: 'TIME_ENTRY_STOPPED',
        payload: { entryId, durationSec },
      },
    });

    this.events.emit(EVENT_NAMES.TIME_ENTRY_STOPPED, {
      boardId: entry.card?.boardId ?? null,
      organizationId: tenant.organizationId,
      actorId: userId,
      userId: entry.userId,
      cardId: entry.cardId,
      entryId,
      durationSec,
    });

    return updated;
  }

  /** Retorna entry ativa (endedAt = null) do usuário logado, ou null. */
  async getActiveForUser(userId: string, tenant: TenantContext) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { userId, endedAt: null, organizationId: tenant.organizationId },
      include: {
        card: {
          select: {
            id: true,
            title: true,
            boardId: true,
            board: { select: { id: true, name: true, color: true, icon: true } },
            list: { select: { id: true, name: true } },
          },
        },
      },
    });
    return entry;
  }

  /**
   * Cria entry MANUAL ("trabalhei de X até Y"). Por padrão pra si próprio.
   * Pra outro user, requer OWNER/ADMIN da Org.
   */
  async createManual(userId: string, tenant: TenantContext, input: ManualEntryInput) {
    const card = await this.prisma.card.findUnique({ where: { id: input.cardId } });
    if (!card || card.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Card não encontrado.');
    }
    await this.access.assertCardAccess(userId, card.id, tenant, 'EDITOR');

    const targetUserId = input.userId && input.userId !== userId ? input.userId : userId;
    if (targetUserId !== userId && tenant.role !== 'OWNER' && tenant.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Apenas OWNER/ADMIN da organização pode lançar entries pra outro usuário.',
      );
    }

    const startedAt = new Date(input.startedAt);
    const endedAt = new Date(input.endedAt);
    const durationSec = Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));

    const created = await this.prisma.timeEntry.create({
      data: {
        cardId: input.cardId,
        userId: targetUserId,
        organizationId: tenant.organizationId,
        startedAt,
        endedAt,
        durationSec,
        source: 'MANUAL',
        note: input.note ?? null,
      },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: card.boardId,
        cardId: input.cardId,
        actorId: userId,
        type: 'TIME_ENTRY_CREATED',
        payload: { entryId: created.id, durationSec, source: 'MANUAL', targetUserId },
      },
    });

    return created;
  }

  /** Edita uma entry existente. Dono OU OWNER/ADMIN da Org. */
  async update(userId: string, tenant: TenantContext, entryId: string, input: UpdateEntryInput) {
    const entry = await this.prisma.timeEntry.findUnique({
      where: { id: entryId },
      include: { card: { select: { boardId: true } } },
    });
    if (!entry || entry.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Entry não encontrada.');
    }
    if (entry.userId !== userId && tenant.role !== 'OWNER' && tenant.role !== 'ADMIN') {
      throw new ForbiddenException('Sem permissão pra editar essa entry.');
    }

    const startedAt = input.startedAt ? new Date(input.startedAt) : entry.startedAt;
    const endedAt =
      input.endedAt === null ? null : input.endedAt ? new Date(input.endedAt) : entry.endedAt;

    if (endedAt && endedAt <= startedAt) {
      throw new BadRequestException('endedAt precisa ser maior que startedAt.');
    }

    const durationSec = endedAt
      ? Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000))
      : null;

    const updated = await this.prisma.timeEntry.update({
      where: { id: entryId },
      data: {
        startedAt,
        endedAt,
        durationSec,
        note: input.note === undefined ? undefined : input.note,
      },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: entry.card?.boardId ?? null,
        cardId: entry.cardId,
        actorId: userId,
        type: 'TIME_ENTRY_UPDATED',
        payload: { entryId, durationSec } as unknown as Prisma.InputJsonValue,
      },
    });

    return updated;
  }

  /** Remove uma entry. Dono OU OWNER/ADMIN da Org. */
  async remove(userId: string, tenant: TenantContext, entryId: string) {
    const entry = await this.prisma.timeEntry.findUnique({
      where: { id: entryId },
      include: { card: { select: { boardId: true } } },
    });
    if (!entry || entry.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Entry não encontrada.');
    }
    if (entry.userId !== userId && tenant.role !== 'OWNER' && tenant.role !== 'ADMIN') {
      throw new ForbiddenException('Sem permissão pra remover essa entry.');
    }

    await this.prisma.timeEntry.delete({ where: { id: entryId } });
    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: entry.card?.boardId ?? null,
        cardId: entry.cardId,
        actorId: userId,
        type: 'TIME_ENTRY_DELETED',
        payload: { entryId },
      },
    });

    return { ok: true };
  }

  /** Lista entries de um card (mais recentes primeiro). */
  async listByCard(userId: string, tenant: TenantContext, cardId: string) {
    const card = await this.prisma.card.findUnique({ where: { id: cardId } });
    if (!card || card.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Card não encontrado.');
    }
    await this.access.assertCardAccess(userId, card.id, tenant, 'VIEWER');

    const entries = await this.prisma.timeEntry.findMany({
      where: { cardId, organizationId: tenant.organizationId },
      orderBy: { startedAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });
    return entries;
  }

  /**
   * Timesheet da Org com filtros. Respeita permissão por board:
   * MEMBER vê só entries em cards de boards que tem acesso. GUEST só próprias.
   * OWNER/ADMIN/GESTOR veem tudo da Org.
   */
  async listTimesheet(userId: string, tenant: TenantContext, filter: TimesheetFilter) {
    const where: Prisma.TimeEntryWhereInput = {
      organizationId: tenant.organizationId,
    };

    if (filter.userIds && filter.userIds.length > 0) where.userId = { in: filter.userIds };
    if (filter.cardId) where.cardId = filter.cardId;
    if (filter.source) where.source = filter.source;
    if (filter.dateFrom || filter.dateTo) {
      where.startedAt = {
        ...(filter.dateFrom ? { gte: new Date(filter.dateFrom) } : {}),
        ...(filter.dateTo ? { lte: new Date(filter.dateTo) } : {}),
      };
    }

    if (filter.boardId) {
      where.card = { boardId: filter.boardId };
    }

    // GUEST: só próprias
    if (tenant.role === 'GUEST') {
      where.userId = userId;
    } else if (tenant.role === 'MEMBER') {
      // MEMBER: filtro server-side por boards acessíveis
      const accessible = await this.prisma.board.findMany({
        where: {
          organizationId: tenant.organizationId,
          OR: [{ members: { some: { userId } } }, { visibility: 'ORGANIZATION' }],
        },
        select: { id: true },
      });
      where.card = {
        ...((where.card as object) ?? {}),
        boardId: { in: accessible.map((b) => b.id) },
      };
    }

    const limit = filter.limit ?? 30;
    const items = await this.prisma.timeEntry.findMany({
      where,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        card: {
          select: {
            id: true,
            title: true,
            boardId: true,
            board: { select: { id: true, name: true } },
            labels: { include: { label: { select: { id: true, name: true, color: true } } } },
            members: {
              include: { user: { select: { id: true, name: true, avatarUrl: true } } },
            },
          },
        },
      },
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    return { items: page, nextCursor };
  }

  /**
   * Resumo: total dos últimos 30d + por usuário, com indicador de quem tá rodando agora.
   */
  async getTimesheetSummary(userId: string, tenant: TenantContext, filter: TimesheetFilter = {}) {
    // Reusa filtros + paginação inválidos aqui
    const where: Prisma.TimeEntryWhereInput = {
      organizationId: tenant.organizationId,
      endedAt: { not: null },
      durationSec: { not: null },
    };
    if (filter.userIds && filter.userIds.length > 0) where.userId = { in: filter.userIds };
    if (filter.dateFrom || filter.dateTo) {
      where.startedAt = {
        ...(filter.dateFrom ? { gte: new Date(filter.dateFrom) } : {}),
        ...(filter.dateTo ? { lte: new Date(filter.dateTo) } : {}),
      };
    }

    if (tenant.role === 'GUEST') where.userId = userId;
    if (tenant.role === 'MEMBER') {
      const accessible = await this.prisma.board.findMany({
        where: {
          organizationId: tenant.organizationId,
          OR: [{ members: { some: { userId } } }, { visibility: 'ORGANIZATION' }],
        },
        select: { id: true },
      });
      where.card = { boardId: { in: accessible.map((b) => b.id) } };
    }

    const [byUserGroup, totalGroup, activeNow] = await Promise.all([
      this.prisma.timeEntry.groupBy({
        by: ['userId'],
        where,
        _sum: { durationSec: true },
      }),
      this.prisma.timeEntry.aggregate({
        where,
        _sum: { durationSec: true },
      }),
      this.prisma.timeEntry.findMany({
        where: {
          organizationId: tenant.organizationId,
          endedAt: null,
          ...(tenant.role === 'GUEST' ? { userId } : {}),
        },
        select: {
          id: true,
          userId: true,
          cardId: true,
          startedAt: true,
          card: {
            select: { id: true, title: true, board: { select: { id: true, name: true } } },
          },
        },
      }),
    ]);

    const userIds = byUserGroup.map((g) => g.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, avatarUrl: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    return {
      totalSec: totalGroup._sum.durationSec ?? 0,
      byUser: byUserGroup
        .map((g) => ({
          user: userById.get(g.userId),
          totalSec: g._sum.durationSec ?? 0,
          activeNow: activeNow.find((a) => a.userId === g.userId) ?? null,
        }))
        .filter((x) => x.user),
      activeNow,
    };
  }
}
