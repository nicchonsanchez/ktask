import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

  /**
   * Garante que o board tenha exatamente 1 lista com isFinalList=true. Se
   * nenhuma existir, cria uma "Finalizado" no fim do board (maior position).
   * Idempotente: chamar de novo num board que ja tem nao faz nada.
   *
   * Usado:
   *   - Backfill em boards existentes (endpoint admin)
   *   - No fim de cada importacao (importer)
   *   - Como recovery se alguem deletar a coluna direto via DB
   *
   * Nao recebe userId/tenant — e infraestrutura interna idempotente.
   */
  async ensureFinalList(
    boardId: string,
    organizationId: string,
  ): Promise<{ listId: string; created: boolean }> {
    const existing = await this.prisma.list.findFirst({
      where: { boardId, isFinalList: true, isArchived: false },
      select: { id: true },
    });
    if (existing) return { listId: existing.id, created: false };

    const last = await this.prisma.list.findFirst({
      where: { boardId, isArchived: false },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = computeInsertPosition(last?.position ?? null, null);

    return this.createListWithFlag(boardId, organizationId, 'Finalizado', position, {
      isFinalList: true,
    });
  }

  /**
   * Garante que o board tenha pelo menos 1 lista com isBacklog=true. Se
   * nenhuma existir, cria uma "Backlog" no inicio do board (menor position).
   * Idempotente.
   *
   * Diferenca pra ensureFinalList: nao impomos max 1 — caso de uso
   * 'Entrada' + 'Informacoes' coexistindo continua valido (sem partial
   * unique no DB). So garantimos que >= 1.
   */
  async ensureBacklogList(
    boardId: string,
    organizationId: string,
  ): Promise<{ listId: string; created: boolean }> {
    const existing = await this.prisma.list.findFirst({
      where: { boardId, isBacklog: true, isArchived: false },
      select: { id: true },
    });
    if (existing) return { listId: existing.id, created: false };

    const first = await this.prisma.list.findFirst({
      where: { boardId, isArchived: false },
      orderBy: { position: 'asc' },
      select: { position: true },
    });
    const position = computeInsertPosition(null, first?.position ?? null);

    return this.createListWithFlag(boardId, organizationId, 'Backlog', position, {
      isBacklog: true,
    });
  }

  private async createListWithFlag(
    boardId: string,
    organizationId: string,
    name: string,
    position: number,
    flags: { isFinalList?: boolean; isBacklog?: boolean },
  ): Promise<{ listId: string; created: boolean }> {
    const created = await this.prisma.list.create({
      data: {
        organizationId,
        boardId,
        name,
        position,
        isFinalList: flags.isFinalList ?? false,
        isBacklog: flags.isBacklog ?? false,
      },
      select: { id: true },
    });
    return { listId: created.id, created: true };
  }

  async update(userId: string, tenant: TenantContext, listId: string, input: UpdateListInput) {
    const list = await this.getOneOrThrow(listId);
    await this.access.assertAccess(userId, list.boardId, tenant, 'ADMIN');

    // Invariante: cada board precisa ter >= 1 isFinalList ativa. Se este
    // for a única e o caller estiver tentando desligar a flag (ou arquivar),
    // bloqueia ate operador marcar outra coluna primeiro.
    if (list.isFinalList && (input.isFinalList === false || input.isArchived === true)) {
      const otherFinal = await this.prisma.list.count({
        where: {
          boardId: list.boardId,
          isFinalList: true,
          isArchived: false,
          id: { not: listId },
        },
      });
      if (otherFinal === 0) {
        throw new NotFoundException(
          'Esta é a única coluna Finalizado do fluxo. Marque outra coluna como Finalizado antes de desligar a flag.',
        );
      }
    }
    if (list.isBacklog && (input.isBacklog === false || input.isArchived === true)) {
      const otherBacklog = await this.prisma.list.count({
        where: {
          boardId: list.boardId,
          isBacklog: true,
          isArchived: false,
          id: { not: listId },
        },
      });
      if (otherBacklog === 0) {
        throw new NotFoundException(
          'Esta é a única coluna Backlog do fluxo. Marque outra coluna como Backlog antes de desligar a flag.',
        );
      }
    }

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

    // Invariante: cada board precisa ter exatamente 1 coluna isFinalList=true.
    // Bloqueia arquivar se for a unica do board — operador precisa marcar
    // outra coluna como Finalizado primeiro (PATCH list isFinalList=true
    // dispara o swap idempotente que desmarca esta).
    if (list.isFinalList) {
      const otherFinal = await this.prisma.list.count({
        where: {
          boardId: list.boardId,
          isFinalList: true,
          isArchived: false,
          id: { not: listId },
        },
      });
      if (otherFinal === 0) {
        throw new NotFoundException(
          'Esta é a coluna Finalizado do fluxo. Marque outra coluna como Finalizado antes de arquivar esta.',
        );
      }
    }

    // Mesma invariante pro Backlog — todo board precisa ter >= 1
    // isBacklog=true. Se for a unica, bloqueia ate operador marcar
    // outra coluna como Backlog (PATCH list isBacklog=true).
    if (list.isBacklog) {
      const otherBacklog = await this.prisma.list.count({
        where: {
          boardId: list.boardId,
          isBacklog: true,
          isArchived: false,
          id: { not: listId },
        },
      });
      if (otherBacklog === 0) {
        throw new NotFoundException(
          'Esta é a única coluna Backlog do fluxo. Marque outra coluna como Backlog antes de arquivar esta.',
        );
      }
    }

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
   * Move a lista pra lixeira (soft delete). Todos os cards ativos da lista
   * vao junto pra lixeira em cascata — restaurar a lista NAO ressuscita
   * eles (cada card tem ciclo proprio, restaure pela tela de lixeira).
   *
   * Bloqueia se for a unica isFinalList/isBacklog do board — mesma
   * invariante do archive.
   */
  async trash(userId: string, tenant: TenantContext, listId: string) {
    const list = await this.getOneOrThrow(listId);
    await this.access.assertAccess(userId, list.boardId, tenant, 'ADMIN');

    if (list.isFinalList) {
      const otherFinal = await this.prisma.list.count({
        where: {
          boardId: list.boardId,
          isFinalList: true,
          isArchived: false,
          id: { not: listId },
        },
      });
      if (otherFinal === 0) {
        throw new BadRequestException(
          'Esta é a coluna Finalizado do fluxo. Marque outra coluna como Finalizado antes de mandar pra lixeira.',
        );
      }
    }
    if (list.isBacklog) {
      const otherBacklog = await this.prisma.list.count({
        where: {
          boardId: list.boardId,
          isBacklog: true,
          isArchived: false,
          id: { not: listId },
        },
      });
      if (otherBacklog === 0) {
        throw new BadRequestException(
          'Esta é a única coluna Backlog do fluxo. Marque outra coluna como Backlog antes de mandar pra lixeira.',
        );
      }
    }

    const now = new Date();
    const cardsAffected = await this.prisma.card.updateMany({
      where: { listId, deletedAt: null },
      data: { deletedAt: now, deletedById: userId },
    });

    const updated = await this.prisma.list.update({
      where: { id: listId },
      data: { deletedAt: now, deletedById: userId },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: list.boardId,
        actorId: userId,
        type: 'LIST_TRASHED',
        payload: { listId, cardsCascaded: cardsAffected.count },
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
   * Restaura uma lista da lixeira. Cards que foram cascateados pra lixeira
   * NAO sao restaurados aqui — usuario decide individualmente pela tela de
   * lixeira. Posiciona ao final do board.
   */
  async restoreFromTrash(userId: string, tenant: TenantContext, listId: string) {
    const raw = this.prisma.raw;
    const list = await raw.list.findUnique({ where: { id: listId } });
    if (!list || list.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Lista não encontrada.');
    }
    if (list.deletedAt === null) {
      return list; // idempotente
    }
    await this.access.assertAccess(userId, list.boardId, tenant, 'ADMIN');

    const last = await this.prisma.list.findFirst({
      where: { boardId: list.boardId, isArchived: false },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const newPosition = (last?.position ?? 0) + 1;

    const updated = await raw.list.update({
      where: { id: listId },
      data: { deletedAt: null, deletedById: null, position: newPosition },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: list.boardId,
        actorId: userId,
        type: 'LIST_RESTORED_FROM_TRASH',
        payload: { listId },
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
   * Exclusao permanente da lista. Requer:
   *   1. Lista ja na lixeira (deletedAt != null).
   *   2. Ator OWNER/ADMIN da org.
   *   3. Nenhum card vivo na lista — todos cascados pra lixeira ou ja
   *      excluidos permanentemente. Garantia contra perda acidental se
   *      alguem moveu cards pra ca depois do trash da lista (cenario raro
   *      mas possivel se a UI bugar).
   */
  async deletePermanent(userId: string, tenant: TenantContext, listId: string) {
    if (tenant.role !== 'OWNER' && tenant.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Apenas OWNER ou ADMIN da organização podem excluir permanentemente.',
      );
    }

    const raw = this.prisma.raw;
    const list = await raw.list.findUnique({ where: { id: listId } });
    if (!list || list.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Lista não encontrada.');
    }
    if (list.deletedAt === null) {
      throw new BadRequestException(
        'Lista precisa estar na lixeira antes de ser excluída permanentemente.',
      );
    }

    const liveCards = await raw.card.count({
      where: { listId, deletedAt: null },
    });
    if (liveCards > 0) {
      throw new BadRequestException(
        `Lista tem ${liveCards} card(s) ativos. Mande-os pra lixeira antes de excluir.`,
      );
    }

    await raw.list.delete({ where: { id: listId } });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: list.boardId,
        actorId: userId,
        type: 'LIST_DELETED_PERMANENTLY',
        payload: { listId, deletedAt: list.deletedAt.toISOString() },
      },
    });

    this.events.emit(EVENT_NAMES.LIST_UPDATED, {
      boardId: list.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      listId,
    });

    return { ok: true };
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
          _count: { select: { cards: { where: { deletedAt: null } } } },
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
