import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type {
  Automation,
  AutomationRun,
  AutomationTrigger,
  Prisma,
  Priority,
} from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';
import { computeInsertPosition } from '@/common/util/position';
import { EVENT_NAMES, type CardMovedPayload } from '@/modules/realtime/events.types';
import { WhatsAppHelper } from '@/modules/whatsapp/whatsapp.helper';
import { evaluateConditions, type AutomationCondition } from './condition.types';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly whatsapp: WhatsAppHelper,
  ) {}

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

  /**
   * Doc 48: dispara automacoes do tipo CHECKLIST_ITEM_DONE escopadas
   * a um item especifico. Acionado por ChecklistsService quando um
   * item é marcado como done (transicao false → true).
   */
  @OnEvent('checklist.item.done', { async: true })
  async onChecklistItemDone(payload: {
    itemId: string;
    checklistId: string;
    cardId: string;
    listId: string;
    organizationId: string;
    actorId: string;
  }) {
    await this.dispatchTrigger({
      scope: { kind: 'checklistItem', id: payload.itemId },
      trigger: 'CHECKLIST_ITEM_DONE',
      cardId: payload.cardId,
      organizationId: payload.organizationId,
      chainDepth: 0,
    });
  }

  /**
   * Doc 48: dispara automacoes do tipo CHECKLIST_COMPLETED escopadas
   * a um checklist especifico. Acionado quando o ultimo item pendente
   * vira done (checklist 100% concluido).
   */
  @OnEvent('checklist.completed', { async: true })
  async onChecklistCompleted(payload: {
    checklistId: string;
    cardId: string;
    listId: string;
    organizationId: string;
    actorId: string;
  }) {
    await this.dispatchTrigger({
      scope: { kind: 'checklist', id: payload.checklistId },
      trigger: 'CHECKLIST_COMPLETED',
      cardId: payload.cardId,
      organizationId: payload.organizationId,
      chainDepth: 0,
    });
  }

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
        return this.handleCreateChildCard(automation, cardId);
      case 'INSERT_CHECKLIST_GROUP':
        return this.handleInsertChecklistGroup(automation, cardId);
      case 'UPDATE_FLOW_POSITION':
        return this.handleUpdateFlowPosition(automation, cardId);
      case 'MOVE_CARD':
        return this.handleMoveCard(automation, cardId);
      case 'SEND_WHATSAPP':
        return this.handleSendWhatsApp(automation, cardId);
      case 'SET_PRIVACY':
        return this.handleSetPrivacy(automation, cardId);

      // Handlers ainda não implementados
      case 'FILL_FIELDS':
      case 'SAVE_DESCRIPTION_VERSION':
      case 'SEND_EMAIL':
      case 'LINK_FLOW':
      case 'UNLINK_FLOW':
      case 'FLAG_DUE_TODAY':
      case 'FLAG_OVERDUE':
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
    return { tagsRemoved: tagIds, deletedCount: result.count };
  }

  /**
   * INSERT_CHECKLIST_ITEMS — cria itens em um checklist do card. Se o
   * card não tiver checklist com o título passado, cria. Senão, anexa
   * os items novos no fim do checklist existente.
   *
   * Idempotência: itens com texto que já existe no mesmo checklist
   * (case-insensitive, trimmed) são pulados. Isso evita duplicação
   * quando:
   *   - A automation re-roda (card sai e volta na coluna)
   *   - O card já tinha os items via import do Ummense e a automation
   *     também tenta criar
   *   - Multiplas automations da mesma coluna criam items sobrepostos
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
      include: { items: { select: { text: true } } },
    });
    if (!checklist) {
      const last = await this.prisma.checklist.findFirst({
        where: { cardId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      const created = await this.prisma.checklist.create({
        data: {
          cardId,
          title,
          position: computeInsertPosition(last?.position ?? null, null),
        },
      });
      checklist = { ...created, items: [] };
    }

    // Idempotência: filtra items cujo texto ja existe no checklist
    // (comparacao case-insensitive + trim).
    const existingTexts = new Set((checklist.items ?? []).map((i) => i.text.trim().toLowerCase()));
    const itemsToCreate = parsedItems.filter((it) => !existingTexts.has(it.text.toLowerCase()));
    const itemsSkipped = parsedItems.length - itemsToCreate.length;
    if (itemsToCreate.length === 0) {
      return { checklistId: checklist.id, itemsAdded: 0, itemsSkipped };
    }

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
    for (const item of itemsToCreate) {
      // Per-item: se o item tem config propria, resolve dela; senao usa
      // os defaults globais. Permite mix livre na mesma automacao.
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
      });
      basePos = computeInsertPosition(basePos, null);
    }
    await this.prisma.checklistItem.createMany({ data: rows });

    return { checklistId: checklist.id, itemsAdded: rows.length, itemsSkipped };
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
  ): Promise<{ assigneeId: string | null; dueDate: Date | null; priority: Priority | null }> {
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
    let dueDate: Date | null = null;
    const DAY = 24 * 60 * 60 * 1000;
    if (config.dueMode === 'OFFSET_FROM_CARD_DUE' && typeof config.dueOffsetDays === 'number') {
      const card = await this.prisma.card.findUnique({
        where: { id: cardId },
        select: { dueDate: true },
      });
      if (card?.dueDate) dueDate = new Date(card.dueDate.getTime() + config.dueOffsetDays * DAY);
    } else if (config.dueMode === 'OFFSET_FROM_NOW' && typeof config.dueOffsetDays === 'number') {
      dueDate = new Date(Date.now() + config.dueOffsetDays * DAY);
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

    return { assigneeId, dueDate, priority };
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
      select: { organizationId: true, leadId: true },
    });
    if (!card) return { leadId: null };

    if (replaceMode === 'KEEP_IF_HAS_LEAD' && card.leadId) {
      return { leadId: card.leadId, skipped: true };
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

    let removedFromTeam: string | undefined;
    if (replaceMode === 'REMOVE_FROM_TEAM' && card.leadId && card.leadId !== config.userId) {
      const previousLeadId = card.leadId;
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
      select: { organizationId: true },
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

    await this.prisma.cardMember.createMany({
      data: validIds.map((userId) => ({ cardId, userId })),
      skipDuplicates: true,
    });

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
    if (mentionUserIds.length > 0) {
      const targets = mentionUserIds.filter((id) => id !== automation.createdById);
      if (targets.length > 0) {
        await this.prisma.notification.createMany({
          data: targets.map((uid) => ({
            userId: uid,
            organizationId: card.organizationId,
            type: 'MENTION' as const,
            title: `${actor?.name ?? 'Automação'} mencionou você`,
            body: text.slice(0, 140),
            entityType: 'card',
            entityId: cardId,
          })),
          skipDuplicates: true,
        });
      }
    }

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
   * SET_CARD_STATUS — altera completedAt / isArchived. Suporta:
   *   - 'COMPLETED': marca como finalizado (completedAt = now)
   *   - 'REOPENED':  desmarca (completedAt = null)
   *   - 'ARCHIVED':  arquiva
   */
  private async handleSetCardStatus(
    automation: Automation,
    cardId: string,
  ): Promise<{ status: string }> {
    const config = automation.actionConfig as {
      status?: 'COMPLETED' | 'REOPENED' | 'ARCHIVED';
    };
    if (!config.status) throw new Error('Status alvo não informado.');

    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: { boardId: true, organizationId: true },
    });
    if (!card) throw new Error('Card não encontrado.');

    let activityType: 'CARD_COMPLETED' | 'CARD_UNCOMPLETED' | 'CARD_ARCHIVED';
    switch (config.status) {
      case 'COMPLETED':
        await this.prisma.card.update({
          where: { id: cardId },
          data: {
            completedAt: new Date(),
            completedById: automation.createdById,
          },
        });
        activityType = 'CARD_COMPLETED';
        break;
      case 'REOPENED':
        await this.prisma.card.update({
          where: { id: cardId },
          data: { completedAt: null, completedById: null },
        });
        activityType = 'CARD_UNCOMPLETED';
        break;
      case 'ARCHIVED':
        await this.prisma.card.update({
          where: { id: cardId },
          data: { isArchived: true },
        });
        activityType = 'CARD_ARCHIVED';
        break;
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

    // Increment atomico do counter da Org pra gerar shortCode do filho
    const orgUpdated = await this.prisma.organization.update({
      where: { id: targetList.organizationId },
      data: { cardSequence: { increment: 1 } },
      select: { cardSequence: true },
    });

    const child = await this.prisma.card.create({
      data: {
        organizationId: targetList.organizationId,
        shortCode: String(orgUpdated.cardSequence),
        boardId: targetList.boardId,
        listId: targetListId,
        title,
        position: (last?.position ?? 0) + 1,
        parentCardId: parent.id,
        createdById: automation.createdById,
        leadId: config.copyLead ? parent.leadId : automation.createdById,
        dueDate: config.copyDueDate ? parent.dueDate : null,
      },
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

    this.events.emit(EVENT_NAMES.CARD_CREATED, {
      boardId: targetList.boardId,
      organizationId: targetList.organizationId,
      actorId: automation.createdById,
      cardId: child.id,
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

    const globalDefaults = await this.resolveChecklistItemDefaults(cardId, config);

    // Items sempre começam do zero (checklist novo); usar espaçamento padrão
    // pra deixar gaps razoáveis pra inserções manuais futuras.
    let basePos = computeInsertPosition(null, null);
    const rows: Prisma.ChecklistItemCreateManyInput[] = [];
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
      });
      basePos = computeInsertPosition(basePos, null);
    }
    await this.prisma.checklistItem.createMany({ data: rows });

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
      select: { listId: true },
    });
    if (!card) throw new Error('Card não encontrado.');

    if (where === 'TOP') {
      const first = await this.prisma.card.findFirst({
        where: { listId: card.listId, isArchived: false, id: { not: cardId } },
        orderBy: { position: 'asc' },
        select: { position: true },
      });
      const newPos = computeInsertPosition(null, first?.position ?? null);
      await this.prisma.card.update({ where: { id: cardId }, data: { position: newPos } });
      return { position: newPos };
    }

    const last = await this.prisma.card.findFirst({
      where: { listId: card.listId, isArchived: false, id: { not: cardId } },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const newPos = computeInsertPosition(last?.position ?? null, null);
    await this.prisma.card.update({ where: { id: cardId }, data: { position: newPos } });
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

    if (card.listId === config.targetListId) {
      return { movedToListId: null, skipped: true, reason: 'ja-na-lista' };
    }

    const target = await this.prisma.list.findUnique({
      where: { id: config.targetListId },
      select: { id: true, boardId: true, isArchived: true },
    });
    if (!target || target.boardId !== card.boardId || target.isArchived) {
      return { movedToListId: null, skipped: true, reason: 'lista-invalida' };
    }

    let newPos: number;
    if (pos === 'TOP') {
      const first = await this.prisma.card.findFirst({
        where: { listId: target.id, isArchived: false },
        orderBy: { position: 'asc' },
        select: { position: true },
      });
      newPos = computeInsertPosition(null, first?.position ?? null);
    } else {
      const last = await this.prisma.card.findFirst({
        where: { listId: target.id, isArchived: false },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      newPos = computeInsertPosition(last?.position ?? null, null);
    }

    const fromListId = card.listId;
    await this.prisma.card.update({
      where: { id: cardId },
      data: {
        listId: target.id,
        position: newPos,
        enteredListAt: new Date(),
      },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: card.organizationId,
        boardId: card.boardId,
        cardId,
        actorId: automation.createdById,
        type: 'CARD_MOVED',
        payload: {
          fromListId,
          toListId: target.id,
          via: 'automation',
          automationId: automation.id,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    this.events.emit(EVENT_NAMES.CARD_MOVED, {
      boardId: card.boardId,
      organizationId: card.organizationId,
      actorId: automation.createdById,
      cardId,
      fromListId,
      toListId: target.id,
      position: newPos,
    });

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

    const text = renderTemplate(template, {
      ...baseVars,
      'recipient.name': recipientName ?? '',
      'recipient.firstName': firstName,
    });

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
    const text = renderTemplate(template, {
      ...baseVars,
      'contact.name': contact.name,
      'contact.firstName': firstName,
      'contact.email': contact.email ?? '',
      'contact.phone': sanitized,
    });

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
}

/** Item individual no actionConfig.items (formato novo). */
interface ChecklistItemConfig extends ChecklistDefaultsConfig {
  text: string;
}

/** Action config completo do INSERT_CHECKLIST_ITEMS/GROUP. */
interface ChecklistItemsActionConfig extends ChecklistDefaultsConfig {
  checklistTitle?: string;
  items?: Array<string | ChecklistItemConfig>;
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
      if (text) out.push({ ...entry, text });
    }
  }
  return out;
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
    (item.itemPriority && item.itemPriority !== 'NONE'),
  );
}
