import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';
import { computeInsertPosition } from '@/common/util/position';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { BoardAccessService } from '@/modules/boards/board-access.service';
import { EVENT_NAMES } from '@/modules/realtime/events.types';

interface CreateListInput {
  boardId: string;
  name: string;
  position?: number;
}

interface UpdateListInput {
  name?: string;
  color?: string | null;
  icon?: string | null;
  wipLimit?: number | null;
  slaMinutes?: number | null;
  position?: number;
  isArchived?: boolean;
  isFinalList?: boolean;
  isBacklog?: boolean;
}

interface MoveListInput {
  afterListId: string | null; // posicionar após esta lista (null = primeira posição)
}

@Injectable()
export class ListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BoardAccessService,
    private readonly events: EventEmitter2,
  ) {}

  async create(userId: string, tenant: TenantContext, input: CreateListInput) {
    await this.access.assertAccess(userId, input.boardId, tenant, 'ADMIN');

    const last = await this.prisma.list.findFirst({
      where: { boardId: input.boardId, isArchived: false },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    const position = input.position ?? computeInsertPosition(last?.position ?? null, null);

    const list = await this.prisma.list.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: input.boardId,
        name: input.name,
        position,
      },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: input.boardId,
        actorId: userId,
        type: 'LIST_CREATED',
        payload: { listId: list.id, name: list.name },
      },
    });

    this.events.emit(EVENT_NAMES.LIST_CREATED, {
      boardId: input.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      listId: list.id,
    });

    return list;
  }

  async update(userId: string, tenant: TenantContext, listId: string, input: UpdateListInput) {
    const list = await this.getOneOrThrow(listId);
    await this.access.assertAccess(userId, list.boardId, tenant, 'ADMIN');

    // Invariante: no máximo 1 lista com isFinalList=true por board (Finalizado é
    // *a* coluna, não uma categoria). Se o caller setar true, desmarca a
    // anterior antes de aplicar — swap idempotente, na mesma transação.
    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.isFinalList === true) {
        await tx.list.updateMany({
          where: { boardId: list.boardId, isFinalList: true, id: { not: listId } },
          data: { isFinalList: false },
        });
      }
      return tx.list.update({ where: { id: listId }, data: input });
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: list.boardId,
        actorId: userId,
        type: 'LIST_UPDATED',
        payload: { listId, input } as unknown as Prisma.InputJsonValue,
      },
    });

    this.events.emit(EVENT_NAMES.LIST_UPDATED, {
      boardId: list.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      listId,
    });

    return updated;
  }

  async move(userId: string, tenant: TenantContext, listId: string, input: MoveListInput) {
    const list = await this.getOneOrThrow(listId);
    await this.access.assertAccess(userId, list.boardId, tenant, 'ADMIN');

    const { beforePos, afterPos } = await this.resolveNeighbors(
      list.boardId,
      input.afterListId,
      listId,
    );
    const position = computeInsertPosition(beforePos, afterPos);

    return this.prisma.list.update({
      where: { id: listId },
      data: { position },
    });
  }

  /**
   * Arquiva uma coluna. Pra colunas com cards, requer escolha explícita
   * do que fazer com eles via `cardsAction`:
   *   - 'archive': arquiva todos os cards junto com a coluna
   *   - 'move':    move todos pra outra coluna (`targetListId`) antes
   *
   * Coluna sem cards não exige cardsAction. Garante que cards nunca
   * fiquem órfãos sem ação consciente do usuário.
   */
  async archive(
    userId: string,
    tenant: TenantContext,
    listId: string,
    opts: { cardsAction?: 'archive' | 'move'; targetListId?: string } = {},
  ) {
    const list = await this.getOneOrThrow(listId);
    await this.access.assertAccess(userId, list.boardId, tenant, 'ADMIN');

    const cards = await this.prisma.card.findMany({
      where: { listId, isArchived: false },
      select: { id: true, position: true },
    });

    if (cards.length > 0) {
      if (opts.cardsAction === 'move') {
        if (!opts.targetListId) {
          throw new NotFoundException('Coluna de destino é obrigatória pra mover os cards.');
        }
        if (opts.targetListId === listId) {
          throw new NotFoundException('Coluna de destino não pode ser a própria coluna.');
        }
        const target = await this.prisma.list.findUnique({
          where: { id: opts.targetListId },
        });
        if (!target || target.boardId !== list.boardId || target.isArchived) {
          throw new NotFoundException('Coluna de destino inválida.');
        }
        // Empilha os cards no final da coluna destino, mantendo ordem original
        const lastCard = await this.prisma.card.findFirst({
          where: { listId: opts.targetListId },
          orderBy: { position: 'desc' },
          select: { position: true },
        });
        let basePos = (lastCard?.position ?? 0) + 1;
        const sorted = cards.sort((a, b) => a.position - b.position);
        await this.prisma.$transaction(
          sorted.map((c) =>
            this.prisma.card.update({
              where: { id: c.id },
              data: { listId: opts.targetListId, position: basePos++ },
            }),
          ),
        );
      } else if (opts.cardsAction === 'archive') {
        await this.prisma.card.updateMany({
          where: { listId, isArchived: false },
          data: { isArchived: true },
        });
      } else {
        throw new NotFoundException(
          'Coluna tem cards. Defina cardsAction: "archive" ou "move" + targetListId.',
        );
      }
    }

    const updated = await this.prisma.list.update({
      where: { id: listId },
      data: { isArchived: true },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: list.boardId,
        actorId: userId,
        type: 'LIST_ARCHIVED',
        payload: {
          listId,
          cardsAction: opts.cardsAction ?? 'empty',
          cardsCount: cards.length,
          targetListId: opts.targetListId ?? null,
        },
      },
    });

    this.events.emit(EVENT_NAMES.LIST_UPDATED, {
      boardId: list.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      listId,
    });

    return updated;
  }

  /**
   * Restaura uma coluna previamente arquivada. Cards que foram arquivados
   * junto NÃO são restaurados automaticamente (precisam restore individual
   * pela tela de Arquivados). Cards que foram movidos pra outra coluna
   * continuam onde estão.
   */
  async restore(userId: string, tenant: TenantContext, listId: string) {
    const list = await this.getOneOrThrow(listId);
    await this.access.assertAccess(userId, list.boardId, tenant, 'ADMIN');

    if (!list.isArchived) {
      return list; // idempotente
    }

    // Posiciona ao final do quadro pra não conflitar com a ordem atual
    const last = await this.prisma.list.findFirst({
      where: { boardId: list.boardId, isArchived: false },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const newPosition = (last?.position ?? 0) + 1;

    const updated = await this.prisma.list.update({
      where: { id: listId },
      data: { isArchived: false, position: newPosition },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: list.boardId,
        actorId: userId,
        type: 'LIST_UPDATED',
        payload: { listId, restored: true } as unknown as Prisma.InputJsonValue,
      },
    });

    this.events.emit(EVENT_NAMES.LIST_UPDATED, {
      boardId: list.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      listId,
    });

    return updated;
  }

  /**
   * Lista cards e listas arquivados de um board pra tela "Arquivados".
   */
  async listArchived(userId: string, tenant: TenantContext, boardId: string) {
    await this.access.assertAccess(userId, boardId, tenant, 'VIEWER');

    const [lists, cards] = await Promise.all([
      this.prisma.list.findMany({
        where: { boardId, organizationId: tenant.organizationId, isArchived: true },
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: { select: { cards: true } },
        },
      }),
      this.prisma.card.findMany({
        where: { boardId, organizationId: tenant.organizationId, isArchived: true },
        orderBy: { updatedAt: 'desc' },
        take: 100,
        include: {
          list: { select: { id: true, name: true, isArchived: true } },
          labels: { include: { label: true } },
        },
      }),
    ]);

    return { lists, cards };
  }

  private async getOneOrThrow(listId: string) {
    const list = await this.prisma.list.findUnique({ where: { id: listId } });
    if (!list) throw new NotFoundException('Lista não encontrada.');
    return list;
  }

  private async resolveNeighbors(
    boardId: string,
    afterListId: string | null,
    skipListId: string,
  ): Promise<{ beforePos: number | null; afterPos: number | null }> {
    if (afterListId === null) {
      const first = await this.prisma.list.findFirst({
        where: { boardId, isArchived: false, id: { not: skipListId } },
        orderBy: { position: 'asc' },
        select: { position: true },
      });
      return { beforePos: null, afterPos: first?.position ?? null };
    }

    const before = await this.prisma.list.findUnique({
      where: { id: afterListId },
      select: { position: true, boardId: true },
    });
    if (!before || before.boardId !== boardId) {
      throw new NotFoundException('Lista referência não encontrada no quadro.');
    }

    const next = await this.prisma.list.findFirst({
      where: {
        boardId,
        isArchived: false,
        id: { not: skipListId },
        position: { gt: before.position },
      },
      orderBy: { position: 'asc' },
      select: { position: true },
    });

    return { beforePos: before.position, afterPos: next?.position ?? null };
  }
}
