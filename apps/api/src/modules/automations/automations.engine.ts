import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { Automation, AutomationRun, Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';
import { computeInsertPosition } from '@/common/util/position';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
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

      // Handlers ainda não implementados
      case 'FILL_FIELDS':
      case 'SAVE_DESCRIPTION_VERSION':
      case 'SEND_EMAIL':
      case 'SEND_WHATSAPP':
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
   * os items no fim do checklist existente. Items vazios são ignorados.
   */
  private async handleInsertChecklistItems(
    automation: Automation,
    cardId: string,
  ): Promise<{ checklistId: string; itemsAdded: number }> {
    const config = automation.actionConfig as {
      items?: string[];
      checklistTitle?: string;
    };
    const items = (config.items ?? []).map((s) => s.trim()).filter((s) => s.length > 0);
    if (items.length === 0) return { checklistId: '', itemsAdded: 0 };

    const title = config.checklistTitle?.trim() || 'Tarefas';

    // Procura checklist com mesmo título no card. Se não existir, cria.
    let checklist = await this.prisma.checklist.findFirst({
      where: { cardId, title },
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
      });
    }

    // Última posição dos items existentes — pra apender com espaçamento
    // padrão (POSITION_STEP) entre cada novo item.
    const lastItem = await this.prisma.checklistItem.findFirst({
      where: { checklistId: checklist.id },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    let basePos = computeInsertPosition(lastItem?.position ?? null, null);

    await this.prisma.checklistItem.createMany({
      data: items.map((text) => {
        const data = { checklistId: checklist!.id, text, position: basePos };
        basePos = computeInsertPosition(basePos, null);
        return data;
      }),
    });

    return { checklistId: checklist.id, itemsAdded: items.length };
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

    const child = await this.prisma.card.create({
      data: {
        organizationId: targetList.organizationId,
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
    const config = automation.actionConfig as {
      title?: string;
      items?: string[];
    };
    const items = (config.items ?? []).map((s) => s.trim()).filter((s) => s.length > 0);
    if (items.length === 0) return { checklistId: '', itemsAdded: 0 };
    const title = config.title?.trim() || 'Tarefas';

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

    // Items sempre começam do zero (checklist novo); usar espaçamento padrão
    // pra deixar gaps razoáveis pra inserções manuais futuras.
    let basePos = computeInsertPosition(null, null);
    await this.prisma.checklistItem.createMany({
      data: items.map((text) => {
        const data = { checklistId: checklist.id, text, position: basePos };
        basePos = computeInsertPosition(basePos, null);
        return data;
      }),
    });

    return { checklistId: checklist.id, itemsAdded: items.length };
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
