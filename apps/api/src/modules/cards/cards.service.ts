import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';
import { computeInsertPosition } from '@/common/util/position';
import { canViewCard } from '@/common/util/card-privacy';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { BoardAccessService } from '@/modules/boards/board-access.service';
import { EVENT_NAMES } from '@/modules/realtime/events.types';
import { StorageService } from '@/modules/storage/storage.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { AutomationsOutboxService } from '@/modules/automations/automations.outbox.service';

import { createCardWithPresence } from './helpers/create-card-with-presence';
import { CardStatusSyncService } from './card-status-sync';

interface CreateCardInput {
  listId: string;
  title: string;
  description?: Prisma.InputJsonValue | null;
  cardColor?: string | null;
  dueDate?: string | null;
  startDate?: string | null;
}

interface UpdateCardInput {
  title?: string;
  description?: Prisma.InputJsonValue | null;
  cardColor?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
  estimateMinutes?: number | null;
  leadId?: string | null;
  coverAttachmentId?: string | null;
  /** Doc 25: privacidade do card. */
  privacy?: 'PUBLIC' | 'TEAM_ONLY';
  /** Doc 42: status (4 estados). Mudar pra COMPLETED auto-set completedAt;
   *  mudar pra outro status auto-clear. */
  status?: 'ACTIVE' | 'COMPLETED' | 'WAITING' | 'CANCELED';
}

interface MoveCardInput {
  toListId: string;
  afterCardId: string | null; // null = topo da lista
}

@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BoardAccessService,
    private readonly events: EventEmitter2,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly statusSync: CardStatusSyncService,
    private readonly automationsOutbox: AutomationsOutboxService,
  ) {}

  async create(userId: string, tenant: TenantContext, input: CreateCardInput) {
    const list = await this.prisma.list.findUnique({ where: { id: input.listId } });
    if (!list) throw new NotFoundException('Lista não encontrada.');
    await this.access.assertAccess(userId, list.boardId, tenant, 'EDITOR');

    const last = await this.prisma.card.findFirst({
      where: { listId: input.listId, isArchived: false, completedAt: null },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = computeInsertPosition(last?.position ?? null, null);

    const board = await this.prisma.board.findUnique({
      where: { id: list.boardId },
      select: { inheritTeamOnNewCards: true, members: { select: { userId: true } } },
    });

    const { card, outboxId } = await this.prisma.$transaction(async (tx) => {
      const created = await createCardWithPresence(tx, {
        organizationId: tenant.organizationId,
        boardId: list.boardId,
        listId: input.listId,
        title: input.title,
        description: (input.description ?? undefined) as Prisma.InputJsonValue | undefined,
        cardColor: input.cardColor ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        startDate: input.startDate ? new Date(input.startDate) : null,
        position,
        createdById: userId,
      });

      const memberIds = new Set<string>([userId]);
      if (board?.inheritTeamOnNewCards) {
        for (const m of board.members) memberIds.add(m.userId);
      }
      await tx.cardMember.createMany({
        data: Array.from(memberIds).map((uid) => ({ cardId: created.id, userId: uid })),
        skipDuplicates: true,
      });

      // Enfileira CARD_ENTERED na MESMA TXN — atomicidade garante que o
      // trigger só persiste se o card foi mesmo criado.
      const outbox = await this.automationsOutbox.enqueue(tx, {
        organizationId: tenant.organizationId,
        trigger: 'CARD_ENTERED',
        cardId: created.id,
        scopeKind: 'LIST',
        scopeId: list.id,
      });

      return { card: created, outboxId: outbox.id };
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: list.boardId,
        cardId: card.id,
        actorId: userId,
        type: 'CARD_CREATED',
        payload: { cardId: card.id, title: card.title, listId: list.id },
      },
    });

    // Realtime: notifica frontend (RealtimeGateway escuta esse canal).
    this.events.emit(EVENT_NAMES.CARD_CREATED, {
      boardId: list.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      cardId: card.id,
      listId: list.id,
      title: card.title,
    });

    // Push: processa outbox JÁ pra latência ~ms. Fire-and-forget — se
    // falhar (Redis down, processo sobrecarregado), o cron pull pega no
    // próximo ciclo de 5s.
    void this.automationsOutbox.processOne(outboxId);

    return card;
  }

  /**
   * Resolve um shortCode ("#412" ou "412") em { id, boardId } pra redirect.
   * Retorna 404 se nao existir na Org. Nao checa BoardAccess aqui — o
   * endpoint detalhe (`getOne` chamado depois com o id) ja faz isso.
   */
  async findByShortCode(
    tenant: TenantContext,
    code: string,
  ): Promise<{ id: string; boardId: string }> {
    const card = await this.prisma.card.findUnique({
      where: {
        organizationId_shortCode: { organizationId: tenant.organizationId, shortCode: code },
      },
      select: { id: true, boardId: true },
    });
    if (!card) throw new NotFoundException(`Card #${code} não encontrado.`);
    return card;
  }

  async getOne(userId: string, tenant: TenantContext, cardId: string) {
    const card = await this.getCardOrThrow(cardId, tenant.organizationId);
    await this.access.assertCardAccess(userId, card.id, tenant, 'VIEWER');
    const result = await this.prisma.card.findUnique({
      where: { id: cardId },
      include: {
        list: { select: { id: true, name: true, boardId: true } },
        lead: { select: { id: true, name: true, email: true, avatarUrl: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
        },
        labels: { include: { label: true } },
        checklists: {
          include: {
            items: {
              orderBy: { position: 'asc' },
              include: {
                assignee: { select: { id: true, name: true, avatarUrl: true } },
              },
            },
          },
          orderBy: { position: 'asc' },
        },
        attachments: {
          // só anexos diretos do card visíveis na lista (não comments, não embedded no editor rich)
          where: { commentId: null, embedded: false },
          orderBy: { createdAt: 'desc' },
          include: { uploader: { select: { id: true, name: true, avatarUrl: true } } },
        },
        comments: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, name: true, email: true, avatarUrl: true } },
            attachments: {
              // anexos visiveis do comment — embedded fica embutido no body
              where: { embedded: false },
              orderBy: { createdAt: 'asc' },
              include: { uploader: { select: { id: true, name: true, avatarUrl: true } } },
            },
            // Reacoes do comment: emoji + quem reagiu. Frontend agrupa por
            // emoji pra mostrar contadores. Ordem por createdAt asc deixa
            // o avatar do primeiro a reagir mais visivel.
            reactions: {
              orderBy: { createdAt: 'asc' },
              include: {
                user: { select: { id: true, name: true, avatarUrl: true } },
              },
            },
          },
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 30,
          include: { actor: { select: { id: true, name: true, email: true, avatarUrl: true } } },
        },
        _count: { select: { children: true } },
      },
    });
    if (!result) return null;
    // Doc 25: privacidade por card. Aplicada aqui pra reusar `members`
    // ja carregados pelo include — evita query extra.
    if (
      !canViewCard(
        {
          privacy: result.privacy,
          leadId: result.leadId,
          members: result.members.map((m) => ({ userId: m.userId })),
        },
        userId,
        tenant.role,
      )
    ) {
      throw new ForbiddenException('Card privado — você não tem acesso.');
    }
    const enabled = this.storage.isEnabled();
    const hydrate = <T extends { storageKey: string }>(a: T) => ({
      ...a,
      publicUrl: enabled ? this.storage.publicUrlFor(a.storageKey) : null,
    });
    // Hidrata publicUrl dos anexos diretos do card e dos anexos de cada comment
    const attachments = result.attachments.map(hydrate);
    const comments = result.comments.map((c) => ({
      ...c,
      attachments: c.attachments.map(hydrate),
    }));
    return { ...result, attachments, comments };
  }

  async update(userId: string, tenant: TenantContext, cardId: string, input: UpdateCardInput) {
    const card = await this.getCardOrThrow(cardId, tenant.organizationId);
    await this.access.assertCardAccess(userId, card.id, tenant, 'EDITOR');

    // Troca de líder: valida que o user alvo é membro da Org e registra activity específica
    const leadChanged = input.leadId !== undefined && input.leadId !== card.leadId;
    if (leadChanged && input.leadId) {
      const membership = await this.prisma.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: input.leadId,
            organizationId: tenant.organizationId,
          },
        },
      });
      if (!membership) {
        throw new BadRequestException('O novo líder precisa ser membro da organização.');
      }
      // Se ainda não era membro do card, vira membro automaticamente
      await this.prisma.cardMember.upsert({
        where: { cardId_userId: { cardId, userId: input.leadId } },
        update: {},
        create: { cardId, userId: input.leadId },
      });
    }

    // Doc 42: status muda completedAt automaticamente. Source of truth =
    // status. Se input traz `status` E `completedAt`, status manda.
    let computedCompletedAt: Date | null | undefined =
      input.completedAt !== undefined
        ? input.completedAt
          ? new Date(input.completedAt)
          : null
        : undefined;
    let computedCompletedById: string | null | undefined = undefined;
    if (input.status !== undefined && input.status !== card.status) {
      if (input.status === 'COMPLETED') {
        // Vira COMPLETED: set completedAt=now (se nao tiver) + completedById
        computedCompletedAt = card.completedAt ?? new Date();
        computedCompletedById = card.completedById ?? userId;
      } else if (card.status === 'COMPLETED') {
        // Saindo de COMPLETED: limpa completedAt
        computedCompletedAt = null;
        computedCompletedById = null;
      }
    }

    const updated = await this.prisma.card.update({
      where: { id: cardId },
      data: {
        title: input.title,
        description: (input.description ?? undefined) as Prisma.InputJsonValue | undefined,
        cardColor: input.cardColor !== undefined ? input.cardColor : undefined,
        startDate:
          input.startDate !== undefined
            ? input.startDate
              ? new Date(input.startDate)
              : null
            : undefined,
        dueDate:
          input.dueDate !== undefined
            ? input.dueDate
              ? new Date(input.dueDate)
              : null
            : undefined,
        completedAt: computedCompletedAt,
        completedById: computedCompletedById,
        estimateMinutes: input.estimateMinutes ?? undefined,
        leadId: input.leadId !== undefined ? input.leadId : undefined,
        coverAttachmentId:
          input.coverAttachmentId !== undefined ? input.coverAttachmentId : undefined,
        // Doc 25: privacidade. Activity log gerado abaixo se mudou.
        privacy: input.privacy ?? undefined,
        // Doc 42: status. Activity log gerado abaixo se mudou.
        status: input.status ?? undefined,
      },
    });

    // Doc 42: log de mudanca de status
    if (input.status && input.status !== card.status) {
      await this.prisma.activity.create({
        data: {
          organizationId: tenant.organizationId,
          boardId: card.boardId,
          cardId,
          actorId: userId,
          type: 'CARD_UPDATED',
          payload: {
            kind: 'status_changed',
            from: card.status,
            to: input.status,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }

    // Doc 25: log de mudanca de privacidade
    if (input.privacy && input.privacy !== card.privacy) {
      await this.prisma.activity.create({
        data: {
          organizationId: tenant.organizationId,
          boardId: card.boardId,
          cardId,
          actorId: userId,
          type: 'CARD_UPDATED',
          payload: {
            kind: 'privacy_changed',
            from: card.privacy,
            to: input.privacy,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    }

    if (leadChanged) {
      await this.prisma.activity.create({
        data: {
          organizationId: tenant.organizationId,
          boardId: card.boardId,
          cardId,
          actorId: userId,
          type: 'CARD_LEAD_CHANGED',
          payload: {
            cardId,
            fromLeadId: card.leadId,
            toLeadId: input.leadId,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      // Notifica o novo lider (se nao for ele mesmo se atribuindo)
      if (input.leadId && input.leadId !== userId) {
        const actor = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        });
        await this.notifications.create({
          userId: input.leadId,
          organizationId: tenant.organizationId,
          type: 'ASSIGNED',
          title: `${actor?.name ?? 'Alguém'} definiu você como líder do card`,
          body: card.title,
          entityType: 'card',
          entityId: cardId,
        });
      }
    } else {
      // Detecta campos que mudaram + valores from/to. Front renderiza
      // mensagens específicas tipo "alterou o título de A para B", "alterou
      // o prazo de 30/04 para 15/05". `fields` segue populado pra retro-
      // compat com activities antigas. Descrição não vai pro `changes`
      // (Tiptap JSON é grande; só sinaliza no `fields`).
      const changed: string[] = [];
      const changes: Record<string, { from: unknown; to: unknown }> = {};

      if (input.title !== undefined && input.title !== card.title) {
        changed.push('title');
        changes.title = { from: card.title, to: input.title };
      }
      if (input.description !== undefined) {
        changed.push('description');
      }
      if (input.cardColor !== undefined && input.cardColor !== card.cardColor) {
        changed.push('cardColor');
        changes.cardColor = { from: card.cardColor, to: input.cardColor };
      }
      const newDue = input.dueDate ? new Date(input.dueDate).toISOString() : null;
      const oldDue = card.dueDate ? card.dueDate.toISOString() : null;
      if (input.dueDate !== undefined && newDue !== oldDue) {
        changed.push('dueDate');
        changes.dueDate = { from: oldDue, to: newDue };
      }
      const newStart = input.startDate ? new Date(input.startDate).toISOString() : null;
      const oldStart = card.startDate ? card.startDate.toISOString() : null;
      if (input.startDate !== undefined && newStart !== oldStart) {
        changed.push('startDate');
        changes.startDate = { from: oldStart, to: newStart };
      }
      if (
        input.completedAt !== undefined &&
        Boolean(input.completedAt) !== Boolean(card.completedAt)
      ) {
        // completedAt eh tratado por endpoints proprios (complete/uncomplete);
        // se vier no update, nao registra (evita duplicar com CARD_COMPLETED)
      }
      if (input.estimateMinutes !== undefined && input.estimateMinutes !== card.estimateMinutes) {
        changed.push('estimateMinutes');
        changes.estimateMinutes = { from: card.estimateMinutes, to: input.estimateMinutes };
      }

      if (changed.length > 0) {
        await this.upsertRecentActivity({
          organizationId: tenant.organizationId,
          boardId: card.boardId,
          cardId,
          actorId: userId,
          type: 'CARD_UPDATED',
          payload: { cardId, fields: changed, changes },
          coalesceWindowSec: 60,
          mergeFields: true,
        });
      }
    }

    this.events.emit(EVENT_NAMES.CARD_UPDATED, {
      boardId: card.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      cardId,
    });

    return updated;
  }

  /**
   * Coalescing de activity: se a última activity do mesmo `actorId/cardId/type`
   * foi criada há menos de `coalesceWindowSec`, atualiza ela em vez de criar
   * uma nova. Quando `mergeFields = true`, faz union dos arrays `fields[]`
   * (caso de CARD_UPDATED — várias mudanças do mesmo user em sequência viram
   * 1 entrada com todos os campos listados).
   */
  private async upsertRecentActivity(input: {
    organizationId: string;
    boardId: string | null;
    cardId: string;
    actorId: string;
    type: 'CARD_UPDATED';
    payload: {
      cardId: string;
      fields: string[];
      changes?: Record<string, { from: unknown; to: unknown }>;
    };
    coalesceWindowSec: number;
    mergeFields: boolean;
  }) {
    const since = new Date(Date.now() - input.coalesceWindowSec * 1000);
    const recent = await this.prisma.activity.findFirst({
      where: {
        organizationId: input.organizationId,
        cardId: input.cardId,
        actorId: input.actorId,
        type: input.type,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recent && input.mergeFields) {
      const prev = (recent.payload ?? {}) as {
        fields?: string[];
        changes?: Record<string, { from: unknown; to: unknown }>;
      };
      const prevFields = Array.isArray(prev.fields) ? prev.fields : [];
      const merged = Array.from(new Set([...prevFields, ...input.payload.fields]));

      // Coalesce de changes: mantém `from` ORIGINAL (primeira mudança da janela)
      // e atualiza `to` pra última. Ex: title A→B coalescido com B→C vira A→C.
      const prevChanges = prev.changes ?? {};
      const mergedChanges: Record<string, { from: unknown; to: unknown }> = { ...prevChanges };
      for (const [field, change] of Object.entries(input.payload.changes ?? {})) {
        const existing = mergedChanges[field];
        if (existing) {
          mergedChanges[field] = { from: existing.from, to: change.to };
        } else {
          mergedChanges[field] = change;
        }
      }

      await this.prisma.activity.update({
        where: { id: recent.id },
        data: {
          payload: {
            ...prev,
            ...input.payload,
            fields: merged,
            changes: mergedChanges,
          } as Prisma.InputJsonValue,
          createdAt: new Date(), // bump pro topo do feed
        },
      });
      return;
    }

    await this.prisma.activity.create({
      data: {
        organizationId: input.organizationId,
        boardId: input.boardId,
        cardId: input.cardId,
        actorId: input.actorId,
        type: input.type,
        payload: input.payload as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async move(userId: string, tenant: TenantContext, cardId: string, input: MoveCardInput) {
    const card = await this.getCardOrThrow(cardId, tenant.organizationId);
    await this.access.assertCardAccess(userId, card.id, tenant, 'EDITOR');

    const destList = await this.prisma.list.findUnique({ where: { id: input.toListId } });
    if (!destList || destList.boardId !== card.boardId) {
      throw new BadRequestException('Lista destino inválida.');
    }

    const { beforePos, afterPos } = await this.resolveNeighbors(
      input.toListId,
      input.afterCardId,
      cardId,
    );
    const position = computeInsertPosition(beforePos, afterPos);

    const listChanged = card.listId !== input.toListId;

    // TXN: atualiza Card + CardPresence + limpa flagColor + enfileira
    // triggers de automação (CARD_LEFT origem + CARD_ENTERED destino).
    // Atomicidade garante que automação só dispara se o move commitou —
    // resolve o bug histórico de evento perdido (EventEmitter2 fire-and-forget).
    const { updated, outboxIds } = await this.prisma.$transaction(async (tx) => {
      const u = await tx.card.update({
        where: { id: cardId },
        data: {
          listId: input.toListId,
          position,
          ...(listChanged ? { enteredListAt: new Date() } : {}),
          // Doc 47: limpa flag visual ao mudar de coluna — alerta não deve
          // "vazar" pra nova coluna. Antes ficava em onCardMoved listener.
          ...(listChanged ? { flagColor: null, flagAt: null } : {}),
        },
      });

      // Espelha presence pra manter CardPresence consistente com campos
      // legacy do Card. Defensivo: cards pré-backfill podem não ter presence.
      await tx.cardPresence
        .updateMany({
          where: { cardId, boardId: card.boardId },
          data: { listId: input.toListId, position },
        })
        .catch(() => undefined);

      const ids: string[] = [];
      if (listChanged) {
        const left = await this.automationsOutbox.enqueue(tx, {
          organizationId: tenant.organizationId,
          trigger: 'CARD_LEFT',
          cardId,
          scopeKind: 'LIST',
          scopeId: card.listId,
        });
        const entered = await this.automationsOutbox.enqueue(tx, {
          organizationId: tenant.organizationId,
          trigger: 'CARD_ENTERED',
          cardId,
          scopeKind: 'LIST',
          scopeId: input.toListId,
        });
        ids.push(left.id, entered.id);
      }

      return { updated: u, outboxIds: ids };
    });

    // Só registra activity quando lista mudou (reorder dentro da mesma coluna
    // não interessa pro feed). Fora da TXN porque é diagnóstico, não correção.
    if (listChanged) {
      const fromList = await this.prisma.list.findUnique({
        where: { id: card.listId },
        select: { name: true },
      });
      const board = await this.prisma.board.findUnique({
        where: { id: card.boardId },
        select: { name: true },
      });
      await this.prisma.activity.create({
        data: {
          organizationId: tenant.organizationId,
          boardId: card.boardId,
          cardId,
          actorId: userId,
          type: 'CARD_MOVED',
          payload: {
            cardId,
            fromListId: card.listId,
            toListId: input.toListId,
            fromListName: fromList?.name ?? null,
            toListName: destList.name,
            boardName: board?.name ?? null,
            position,
          },
        },
      });
    }

    // Realtime: notifica frontend (RealtimeGateway escuta esse canal).
    this.events.emit(EVENT_NAMES.CARD_MOVED, {
      boardId: card.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      cardId,
      fromListId: card.listId,
      toListId: input.toListId,
      position,
    });

    // Push: processa cada outbox JÁ pra latência ~ms. Fire-and-forget — se
    // falhar, o cron pull pega no próximo ciclo de 5s.
    for (const id of outboxIds) void this.automationsOutbox.processOne(id);

    return updated;
  }

  async archive(userId: string, tenant: TenantContext, cardId: string) {
    const card = await this.getCardOrThrow(cardId, tenant.organizationId);
    await this.access.assertCardAccess(userId, card.id, tenant, 'EDITOR');

    const updated = await this.prisma.card.update({
      where: { id: cardId },
      data: { isArchived: true },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: card.boardId,
        cardId,
        actorId: userId,
        type: 'CARD_ARCHIVED',
        payload: { cardId },
      },
    });

    this.events.emit(EVENT_NAMES.CARD_ARCHIVED, {
      boardId: card.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      cardId,
    });

    return updated;
  }

  async restore(userId: string, tenant: TenantContext, cardId: string) {
    const card = await this.getCardOrThrow(cardId, tenant.organizationId);
    await this.access.assertCardAccess(userId, card.id, tenant, 'EDITOR');
    return this.prisma.card.update({
      where: { id: cardId },
      data: { isArchived: false },
    });
  }

  /**
   * Exclusão permanente. Apaga card + tudo que tem cascata (CardMember,
   * CardLabel, Checklist+Items, Attachments, Comments, Activities).
   * Requer confirmação dupla no client (não tem lixeira).
   */
  async deletePermanent(userId: string, tenant: TenantContext, cardId: string) {
    const card = await this.getCardOrThrow(cardId, tenant.organizationId);
    await this.access.assertCardAccess(userId, card.id, tenant, 'EDITOR');

    await this.prisma.card.delete({ where: { id: cardId } });

    // emit CARD_ARCHIVED pra a UI sair do estado "aberto" (trata como saída)
    this.events.emit(EVENT_NAMES.CARD_ARCHIVED, {
      boardId: card.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      cardId,
    });
    return { ok: true };
  }

  /**
   * Duplica o card N vezes, com flags pra escolher o que copiar.
   * Sempre copia: título (com sufixo "(cópia)"), prioridade, descrição se
   * `copyDescription`, e cria as tarefas como "não feitas" mesmo se a
   * checklist for copiada. Nunca copia: comments, activities, completedAt.
   */
  async duplicate(
    userId: string,
    tenant: TenantContext,
    cardId: string,
    options: {
      copyDescription?: boolean;
      copyLead?: boolean;
      copyTeam?: boolean;
      copyTags?: boolean;
      copyDueDate?: boolean;
      copyChecklists?: boolean;
      copyAttachments?: boolean;
      copyParent?: boolean;
      count?: number;
      targetBoardId?: string | null;
      targetListId?: string | null;
    } = {},
  ) {
    const count = Math.max(1, Math.min(options.count ?? 1, 10));
    const source = await this.prisma.card.findUnique({
      where: { id: cardId },
      include: {
        labels: true,
        members: true,
        checklists: {
          include: {
            items: {
              orderBy: { position: 'asc' },
              include: {
                assignee: { select: { id: true, name: true, avatarUrl: true } },
              },
            },
          },
          orderBy: { position: 'asc' },
        },
        attachments: true,
      },
    });
    if (!source || source.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Card não encontrado.');
    }
    await this.access.assertAccess(userId, source.boardId, tenant, 'EDITOR');

    // Resolve destino: por padrão é o mesmo board/lista do card original.
    let destBoardId = source.boardId;
    let destListId = source.listId;
    let prevPos: number | null = source.position;
    let nextPos: number | null = null;

    if (options.targetBoardId && options.targetListId) {
      const destList = await this.prisma.list.findUnique({
        where: { id: options.targetListId },
      });
      if (!destList || destList.boardId !== options.targetBoardId || destList.isArchived) {
        throw new BadRequestException('Lista destino inválida.');
      }
      const destBoard = await this.prisma.board.findUnique({
        where: { id: options.targetBoardId },
      });
      if (!destBoard || destBoard.organizationId !== tenant.organizationId) {
        throw new NotFoundException('Quadro destino não encontrado.');
      }
      await this.access.assertAccess(userId, options.targetBoardId, tenant, 'EDITOR');

      destBoardId = options.targetBoardId;
      destListId = options.targetListId;

      // Vai pro fim da lista destino
      const last = await this.prisma.card.findFirst({
        where: { listId: destListId, isArchived: false, completedAt: null },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      prevPos = last?.position ?? null;
      nextPos = null;
    } else {
      // Mesmo board: insere logo após o card origem
      const nextAfter = await this.prisma.card.findFirst({
        where: {
          listId: source.listId,
          isArchived: false,
          completedAt: null,
          position: { gt: source.position },
        },
        orderBy: { position: 'asc' },
        select: { position: true },
      });
      nextPos = nextAfter?.position ?? null;
    }

    const crossBoard = destBoardId !== source.boardId;
    const created: Array<{ id: string; title: string }> = [];

    // Quando o destino é OUTRO board, labels específicas do board origem
    // não fazem sentido. Filtramos pra só copiar as labels Org-globais
    // (Label.boardId == null). Buscamos os Label refs no banco.
    const labelDefs =
      options.copyTags !== false && source.labels.length > 0
        ? await this.prisma.label.findMany({
            where: { id: { in: source.labels.map((l) => l.labelId) } },
            select: { id: true, boardId: true },
          })
        : [];
    const labelsToCopy = crossBoard
      ? labelDefs.filter((l) => l.boardId === null).map((l) => l.id)
      : source.labels.map((l) => l.labelId);

    for (let i = 0; i < count; i++) {
      const position = computeInsertPosition(prevPos, nextPos);
      prevPos = position;

      const copy = await this.prisma.$transaction(async (tx) => {
        const newCard = await createCardWithPresence(tx, {
          organizationId: source.organizationId,
          boardId: destBoardId,
          listId: destListId,
          title: count > 1 ? `${source.title} (cópia ${i + 1})` : `${source.title} (cópia)`,
          description:
            options.copyDescription !== false
              ? ((source.description ?? undefined) as Prisma.InputJsonValue | undefined)
              : undefined,
          cardColor: source.cardColor,
          startDate: options.copyDueDate !== false ? source.startDate : null,
          dueDate: options.copyDueDate !== false ? source.dueDate : null,
          estimateMinutes: source.estimateMinutes,
          // copyParent só faz sentido se permanecer no mesmo board (parent
          // é card do mesmo board pelo schema)
          parentCardId: options.copyParent && !crossBoard ? source.parentCardId : null,
          position,
          createdById: userId,
          leadId: options.copyLead && source.leadId ? source.leadId : userId,
        });

        if (labelsToCopy.length > 0) {
          await tx.cardLabel.createMany({
            data: labelsToCopy.map((labelId) => ({ cardId: newCard.id, labelId })),
            skipDuplicates: true,
          });
        }

        // Equipe = membros excluindo o líder original (que pode ter sido copiado)
        const teamIds = source.members.map((m) => m.userId).filter((id) => id !== source.leadId);
        const memberIds: string[] = [];
        if (options.copyLead && source.leadId) memberIds.push(source.leadId);
        if (options.copyTeam !== false) memberIds.push(...teamIds);
        // Garantir o leadId do novo card como membro
        if (!memberIds.includes(newCard.leadId!)) memberIds.push(newCard.leadId!);
        if (memberIds.length > 0) {
          await tx.cardMember.createMany({
            data: memberIds.map((uid) => ({ cardId: newCard.id, userId: uid })),
            skipDuplicates: true,
          });
        }

        if (options.copyChecklists !== false) {
          for (const cl of source.checklists) {
            const createdChecklist = await tx.checklist.create({
              data: { cardId: newCard.id, title: cl.title, position: cl.position },
            });
            if (cl.items.length > 0) {
              await tx.checklistItem.createMany({
                data: cl.items.map((it) => ({
                  checklistId: createdChecklist.id,
                  text: it.text,
                  position: it.position,
                  // tarefas duplicadas voltam pra "não feitas"
                  isDone: false,
                  dueDate: it.dueDate,
                })),
              });
            }
          }
        }

        if (options.copyAttachments && source.attachments.length > 0) {
          // Reutilizamos as mesmas chaves de storage: o objeto vive uma vez
          // mas é referenciado por N anexos. Quando uma das cópias for
          // removida, o objeto continua disponível pelas outras referências.
          await tx.attachment.createMany({
            data: source.attachments.map((a) => ({
              cardId: newCard.id,
              uploaderId: userId,
              fileName: a.fileName,
              mimeType: a.mimeType,
              sizeBytes: a.sizeBytes,
              storageKey: a.storageKey,
              kind: a.kind,
            })),
          });
        }

        // Enfileira CARD_ENTERED na mesma TXN — garante que automação
        // dispara somente se a cópia commitou.
        const outbox = await this.automationsOutbox.enqueue(tx, {
          organizationId: source.organizationId,
          trigger: 'CARD_ENTERED',
          cardId: newCard.id,
          scopeKind: 'LIST',
          scopeId: destListId,
        });

        return { newCard, outboxId: outbox.id };
      });

      await this.prisma.activity.create({
        data: {
          organizationId: source.organizationId,
          boardId: destBoardId,
          cardId: copy.newCard.id,
          actorId: userId,
          type: 'CARD_CREATED',
          payload: {
            cardId: copy.newCard.id,
            duplicatedFromId: source.id,
            title: copy.newCard.title,
          },
        },
      });

      this.events.emit(EVENT_NAMES.CARD_CREATED, {
        boardId: destBoardId,
        organizationId: source.organizationId,
        actorId: userId,
        cardId: copy.newCard.id,
        listId: destListId,
        title: copy.newCard.title,
      });

      void this.automationsOutbox.processOne(copy.outboxId);

      created.push({ id: copy.newCard.id, title: copy.newCard.title });
    }

    return { count: created.length, cards: created };
  }

  /** ----------------- Família (pai/filho) ----------------- */

  /**
   * Lista a família de um card: pai (se houver) + filhos diretos com info
   * de board/lista (pra renderizar mini-progresso por filho).
   */
  async getFamily(userId: string, tenant: TenantContext, cardId: string) {
    const card = await this.getCardOrThrow(cardId, tenant.organizationId);
    await this.access.assertCardAccess(userId, card.id, tenant, 'VIEWER');

    const include = {
      list: { select: { id: true, name: true, isArchived: true } },
      board: { select: { id: true, name: true, color: true, icon: true } },
      members: {
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      },
      lead: { select: { id: true, name: true, email: true, avatarUrl: true } },
    } as const;

    const [parent, siblings, descendantsFlat] = await Promise.all([
      card.parentCardId
        ? this.prisma.card.findUnique({ where: { id: card.parentCardId }, include })
        : Promise.resolve(null),
      // Irmãos: cards com mesmo parentCardId, excluindo o atual.
      card.parentCardId
        ? this.prisma.card.findMany({
            where: {
              parentCardId: card.parentCardId,
              organizationId: tenant.organizationId,
              isArchived: false,
              id: { not: cardId },
            },
            orderBy: { createdAt: 'asc' },
            include,
          })
        : Promise.resolve([]),
      // Descendentes em múltiplos níveis (filhos, netos, bisnetos, ...).
      // Padrão Ummense — limita profundidade a 6 níveis pra evitar carga
      // excessiva em hierarquias bizarras.
      this.collectDescendants(cardId, tenant.organizationId, include, 6),
    ]);

    return { parent, siblings, descendants: descendantsFlat };
  }

  /**
   * Coleta descendentes em camadas (BFS), até `maxDepth` níveis.
   * `depth` no retorno: 1 = filho direto, 2 = neto, 3 = bisneto, etc.
   */
  private async collectDescendants(
    rootId: string,
    organizationId: string,
    include: object,
    maxDepth: number,
  ) {
    type WithDepth = Awaited<ReturnType<typeof this.prisma.card.findMany>>[number] & {
      depth: number;
    };
    const all: WithDepth[] = [];
    let frontierIds = [rootId];
    let currentDepth = 1;
    while (frontierIds.length > 0 && currentDepth <= maxDepth) {
      const layer = await this.prisma.card.findMany({
        where: {
          parentCardId: { in: frontierIds },
          organizationId,
          isArchived: false,
        },
        orderBy: { createdAt: 'asc' },
        include: include as never,
      });
      if (layer.length === 0) break;
      for (const c of layer) all.push({ ...c, depth: currentDepth });
      frontierIds = layer.map((c) => c.id);
      currentDepth += 1;
    }
    return all;
  }

  /**
   * Cria filho a partir do card atual. Reusa lógica de `duplicate` (com flags
   * de copy), mas grava `parentCardId` no novo card e tem activity própria.
   */
  async createChild(
    userId: string,
    tenant: TenantContext,
    parentId: string,
    input: {
      title: string;
      description?: Prisma.InputJsonValue | null;
      copyDescription?: boolean;
      copyLead?: boolean;
      copyTeam?: boolean;
      copyTags?: boolean;
      copyDueDate?: boolean;
      copyAttachments?: boolean;
      targetBoardId?: string | null;
      targetListId?: string | null;
    },
  ) {
    const parent = await this.prisma.card.findUnique({
      where: { id: parentId },
      include: {
        labels: true,
        members: true,
        attachments: { where: { commentId: null, embedded: false } },
      },
    });
    if (!parent || parent.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Card pai não encontrado.');
    }
    await this.access.assertCardAccess(userId, parent.id, tenant, 'EDITOR');

    let destBoardId = parent.boardId;
    let destListId = parent.listId;

    if (input.targetBoardId && input.targetListId) {
      const destList = await this.prisma.list.findUnique({
        where: { id: input.targetListId },
      });
      if (!destList || destList.boardId !== input.targetBoardId || destList.isArchived) {
        throw new BadRequestException('Lista destino inválida.');
      }
      const destBoard = await this.prisma.board.findUnique({
        where: { id: input.targetBoardId },
      });
      if (!destBoard || destBoard.organizationId !== tenant.organizationId) {
        throw new NotFoundException('Quadro destino não encontrado.');
      }
      await this.access.assertAccess(userId, input.targetBoardId, tenant, 'EDITOR');
      destBoardId = input.targetBoardId;
      destListId = input.targetListId;
    }

    // Vai pro fim da lista destino
    const last = await this.prisma.card.findFirst({
      where: { listId: destListId, isArchived: false, completedAt: null },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = computeInsertPosition(last?.position ?? null, null);

    const crossBoard = destBoardId !== parent.boardId;

    // Tags do mesmo board: ok; Tags Org-globais: ok; específicas de outro board: pula
    const labelDefs =
      input.copyTags !== false && parent.labels.length > 0
        ? await this.prisma.label.findMany({
            where: { id: { in: parent.labels.map((l) => l.labelId) } },
            select: { id: true, boardId: true },
          })
        : [];
    const labelsToCopy = crossBoard
      ? labelDefs.filter((l) => l.boardId === null).map((l) => l.id)
      : parent.labels.map((l) => l.labelId);

    const child = await this.prisma.$transaction(async (tx) => {
      // Resolve descricao final:
      // - se input.description vier (com texto digitado pelo user no editor), usa ele
      // - senao se copyDescription, copia do pai
      // - senao deixa null
      const finalDescription =
        input.description !== undefined && input.description !== null
          ? (input.description as Prisma.InputJsonValue)
          : input.copyDescription
            ? ((parent as unknown as { description: Prisma.InputJsonValue | null }).description ??
              undefined)
            : undefined;

      const newCard = await createCardWithPresence(tx, {
        organizationId: parent.organizationId,
        boardId: destBoardId,
        listId: destListId,
        title: input.title,
        description: finalDescription,
        cardColor: parent.cardColor,
        startDate: input.copyDueDate ? parent.startDate : null,
        dueDate: input.copyDueDate ? parent.dueDate : null,
        parentCardId: parentId,
        position,
        createdById: userId,
        leadId: input.copyLead && parent.leadId ? parent.leadId : userId,
      });

      if (labelsToCopy.length > 0) {
        await tx.cardLabel.createMany({
          data: labelsToCopy.map((labelId) => ({ cardId: newCard.id, labelId })),
          skipDuplicates: true,
        });
      }

      const teamIds = parent.members.map((m) => m.userId).filter((id) => id !== parent.leadId);
      const memberIds: string[] = [];
      if (input.copyLead && parent.leadId) memberIds.push(parent.leadId);
      if (input.copyTeam !== false) memberIds.push(...teamIds);
      if (newCard.leadId && !memberIds.includes(newCard.leadId)) memberIds.push(newCard.leadId);
      if (memberIds.length > 0) {
        await tx.cardMember.createMany({
          data: memberIds.map((uid) => ({ cardId: newCard.id, userId: uid })),
          skipDuplicates: true,
        });
      }

      // Copia anexos diretos do card (não-embedded, não de comments).
      // Reutiliza as mesmas storageKey — o objeto vive uma vez no S3 e é
      // referenciado por N attachments. Quando uma cópia for removida, o
      // storage segue disponível pelas outras referências.
      if (input.copyAttachments && parent.attachments.length > 0) {
        await tx.attachment.createMany({
          data: parent.attachments.map((a) => ({
            cardId: newCard.id,
            uploaderId: userId,
            fileName: a.fileName,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            storageKey: a.storageKey,
            kind: a.kind,
          })),
        });
      }

      // Enfileira CARD_ENTERED na mesma TXN — atomicidade garante que
      // automação dispara somente se o sub-card commitou.
      const outbox = await this.automationsOutbox.enqueue(tx, {
        organizationId: parent.organizationId,
        trigger: 'CARD_ENTERED',
        cardId: newCard.id,
        scopeKind: 'LIST',
        scopeId: destListId,
      });

      return { newCard, outboxId: outbox.id };
    });

    await this.prisma.activity.create({
      data: {
        organizationId: parent.organizationId,
        boardId: destBoardId,
        cardId: child.newCard.id,
        actorId: userId,
        type: 'CARD_PARENT_LINKED',
        payload: { cardId: child.newCard.id, parentCardId: parentId, title: child.newCard.title },
      },
    });

    this.events.emit(EVENT_NAMES.CARD_CREATED, {
      boardId: destBoardId,
      organizationId: parent.organizationId,
      actorId: userId,
      cardId: child.newCard.id,
      listId: destListId,
      title: child.newCard.title,
    });

    void this.automationsOutbox.processOne(child.outboxId);

    return child.newCard;
  }

  /**
   * Vincula este card como filho de outro (parentCardId = newParentId)
   * ou desvincula (newParentId = null).
   */
  async setParent(
    userId: string,
    tenant: TenantContext,
    cardId: string,
    newParentId: string | null,
  ) {
    const card = await this.getCardOrThrow(cardId, tenant.organizationId);
    await this.access.assertCardAccess(userId, card.id, tenant, 'EDITOR');

    if (newParentId) {
      if (newParentId === cardId) {
        throw new BadRequestException('Um card não pode ser pai dele mesmo.');
      }
      const candidate = await this.prisma.card.findUnique({
        where: { id: newParentId },
        select: { id: true, organizationId: true },
      });
      if (!candidate || candidate.organizationId !== tenant.organizationId) {
        throw new NotFoundException('Card pai não encontrado.');
      }

      // Anti-loop: garantir que `newParentId` não é descendente de `cardId`
      // (caso contrário, ao definir parent criaria ciclo).
      if (await this.isDescendant(newParentId, cardId)) {
        throw new BadRequestException(
          'Não é possível: o pai escolhido é descendente deste card (formaria ciclo).',
        );
      }
    }

    const updated = await this.prisma.card.update({
      where: { id: cardId },
      data: { parentCardId: newParentId },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: card.boardId,
        cardId,
        actorId: userId,
        type: newParentId ? 'CARD_PARENT_LINKED' : 'CARD_PARENT_UNLINKED',
        payload: {
          cardId,
          fromParentId: card.parentCardId,
          toParentId: newParentId,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    this.events.emit(EVENT_NAMES.CARD_UPDATED, {
      boardId: card.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      cardId,
    });

    return updated;
  }

  /**
   * Verifica se `candidateId` é descendente (filho/neto/...) de `rootId`.
   * Usado pra prevenir ciclos. Profundidade limitada a 10 níveis.
   */
  private async isDescendant(candidateId: string, rootId: string): Promise<boolean> {
    const visited = new Set<string>();
    let frontier: string[] = [rootId];
    for (let depth = 0; depth < 10 && frontier.length > 0; depth++) {
      const children = await this.prisma.card.findMany({
        where: { parentCardId: { in: frontier } },
        select: { id: true },
      });
      const childIds = children.map((c) => c.id);
      if (childIds.includes(candidateId)) return true;
      frontier = childIds.filter((id) => !visited.has(id));
      childIds.forEach((id) => visited.add(id));
    }
    return false;
  }

  async complete(userId: string, tenant: TenantContext, cardId: string) {
    const card = await this.getCardOrThrow(cardId, tenant.organizationId);
    await this.access.assertCardAccess(userId, card.id, tenant, 'EDITOR');

    if (card.completedAt) {
      return card; // idempotente
    }

    const updated = await this.prisma.card.update({
      where: { id: cardId },
      data: { completedAt: new Date(), completedById: userId },
    });

    // Espelha primary presence (ver comment em move()).
    await this.prisma.cardPresence
      .updateMany({
        where: { cardId, boardId: card.boardId },
        data: { completedAt: updated.completedAt, completedById: userId },
      })
      .catch(() => undefined);

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: card.boardId,
        cardId,
        actorId: userId,
        type: 'CARD_COMPLETED',
        payload: { cardId, fromListId: card.listId },
      },
    });

    this.events.emit(EVENT_NAMES.CARD_COMPLETED, {
      boardId: card.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      cardId,
      listId: card.listId,
    });

    return updated;
  }

  async uncomplete(userId: string, tenant: TenantContext, cardId: string, toListId?: string) {
    const card = await this.getCardOrThrow(cardId, tenant.organizationId);
    await this.access.assertCardAccess(userId, card.id, tenant, 'EDITOR');

    if (!card.completedAt) {
      return card; // idempotente
    }

    // Decide a lista destino: a solicitada, ou a original se ainda ativa, ou a primeira lista não-arquivada do board
    let targetListId = toListId ?? card.listId;
    const targetList = await this.prisma.list.findUnique({ where: { id: targetListId } });
    if (!targetList || targetList.boardId !== card.boardId || targetList.isArchived) {
      const firstList = await this.prisma.list.findFirst({
        where: { boardId: card.boardId, isArchived: false },
        orderBy: { position: 'asc' },
      });
      if (!firstList) {
        throw new BadRequestException('Não há lista disponível para restaurar o card.');
      }
      targetListId = firstList.id;
    }

    // Posiciona no fim da lista destino
    const last = await this.prisma.card.findFirst({
      where: { listId: targetListId, isArchived: false, completedAt: null },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = computeInsertPosition(last?.position ?? null, null);

    const updated = await this.prisma.card.update({
      where: { id: cardId },
      data: {
        completedAt: null,
        completedById: null,
        listId: targetListId,
        position,
      },
    });

    // Espelha primary presence (ver comment em move()).
    await this.prisma.cardPresence
      .updateMany({
        where: { cardId, boardId: card.boardId },
        data: { completedAt: null, completedById: null, listId: targetListId, position },
      })
      .catch(() => undefined);

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: card.boardId,
        cardId,
        actorId: userId,
        type: 'CARD_UNCOMPLETED',
        payload: { cardId, toListId: targetListId },
      },
    });

    this.events.emit(EVENT_NAMES.CARD_UNCOMPLETED, {
      boardId: card.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      cardId,
      listId: targetListId,
    });

    return updated;
  }

  async assignMember(userId: string, tenant: TenantContext, cardId: string, memberUserId: string) {
    const card = await this.getCardOrThrow(cardId, tenant.organizationId);
    await this.access.assertCardAccess(userId, card.id, tenant, 'EDITOR');

    // Verifica se memberUserId é da Org
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId: memberUserId, organizationId: tenant.organizationId },
      },
    });
    if (!membership) {
      throw new BadRequestException('Usuário não pertence à organização.');
    }

    await this.prisma.cardMember.upsert({
      where: { cardId_userId: { cardId, userId: memberUserId } },
      update: {},
      create: { cardId, userId: memberUserId },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: card.boardId,
        cardId,
        actorId: userId,
        type: 'CARD_ASSIGNED',
        payload: { cardId, memberId: memberUserId },
      },
    });

    // Notifica o user adicionado a equipe (se nao for ele se auto-adicionando)
    if (memberUserId !== userId) {
      const actor = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      await this.notifications.create({
        userId: memberUserId,
        organizationId: tenant.organizationId,
        type: 'ASSIGNED',
        title: `${actor?.name ?? 'Alguém'} adicionou você ao card`,
        body: card.title,
        entityType: 'card',
        entityId: cardId,
      });
    }

    return { ok: true };
  }

  async unassignMember(
    userId: string,
    tenant: TenantContext,
    cardId: string,
    memberUserId: string,
  ) {
    const card = await this.getCardOrThrow(cardId, tenant.organizationId);
    await this.access.assertCardAccess(userId, card.id, tenant, 'EDITOR');

    await this.prisma.cardMember
      .delete({ where: { cardId_userId: { cardId, userId: memberUserId } } })
      .catch(() => undefined);

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: card.boardId,
        cardId,
        actorId: userId,
        type: 'CARD_UNASSIGNED',
        payload: { cardId, memberId: memberUserId },
      },
    });

    return { ok: true };
  }

  async addLabel(userId: string, tenant: TenantContext, cardId: string, labelId: string) {
    const card = await this.getCardOrThrow(cardId, tenant.organizationId);
    await this.access.assertCardAccess(userId, card.id, tenant, 'EDITOR');

    const label = await this.prisma.label.findUnique({ where: { id: labelId } });
    if (!label || label.organizationId !== tenant.organizationId) {
      throw new BadRequestException('Etiqueta inválida.');
    }
    if (label.boardId && label.boardId !== card.boardId) {
      throw new BadRequestException('Etiqueta pertence a outro quadro.');
    }

    await this.prisma.cardLabel.upsert({
      where: { cardId_labelId: { cardId, labelId } },
      update: {},
      create: { cardId, labelId },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: card.boardId,
        cardId,
        actorId: userId,
        type: 'LABEL_ADDED',
        payload: { cardId, labelId, labelName: label.name },
      },
    });

    return { ok: true };
  }

  async removeLabel(userId: string, tenant: TenantContext, cardId: string, labelId: string) {
    const card = await this.getCardOrThrow(cardId, tenant.organizationId);
    await this.access.assertCardAccess(userId, card.id, tenant, 'EDITOR');

    await this.prisma.cardLabel
      .delete({ where: { cardId_labelId: { cardId, labelId } } })
      .catch(() => undefined);

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: card.boardId,
        cardId,
        actorId: userId,
        type: 'LABEL_REMOVED',
        payload: { cardId, labelId },
      },
    });

    return { ok: true };
  }

  // -----------------------------------------------------------------
  // Cards multi-fluxo (iteração 1: aditivo, sem migrar leitura do kanban)
  // -----------------------------------------------------------------

  /**
   * Lista todas as presenças ativas do card (uma por fluxo onde o card aparece).
   * Filtra por acesso: se o user não tem acesso a um dos boards, aquela presença
   * é omitida — assim a aba "Fluxos" no modal não vaza fluxos restritos.
   */
  async listFlows(userId: string, tenant: TenantContext, cardId: string) {
    const card = await this.getCardOrThrow(cardId, tenant.organizationId);
    // Acesso ao card = acesso a pelo menos 1 board onde ele tem presença.
    // Como check inicial, basta exigir VIEWER no board primário.
    await this.access.assertCardAccess(userId, card.id, tenant, 'VIEWER');

    const presences = await this.prisma.cardPresence.findMany({
      where: { cardId, removedAt: null },
      include: {
        board: {
          select: {
            id: true,
            name: true,
            icon: true,
            color: true,
            visibility: true,
            isArchived: true,
            members: {
              select: {
                role: true,
                user: { select: { id: true, name: true, avatarUrl: true } },
              },
            },
            lists: {
              where: { isArchived: false },
              orderBy: { position: 'asc' },
              // Doc 42: inclui flags pra UI da regua filtrar isFinalList
              // (representado pela bolinha do check no fim).
              select: {
                id: true,
                name: true,
                position: true,
                isFinalList: true,
                isBacklog: true,
              },
            },
          },
        },
        list: { select: { id: true, name: true } },
        completedBy: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { addedAt: 'asc' },
    });

    // Filtra por acesso a cada board. Se o user não tiver, esconde.
    const result = [];
    for (const p of presences) {
      const has = await this.access
        .assertAccess(userId, p.boardId, tenant, 'VIEWER')
        .then(() => true)
        .catch(() => false);
      if (!has) continue;
      result.push({
        boardId: p.boardId,
        listId: p.listId,
        position: p.position,
        completedAt: p.completedAt,
        completedBy: p.completedBy,
        addedAt: p.addedAt,
        isPrimary: p.boardId === card.boardId,
        board: p.board,
        list: p.list,
      });
    }
    return result;
  }

  /**
   * Auditoria minimalista: quem ja abriu este card pelo menos 1 vez.
   * Retorna 1 entry por user (CardVisit tem PK composta userId+cardId),
   * com timestamp da ultima visita + flag se eh lead/membro/outro.
   * Sem contagem de vezes — so "abriu ou nao abriu".
   */
  async listVisits(userId: string, tenant: TenantContext, cardId: string) {
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: {
        id: true,
        boardId: true,
        organizationId: true,
        leadId: true,
        privacy: true,
        members: { select: { userId: true } },
      },
    });
    if (!card || card.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Card não encontrado.');
    }
    await this.access.assertCardAccess(userId, card.id, tenant, 'VIEWER');
    if (!canViewCard(card, userId, tenant.role)) {
      throw new NotFoundException('Card não encontrado.');
    }

    const visits = await this.prisma.cardVisit.findMany({
      where: { cardId },
      orderBy: { visitedAt: 'desc' },
      take: 50,
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    const memberIds = new Set(card.members.map((m) => m.userId));
    return visits.map((v) => ({
      userId: v.userId,
      visitedAt: v.visitedAt.toISOString(),
      user: v.user,
      role: v.userId === card.leadId ? 'LEAD' : memberIds.has(v.userId) ? 'MEMBER' : 'OTHER',
    }));
  }

  /**
   * Vincula o card a um novo fluxo (board). Se `listId` for omitido, usa a
   * primeira lista não-arquivada do board destino. Idempotente: se já existe
   * presença ativa, devolve ela; se existe mas está soft-deleted (`removedAt`),
   * "reativa" mantendo a posição original.
   */
  async linkToFlow(
    userId: string,
    tenant: TenantContext,
    cardId: string,
    input: { boardId: string; listId?: string },
  ) {
    const card = await this.getCardOrThrow(cardId, tenant.organizationId);
    // Precisa permissão de EDITOR no board origem (pra "saber" o card)
    // E EDITOR no board destino (pra "incluir" o card lá).
    await this.access.assertCardAccess(userId, card.id, tenant, 'EDITOR');
    await this.access.assertAccess(userId, input.boardId, tenant, 'EDITOR');

    if (input.boardId === card.boardId) {
      throw new BadRequestException('Card já está neste fluxo.');
    }

    const board = await this.prisma.board.findUnique({
      where: { id: input.boardId },
      select: {
        id: true,
        organizationId: true,
        isArchived: true,
        inheritTeamOnNewCards: true,
        members: { select: { userId: true } },
      },
    });
    if (!board || board.organizationId !== tenant.organizationId || board.isArchived) {
      throw new BadRequestException('Fluxo destino inválido.');
    }

    // Lista alvo: a passada (se válida) ou a primeira do board.
    let targetListId = input.listId;
    if (targetListId) {
      const list = await this.prisma.list.findUnique({ where: { id: targetListId } });
      if (!list || list.boardId !== input.boardId || list.isArchived) {
        throw new BadRequestException('Lista destino inválida.');
      }
    } else {
      const first = await this.prisma.list.findFirst({
        where: { boardId: input.boardId, isArchived: false },
        orderBy: { position: 'asc' },
        select: { id: true },
      });
      if (!first) throw new BadRequestException('Fluxo destino não tem listas ativas.');
      targetListId = first.id;
    }

    // Posição: fim da lista
    const last = await this.prisma.cardPresence.findFirst({
      where: { boardId: input.boardId, listId: targetListId, removedAt: null },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = (last?.position ?? 0) + 1024;

    // Upsert: se já existe (mesmo soft-deleted), reativa.
    const presence = await this.prisma.cardPresence.upsert({
      where: { cardId_boardId: { cardId, boardId: input.boardId } },
      update: {
        listId: targetListId,
        position,
        removedAt: null,
      },
      create: {
        cardId,
        boardId: input.boardId,
        listId: targetListId,
        position,
      },
    });

    // Herda a equipe do board destino quando ele tem inheritTeamOnNewCards.
    // Coerencia multi-fluxo: card que ENTRA no fluxo (nascido OU vinculado)
    // ganha a equipe. Aditivo — nao remove ninguem. skipDuplicates evita
    // erro se membro ja estava no card.
    if (board.inheritTeamOnNewCards && board.members.length > 0) {
      await this.prisma.cardMember.createMany({
        data: board.members.map((mb) => ({ cardId, userId: mb.userId })),
        skipDuplicates: true,
      });
    }

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: input.boardId,
        cardId,
        actorId: userId,
        type: 'CARD_CREATED', // reusa o tipo existente (vínculo é como entrada nova nesse fluxo)
        payload: { cardId, listId: targetListId, linkedFromBoardId: card.boardId },
      },
    });

    // Vincular a novo fluxo pode reabrir card "COMPLETED" se o destino
    // for coluna nao-final. Auto-sync trata.
    await this.statusSync.evaluate(cardId);

    return presence;
  }

  /**
   * Move o card pra outra coluna DENTRO de um fluxo específico (CardPresence).
   * Permite mover por qualquer fluxo onde o card tem presença ativa, não só
   * o primário. Quando o boardId é o primário, também espelha em Card.* pra
   * manter a fonte legacy consistente (ainda usada pelo kanban na iteração 1).
   */
  async moveInFlow(
    userId: string,
    tenant: TenantContext,
    cardId: string,
    boardId: string,
    input: { toListId: string; afterCardId?: string | null; beforeCardId?: string | null },
  ) {
    const card = await this.getCardOrThrow(cardId, tenant.organizationId);
    await this.access.assertAccess(userId, boardId, tenant, 'EDITOR');

    const presence = await this.prisma.cardPresence.findUnique({
      where: { cardId_boardId: { cardId, boardId } },
    });
    if (!presence || presence.removedAt) {
      throw new NotFoundException('Card não está vinculado a este fluxo.');
    }

    const destList = await this.prisma.list.findUnique({ where: { id: input.toListId } });
    if (!destList || destList.boardId !== boardId || destList.isArchived) {
      throw new BadRequestException('Lista destino inválida pra este fluxo.');
    }

    // Idempotência: só é no-op quando a posição também é "fim" (sem
    // afterCardId nem beforeCardId). Reorder dentro da mesma lista
    // (incluindo "mover pro topo" via beforeCardId) precisa passar.
    if (presence.listId === input.toListId && !input.afterCardId && !input.beforeCardId) {
      return presence;
    }

    // Posição:
    //   - beforeCardId  → entre o anterior e o alvo (insere antes do alvo)
    //   - afterCardId   → entre o alvo e o seguinte (insere após o alvo)
    //   - nenhum        → no fim da lista destino
    let position: number;
    if (input.beforeCardId) {
      const target = await this.prisma.cardPresence.findUnique({
        where: { cardId_boardId: { cardId: input.beforeCardId, boardId } },
      });
      if (!target || target.listId !== input.toListId) {
        throw new BadRequestException('beforeCardId inválido pra esta lista.');
      }
      const prev = await this.prisma.cardPresence.findFirst({
        where: {
          boardId,
          listId: input.toListId,
          removedAt: null,
          position: { lt: target.position },
          NOT: { cardId },
        },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      position = computeInsertPosition(prev?.position ?? null, target.position);
    } else if (input.afterCardId) {
      const after = await this.prisma.cardPresence.findUnique({
        where: { cardId_boardId: { cardId: input.afterCardId, boardId } },
      });
      if (!after || after.listId !== input.toListId) {
        throw new BadRequestException('afterCardId inválido pra esta lista.');
      }
      const next = await this.prisma.cardPresence.findFirst({
        where: {
          boardId,
          listId: input.toListId,
          removedAt: null,
          position: { gt: after.position },
          NOT: { cardId },
        },
        orderBy: { position: 'asc' },
        select: { position: true },
      });
      position = computeInsertPosition(after.position, next?.position ?? null);
    } else {
      const last = await this.prisma.cardPresence.findFirst({
        where: {
          boardId,
          listId: input.toListId,
          removedAt: null,
          NOT: { cardId },
        },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      position = computeInsertPosition(last?.position ?? null, null);
    }

    const listChanged = presence.listId !== input.toListId;

    // TXN: presence + sync legacy + flagColor + enqueue automation triggers.
    const { updated, outboxIds } = await this.prisma.$transaction(async (tx) => {
      const u = await tx.cardPresence.update({
        where: { cardId_boardId: { cardId, boardId } },
        data: { listId: input.toListId, position },
      });

      if (card.boardId === boardId) {
        await tx.card.update({
          where: { id: cardId },
          data: {
            listId: input.toListId,
            position,
            ...(listChanged ? { enteredListAt: new Date() } : {}),
            // Doc 47: limpa flag visual ao mudar de coluna (só no primário —
            // flag é por card, não por presence).
            ...(listChanged ? { flagColor: null, flagAt: null } : {}),
          },
        });
      }

      const ids: string[] = [];
      if (listChanged) {
        const left = await this.automationsOutbox.enqueue(tx, {
          organizationId: tenant.organizationId,
          trigger: 'CARD_LEFT',
          cardId,
          scopeKind: 'LIST',
          scopeId: presence.listId,
        });
        const entered = await this.automationsOutbox.enqueue(tx, {
          organizationId: tenant.organizationId,
          trigger: 'CARD_ENTERED',
          cardId,
          scopeKind: 'LIST',
          scopeId: input.toListId,
        });
        ids.push(left.id, entered.id);
      }

      return { updated: u, outboxIds: ids };
    });

    // Activity log no contexto do board onde rolou a movimentação
    if (listChanged) {
      const fromList = await this.prisma.list.findUnique({
        where: { id: presence.listId },
        select: { name: true },
      });
      await this.prisma.activity.create({
        data: {
          organizationId: tenant.organizationId,
          boardId,
          cardId,
          actorId: userId,
          type: 'CARD_MOVED',
          payload: {
            cardId,
            fromListId: presence.listId,
            toListId: input.toListId,
            fromListName: fromList?.name ?? null,
            toListName: destList.name,
            position,
            inFlow: boardId,
          },
        },
      });

      // Realtime: notifica frontend pra Kanban animar a transição.
      this.events.emit(EVENT_NAMES.CARD_MOVED, {
        boardId,
        organizationId: tenant.organizationId,
        actorId: userId,
        cardId,
        fromListId: presence.listId,
        toListId: input.toListId,
        position,
      });

      // Push: dispara processamento imediato. Cron pull pega se falhar.
      for (const id of outboxIds) void this.automationsOutbox.processOne(id);
    }

    // Auto-status sync: avalia se card deve virar COMPLETED (todas as
    // presences em final list) ou voltar pra ACTIVE (saiu de final).
    // No-op quando a Org nao habilitou o flag.
    await this.statusSync.evaluate(cardId);

    return updated;
  }

  /**
   * Desvincula o card de um fluxo. Soft-delete: marca `removedAt` na presença.
   * Não permite desvincular o fluxo primário (boardId == card.boardId) — pra
   * "remover do todo", use archive/delete do card.
   */
  async unlinkFromFlow(userId: string, tenant: TenantContext, cardId: string, boardId: string) {
    const card = await this.getCardOrThrow(cardId, tenant.organizationId);
    await this.access.assertAccess(userId, boardId, tenant, 'EDITOR');

    if (boardId === card.boardId) {
      throw new BadRequestException(
        'Não é possível desvincular o fluxo primário. Use arquivar para remover o card.',
      );
    }

    const presence = await this.prisma.cardPresence.findUnique({
      where: { cardId_boardId: { cardId, boardId } },
    });
    if (!presence || presence.removedAt) {
      throw new NotFoundException('Card não está vinculado a este fluxo.');
    }

    await this.prisma.cardPresence.update({
      where: { cardId_boardId: { cardId, boardId } },
      data: { removedAt: new Date() },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId,
        cardId,
        actorId: userId,
        type: 'CARD_ARCHIVED', // reusa: significa "saiu deste fluxo"
        payload: { cardId, unlinkedFromBoardId: boardId },
      },
    });

    // Desvincular um fluxo pode mudar o conjunto de presences ativas →
    // re-avalia auto-status. Ex: card era "Em andamento" no fluxo
    // desvinculado e "Finalizado" no resto → agora todas estao finais →
    // COMPLETED.
    await this.statusSync.evaluate(cardId);

    return { ok: true };
  }

  // -----------------------------------------------------------------

  private async getCardOrThrow(cardId: string, organizationId: string) {
    const card = await this.prisma.card.findUnique({ where: { id: cardId } });
    if (!card || card.organizationId !== organizationId) {
      throw new NotFoundException('Card não encontrado.');
    }
    return card;
  }

  private async resolveNeighbors(
    listId: string,
    afterCardId: string | null,
    skipCardId: string,
  ): Promise<{ beforePos: number | null; afterPos: number | null }> {
    if (afterCardId === null) {
      const first = await this.prisma.card.findFirst({
        where: { listId, isArchived: false, completedAt: null, id: { not: skipCardId } },
        orderBy: { position: 'asc' },
        select: { position: true },
      });
      return { beforePos: null, afterPos: first?.position ?? null };
    }

    const before = await this.prisma.card.findUnique({
      where: { id: afterCardId },
      select: { position: true, listId: true },
    });
    if (!before || before.listId !== listId) {
      throw new BadRequestException('Card referência não está na lista destino.');
    }

    const next = await this.prisma.card.findFirst({
      where: {
        listId,
        isArchived: false,
        completedAt: null,
        id: { not: skipCardId },
        position: { gt: before.position },
      },
      orderBy: { position: 'asc' },
      select: { position: true },
    });

    return { beforePos: before.position, afterPos: next?.position ?? null };
  }
}
