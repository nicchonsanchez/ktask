import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import type {
  Automation,
  AutomationActionType,
  AutomationRun,
  AutomationTrigger,
  Priority,
} from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';
import { computeInsertPosition } from '@/common/util/position';
import { createCardWithPresence } from '@/modules/cards/helpers/create-card-with-presence';
import { CardStatusSyncService } from '@/modules/cards/card-status-sync';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { EVENT_NAMES } from '@/modules/realtime/events.types';
import { WhatsAppHelper } from '@/modules/whatsapp/whatsapp.helper';
import { evaluateConditions, type AutomationCondition } from './condition.types';
import { AutomationsOutboxService } from './automations.outbox.service';

/**
 * Event emitido por ApprovalsService quando uma aprovação é decidida.
 * Constante duplicada (em vez de import) pra evitar acoplamento circular
 * entre AutomationsModule e ApprovalsModule.
 */
const APPROVAL_DECIDED_EVENT = 'approval.decided';

interface ApprovalDecidedPayload {
  approvalId: string;
  cardId: string;
  organizationId: string;
  boardId: string;
  listId: string;
  decidedById: string | null;
  status: 'APPROVED' | 'REJECTED';
}

/**
 * Engine de automações — Fase C (outbox-driven).
 *
 * **Mudança 2026-05**: deixou de escutar `@OnEvent` pra eventos de
 * automação (CARD_CREATED, CARD_MOVED, checklist.*). O trigger agora é
 * persistido na MESMA transação que altera o card/checklist, via
 * AutomationsOutboxService. Worker (cron @5s) processa a outbox com
 * retry+backoff. Resolve a perda de evento que acontecia quando o
 * processo morria entre `events.emit` e o handler async.
 *
 * Único `@OnEvent` que sobrou: `APPROVAL_DECIDED` — segue síncrono
 * porque depende de anexar runIds em CardApproval.sideEffects pro undo
 * (correlação que ficaria feia via outbox). Risco aceitável: aprovação
 * decidida é raro o suficiente pra crash mid-flight ser desprezível.
 *
 * Anti-loop: cada AutomationRun tem `chainDepth`. Handlers que disparam
 * eventos novos (MOVE_CARD, CREATE_CHILD_CARD) enfileiram na outbox com
 * chainDepth+1. Aborta acima de MAX_CHAIN_DEPTH.
 */
@Injectable()
export class AutomationsEngine {
  private readonly logger = new Logger(AutomationsEngine.name);
  private readonly MAX_CHAIN_DEPTH = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly whatsapp: WhatsAppHelper,
    private readonly statusSync: CardStatusSyncService,
    private readonly notifications: NotificationsService,
    // forwardRef pra quebrar ciclo Engine ↔ Outbox.
    @Inject(forwardRef(() => AutomationsOutboxService))
    private readonly outbox: AutomationsOutboxService,
  ) {}

  /**
   * Listener pra aprovações decididas. Dispara CARD_APPROVED ou
   * CARD_REJECTED conforme o status. Usa a `listId` atual do card no
   * momento da decisão (que pode ter sido ajustada pelo move automático
   * do default). Os AutomationRun.id resultantes são gravados em
   * CardApproval.sideEffects pra que o undo possa reverter ações
   * automáticas que rodaram em cadeia.
   */
  @OnEvent(APPROVAL_DECIDED_EVENT, { async: true })
  async onApprovalDecided(payload: ApprovalDecidedPayload) {
    const trigger: AutomationTrigger =
      payload.status === 'APPROVED' ? 'CARD_APPROVED' : 'CARD_REJECTED';

    const runIds = await this.dispatchTrigger({
      listId: payload.listId,
      trigger,
      cardId: payload.cardId,
      organizationId: payload.organizationId,
      chainDepth: 0,
    });

    if (runIds && runIds.length > 0) {
      // Anexa os run IDs ao sideEffects da aprovação (preservando o resto).
      await this.appendAutomationRunsToApproval(payload.approvalId, runIds);
    }
  }

  private async appendAutomationRunsToApproval(approvalId: string, runIds: string[]) {
    const approval = await this.prisma.cardApproval.findUnique({
      where: { id: approvalId },
      select: { sideEffects: true },
    });
    if (!approval) return;
    const current = ((approval.sideEffects ?? {}) as { automationRunIds?: string[] }) || {};
    const merged = {
      ...current,
      automationRunIds: [...(current.automationRunIds ?? []), ...runIds],
    };
    await this.prisma.cardApproval.update({
      where: { id: approvalId },
      data: { sideEffects: merged as unknown as Prisma.InputJsonValue },
    });
  }

  // checklist.item.done e checklist.completed agora enfileiram direto no
  // outbox via ChecklistsService.updateChecklistItem (mesma TXN da
  // mudança). Listeners @OnEvent foram removidos em 2026-05.

  /**
   * Busca automações ativas pra (escopo, trigger) e dispara cada uma.
   * Escopo pode ser uma lista (CARD_ENTERED/LEFT), um checklist
   * (CHECKLIST_COMPLETED) ou um item (CHECKLIST_ITEM_DONE).
   * Retorna os IDs dos AutomationRun criados.
   */
  async dispatchTrigger(params: {
    trigger: AutomationTrigger;
    cardId: string;
    organizationId: string;
    chainDepth: number;
    listId?: string;
    scope?: { kind: 'list' | 'checklist' | 'checklistItem'; id: string };
  }): Promise<string[]> {
    if (params.chainDepth > this.MAX_CHAIN_DEPTH) {
      this.logger.warn(
        `chainDepth ${params.chainDepth} excedido — abortando dispatch (cardId=${params.cardId})`,
      );
      return [];
    }

    // Backward-compat: aceita params.listId direto OU params.scope.
    const scope =
      params.scope ?? (params.listId ? { kind: 'list' as const, id: params.listId } : null);
    if (!scope) {
      this.logger.warn(`dispatchTrigger sem escopo (cardId=${params.cardId})`);
      return [];
    }

    const scopeWhere =
      scope.kind === 'list'
        ? { listId: scope.id }
        : scope.kind === 'checklist'
          ? { scopeChecklistId: scope.id }
          : { scopeChecklistItemId: scope.id };

    const automations = await this.prisma.automation.findMany({
      where: {
        ...scopeWhere,
        trigger: params.trigger,
        isActive: true,
        organizationId: params.organizationId,
      },
    });

    const runIds: string[] = [];
    for (const automation of automations) {
      const run = await this.executeAutomation(automation, params.cardId, params.chainDepth);
      runIds.push(run.id);
    }
    return runIds;
  }

  /**
   * Versão pública usada pelo scheduler de triggers temporais
   * (TIME_IN_LIST, TIME_NO_INTERACTION, DUE_DATE_TODAY, DUE_DATE_OVERDUE).
   * O scheduler já filtra qual automação roda em qual card — aqui só
   * delegamos pra executeAutomation com chainDepth=0.
   */
  async executeAutomationDirect(automation: Automation, cardId: string): Promise<AutomationRun> {
    return this.executeAutomation(automation, cardId, 0);
  }

  /**
   * Versão pública usada pelo AutomationsOutboxService. Diferença vs
   * `executeAutomationDirect`: LANÇA exceção se o run terminar em
   * FAILED — assim a outbox sabe que precisa reagendar pra retry.
   * `SUCCESS` e `SKIPPED` retornam normal (sucesso final, não retentar).
   */
  async executeFromOutbox(
    automation: Automation,
    cardId: string,
    chainDepth: number,
  ): Promise<AutomationRun> {
    const run = await this.executeAutomation(automation, cardId, chainDepth);
    if (run.status === 'FAILED') {
      throw new Error(run.error ?? 'Automação falhou sem mensagem de erro.');
    }
    return run;
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

    // Avalia configuracao condicional ANTES da action. Se nao passar,
    // marca run como SKIPPED e nao chama o handler. Conditions null/vazio
    // = automacao sempre roda (default).
    const conditions = automation.conditions as AutomationCondition[] | null | undefined;
    if (conditions && Array.isArray(conditions) && conditions.length > 0) {
      const cardForEval = await this.prisma.card.findUnique({
        where: { id: cardId },
        select: {
          leadId: true,
          dueDate: true,
          labels: { select: { labelId: true } },
          // Empresas vinculadas ao card: contatos do tipo COMPANY ligados via
          // CardContact (auto-link da empresa-pai ja garante presenca quando
          // uma pessoa daquela empresa e adicionada). Avaliado pela condicao
          // CompanyCondition em condition.types.
          contacts: {
            where: { contact: { type: 'COMPANY' } },
            select: { contactId: true },
          },
        },
      });
      const passes = cardForEval ? evaluateConditions(cardForEval, conditions) : false;
      if (!passes) {
        return this.prisma.automationRun.update({
          where: { id: run.id },
          data: {
            status: 'SKIPPED',
            finishedAt: new Date(),
            error: 'Condições não atendidas',
          },
        });
      }
    }

    try {
      const result = await this.routeAction(automation, cardId, chainDepth);
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
    chainDepth: number,
  ): Promise<Record<string, unknown> | null> {
    switch (automation.actionType) {
      case 'INSERT_TAGS':
        return this.handleInsertTags(automation, cardId);
      case 'REMOVE_TAGS':
        return this.handleRemoveTags(automation, cardId);
      case 'INSERT_CHECKLIST_ITEMS':
        return this.handleInsertChecklistItems(automation, cardId);
      case 'SET_LEAD':
        return this.handleSetLead(automation, cardId);
      case 'ADD_TEAM':
        return this.handleAddTeam(automation, cardId);
      case 'POST_COMMENT':
        return this.handlePostComment(automation, cardId);
      case 'SET_CARD_STATUS':
        return this.handleSetCardStatus(automation, cardId);
      case 'CREATE_CHILD_CARD':
        return this.handleCreateChildCard(automation, cardId, chainDepth);
      case 'INSERT_CHECKLIST_GROUP':
        return this.handleInsertChecklistGroup(automation, cardId);
      case 'UPDATE_FLOW_POSITION':
        return this.handleUpdateFlowPosition(automation, cardId);
      case 'MOVE_CARD':
        return this.handleMoveCard(automation, cardId, chainDepth);
      case 'SEND_WHATSAPP':
        return this.handleSendWhatsApp(automation, cardId);
      case 'SET_PRIVACY':
        return this.handleSetPrivacy(automation, cardId);
      case 'FLAG_OVERDUE':
      case 'FLAG_DUE_TODAY':
        return this.handleFlag(automation, cardId);
      case 'SEND_EMAIL':
        return this.handleSendEmail(automation, cardId);

      // Handlers ainda não implementados
      case 'FILL_FIELDS':
      case 'SAVE_DESCRIPTION_VERSION':
      case 'LINK_FLOW':
      case 'UNLINK_FLOW':
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
    const result = await this.prisma.cardLabel.createMany({
      data: validIds.map((labelId) => ({ cardId, labelId })),
      skipDuplicates: true,
    });

    // Yellow fix: sem CARD_UPDATED, etiquetas adicionadas via automacao so
    // apareciam pro user que abriu a pagina depois — quem ja estava com o
    // board aberto via UI dessincronizada. Emit so se algo realmente entrou.
    if (result.count > 0) {
      this.events.emit(EVENT_NAMES.CARD_UPDATED, {
        boardId: card.boardId,
        organizationId: card.organizationId,
        actorId: automation.createdById,
        cardId,
      });
    }

    return { tagsAdded: validIds };
  }

  /**
   * REMOVE_TAGS — remove etiquetas do card. Idempotente: deleteMany sem
   * erro se a label nem estiver no card.
   */
  private async handleRemoveTags(
    automation: Automation,
    cardId: string,
  ): Promise<{ tagsRemoved: string[]; deletedCount: number }> {
    const config = automation.actionConfig as { tagIds?: string[] };
    const tagIds = Array.isArray(config.tagIds) ? config.tagIds : [];
    if (tagIds.length === 0) return { tagsRemoved: [], deletedCount: 0 };

    const result = await this.prisma.cardLabel.deleteMany({
      where: { cardId, labelId: { in: tagIds } },
    });

    // Yellow fix: mesmo motivo do handleInsertTags — sem evento, remocao
    // via automacao nao chegava em tempo real no front. So emite se houve
    // delecao real (idempotencia: 0 deletados = nada mudou).
    if (result.count > 0) {
      const card = await this.prisma.card.findUnique({
        where: { id: cardId },
        select: { boardId: true, organizationId: true },
      });
      if (card) {
        this.events.emit(EVENT_NAMES.CARD_UPDATED, {
          boardId: card.boardId,
          organizationId: card.organizationId,
          actorId: automation.createdById,
          cardId,
        });
      }
    }

    return { tagsRemoved: tagIds, deletedCount: result.count };
  }

  /**
   * INSERT_CHECKLIST_ITEMS — cria itens em um checklist do card. Se o
   * card não tiver checklist com o título passado, cria. Senão, anexa
   * os items novos no fim do checklist existente.
   *
   * Sem idempotência de texto: cada execução SEMPRE cria todos os items
   * configurados, mesmo se já houver item com mesmo texto no checklist
   * (criado por execução anterior, manualmente ou via import). Decisão
   * tomada após relato de items pulados silenciosamente confundindo o
   * usuário ("tarefa não criou"). Trade-off: aceitar duplicatas visíveis
   * em vez de pulos silenciosos.
   *
   * Suporta atribuir responsavel/prazo/prioridade a TODOS os items
   * criados nessa execucao (1 valor por automacao, nao por item — match
   * com o caso de uso dominante do Ummense).
   */
  private async handleInsertChecklistItems(
    automation: Automation,
    cardId: string,
  ): Promise<{ checklistId: string; itemsAdded: number; itemsSkipped: number }> {
    const config = automation.actionConfig as ChecklistItemsActionConfig;
    const parsedItems = parseChecklistItemsConfig(config);
    if (parsedItems.length === 0) return { checklistId: '', itemsAdded: 0, itemsSkipped: 0 };

    const title = config.checklistTitle?.trim() || 'Tarefas';

    // Procura checklist com mesmo título no card. Se não existir, cria.
    let checklist = await this.prisma.checklist.findFirst({
      where: { cardId, title },
      select: { id: true, position: true },
    });
    if (!checklist) {
      const last = await this.prisma.checklist.findFirst({
        where: { cardId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      checklist = await this.prisma.checklist.create({
        data: {
          cardId,
          title,
          position: computeInsertPosition(last?.position ?? null, null),
        },
        select: { id: true, position: true },
      });
    }

    const cardCtx = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: { boardId: true, organizationId: true },
    });

    // Sub-automacao da LISTA:
    // - Quando o checklist foi recem-criado nessa execucao → cria.
    // - Quando o checklist ja existia → so cria se ainda nao tem
    //   sub-automation com scopeChecklistId = checklist.id (idempotente).
    //   Isso resolve o caso "configurei listAutomation depois e o
    //   checklist ja existia no card".
    if (cardCtx && isValidNestedAutomation(config.listAutomation, 'list')) {
      const existingListAuto = await this.prisma.automation.findFirst({
        where: { scopeChecklistId: checklist.id },
        select: { id: true },
      });
      if (!existingListAuto) {
        await this.createNestedChecklistAutomation({
          parent: automation,
          cfg: config.listAutomation,
          scope: 'list',
          targetId: checklist.id,
          boardId: cardCtx.boardId,
          organizationId: cardCtx.organizationId,
        });
      }
    }

    const itemsToCreate = parsedItems;
    const itemsSkipped = 0;

    // Resolve defaults globais da automacao 1x (usados como fallback per-item).
    const globalDefaults = await this.resolveChecklistItemDefaults(cardId, config);

    // Última posição dos items existentes — pra apender com espaçamento
    // padrão (POSITION_STEP) entre cada novo item.
    const lastItem = await this.prisma.checklistItem.findFirst({
      where: { checklistId: checklist.id },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    let basePos = computeInsertPosition(lastItem?.position ?? null, null);

    const rows: Prisma.ChecklistItemCreateManyInput[] = [];
    const itemsHaveAutomation = itemsToCreate.some((it) =>
      isValidNestedAutomation(it.itemAutomation, 'item'),
    );

    for (const item of itemsToCreate) {
      const r = hasItemSpecificConfig(item)
        ? await this.resolveChecklistItemDefaults(cardId, item)
        : globalDefaults;
      rows.push({
        checklistId: checklist.id,
        text: item.text,
        position: basePos,
        ...(r.assigneeId ? { assigneeId: r.assigneeId } : {}),
        ...(r.dueDate ? { dueDate: r.dueDate } : {}),
        ...(r.priority ? { priority: r.priority } : {}),
        ...(r.recurrence ? { recurrence: r.recurrence as Prisma.InputJsonValue } : {}),
      });
      basePos = computeInsertPosition(basePos, null);
    }

    // Trackeia ids dos items recem-criados pra notificar assignees em
    // batch depois (consistente entre os 2 caminhos abaixo).
    const createdIds: string[] = [];

    if (!itemsHaveAutomation || !cardCtx) {
      // createManyAndReturn (Prisma 6+) — devolve IDs sem refetch.
      const justCreated = await this.prisma.checklistItem.createManyAndReturn({
        data: rows,
        select: { id: true },
      });
      createdIds.push(...justCreated.map((i) => i.id));
    } else {
      // Caminho com sub-automacao por item — 1 INSERT por item pra ter ID.
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const itemCfg = itemsToCreate[i]!;
        const created = await this.prisma.checklistItem.create({ data: row });
        createdIds.push(created.id);
        if (isValidNestedAutomation(itemCfg.itemAutomation, 'item')) {
          await this.createNestedChecklistAutomation({
            parent: automation,
            cfg: itemCfg.itemAutomation,
            scope: 'item',
            targetId: created.id,
            boardId: cardCtx.boardId,
            organizationId: cardCtx.organizationId,
          });
        }
      }
    }

    if (createdIds.length > 0) {
      await this.notifyAssigneesOfActiveItems(automation, cardId, createdIds);
    }

    // Emite CARD_UPDATED quando items novos foram criados pra RealtimeGateway
    // fazer broadcast Socket.IO. Sem isso o frontend so ve a mudanca apos F5.
    if (cardCtx && rows.length > 0) {
      this.events.emit(EVENT_NAMES.CARD_UPDATED, {
        boardId: cardCtx.boardId,
        organizationId: cardCtx.organizationId,
        actorId: automation.createdById,
        cardId,
      });
    }

    return { checklistId: checklist.id, itemsAdded: rows.length, itemsSkipped };
  }

  /**
   * Notifica assignees de items de checklist criados via automacao.
   * Mesmo padrao do checklists.service.notifyIfOther: pula se o
   * destinatario eh o proprio createdById da automacao. Fire-and-forget —
   * erro nao bloqueia a execucao.
   */
  private async notifyAssigneesOfActiveItems(
    automation: Automation,
    cardId: string,
    itemIds: string[],
  ): Promise<void> {
    try {
      const [card, items] = await Promise.all([
        this.prisma.card.findUnique({
          where: { id: cardId },
          select: { title: true, organizationId: true },
        }),
        this.prisma.checklistItem.findMany({
          where: { id: { in: itemIds }, assigneeId: { not: null } },
          select: { text: true, assigneeId: true },
        }),
      ]);
      if (!card || items.length === 0) return;

      const rows = items
        .filter((it) => it.assigneeId && it.assigneeId !== automation.createdById)
        .map((it) => ({
          userId: it.assigneeId as string,
          organizationId: card.organizationId,
          type: 'ASSIGNED' as const,
          title: `Tarefa atribuída: ${it.text}`,
          body: `Você foi atribuído a uma tarefa no card "${card.title}".`,
          entityType: 'card',
          entityId: cardId,
          // Mesmo evento canonico de checklists.service — gated por pref do
          // user + envio WhatsApp (urgente, 2min) quando opt-in.
          eventKey: 'task_assigned' as const,
          whatsappPayload: { cardTitle: card.title, cardId, taskText: it.text },
        }));

      if (rows.length > 0) {
        // Usa NotificationsService.createMany em vez de prisma direto — alem
        // do INSERT, dispara push em batch (fire-and-forget) via PushService.
        // Equipara o caminho automatico ao caminho manual (ChecklistsService).
        await this.notifications.createMany(rows);
      }
    } catch (err) {
      this.logger.warn(
        `[notifyAssignees] falhou pra automation=${automation.id} card=${cardId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Cria uma sub-automacao em cascata (listAutomation ou itemAutomation
   * de um INSERT_CHECKLIST_GROUP/ITEMS). Reusa createdById e
   * organizationId/boardId da automacao-pai pra manter rastreabilidade.
   *
   * `scope` define em qual coluna FK vai o registro:
   *   - 'list' → scopeChecklistId, trigger CHECKLIST_COMPLETED
   *   - 'item' → scopeChecklistItemId, trigger CHECKLIST_ITEM_DONE
   *
   * Best-effort: erros de validacao no actionConfig nao quebram a
   * execucao da automacao-pai — soh logam o problema. A sub-automacao
   * que falhar criacao simplesmente nao existira (user pode adicionar
   * manualmente depois).
   */
  private async createNestedChecklistAutomation(params: {
    parent: Automation;
    cfg: NestedChecklistAutomation;
    scope: 'list' | 'item';
    targetId: string; // checklist.id ou checklistItem.id
    boardId: string;
    organizationId: string;
  }): Promise<void> {
    const { parent, cfg, scope, targetId, boardId, organizationId } = params;
    try {
      await this.prisma.automation.create({
        data: {
          organizationId,
          boardId,
          ...(scope === 'list'
            ? { scopeChecklistId: targetId }
            : { scopeChecklistItemId: targetId }),
          trigger: cfg.trigger,
          triggerConfig: (cfg.triggerConfig ?? {}) as Prisma.InputJsonValue,
          actionType: cfg.actionType as AutomationActionType,
          actionConfig: (cfg.actionConfig ?? {}) as Prisma.InputJsonValue,
          conditions:
            cfg.conditions == null ? Prisma.JsonNull : (cfg.conditions as Prisma.InputJsonValue),
          label: cfg.label ?? null,
          isActive: true,
          createdById: parent.createdById,
        },
      });
    } catch (err) {
      this.logger.warn(
        `[nested-automation] falhou criar sub-automacao ${scope}=${targetId} (parent=${parent.id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Resolve os defaults (assignee/dueDate/priority) que vao ser aplicados
   * em todos os items criados por uma execucao de INSERT_CHECKLIST_ITEMS
   * ou INSERT_CHECKLIST_GROUP. Lookups silenciosos: se algo nao for
   * resolvivel (ex: card sem lider quando mode=CARD_LEAD), cai pra null
   * sem quebrar a execucao.
   */
  private async resolveChecklistItemDefaults(
    cardId: string,
    config: ChecklistDefaultsConfig,
  ): Promise<{
    assigneeId: string | null;
    dueDate: Date | null;
    priority: Priority | null;
    recurrence: Record<string, unknown> | null;
  }> {
    // ---- assignee ----
    let assigneeId: string | null = null;
    if (config.assigneeMode === 'CARD_LEAD') {
      const card = await this.prisma.card.findUnique({
        where: { id: cardId },
        select: { leadId: true },
      });
      assigneeId = card?.leadId ?? null;
    } else if (config.assigneeMode === 'SPECIFIC_USER' && config.assigneeUserId) {
      assigneeId = config.assigneeUserId;
    }

    // ---- dueDate ----
    // OFFSET_FROM_NOW deve produzir "dia X as 00:00 BRT", nao "agora + X dias"
    // com hora/min/seg do momento da execucao. A UI manda apenas o numero
    // de dias (sem hora); copiar o relogio da execucao polui a coluna Prazo
    // com horarios aleatorios tipo "19:15" — queixa relatada por usuario.
    // OFFSET_FROM_CARD_DUE preserva o horario do card pai (se o card tem
    // hora explicita, a tarefa "vence junto" naquele horario).
    let dueDate: Date | null = null;
    const DAY = 24 * 60 * 60 * 1000;
    if (config.dueMode === 'OFFSET_FROM_CARD_DUE' && typeof config.dueOffsetDays === 'number') {
      const card = await this.prisma.card.findUnique({
        where: { id: cardId },
        select: { dueDate: true },
      });
      if (card?.dueDate) dueDate = new Date(card.dueDate.getTime() + config.dueOffsetDays * DAY);
    } else if (config.dueMode === 'OFFSET_FROM_NOW' && typeof config.dueOffsetDays === 'number') {
      const base = startOfDayBRT(new Date());
      dueDate = new Date(base.getTime() + config.dueOffsetDays * DAY);
    } else if (config.dueMode === 'FIXED_DATE' && config.dueDate) {
      const parsed = new Date(config.dueDate);
      if (!Number.isNaN(parsed.getTime())) dueDate = parsed;
    }

    // ---- priority ----
    // Cast direto pro enum do Prisma — schema do actionConfig restringe
    // aos 5 valores validos (NONE/LOW/MEDIUM/HIGH/URGENT).
    const priority =
      config.itemPriority && config.itemPriority !== 'NONE'
        ? (config.itemPriority as Priority)
        : null;

    // ---- recurrence ----
    // Shape vem do front (TaskRecurrence). Persiste como Json — validacao forte
    // do payload acontece no momento de aplicar a recorrencia (item completed).
    const recurrence =
      config.itemRecurrence && typeof config.itemRecurrence === 'object'
        ? (config.itemRecurrence as Record<string, unknown>)
        : null;

    return { assigneeId, dueDate, priority, recurrence };
  }

  /**
   * SET_LEAD — define o líder do card. Suporta replaceMode pra ditar
   * o que fazer quando o card já tem líder (ver Ummense):
   *
   *   - MOVE_TO_TEAM (default): substitui líder atual e mantém o antigo
   *     na equipe (CardMember).
   *   - REMOVE_FROM_TEAM: substitui líder atual e remove o antigo da
   *     equipe.
   *   - KEEP_IF_HAS_LEAD: se já tem líder, não faz nada (skip).
   *
   * Sempre valida que o novo líder é membro da Org e faz upsert em
   * CardMember pro novo líder.
   */
  private async handleSetLead(
    automation: Automation,
    cardId: string,
  ): Promise<{ leadId: string | null; skipped?: boolean; removedFromTeam?: string }> {
    const config = automation.actionConfig as {
      userId?: string;
      replaceMode?: 'MOVE_TO_TEAM' | 'REMOVE_FROM_TEAM' | 'KEEP_IF_HAS_LEAD';
    };
    if (!config.userId) return { leadId: null };
    const replaceMode = config.replaceMode ?? 'MOVE_TO_TEAM';

    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: { organizationId: true, boardId: true, leadId: true },
    });
    if (!card) return { leadId: null };

    if (replaceMode === 'KEEP_IF_HAS_LEAD' && card.leadId) {
      return { leadId: card.leadId, skipped: true };
    }

    // Idempotente — se ja eh o lead atual, nao mexe (evita Activity ruidosa).
    if (card.leadId === config.userId) {
      return { leadId: config.userId, skipped: true };
    }

    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: config.userId,
          organizationId: card.organizationId,
        },
      },
    });
    if (!membership) {
      throw new Error('Usuário alvo não é membro da organização.');
    }

    const previousLeadId = card.leadId;
    let removedFromTeam: string | undefined;
    if (replaceMode === 'REMOVE_FROM_TEAM' && previousLeadId && previousLeadId !== config.userId) {
      await this.prisma.cardMember.deleteMany({
        where: { cardId, userId: previousLeadId },
      });
      removedFromTeam = previousLeadId;
    }

    await this.prisma.card.update({
      where: { id: cardId },
      data: { leadId: config.userId },
    });
    await this.prisma.cardMember.upsert({
      where: { cardId_userId: { cardId, userId: config.userId } },
      update: {},
      create: { cardId, userId: config.userId },
    });

    // BUG FIX: handler nao gravava Activity nem emitia CARD_UPDATED. Resultado:
    // troca de lider via automacao acontecia "silenciosa" — sem registro no
    // historico do card e sem realtime pro front (clientes ficavam com o lead
    // antigo ate F5). Cards.service ja faz isso no caminho manual (CARD_LEAD_CHANGED).
    await this.prisma.activity.create({
      data: {
        organizationId: card.organizationId,
        boardId: card.boardId,
        cardId,
        actorId: automation.createdById,
        type: 'CARD_LEAD_CHANGED',
        payload: {
          fromUserId: previousLeadId,
          toUserId: config.userId,
          via: 'automation',
          automationId: automation.id,
          ...(removedFromTeam ? { removedFromTeam } : {}),
        } as unknown as Prisma.InputJsonValue,
      },
    });

    this.events.emit(EVENT_NAMES.CARD_UPDATED, {
      boardId: card.boardId,
      organizationId: card.organizationId,
      actorId: automation.createdById,
      cardId,
    });

    return { leadId: config.userId, ...(removedFromTeam ? { removedFromTeam } : {}) };
  }

  /**
   * ADD_TEAM — adiciona N usuários como membros do card. Filtra pra
   * apenas membros válidos da Org. Idempotente.
   */
  private async handleAddTeam(
    automation: Automation,
    cardId: string,
  ): Promise<{ membersAdded: string[] }> {
    const config = automation.actionConfig as { userIds?: string[] };
    const userIds = Array.isArray(config.userIds) ? config.userIds : [];
    if (userIds.length === 0) return { membersAdded: [] };

    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: { organizationId: true, boardId: true },
    });
    if (!card) return { membersAdded: [] };

    const memberships = await this.prisma.membership.findMany({
      where: {
        userId: { in: userIds },
        organizationId: card.organizationId,
      },
      select: { userId: true },
    });
    const validIds = memberships.map((m) => m.userId);
    if (validIds.length === 0) return { membersAdded: [] };

    const result = await this.prisma.cardMember.createMany({
      data: validIds.map((userId) => ({ cardId, userId })),
      skipDuplicates: true,
    });

    // Yellow fix: sem CARD_UPDATED, novos membros so apareciam no card depois
    // de F5. Tambem deixa o `realtime` cobrir o caso comum de "automacao
    // adicionou Fulano ao time" sem precisar de polling.
    if (result.count > 0) {
      this.events.emit(EVENT_NAMES.CARD_UPDATED, {
        boardId: card.boardId,
        organizationId: card.organizationId,
        actorId: automation.createdById,
        cardId,
      });
    }

    return { membersAdded: validIds };
  }

  /**
   * POST_COMMENT — cria um Comment automático no card a partir de
   * template Mustache simples. Variáveis suportadas:
   *   {{card.title}} {{card.list.name}} {{card.board.name}}
   *   {{actor.name}}  (= criador da automação)
   *
   * O autor do comment é o `createdBy` da automação. Body é plainText
   * (sem rich text por enquanto — simplifica e bate com MentionTextarea
   * que continua sendo a UI de comments).
   */
  private async handlePostComment(
    automation: Automation,
    cardId: string,
  ): Promise<{ commentId: string; mentionedUserIds: string[] }> {
    const config = automation.actionConfig as { template?: string };
    const template = config.template?.trim();
    if (!template) throw new Error('Template do comentário vazio.');

    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      include: {
        list: { select: { name: true } },
        board: { select: { name: true } },
      },
    });
    if (!card) throw new Error('Card não encontrado.');

    const actor = await this.prisma.user.findUnique({
      where: { id: automation.createdById },
      select: { name: true },
    });

    const text = renderTemplate(template, {
      'card.title': card.title,
      'card.list.name': card.list.name,
      'card.board.name': card.board.name,
      'actor.name': actor?.name ?? 'Automação',
    });

    // Resolve menções @handle no texto renderizado, igual ao CommentsService.
    // Bate com a parte antes do @ do email do user na Org.
    const mentionUserIds = await this.resolveMentionsInText(text, card.organizationId);

    // Guarda como ProseMirror doc simples (1 paragraph com o texto)
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    };

    const comment = await this.prisma.comment.create({
      data: {
        cardId,
        authorId: automation.createdById,
        body: doc as unknown as Prisma.InputJsonValue,
        mentions: mentionUserIds,
      },
    });

    // Cria notificações MENTION pra cada user mencionado (exceto o autor
    // da automação, que aqui é o "remetente" do comment).
    //
    // Yellow fix: antes chamava prisma.notification.createMany direto,
    // bypassando NotificationsService — eventKey/preferencias/quiet hours/
    // WhatsApp Outbox/caps anti-block NAO eram aplicados. Resultado: user
    // que desativou 'mention_comment' nas preferencias continuava recebendo
    // ping via automacao. Agora unifica com CommentsService (eventKey =
    // mention_comment, urgente -> WhatsApp opt-in respeita pref).
    if (mentionUserIds.length > 0) {
      const targets = mentionUserIds.filter((id) => id !== automation.createdById);
      if (targets.length > 0) {
        await this.notifications.createMany(
          targets.map((uid) => ({
            userId: uid,
            organizationId: card.organizationId,
            type: 'MENTION' as const,
            title: `${actor?.name ?? 'Automação'} mencionou você`,
            body: text.slice(0, 140),
            entityType: 'card',
            entityId: cardId,
            eventKey: 'mention_comment' as const,
            whatsappPayload: {
              cardTitle: card.title,
              cardId,
              actorName: actor?.name ?? 'Automação',
              snippet: text.slice(0, 140),
            },
          })),
        );
      }
    }

    // Yellow fix: comentario via automacao tambem nao emitia CARD_UPDATED.
    // Card-modal aberto em outro user nao mostrava o comment novo ate F5.
    this.events.emit(EVENT_NAMES.CARD_UPDATED, {
      boardId: card.boardId,
      organizationId: card.organizationId,
      actorId: automation.createdById,
      cardId,
    });

    return { commentId: comment.id, mentionedUserIds: mentionUserIds };
  }

  /**
   * Resolução de menções inline no engine — espelha o que CommentsService
   * faz, mas evita dependência circular entre módulos. Mesma regex e
   * mesma resolução por parte-local-do-email.
   */
  private async resolveMentionsInText(
    plainText: string,
    organizationId: string,
  ): Promise<string[]> {
    const re = /(?:^|\s)@([a-z0-9][a-z0-9._-]{1,63})(?=\b)/gi;
    const handles = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(plainText)) !== null) {
      handles.add(m[1]!.toLowerCase());
    }
    if (handles.size === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { memberships: { some: { organizationId } } },
      select: { id: true, email: true },
    });
    return users
      .filter((u) => {
        const localPart = u.email.split('@')[0]?.toLowerCase();
        return localPart && handles.has(localPart);
      })
      .map((u) => u.id);
  }

  /**
   * SET_CARD_STATUS — altera Card.status (enum), Card.completedAt e
   * Card.isArchived de forma consistente.
   *
   * Valores aceitos (config.status):
   *   - 'ACTIVE'    -> status=ACTIVE,    completedAt=null
   *   - 'WAITING'   -> status=WAITING,   completedAt=null
   *   - 'CANCELED'  -> status=CANCELED,  completedAt=null
   *   - 'COMPLETED' -> status=COMPLETED, completedAt=now, completedById=automation.createdBy
   *   - 'ARCHIVED'  -> isArchived=true (NAO mexe no enum status — eh ortogonal)
   *
   * Compat: aceita os 2 valores legados ('REOPENED' -> ACTIVE; 'COMPLETED'
   * idem). Payloads antigos seguem funcionando.
   *
   * BUG FIX: antes desse fix o handler so mexia em completedAt/isArchived
   * sem tocar no enum Card.status (Doc 42 introduziu o enum mas o handler
   * nao foi atualizado). Resultado: card terminava com `status=ACTIVE` e
   * `completedAt=now` simultaneamente — estado inconsistente. Tambem o UI
   * so oferecia 3 opcoes (Concluido/Reabrir/Arquivar) sem cobrir WAITING
   * e CANCELED.
   */
  private async handleSetCardStatus(
    automation: Automation,
    cardId: string,
  ): Promise<{ status: string }> {
    const config = automation.actionConfig as {
      status?: 'ACTIVE' | 'WAITING' | 'COMPLETED' | 'CANCELED' | 'ARCHIVED' | 'REOPENED';
    };
    if (!config.status) throw new Error('Status alvo não informado.');

    // Normaliza legado: 'REOPENED' do payload antigo vira ACTIVE
    const target = config.status === 'REOPENED' ? 'ACTIVE' : config.status;

    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: { boardId: true, organizationId: true, status: true, completedAt: true },
    });
    if (!card) throw new Error('Card não encontrado.');

    let activityType: 'CARD_COMPLETED' | 'CARD_UNCOMPLETED' | 'CARD_ARCHIVED' | 'CARD_UPDATED';
    if (target === 'ARCHIVED') {
      await this.prisma.card.update({
        where: { id: cardId },
        data: { isArchived: true },
      });
      activityType = 'CARD_ARCHIVED';
    } else if (target === 'COMPLETED') {
      // Alinha enum + completedAt + completedById. completedById eh a
      // automacao que disparou (igual ao caminho de complete manual).
      await this.prisma.card.update({
        where: { id: cardId },
        data: {
          status: 'COMPLETED',
          completedAt: card.completedAt ?? new Date(),
          completedById: automation.createdById,
        },
      });
      activityType = 'CARD_COMPLETED';
    } else {
      // ACTIVE, WAITING, CANCELED — limpa completedAt se estava setado
      // (saindo de COMPLETED) e atualiza o enum.
      const wasCompleted = card.status === 'COMPLETED';
      await this.prisma.card.update({
        where: { id: cardId },
        data: {
          status: target,
          ...(wasCompleted ? { completedAt: null, completedById: null } : {}),
        },
      });
      // Activity de "desconclusao" so quando estava em COMPLETED
      activityType = wasCompleted ? 'CARD_UNCOMPLETED' : 'CARD_UPDATED';
    }

    await this.prisma.activity.create({
      data: {
        organizationId: card.organizationId,
        boardId: card.boardId,
        cardId,
        actorId: automation.createdById,
        type: activityType,
        payload: { cardId, automationId: automation.id, status: config.status },
      },
    });

    this.events.emit(EVENT_NAMES.CARD_UPDATED, {
      boardId: card.boardId,
      organizationId: card.organizationId,
      actorId: automation.createdById,
      cardId,
    });

    return { status: config.status };
  }

  /**
   * Doc 25 V1.1: SET_PRIVACY — altera Card.privacy quando o trigger
   * dispara. Use case classico: card entra em "Negociacao interna" =>
   * vira TEAM_ONLY; entra em "Aprovacao cliente" => volta pra PUBLIC.
   *
   * Idempotente — se ja esta no estado alvo, nao registra activity.
   */
  private async handleSetPrivacy(
    automation: Automation,
    cardId: string,
  ): Promise<{ privacy: string; changed: boolean }> {
    const config = automation.actionConfig as {
      privacy?: 'PUBLIC' | 'TEAM_ONLY';
    };
    if (!config.privacy) throw new Error('Privacidade alvo não informada.');

    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: { boardId: true, organizationId: true, privacy: true },
    });
    if (!card) throw new Error('Card não encontrado.');

    if (card.privacy === config.privacy) {
      return { privacy: config.privacy, changed: false };
    }

    await this.prisma.card.update({
      where: { id: cardId },
      data: { privacy: config.privacy },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: card.organizationId,
        boardId: card.boardId,
        cardId,
        actorId: automation.createdById,
        type: 'CARD_UPDATED',
        payload: {
          kind: 'privacy_changed',
          from: card.privacy,
          to: config.privacy,
          via: 'automation',
          automationId: automation.id,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    this.events.emit(EVENT_NAMES.CARD_UPDATED, {
      boardId: card.boardId,
      organizationId: card.organizationId,
      actorId: automation.createdById,
      cardId,
    });

    return { privacy: config.privacy, changed: true };
  }

  /**
   * CREATE_CHILD_CARD — cria sub-card vinculado ao card de origem
   * (parentCardId). Suporta template Mustache no título e flags pra
   * copiar membros/lead/tags/dueDate. Board/list de destino: se não
   * informado, usa o mesmo do card de origem.
   */
  private async handleCreateChildCard(
    automation: Automation,
    cardId: string,
    chainDepth: number,
  ): Promise<{ childId: string }> {
    const config = automation.actionConfig as {
      titleTemplate?: string;
      copyLead?: boolean;
      copyTeam?: boolean;
      copyTags?: boolean;
      copyDueDate?: boolean;
      targetListId?: string;
    };
    const titleTemplate = config.titleTemplate?.trim() || 'Sub-tarefa de {{card.title}}';

    const parent = await this.prisma.card.findUnique({
      where: { id: cardId },
      include: {
        members: { select: { userId: true } },
        labels: { select: { labelId: true } },
        list: { select: { name: true } },
        board: { select: { name: true } },
      },
    });
    if (!parent) throw new Error('Card pai não encontrado.');

    const title = renderTemplate(titleTemplate, {
      'card.title': parent.title,
      'card.list.name': parent.list.name,
      'card.board.name': parent.board.name,
    });

    const targetListId = config.targetListId ?? parent.listId;
    const targetList = await this.prisma.list.findUnique({
      where: { id: targetListId },
      select: { id: true, boardId: true, organizationId: true, isArchived: true },
    });
    if (!targetList || targetList.isArchived) {
      throw new Error('Lista de destino inválida ou arquivada.');
    }

    const last = await this.prisma.card.findFirst({
      where: { listId: targetListId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    const child = await createCardWithPresence(this.prisma, {
      organizationId: targetList.organizationId,
      boardId: targetList.boardId,
      listId: targetListId,
      title,
      position: (last?.position ?? 0) + 1,
      parentCardId: parent.id,
      createdById: automation.createdById,
      leadId: config.copyLead ? (parent.leadId ?? automation.createdById) : automation.createdById,
      dueDate: config.copyDueDate ? parent.dueDate : null,
    });

    if (config.copyTeam && parent.members.length > 0) {
      await this.prisma.cardMember.createMany({
        data: parent.members.map((m) => ({ cardId: child.id, userId: m.userId })),
        skipDuplicates: true,
      });
    }

    if (config.copyTags && parent.labels.length > 0) {
      await this.prisma.cardLabel.createMany({
        data: parent.labels.map((l) => ({ cardId: child.id, labelId: l.labelId })),
        skipDuplicates: true,
      });
    }

    await this.prisma.activity.create({
      data: {
        organizationId: targetList.organizationId,
        boardId: targetList.boardId,
        cardId: child.id,
        actorId: automation.createdById,
        type: 'CARD_CREATED',
        payload: {
          cardId: child.id,
          parentCardId: parent.id,
          automationId: automation.id,
          via: 'automation',
        },
      },
    });

    // Realtime: notifica frontend (RealtimeGateway escuta esse canal).
    this.events.emit(EVENT_NAMES.CARD_CREATED, {
      boardId: targetList.boardId,
      organizationId: targetList.organizationId,
      actorId: automation.createdById,
      cardId: child.id,
      listId: targetListId,
      title,
    });

    // Enfileira CARD_ENTERED na lista de destino com chainDepth+1 pra
    // cascata de automações (ex: child entrou em "Aprovação" e essa lista
    // tem outra automação configurada). Sem outbox aqui, a child criada
    // automaticamente nunca dispararia automação da nova coluna.
    await this.outbox.enqueue(this.prisma, {
      organizationId: targetList.organizationId,
      trigger: 'CARD_ENTERED',
      cardId: child.id,
      scopeKind: 'LIST',
      scopeId: targetListId,
      chainDepth: chainDepth + 1,
    });

    return { childId: child.id };
  }

  /**
   * INSERT_CHECKLIST_GROUP — cria um novo checklist no card SEMPRE
   * (diferente de INSERT_CHECKLIST_ITEMS, que reaproveita checklist com
   * mesmo título). Útil pra rodadas de tarefas com o mesmo nome em fases
   * diferentes do fluxo.
   */
  private async handleInsertChecklistGroup(
    automation: Automation,
    cardId: string,
  ): Promise<{ checklistId: string; itemsAdded: number }> {
    // Reusa o mesmo parser: title field aqui se chama "title" em vez de
    // "checklistTitle". Normalizamos ambos antes de passar.
    const raw = automation.actionConfig as ChecklistItemsActionConfig & { title?: string };
    const config: ChecklistItemsActionConfig = {
      ...raw,
      checklistTitle: raw.checklistTitle ?? raw.title,
    };
    const parsedItems = parseChecklistItemsConfig(config);
    if (parsedItems.length === 0) return { checklistId: '', itemsAdded: 0 };
    const title = config.checklistTitle?.trim() || 'Tarefas';

    const last = await this.prisma.checklist.findFirst({
      where: { cardId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const checklist = await this.prisma.checklist.create({
      data: {
        cardId,
        title,
        position: computeInsertPosition(last?.position ?? null, null),
      },
    });

    // Pega boardId/orgId do card 1x — usado pelas sub-automacoes em cascata.
    const cardCtx = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: { boardId: true, organizationId: true },
    });

    // Sub-automacao da LISTA (scopeChecklistId). Trigger fixo CHECKLIST_COMPLETED.
    if (cardCtx && isValidNestedAutomation(config.listAutomation, 'list')) {
      await this.createNestedChecklistAutomation({
        parent: automation,
        cfg: config.listAutomation,
        scope: 'list',
        targetId: checklist.id,
        boardId: cardCtx.boardId,
        organizationId: cardCtx.organizationId,
      });
    }

    const globalDefaults = await this.resolveChecklistItemDefaults(cardId, config);

    // Items sempre começam do zero (checklist novo); usar espaçamento padrão
    // pra deixar gaps razoáveis pra inserções manuais futuras.
    let basePos = computeInsertPosition(null, null);
    const rows: Prisma.ChecklistItemCreateManyInput[] = [];
    const itemsHaveAutomation = parsedItems.some((it) =>
      isValidNestedAutomation(it.itemAutomation, 'item'),
    );

    for (const item of parsedItems) {
      const r = hasItemSpecificConfig(item)
        ? await this.resolveChecklistItemDefaults(cardId, item)
        : globalDefaults;
      rows.push({
        checklistId: checklist.id,
        text: item.text,
        position: basePos,
        ...(r.assigneeId ? { assigneeId: r.assigneeId } : {}),
        ...(r.dueDate ? { dueDate: r.dueDate } : {}),
        ...(r.priority ? { priority: r.priority } : {}),
        ...(r.recurrence ? { recurrence: r.recurrence as Prisma.InputJsonValue } : {}),
      });
      basePos = computeInsertPosition(basePos, null);
    }

    const createdIds: string[] = [];

    if (!itemsHaveAutomation || !cardCtx) {
      // Caminho rapido: createManyAndReturn (Prisma 6+) devolve IDs.
      const justCreated = await this.prisma.checklistItem.createManyAndReturn({
        data: rows,
        select: { id: true },
      });
      createdIds.push(...justCreated.map((i) => i.id));
    } else {
      // Caminho lento (1 INSERT por item) — necessario pra obter os IDs e
      // criar as sub-automacoes. Aceitavel porque checklists tipicamente
      // tem 5-20 items, e essa configuracao e opt-in (so quem habilita
      // itemAutomation paga o custo).
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const itemCfg = parsedItems[i]!;
        const created = await this.prisma.checklistItem.create({ data: row });
        createdIds.push(created.id);
        if (isValidNestedAutomation(itemCfg.itemAutomation, 'item')) {
          await this.createNestedChecklistAutomation({
            parent: automation,
            cfg: itemCfg.itemAutomation,
            scope: 'item',
            targetId: created.id,
            boardId: cardCtx.boardId,
            organizationId: cardCtx.organizationId,
          });
        }
      }
    }

    if (createdIds.length > 0) {
      await this.notifyAssigneesOfActiveItems(automation, cardId, createdIds);
    }

    // Emite CARD_UPDATED pra RealtimeGateway fazer broadcast Socket.IO —
    // frontend invalida cache e re-renderiza sem precisar de F5.
    if (cardCtx && rows.length > 0) {
      this.events.emit(EVENT_NAMES.CARD_UPDATED, {
        boardId: cardCtx.boardId,
        organizationId: cardCtx.organizationId,
        actorId: automation.createdById,
        cardId,
      });
    }

    return { checklistId: checklist.id, itemsAdded: rows.length };
  }

  /**
   * UPDATE_FLOW_POSITION — move o card para o topo (TOP) ou base
   * (BOTTOM) da coluna em que ele está. MVP intencional: não cruza
   * boards/listas; só reposiciona dentro da própria list.
   */
  private async handleUpdateFlowPosition(
    automation: Automation,
    cardId: string,
  ): Promise<{ position: number }> {
    const config = automation.actionConfig as { position?: 'TOP' | 'BOTTOM' };
    const where = config.position === 'TOP' ? 'TOP' : 'BOTTOM';

    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: { listId: true, boardId: true, organizationId: true },
    });
    if (!card) throw new Error('Card não encontrado.');

    let newPos: number;
    if (where === 'TOP') {
      const first = await this.prisma.card.findFirst({
        where: { listId: card.listId, isArchived: false, id: { not: cardId } },
        orderBy: { position: 'asc' },
        select: { position: true },
      });
      newPos = computeInsertPosition(null, first?.position ?? null);
    } else {
      const last = await this.prisma.card.findFirst({
        where: { listId: card.listId, isArchived: false, id: { not: cardId } },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      newPos = computeInsertPosition(last?.position ?? null, null);
    }

    await this.prisma.card.update({ where: { id: cardId }, data: { position: newPos } });

    // BUG FIX: handler nao gravava Activity nem emitia evento. Kanban no
    // front nao reordenava ate F5; historico do card nao registrava o pulo
    // pro topo/base. Agora alinhado com handleMoveCard (mesmo padrao).
    await this.prisma.activity.create({
      data: {
        organizationId: card.organizationId,
        boardId: card.boardId,
        cardId,
        actorId: automation.createdById,
        type: 'CARD_UPDATED',
        payload: {
          kind: 'position_changed',
          listId: card.listId,
          to: where,
          via: 'automation',
          automationId: automation.id,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    this.events.emit(EVENT_NAMES.CARD_UPDATED, {
      boardId: card.boardId,
      organizationId: card.organizationId,
      actorId: automation.createdById,
      cardId,
    });

    return { position: newPos };
  }

  /**
   * MOVE_CARD — move o card pra outra lista do mesmo board.
   * actionConfig: { targetListId: cuid, position?: 'TOP' | 'BOTTOM' }
   *
   * Validacoes:
   *   - targetListId existe, mesmo board, nao arquivada
   *   - nao move se ja esta na lista alvo (idempotente, retorna noop)
   *
   * Side effects:
   *   - Atualiza listId + position + enteredListAt do card
   *   - Emite CARD_MOVED pra UI Kanban reagir
   *   - Cria Activity CARD_MOVED com payload via=automation
   *
   * Importante: a engine ja tem anti-loop via chainDepth. Se essa
   * automation move pra coluna que tem outra automation CARD_ENTERED, a
   * proxima dispatcha com chainDepth+1 — corta acima de 5.
   */
  private async handleMoveCard(
    automation: Automation,
    cardId: string,
    chainDepth: number,
  ): Promise<{ movedToListId: string | null; skipped?: boolean; reason?: string }> {
    const config = automation.actionConfig as {
      targetListId?: string;
      position?: 'TOP' | 'BOTTOM';
    };
    if (!config.targetListId) {
      throw new Error('Lista de destino nao informada.');
    }
    const pos = config.position === 'TOP' ? 'TOP' : 'BOTTOM';

    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: { listId: true, boardId: true, organizationId: true },
    });
    if (!card) throw new Error('Card nao encontrado.');

    // Multi-fluxo: o "board" do move e o board da AUTOMATION, nao o board
    // primary do card. Se automation.boardId e null (automation global),
    // fallback pro primary. Sem isso, move em card multi-presenca acabava
    // sincronizando o board errado.
    const scopeBoardId = automation.boardId ?? card.boardId;

    // CardPresence atual no board target. Sem isso ja podemos skip.
    const presence = await this.prisma.cardPresence.findUnique({
      where: { cardId_boardId: { cardId, boardId: scopeBoardId } },
      select: { listId: true, removedAt: true },
    });
    if (!presence || presence.removedAt) {
      return { movedToListId: null, skipped: true, reason: 'sem-presenca' };
    }

    if (presence.listId === config.targetListId) {
      return { movedToListId: null, skipped: true, reason: 'ja-na-lista' };
    }

    const target = await this.prisma.list.findUnique({
      where: { id: config.targetListId },
      select: { id: true, boardId: true, isArchived: true },
    });
    if (!target || target.boardId !== scopeBoardId || target.isArchived) {
      return { movedToListId: null, skipped: true, reason: 'lista-invalida' };
    }

    let newPos: number;
    if (pos === 'TOP') {
      const first = await this.prisma.cardPresence.findFirst({
        where: { listId: target.id, removedAt: null },
        orderBy: { position: 'asc' },
        select: { position: true },
      });
      newPos = computeInsertPosition(null, first?.position ?? null);
    } else {
      const last = await this.prisma.cardPresence.findFirst({
        where: { listId: target.id, removedAt: null },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      newPos = computeInsertPosition(last?.position ?? null, null);
    }

    const fromListId = presence.listId;

    // Update da presence (fonte de verdade do kanban multi-fluxo).
    await this.prisma.cardPresence.update({
      where: { cardId_boardId: { cardId, boardId: scopeBoardId } },
      data: {
        listId: target.id,
        position: newPos,
      },
    });

    // Sync com Card.listId legacy SE o move e no board primary do card.
    // Pra moves em board nao-primary, Card.listId nao deve mudar.
    if (scopeBoardId === card.boardId) {
      await this.prisma.card.update({
        where: { id: cardId },
        data: {
          listId: target.id,
          position: newPos,
          enteredListAt: new Date(),
        },
      });
    }

    await this.prisma.activity.create({
      data: {
        organizationId: card.organizationId,
        boardId: scopeBoardId,
        cardId,
        actorId: automation.createdById,
        type: 'CARD_MOVED',
        payload: {
          fromListId,
          toListId: target.id,
          boardId: scopeBoardId,
          via: 'automation',
          automationId: automation.id,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    // Realtime: notifica frontend pro Kanban animar a transição.
    //
    // BUG FIX: antes emitia `card.boardId` (primary). Em cards multi-fluxo,
    // se a automacao movesse o card num fluxo NAO-primary, o frontend
    // ouvia o board errado — clientes assistindo o fluxo afetado ficavam
    // sem realtime ate F5. Agora sempre scopeBoardId (o fluxo do move).
    this.events.emit(EVENT_NAMES.CARD_MOVED, {
      boardId: scopeBoardId,
      organizationId: card.organizationId,
      actorId: automation.createdById,
      cardId,
      fromListId,
      toListId: target.id,
      position: newPos,
    });

    // Doc 47: limpa flag visual ao mudar de coluna — alerta não deve
    // "vazar" pra nova coluna. Antes ficava em onCardMoved; agora que o
    // listener foi removido, faz aqui também (mesmo motivo, mesma regra).
    await this.prisma.card.updateMany({
      where: { id: cardId, flagColor: { not: null } },
      data: { flagColor: null, flagAt: null },
    });

    // Enfileira CARD_LEFT (origem) + CARD_ENTERED (destino) na outbox com
    // chainDepth+1 pra cascata de automações. Sem isso, mover via
    // automation nunca dispararia automação encadeada da nova lista.
    //
    // Push fire-and-forget logo após o enqueue — mesmo padrão do
    // cards.service.move. Sem isso a cascata depende SÓ do cron PULL, e
    // qualquer falha no PULL (incluindo o bug histórico de TZ
    // mismatch) deixa a próxima trigger presa indefinidamente.
    const cascadeIds = await this.outbox.enqueueCardMoved(this.prisma, {
      organizationId: card.organizationId,
      cardId,
      fromListId,
      toListId: target.id,
      chainDepth: chainDepth + 1,
    });
    void this.outbox.processOne(cascadeIds.leftId);
    void this.outbox.processOne(cascadeIds.enteredId);

    // Auto-status sync: move via automacao tambem pode levar o card pra
    // uma coluna final (ou retira-lo de uma) → re-avalia.
    await this.statusSync.evaluate(cardId);

    return { movedToListId: target.id };
  }

  /**
   * SEND_WHATSAPP — envia mensagem via Evolution API. Destinatario resolvido
   * por prioridade:
   *   1. `phone` literal (E.164 sem '+')
   *   2. `userId` -> phone do user (so se opt-in `notifyApprovalsOnWhatsApp`
   *      OU se a action explicitamente nao restringe — aqui sempre envia,
   *      a opt-in controla so o caso de aprovacoes; pra automacao manual
   *      o usuario que configurou ja escolheu o destinatario)
   *   3. `useCardLead = true` -> phone do lead do card
   *
   * Template usa Mustache simples com vars do card. Falha gracioso: run
   * fica SUCCESS com `delivered: false` pra debug, em vez de FAILED, pra
   * nao bloquear cadeias de automacao.
   */

  /**
   * FLAG_OVERDUE / FLAG_DUE_TODAY — seta uma cor de flag visual no card.
   * Espelha o comportamento do Ummense AutomationAlertTimeExceeded/etc:
   * destaca visualmente cards problematicos (prazo vencido, sem
   * interacao, etc) sem alterar listId ou outros campos. Flag eh limpo
   * automaticamente quando o card muda de lista (listener CARD_MOVED).
   *
   * actionConfig: { flagColor: 'orange'|'yellow'|'pink'|'red' }
   */
  private async handleFlag(automation: Automation, cardId: string): Promise<{ flagColor: string }> {
    const config = automation.actionConfig as { flagColor?: string };
    const validColors = ['orange', 'yellow', 'pink', 'red'];
    const flagColor = validColors.includes(config.flagColor ?? '')
      ? (config.flagColor as string)
      : 'orange';

    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: { id: true, boardId: true, organizationId: true, flagColor: true },
    });
    if (!card) throw new Error('Card nao encontrado.');

    // Idempotente: se ja esta na cor alvo, nao registra activity nem
    // emite event (evita ruido em re-execucoes do scheduler).
    if (card.flagColor === flagColor) {
      return { flagColor };
    }

    await this.prisma.card.update({
      where: { id: cardId },
      data: { flagColor, flagAt: new Date() },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: card.organizationId,
        boardId: card.boardId,
        cardId,
        actorId: automation.createdById,
        type: 'CARD_UPDATED',
        payload: {
          kind: 'flag_set',
          color: flagColor,
          via: 'automation',
          automationId: automation.id,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    this.events.emit(EVENT_NAMES.CARD_UPDATED, {
      boardId: card.boardId,
      organizationId: card.organizationId,
      actorId: automation.createdById,
      cardId,
    });

    return { flagColor };
  }

  /**
   * SEND_EMAIL — envia email com subject + body renderizados (Mustache
   * simples). Destinatario resolvido conforme recipientType:
   *   - CARD_LEAD: email do lead atual do card
   *   - LIST_LEADER: lider da coluna (List.leadId quando existir; fallback CARD_LEAD)
   *   - CUSTOM: emails fixos em config.customEmails[]
   *
   * Falha gracioso: run fica SUCCESS com delivered:false pra debug;
   * nao quebra cadeia de automacao.
   */
  private async handleSendEmail(
    automation: Automation,
    cardId: string,
  ): Promise<{ delivered: boolean; to: string | null; reason?: string }> {
    const config = automation.actionConfig as {
      subject?: string;
      body?: string;
      recipientType?: 'CARD_LEAD' | 'LIST_LEADER' | 'CUSTOM';
      customEmails?: string[];
    };
    const subjectTpl = (config.subject ?? '').trim();
    const bodyTpl = (config.body ?? '').trim();
    if (!subjectTpl || !bodyTpl) {
      return { delivered: false, to: null, reason: 'subject/body vazio' };
    }

    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      include: {
        lead: { select: { id: true, name: true, email: true } },
        list: { select: { id: true, name: true } },
        board: { select: { id: true, name: true } },
      },
    });
    if (!card) return { delivered: false, to: null, reason: 'card nao encontrado' };

    // Resolve destinatario
    const mode = config.recipientType ?? 'CARD_LEAD';
    let to: string | null = null;
    if (mode === 'CUSTOM') {
      to =
        (config.customEmails ?? []).find((e) => typeof e === 'string' && e.includes('@')) ?? null;
    } else if (mode === 'LIST_LEADER' || mode === 'CARD_LEAD') {
      // KTask nao tem 'lead da lista' formal — fallback pro lead do card.
      to = card.lead?.email ?? null;
    }
    if (!to) {
      return { delivered: false, to: null, reason: `sem destinatario (${mode})` };
    }

    // Render Mustache simples
    const vars: Record<string, string> = {
      'card.title': card.title,
      'card.list.name': card.list?.name ?? '',
      'card.board.name': card.board?.name ?? '',
      'card.lead.name': card.lead?.name ?? '',
      // Aliases Ummense pra compatibilidade com templates importados
      nome_do_card: card.title,
      nome_do_destinatario: card.lead?.name ?? '',
      cliente: card.lead?.name ?? '',
    };
    const subject = renderTemplate(subjectTpl, vars);
    const body = renderTemplate(bodyTpl, vars);

    // Importa MailService lazy via DI runtime — engine evita acoplamento
    // direto. Caller usa eventEmitter pra delegar pro modulo Mail.
    try {
      this.events.emit('mail.send-direct', {
        to,
        subject,
        html: body,
        organizationId: card.organizationId,
      });
      return { delivered: true, to };
    } catch (e) {
      this.logger.warn(`SEND_EMAIL falhou ${cardId}: ${(e as Error).message}`);
      return { delivered: false, to, reason: (e as Error).message };
    }
  }

  private async handleSendWhatsApp(
    automation: Automation,
    cardId: string,
  ): Promise<{
    delivered: boolean;
    phone: string | null;
    reason?: string;
    /** Doc 33: quando modo CARD_CONTACTS, registra cada tentativa. */
    attempts?: Array<{
      contactId: string;
      name: string;
      phone: string | null;
      delivered: boolean;
      reason?: string;
    }>;
  }> {
    const config = automation.actionConfig as {
      template?: string;
      phone?: string;
      userId?: string;
      useCardLead?: boolean;
      // Doc 33
      useCardContacts?: boolean;
      contactId?: string;
    };
    const template = config.template?.trim();
    if (!template) {
      return { delivered: false, phone: null, reason: 'Template vazio' };
    }

    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      include: {
        list: { select: { name: true } },
        board: { select: { name: true } },
        lead: { select: { id: true, name: true, phone: true } },
      },
    });
    if (!card) {
      return { delivered: false, phone: null, reason: 'Card nao encontrado' };
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: automation.createdById },
      select: { name: true },
    });

    const baseVars = {
      'card.title': card.title,
      'card.list.name': card.list.name,
      'card.board.name': card.board.name,
      'card.lead.name': card.lead?.name ?? '',
      'actor.name': actor?.name ?? 'Automação',
    };

    // ----- Doc 33: modo CARD_CONTACTS — fan out pra todos os contatos -----
    if (config.useCardContacts) {
      const cardContacts = await this.prisma.cardContact.findMany({
        where: { cardId },
        include: {
          contact: { select: { id: true, name: true, email: true, phone: true } },
        },
      });
      if (cardContacts.length === 0) {
        await this.logAutomationActivity(card, automation, 'sem contatos vinculados ao card');
        return { delivered: false, phone: null, reason: 'Card sem contatos vinculados' };
      }

      const attempts: Array<{
        contactId: string;
        name: string;
        phone: string | null;
        delivered: boolean;
        reason?: string;
      }> = [];

      for (const cc of cardContacts) {
        const result = await this.sendToContact(template, baseVars, cc.contact);
        attempts.push({
          contactId: cc.contact.id,
          name: cc.contact.name,
          phone: result.phone,
          delivered: result.delivered,
          ...(result.reason ? { reason: result.reason } : {}),
        });
      }

      const sent = attempts.filter((a) => a.delivered).length;
      const skipped = attempts.length - sent;
      const skippedNames = attempts
        .filter((a) => !a.delivered)
        .map((a) => a.name)
        .join(', ');
      const summary =
        skipped === 0
          ? `${sent} mensagem(ns) enviada(s) via WhatsApp aos contatos do card.`
          : `${sent} enviada(s), ${skipped} pulada(s) (sem WhatsApp ou erro): ${skippedNames}`;
      await this.logAutomationActivity(card, automation, summary);

      return {
        delivered: sent > 0,
        phone: null,
        attempts,
        ...(sent === 0 ? { reason: 'Nenhum contato com WhatsApp valido' } : {}),
      };
    }

    // ----- Doc 33: modo CONTACT (fixo do CRM) -----
    if (config.contactId) {
      const contact = await this.prisma.contact.findUnique({
        where: { id: config.contactId },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          organizationId: true,
        },
      });
      if (!contact || contact.organizationId !== automation.organizationId) {
        return { delivered: false, phone: null, reason: 'Contato nao encontrado' };
      }
      const result = await this.sendToContact(template, baseVars, contact);
      if (!result.delivered) {
        await this.logAutomationActivity(
          card,
          automation,
          `Mensagem nao enviada para ${contact.name}: ${result.reason ?? 'erro'}`,
        );
      }
      return {
        delivered: result.delivered,
        phone: result.phone,
        ...(result.reason ? { reason: result.reason } : {}),
      };
    }

    // ----- Modos legados (lead, member, phone literal) -----
    let phone: string | null = null;
    let recipientName: string | null = null;
    if (config.phone && /^\d{10,15}$/.test(config.phone)) {
      phone = config.phone;
    } else if (config.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: config.userId },
        select: { phone: true, name: true },
      });
      phone = user?.phone ?? null;
      recipientName = user?.name ?? null;
    } else if (config.useCardLead) {
      phone = card.lead?.phone ?? null;
      recipientName = card.lead?.name ?? null;
    }

    if (!phone) {
      return { delivered: false, phone: null, reason: 'Destinatario sem telefone' };
    }

    const firstName = recipientName ? (recipientName.split(' ')[0] ?? '') : '';

    const rendered = renderTemplate(template, {
      ...baseVars,
      'recipient.name': recipientName ?? '',
      'recipient.firstName': firstName,
    });
    // Append rodape padrao "mensagem automatica" — destinatario precisa
    // saber que veio de uma automation, nao de humano digitando.
    const text = appendAutomatedFooter(rendered);

    const ok = await this.whatsapp.sendText(phone, text);
    return {
      delivered: ok,
      phone,
      ...(ok ? {} : { reason: 'Evolution rejeitou ou desabilitada' }),
    };
  }

  /**
   * Doc 33: envia mensagem pra um Contact especifico, sanitizando phone
   * (campo livre no CRM) e resolvendo vars de contato. Retorna outcome
   * pra logging granular.
   */
  private async sendToContact(
    template: string,
    baseVars: Record<string, string>,
    contact: { id: string; name: string; email: string | null; phone: string | null },
  ): Promise<{ delivered: boolean; phone: string | null; reason?: string }> {
    const sanitized = (contact.phone ?? '').replace(/\D/g, '');
    if (!/^\d{10,15}$/.test(sanitized)) {
      return {
        delivered: false,
        phone: null,
        reason: contact.phone ? 'Phone do contato em formato invalido' : 'Contato sem WhatsApp',
      };
    }

    const firstName = contact.name.split(' ')[0] ?? '';
    const rendered = renderTemplate(template, {
      ...baseVars,
      'contact.name': contact.name,
      'contact.firstName': firstName,
      'contact.email': contact.email ?? '',
      'contact.phone': sanitized,
    });
    const text = appendAutomatedFooter(rendered);

    const ok = await this.whatsapp.sendText(sanitized, text);
    return {
      delivered: ok,
      phone: sanitized,
      ...(ok ? {} : { reason: 'Evolution rejeitou ou desabilitada' }),
    };
  }

  /**
   * Doc 33: posta entrada na timeline do card resumindo a tentativa
   * de envio. Reutiliza Activity tipo CARD_UPDATED com payload distinto
   * pra evitar migration de enum.
   */
  private async logAutomationActivity(
    card: { id: string; board: { name: string } },
    automation: Automation,
    summary: string,
  ): Promise<void> {
    await this.prisma.activity
      .create({
        data: {
          organizationId: automation.organizationId,
          cardId: card.id,
          type: 'CARD_UPDATED',
          payload: {
            via: 'automation-whatsapp',
            automationId: automation.id,
            summary,
          } as unknown as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined);
  }
}

/**
 * Mustache simples (sem dependência externa). Suporta apenas
 * `{{key.path}}` literal — sem helpers, condicionais ou loops.
 * Usar regex pra substituir cada ocorrência por valor do mapa.
 * Variável não encontrada vira string vazia (não quebra render).
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    return vars[key] ?? '';
  });
}

/**
 * Adiciona rodape padrao "Esta e uma mensagem automatica" no fim de toda
 * mensagem disparada por automation. Destinatario precisa saber que veio
 * de uma regra automatica do sistema, nao de humano digitando.
 *
 * Idempotente: se a mensagem ja termina com o rodape (raro mas possivel),
 * nao duplica.
 */
function appendAutomatedFooter(text: string): string {
  const footer = '> Esta é uma mensagem automática.';
  if (text.trimEnd().endsWith(footer)) return text;
  return text.trimEnd() + '\n\n' + footer;
}

// ---------------- Checklist items config (parsing) ----------------

/**
 * Defaults aplicaveis a 1 item ou ao conjunto inteiro (global da automacao).
 * Reusados pelo resolveChecklistItemDefaults — quando o item nao tem campo
 * proprio, o resolver le do nivel acima (config global).
 */
interface ChecklistDefaultsConfig {
  assigneeMode?: 'NONE' | 'CARD_LEAD' | 'SPECIFIC_USER';
  assigneeUserId?: string;
  dueMode?: 'NONE' | 'OFFSET_FROM_CARD_DUE' | 'OFFSET_FROM_NOW' | 'FIXED_DATE';
  dueOffsetDays?: number;
  dueDate?: string;
  itemPriority?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  /**
   * Recorrencia opcional do item. Persistida em ChecklistItem.recurrence (Json).
   * Shape espelha TaskRecurrence — validacao fraca aqui; quando o item completa,
   * o handler de recorrencia normaliza/aplica.
   */
  itemRecurrence?: Record<string, unknown> | null;
}

/**
 * Sub-automacao aninhada na config de INSERT_CHECKLIST_GROUP/ITEMS.
 * Quando setada, o handler cria UM registro `Automation` extra com o
 * escopo certo (scopeChecklistId pra lista ou scopeChecklistItemId pra
 * item) — refletindo o mesmo modelo que o user pode criar manualmente
 * pelos botoes "robo" no card.
 */
interface NestedChecklistAutomation {
  trigger: 'CHECKLIST_ITEM_DONE' | 'CHECKLIST_COMPLETED';
  triggerConfig?: Record<string, unknown>;
  actionType: string; // valida AutomationActionType no momento de salvar (Zod do form)
  actionConfig?: Record<string, unknown>;
  conditions?: unknown;
  label?: string;
}

/** Item individual no actionConfig.items (formato novo). */
interface ChecklistItemConfig extends ChecklistDefaultsConfig {
  text: string;
  /**
   * Automacao a ser criada automaticamente para este item especifico,
   * com escopo scopeChecklistItemId. Trigger restrito a CHECKLIST_ITEM_DONE.
   */
  itemAutomation?: NestedChecklistAutomation;
}

/** Action config completo do INSERT_CHECKLIST_ITEMS/GROUP. */
interface ChecklistItemsActionConfig extends ChecklistDefaultsConfig {
  checklistTitle?: string;
  items?: Array<string | ChecklistItemConfig>;
  /**
   * Automacao a ser criada automaticamente quando o checklist for criado
   * (so vale na primeira execucao que cria o checklist — execucoes
   * subsequentes em `INSERT_CHECKLIST_ITEMS` que reaproveitam checklist
   * existente nao criam segunda copia). Trigger restrito a
   * CHECKLIST_COMPLETED. Aplica em scopeChecklistId.
   */
  listAutomation?: NestedChecklistAutomation;
}

/**
 * Normaliza items pra { text, ...config } independente do formato.
 *
 * Aceita 2 formatos no actionConfig.items:
 *   - Legacy: `string[]` — automacoes criadas antes do per-item config.
 *     Items herdam tudo dos defaults globais da automacao.
 *   - Novo:   `Array<{ text, assigneeMode?, dueMode?, itemPriority?, ... }>`
 *     — items podem sobrescrever os defaults globais.
 *
 * Filtra entries sem texto. Trim no texto pra evitar duplicacao por espaco.
 */
function parseChecklistItemsConfig(config: ChecklistItemsActionConfig): ChecklistItemConfig[] {
  const raw = Array.isArray(config.items) ? config.items : [];
  const out: ChecklistItemConfig[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      const text = entry.trim();
      if (text) out.push({ text });
    } else if (entry && typeof entry === 'object' && typeof entry.text === 'string') {
      const text = entry.text.trim();
      if (text) {
        // Preserva itemAutomation se vier — o spread {...entry, text} ja
        // pega, so anotando aqui pra ficar explicito que e proposital.
        out.push({ ...entry, text });
      }
    }
  }
  return out;
}

/**
 * Valida shape minimo da sub-automacao. Garante que `trigger` esta na
 * lista permitida pro escopo (item vs lista). Outros campos sao livres
 * — actionType/actionConfig sao validados pelo proprio handler quando a
 * sub-automacao executar (mesmo caminho que automacoes manuais).
 */
function isValidNestedAutomation(
  value: unknown,
  scope: 'item' | 'list',
): value is NestedChecklistAutomation {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<NestedChecklistAutomation>;
  if (typeof v.trigger !== 'string' || typeof v.actionType !== 'string') return false;
  if (scope === 'item' && v.trigger !== 'CHECKLIST_ITEM_DONE') return false;
  if (scope === 'list' && v.trigger !== 'CHECKLIST_COMPLETED') return false;
  return true;
}

/**
 * True se o item tem QUALQUER override de assignee/due/priority em relacao
 * aos defaults da automacao. Usado pra decidir se vale a pena chamar
 * resolveChecklistItemDefaults com o item especifico (vs reusar o global).
 */
function hasItemSpecificConfig(item: ChecklistItemConfig): boolean {
  return Boolean(
    (item.assigneeMode && item.assigneeMode !== 'NONE') ||
    (item.dueMode && item.dueMode !== 'NONE') ||
    (item.itemPriority && item.itemPriority !== 'NONE') ||
    item.itemRecurrence,
  );
}

/**
 * Meia-noite BRT (UTC-3) do dia atual. Mesmo padrao do management.service —
 * o servidor em Hetzner roda em UTC mas as operacoes (incluindo o conceito
 * de "hoje") sao em BRT. Mantido inline pra evitar import cruzado entre
 * modulos so por causa de um helper de 4 linhas.
 */
function startOfDayBRT(now: Date): Date {
  const brtMs = now.getTime() - 3 * 60 * 60_000;
  const brt = new Date(brtMs);
  brt.setUTCHours(0, 0, 0, 0);
  return new Date(brt.getTime() + 3 * 60 * 60_000);
}
