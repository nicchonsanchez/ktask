import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Automation, AutomationRun, Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';
import { EVENT_NAMES, type CardMovedPayload } from '@/modules/realtime/events.types';

/**
 * Engine de automações — Fase B (síncrona, em-process).
 *
 * Escuta eventos do EventEmitter2 e executa automações ativas que casam
 * com o trigger. Ainda não usa BullMQ — execução acontece no mesmo
 * processo, fire-and-forget pra não bloquear a request HTTP que originou
 * o evento.
 *
 * Anti-loop: cada AutomationRun tem `chainDepth`. Se uma action dispara
 * outro evento (ex: mover card pra outra coluna que tem automação), o
 * próximo run herda chainDepth+1. Aborta acima de 5.
 *
 * Handlers implementados nesta fase:
 *   - INSERT_TAGS — adiciona tags ao card (idempotente: não duplica)
 *
 * Os outros 17 handlers entram em commits subsequentes.
 */
@Injectable()
export class AutomationsEngine {
  private readonly logger = new Logger(AutomationsEngine.name);
  private readonly MAX_CHAIN_DEPTH = 5;

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(EVENT_NAMES.CARD_MOVED, { async: true })
  async onCardMoved(payload: CardMovedPayload) {
    // Dispara automações dos dois lados: CARD_LEFT na origem + CARD_ENTERED no destino
    await Promise.all([
      this.dispatchTrigger({
        listId: payload.fromListId,
        trigger: 'CARD_LEFT',
        cardId: payload.cardId,
        organizationId: payload.organizationId,
        chainDepth: 0,
      }),
      this.dispatchTrigger({
        listId: payload.toListId,
        trigger: 'CARD_ENTERED',
        cardId: payload.cardId,
        organizationId: payload.organizationId,
        chainDepth: 0,
      }),
    ]);
  }

  /**
   * Busca automações ativas pra (listId, trigger) e dispara cada uma.
   * Usado tanto pelo listener acima quanto recursivamente pelas actions
   * que disparam novos eventos.
   */
  async dispatchTrigger(params: {
    listId: string;
    trigger: 'CARD_ENTERED' | 'CARD_LEFT';
    cardId: string;
    organizationId: string;
    chainDepth: number;
  }) {
    if (params.chainDepth > this.MAX_CHAIN_DEPTH) {
      this.logger.warn(
        `chainDepth ${params.chainDepth} excedido — abortando dispatch (cardId=${params.cardId})`,
      );
      return;
    }

    const automations = await this.prisma.automation.findMany({
      where: {
        listId: params.listId,
        trigger: params.trigger,
        isActive: true,
        organizationId: params.organizationId,
      },
    });

    for (const automation of automations) {
      await this.executeAutomation(automation, params.cardId, params.chainDepth);
    }
  }

  /**
   * Cria uma AutomationRun, dispatcha pro handler certo, atualiza status
   * com base no resultado. Erros não propagam (engine é fire-and-forget).
   */
  private async executeAutomation(
    automation: Automation,
    cardId: string,
    chainDepth: number,
  ): Promise<AutomationRun> {
    const run = await this.prisma.automationRun.create({
      data: {
        automationId: automation.id,
        cardId,
        chainDepth,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    try {
      const result = await this.routeAction(automation, cardId);
      return await this.prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status: 'SUCCESS',
          finishedAt: new Date(),
          result: (result ?? null) as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Automation ${automation.id} falhou em card ${cardId}: ${message}`);
      return this.prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          error: message,
        },
      });
    }
  }

  private async routeAction(
    automation: Automation,
    cardId: string,
  ): Promise<Record<string, unknown> | null> {
    switch (automation.actionType) {
      case 'INSERT_TAGS':
        return this.handleInsertTags(automation, cardId);

      // Handlers ainda não implementados — Fase C
      case 'REMOVE_TAGS':
      case 'INSERT_CHECKLIST_ITEMS':
      case 'INSERT_CHECKLIST_GROUP':
      case 'SET_CARD_STATUS':
      case 'FILL_FIELDS':
      case 'SAVE_DESCRIPTION_VERSION':
      case 'SET_LEAD':
      case 'ADD_TEAM':
      case 'POST_COMMENT':
      case 'CREATE_CHILD_CARD':
      case 'SEND_EMAIL':
      case 'SEND_WHATSAPP':
      case 'LINK_FLOW':
      case 'UNLINK_FLOW':
      case 'UPDATE_FLOW_POSITION':
      case 'FLAG_DUE_TODAY':
      case 'FLAG_OVERDUE':
        // Marca como SKIPPED — automação foi configurada mas handler não existe
        await this.prisma.automationRun.updateMany({
          where: { automationId: automation.id, status: 'RUNNING' },
          data: { status: 'SKIPPED' },
        });
        return { skipped: true, reason: `Handler ${automation.actionType} ainda não implementado` };
    }
  }

  // ---------------- Handlers ----------------

  private async handleInsertTags(
    automation: Automation,
    cardId: string,
  ): Promise<{ tagsAdded: string[] }> {
    const config = automation.actionConfig as { tagIds?: string[] };
    const tagIds = Array.isArray(config.tagIds) ? config.tagIds : [];
    if (tagIds.length === 0) {
      return { tagsAdded: [] };
    }

    // Valida que as tags existem no mesmo board do card
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: { boardId: true, organizationId: true },
    });
    if (!card) return { tagsAdded: [] };

    const validLabels = await this.prisma.label.findMany({
      where: {
        id: { in: tagIds },
        OR: [{ boardId: card.boardId }, { boardId: null }],
        organizationId: card.organizationId,
      },
      select: { id: true },
    });
    const validIds = validLabels.map((l) => l.id);
    if (validIds.length === 0) return { tagsAdded: [] };

    // createMany skipDuplicates evita inserir labels que já estão no card
    await this.prisma.cardLabel.createMany({
      data: validIds.map((labelId) => ({ cardId, labelId })),
      skipDuplicates: true,
    });

    return { tagsAdded: validIds };
  }
}
