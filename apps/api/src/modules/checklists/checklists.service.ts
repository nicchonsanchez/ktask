import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ChecklistItem, Prisma, Priority } from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';
import { computeInsertPosition } from '@/common/util/position';
import { computeNextDueDate, parseRecurrence } from '@/common/util/recurrence';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { BoardAccessService } from '@/modules/boards/board-access.service';
import { EVENT_NAMES } from '@/modules/realtime/events.types';
import { NotificationsService } from '@/modules/notifications/notifications.service';

@Injectable()
export class ChecklistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BoardAccessService,
    private readonly events: EventEmitter2,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Helper: dispara notificação só se o destinatário não for o próprio
   * autor da ação (evita "você foi atribuído por você mesmo").
   * Fire-and-forget: erro na notificação não pode quebrar a operação.
   */
  private async notifyIfOther(params: {
    userId: string;
    actorId: string;
    organizationId: string;
    cardId: string;
    type: 'ASSIGNED' | 'CUSTOM';
    title: string;
    body?: string;
  }) {
    if (params.userId === params.actorId) return;
    try {
      await this.notifications.create({
        userId: params.userId,
        organizationId: params.organizationId,
        type: params.type,
        title: params.title,
        body: params.body,
        entityType: 'Card',
        entityId: params.cardId,
      });
    } catch {
      // silenciar — notificação não deve bloquear ação principal
    }
  }

  /** ----------------- Checklists ----------------- */

  async create(userId: string, tenant: TenantContext, input: { cardId: string; title: string }) {
    const card = await this.getCardOrThrow(input.cardId, tenant.organizationId);
    await this.access.assertCardAccess(userId, card.id, tenant, 'EDITOR');

    const last = await this.prisma.checklist.findFirst({
      where: { cardId: input.cardId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = computeInsertPosition(last?.position ?? null, null);

    const checklist = await this.prisma.checklist.create({
      data: { cardId: input.cardId, title: input.title, position },
      include: { items: { orderBy: { position: 'asc' } } },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: card.boardId,
        cardId: card.id,
        actorId: userId,
        type: 'CHECKLIST_CREATED',
        payload: { checklistId: checklist.id, title: checklist.title },
      },
    });

    this.events.emit(EVENT_NAMES.CARD_UPDATED, {
      boardId: card.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      cardId: card.id,
    });

    return checklist;
  }

  async update(
    userId: string,
    tenant: TenantContext,
    checklistId: string,
    input: { title: string },
  ) {
    const { checklist, card } = await this.getChecklistOrThrow(checklistId, tenant.organizationId);
    await this.access.assertCardAccess(userId, card.id, tenant, 'EDITOR');

    const renamed = input.title !== checklist.title;

    const updated = await this.prisma.checklist.update({
      where: { id: checklistId },
      data: { title: input.title },
    });

    if (renamed) {
      await this.prisma.activity.create({
        data: {
          organizationId: tenant.organizationId,
          boardId: card.boardId,
          cardId: card.id,
          actorId: userId,
          type: 'CHECKLIST_RENAMED',
          payload: { checklistId, fromTitle: checklist.title, toTitle: input.title },
        },
      });
    }

    this.events.emit(EVENT_NAMES.CARD_UPDATED, {
      boardId: card.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      cardId: card.id,
    });

    return updated;
  }

  async remove(userId: string, tenant: TenantContext, checklistId: string) {
    const { card, checklist } = await this.getChecklistOrThrow(checklistId, tenant.organizationId);
    await this.access.assertCardAccess(userId, card.id, tenant, 'EDITOR');

    await this.prisma.checklist.delete({ where: { id: checklistId } });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: card.boardId,
        cardId: card.id,
        actorId: userId,
        type: 'CHECKLIST_DELETED',
        payload: { checklistId, title: checklist.title },
      },
    });

    this.events.emit(EVENT_NAMES.CARD_UPDATED, {
      boardId: card.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      cardId: card.id,
    });

    return { ok: true };
  }

  /** ----------------- Items ----------------- */

  async addItem(
    userId: string,
    tenant: TenantContext,
    checklistId: string,
    input: {
      text: string;
      assigneeId?: string | null;
      dueDate?: string | null;
      priority?: Priority;
    },
  ) {
    const { card } = await this.getChecklistOrThrow(checklistId, tenant.organizationId);
    await this.access.assertCardAccess(userId, card.id, tenant, 'EDITOR');

    const last = await this.prisma.checklistItem.findFirst({
      where: { checklistId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = computeInsertPosition(last?.position ?? null, null);

    // Modelo unificado de roles: por padrão, quem cria a subtarefa fica
    // automaticamente como assignee. Pra criar sem assignee, passar null
    // explicitamente. Pra atribuir a outro, passar o cuid dele.
    const assigneeId = input.assigneeId === undefined ? userId : input.assigneeId;

    if (assigneeId) {
      const isMember = await this.prisma.membership.findUnique({
        where: {
          userId_organizationId: { userId: assigneeId, organizationId: tenant.organizationId },
        },
      });
      if (!isMember) {
        throw new BadRequestException('Usuário designado não pertence à organização.');
      }
    }

    const item = await this.prisma.checklistItem.create({
      data: {
        checklistId,
        text: input.text,
        position,
        assigneeId,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        priority: input.priority ?? 'NONE',
      },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: card.boardId,
        cardId: card.id,
        actorId: userId,
        type: 'CHECKLIST_ITEM_CREATED',
        payload: { itemId: item.id, checklistId, text: item.text },
      },
    });

    this.events.emit(EVENT_NAMES.CARD_UPDATED, {
      boardId: card.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      cardId: card.id,
    });

    return item;
  }

  async updateItem(
    userId: string,
    tenant: TenantContext,
    itemId: string,
    input: {
      text?: string;
      isDone?: boolean;
      dueDate?: string | null;
      assigneeId?: string | null;
      priority?: Priority;
      recurrence?: unknown;
    },
  ) {
    const { card, item } = await this.getItemOrThrow(itemId, tenant.organizationId);
    await this.access.assertCardAccess(userId, card.id, tenant, 'EDITOR');

    const isToggling = input.isDone !== undefined && input.isDone !== item.isDone;
    const isRenaming = input.text !== undefined && input.text !== item.text;
    const isReassigning = input.assigneeId !== undefined && input.assigneeId !== item.assigneeId;

    const updated = await this.prisma.checklistItem.update({
      where: { id: itemId },
      data: {
        text: input.text,
        isDone: input.isDone,
        dueDate:
          input.dueDate !== undefined
            ? input.dueDate
              ? new Date(input.dueDate)
              : null
            : undefined,
        assigneeId: input.assigneeId !== undefined ? input.assigneeId : undefined,
        priority: input.priority,
        recurrence:
          input.recurrence !== undefined ? (input.recurrence as Prisma.InputJsonValue) : undefined,
        doneAt: isToggling ? (input.isDone ? new Date() : null) : undefined,
        doneById: isToggling ? (input.isDone ? userId : null) : undefined,
      },
    });

    // Doc 49: recorrencia. Quando user marca como done (transicao false → true)
    // E o item tem recurrence + dueDate, cria nova instancia com prox data.
    // Idempotente: re-marcar pra undone NAO duplica (so dispara em false→true).
    if (isToggling && input.isDone === true) {
      await this.maybeCreateRecurrenceNext(updated, userId);
    }

    // Notificações ao responsável (assignee) — sempre que NÃO for o próprio
    // autor da ação. Cobre 4 casos: atribuído, desatribuído, concluído, editado.
    if (isReassigning) {
      if (input.assigneeId) {
        await this.notifyIfOther({
          userId: input.assigneeId,
          actorId: userId,
          organizationId: tenant.organizationId,
          cardId: card.id,
          type: 'ASSIGNED',
          title: `Tarefa atribuída: ${updated.text}`,
          body: `Você foi atribuído a uma tarefa no card "${card.title}".`,
        });
      }
      if (item.assigneeId) {
        await this.notifyIfOther({
          userId: item.assigneeId,
          actorId: userId,
          organizationId: tenant.organizationId,
          cardId: card.id,
          type: 'ASSIGNED',
          title: `Tarefa desatribuída: ${updated.text}`,
          body: `Você não está mais responsável por essa tarefa no card "${card.title}".`,
        });
      }
    }
    // Concluída: notifica o responsável atual (se não for o ator)
    if (isToggling && input.isDone && updated.assigneeId) {
      await this.notifyIfOther({
        userId: updated.assigneeId,
        actorId: userId,
        organizationId: tenant.organizationId,
        cardId: card.id,
        type: 'CUSTOM',
        title: `Tarefa concluída: ${updated.text}`,
        body: `Sua tarefa foi marcada como concluída no card "${card.title}".`,
      });
    }
    // Editada (texto): notifica o responsável atual (se não for o ator e
    // não foi reatribuída no mesmo update — evita 2 notifs simultâneas)
    if (isRenaming && !isReassigning && updated.assigneeId) {
      await this.notifyIfOther({
        userId: updated.assigneeId,
        actorId: userId,
        organizationId: tenant.organizationId,
        cardId: card.id,
        type: 'CUSTOM',
        title: `Tarefa editada: ${updated.text}`,
        body: `Sua tarefa foi atualizada no card "${card.title}".`,
      });
    }

    if (isToggling) {
      await this.prisma.activity.create({
        data: {
          organizationId: tenant.organizationId,
          boardId: card.boardId,
          cardId: card.id,
          actorId: userId,
          type: input.isDone ? 'CHECKLIST_ITEM_DONE' : 'CHECKLIST_ITEM_UNDONE',
          payload: { itemId, text: updated.text },
        },
      });

      // Doc 48: dispara eventos pra automation engine. Só na transição
      // false → true (input.isDone === true). Re-marcar como undone não
      // dispara nada (evita loops e disparos espurios).
      if (input.isDone === true) {
        this.events.emit('checklist.item.done', {
          itemId,
          checklistId: item.checklistId,
          cardId: card.id,
          listId: card.listId,
          organizationId: tenant.organizationId,
          actorId: userId,
        });

        // Se este foi o último item pendente do checklist, dispara
        // CHECKLIST_COMPLETED também.
        const remaining = await this.prisma.checklistItem.count({
          where: { checklistId: item.checklistId, isDone: false },
        });
        if (remaining === 0) {
          this.events.emit('checklist.completed', {
            checklistId: item.checklistId,
            cardId: card.id,
            listId: card.listId,
            organizationId: tenant.organizationId,
            actorId: userId,
          });
        }
      }
    }

    if (isRenaming) {
      await this.prisma.activity.create({
        data: {
          organizationId: tenant.organizationId,
          boardId: card.boardId,
          cardId: card.id,
          actorId: userId,
          type: 'CHECKLIST_ITEM_RENAMED',
          payload: { itemId, fromText: item.text, toText: updated.text },
        },
      });
    }

    this.events.emit(EVENT_NAMES.CARD_UPDATED, {
      boardId: card.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      cardId: card.id,
    });

    return updated;
  }

  async removeItem(userId: string, tenant: TenantContext, itemId: string) {
    const { card, item } = await this.getItemOrThrow(itemId, tenant.organizationId);
    await this.access.assertCardAccess(userId, card.id, tenant, 'EDITOR');

    await this.prisma.checklistItem.delete({ where: { id: itemId } });

    // Notifica responsável (se houver e não for o autor da ação)
    if (item.assigneeId) {
      await this.notifyIfOther({
        userId: item.assigneeId,
        actorId: userId,
        organizationId: tenant.organizationId,
        cardId: card.id,
        type: 'CUSTOM',
        title: `Tarefa excluída: ${item.text}`,
        body: `Uma tarefa atribuída a você foi excluída do card "${card.title}".`,
      });
    }

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: card.boardId,
        cardId: card.id,
        actorId: userId,
        type: 'CHECKLIST_ITEM_DELETED',
        payload: { itemId, text: item.text },
      },
    });

    this.events.emit(EVENT_NAMES.CARD_UPDATED, {
      boardId: card.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      cardId: card.id,
    });

    return { ok: true };
  }

  async moveItem(
    userId: string,
    tenant: TenantContext,
    itemId: string,
    input: { afterItemId: string | null; toChecklistId?: string },
  ) {
    const { card, item } = await this.getItemOrThrow(itemId, tenant.organizationId);
    await this.access.assertCardAccess(userId, card.id, tenant, 'EDITOR');

    const destChecklistId = input.toChecklistId ?? item.checklistId;
    if (destChecklistId !== item.checklistId) {
      // Valida que a destino pertence ao mesmo card
      const dest = await this.prisma.checklist.findUnique({ where: { id: destChecklistId } });
      if (!dest || dest.cardId !== card.id) {
        throw new BadRequestException('Checklist destino inválida.');
      }
    }

    const { beforePos, afterPos } = await this.resolveNeighbors(
      destChecklistId,
      input.afterItemId,
      itemId,
    );
    const position = computeInsertPosition(beforePos, afterPos);

    const updated = await this.prisma.checklistItem.update({
      where: { id: itemId },
      data: { checklistId: destChecklistId, position },
    });

    this.events.emit(EVENT_NAMES.CARD_UPDATED, {
      boardId: card.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      cardId: card.id,
    });

    return updated;
  }

  /** ----------------- Helpers ----------------- */

  private async getCardOrThrow(cardId: string, organizationId: string) {
    const card = await this.prisma.card.findUnique({ where: { id: cardId } });
    if (!card || card.organizationId !== organizationId) {
      throw new NotFoundException('Card não encontrado.');
    }
    return card;
  }

  private async getChecklistOrThrow(checklistId: string, organizationId: string) {
    const checklist = await this.prisma.checklist.findUnique({
      where: { id: checklistId },
      include: { card: true },
    });
    if (!checklist || checklist.card.organizationId !== organizationId) {
      throw new NotFoundException('Checklist não encontrada.');
    }
    return { checklist, card: checklist.card };
  }

  private async getItemOrThrow(itemId: string, organizationId: string) {
    const item = await this.prisma.checklistItem.findUnique({
      where: { id: itemId },
      include: { checklist: { include: { card: true } } },
    });
    if (!item || item.checklist.card.organizationId !== organizationId) {
      throw new NotFoundException('Item não encontrado.');
    }
    return { item, card: item.checklist.card };
  }

  private async resolveNeighbors(
    checklistId: string,
    afterItemId: string | null,
    skipItemId: string,
  ): Promise<{ beforePos: number | null; afterPos: number | null }> {
    if (afterItemId === null) {
      const first = await this.prisma.checklistItem.findFirst({
        where: { checklistId, id: { not: skipItemId } },
        orderBy: { position: 'asc' },
        select: { position: true },
      });
      return { beforePos: null, afterPos: first?.position ?? null };
    }
    const before = await this.prisma.checklistItem.findUnique({
      where: { id: afterItemId },
      select: { position: true, checklistId: true },
    });
    if (!before || before.checklistId !== checklistId) {
      throw new BadRequestException('Item referência não está na checklist destino.');
    }
    const next = await this.prisma.checklistItem.findFirst({
      where: {
        checklistId,
        id: { not: skipItemId },
        position: { gt: before.position },
      },
      orderBy: { position: 'asc' },
      select: { position: true },
    });
    return { beforePos: before.position, afterPos: next?.position ?? null };
  }

  /**
   * Doc 49: ao concluir um item com recurrence + dueDate, cria nova
   * instancia no MESMO checklist com prox dueDate. Item original permanece
   * marcado como done (vira historico). Idempotente: chamado uma vez por
   * transicao false → true. Sem dueDate ou sem recurrence → no-op.
   *
   * Se a regra ja terminou (endsAt no passado), nao cria.
   */
  private async maybeCreateRecurrenceNext(item: ChecklistItem, _actorId: string): Promise<void> {
    if (!item.dueDate || !item.recurrence) return;
    const rec = parseRecurrence(item.recurrence);
    if (!rec) return;
    const next = computeNextDueDate(item.dueDate, rec);
    if (!next) return;

    // Posiciona depois do item atual; computeInsertPosition pega o ponto
    // medio com o proximo (ou +1024 se for o ultimo).
    const after = await this.prisma.checklistItem.findFirst({
      where: { checklistId: item.checklistId, position: { gt: item.position } },
      orderBy: { position: 'asc' },
      select: { position: true },
    });
    const position = computeInsertPosition(item.position, after?.position ?? null);

    await this.prisma.checklistItem.create({
      data: {
        checklistId: item.checklistId,
        text: item.text,
        position,
        dueDate: next,
        priority: item.priority,
        assigneeId: item.assigneeId,
        recurrence: item.recurrence as Prisma.InputJsonValue,
      },
    });
  }
}
