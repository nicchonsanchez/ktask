import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';

/**
 * Serviço da página inicial pessoal (home nova estilo Ummense).
 *
 * Tudo aqui é "do usuário logado" + escopado pela Org corrente.
 * Decisões importantes:
 *   - "Tarefas" = ChecklistItems com `assigneeId = userId`. O assignee é
 *     individual (granular dentro de um checklist). Hoje muitos itens não
 *     têm assignee — esses não aparecem (intencional: só tarefas claramente
 *     delegadas pra você).
 *   - Fuso de cálculo de "hoje" = America/Sao_Paulo (default do KTask).
 *     Usa boundaries em UTC pra fazer query eficiente no Postgres.
 *   - Cards arquivados / Boards arquivados ficam fora.
 */
@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retorna o início e fim do dia local (BRT) em UTC. Postgres armazena
   * timestamps em UTC; pra perguntar "tarefas com dueDate hoje em BRT",
   * precisamos converter as bordas do dia local pra UTC.
   *
   * Ex: hoje = 2026-04-25 BRT.
   *   startUtc = 2026-04-25T03:00:00Z (00:00 BRT)
   *   endUtc   = 2026-04-26T03:00:00Z (24:00 BRT)
   *
   * Implementação: BRT é UTC-3 sem horário de verão (desde 2019).
   * Usar offset fixo é exato e barato; quando suportarmos múltiplos
   * fusos, trocar pra Intl.DateTimeFormat ou date-fns-tz.
   */
  private brtDayBoundaries(now: Date = new Date()): {
    startOfDayUtc: Date;
    endOfDayUtc: Date;
    startOfTodayUtc: Date;
    endOfNext7Utc: Date;
  } {
    const BRT_OFFSET_HOURS = -3;
    const localMs = now.getTime() + BRT_OFFSET_HOURS * 3600 * 1000;
    const localDate = new Date(localMs);
    const y = localDate.getUTCFullYear();
    const m = localDate.getUTCMonth();
    const d = localDate.getUTCDate();
    // Borda 00:00 BRT do dia local = 03:00 UTC do mesmo dia
    const startOfDayUtc = new Date(Date.UTC(y, m, d, -BRT_OFFSET_HOURS, 0, 0, 0));
    const endOfDayUtc = new Date(startOfDayUtc.getTime() + 24 * 3600 * 1000);
    const endOfNext7Utc = new Date(startOfDayUtc.getTime() + 8 * 24 * 3600 * 1000); // hoje + 7 dias inclusivo
    return {
      startOfDayUtc,
      endOfDayUtc,
      startOfTodayUtc: startOfDayUtc,
      endOfNext7Utc,
    };
  }

  /**
   * GET /me/tasks — agrupa as tarefas atribuídas ao usuário em 4 buckets:
   * overdue, today, next7, noDate.
   *
   * Mistura DUAS fontes:
   *   1) ChecklistItems (tarefas dentro de cards) com `assigneeId = userId`
   *   2) Tasks standalone (sem card) com `assigneeId = userId`
   *
   * O retorno é unificado num DTO `MeTaskOut` com `kind: 'checklist' | 'standalone'`
   * pra o frontend renderizar conforme o tipo. Cards arquivados ficam de fora.
   */
  async getTasks(userId: string, org: TenantContext) {
    const { startOfDayUtc, endOfDayUtc, endOfNext7Utc } = this.brtDayBoundaries();

    // ===== ChecklistItems =====
    const baseWhereCl = {
      assigneeId: userId,
      isDone: false,
      checklist: {
        card: {
          organizationId: org.organizationId,
          isArchived: false,
          board: { isArchived: false },
        },
      },
    } as const;

    const includeCl = {
      checklist: {
        include: {
          card: {
            select: {
              id: true,
              title: true,
              boardId: true,
              cardColor: true,
              list: { select: { id: true, name: true } },
              board: { select: { id: true, name: true, color: true } },
            },
          },
        },
      },
    };

    // ===== Standalone Tasks =====
    const baseWhereTask = {
      assigneeId: userId,
      isDone: false,
      organizationId: org.organizationId,
    } as const;

    const [clOverdue, clToday, clNext7, clNoDate, tOverdue, tToday, tNext7, tNoDate] =
      await Promise.all([
        this.prisma.checklistItem.findMany({
          where: { ...baseWhereCl, dueDate: { lt: startOfDayUtc } },
          include: includeCl,
          orderBy: [{ dueDate: 'asc' }, { position: 'asc' }],
        }),
        this.prisma.checklistItem.findMany({
          where: { ...baseWhereCl, dueDate: { gte: startOfDayUtc, lt: endOfDayUtc } },
          include: includeCl,
          orderBy: [{ dueDate: 'asc' }, { position: 'asc' }],
        }),
        this.prisma.checklistItem.findMany({
          where: { ...baseWhereCl, dueDate: { gte: endOfDayUtc, lt: endOfNext7Utc } },
          include: includeCl,
          orderBy: [{ dueDate: 'asc' }, { position: 'asc' }],
        }),
        this.prisma.checklistItem.findMany({
          where: { ...baseWhereCl, dueDate: null },
          include: includeCl,
          orderBy: { position: 'asc' },
          take: 50,
        }),
        this.prisma.task.findMany({
          where: { ...baseWhereTask, dueDate: { lt: startOfDayUtc } },
          orderBy: [{ dueDate: 'asc' }, { position: 'asc' }],
        }),
        this.prisma.task.findMany({
          where: { ...baseWhereTask, dueDate: { gte: startOfDayUtc, lt: endOfDayUtc } },
          orderBy: [{ dueDate: 'asc' }, { position: 'asc' }],
        }),
        this.prisma.task.findMany({
          where: { ...baseWhereTask, dueDate: { gte: endOfDayUtc, lt: endOfNext7Utc } },
          orderBy: [{ dueDate: 'asc' }, { position: 'asc' }],
        }),
        this.prisma.task.findMany({
          where: { ...baseWhereTask, dueDate: null },
          orderBy: [{ createdAt: 'desc' }],
          take: 50,
        }),
      ]);

    type ClItem = (typeof clOverdue)[number];
    type TItem = (typeof tOverdue)[number];

    function mapCl(item: ClItem) {
      return {
        kind: 'checklist' as const,
        id: item.id,
        text: item.text,
        isDone: item.isDone,
        position: item.position,
        dueDate: item.dueDate,
        assigneeId: item.assigneeId,
        doneAt: item.doneAt,
        doneById: item.doneById,
        checklistId: item.checklistId,
        checklist: item.checklist,
      };
    }

    function mapTask(item: TItem) {
      return {
        kind: 'standalone' as const,
        id: item.id,
        text: item.text,
        isDone: item.isDone,
        position: item.position,
        dueDate: item.dueDate,
        assigneeId: item.assigneeId,
        doneAt: item.doneAt,
        doneById: item.doneById,
      };
    }

    type MeTaskOut = ReturnType<typeof mapCl> | ReturnType<typeof mapTask>;

    function mergeAndSort(a: MeTaskOut[], b: MeTaskOut[]): MeTaskOut[] {
      return [...a, ...b].sort((x, y) => {
        const dx = x.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const dy = y.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
        if (dx !== dy) return dx - dy;
        return x.position - y.position;
      });
    }

    return {
      overdue: mergeAndSort(clOverdue.map(mapCl), tOverdue.map(mapTask)),
      today: mergeAndSort(clToday.map(mapCl), tToday.map(mapTask)),
      next7: mergeAndSort(clNext7.map(mapCl), tNext7.map(mapTask)),
      noDate: mergeAndSort(clNoDate.map(mapCl), tNoDate.map(mapTask)),
    };
  }

  /**
   * POST /me/tasks/bulk-reschedule-today — move o dueDate dos itens
   * informados pra hoje (00:00 BRT) em massa. Usado pelo atalho
   * "Atualizar todas as tarefas para hoje" da home.
   *
   * Apenas itens onde o user é o assignee são afetados (segurança).
   */
  async bulkRescheduleToday(userId: string, org: TenantContext, ids: string[]) {
    const { startOfDayUtc } = this.brtDayBoundaries();
    const result = await this.prisma.checklistItem.updateMany({
      where: {
        id: { in: ids },
        assigneeId: userId,
        checklist: {
          card: {
            organizationId: org.organizationId,
          },
        },
      },
      data: { dueDate: startOfDayUtc },
    });
    return { updated: result.count };
  }

  /**
   * GET /me/recent-cards — últimos cards visitados pelo user (até 12).
   * Cards arquivados e boards arquivados ficam fora.
   * Filtra apenas cards onde o user e lider OU membro da equipe — visitar
   * um card por curiosidade nao deve fazer ele aparecer aqui se o user
   * nao tem responsabilidade direta.
   */
  async getRecentCards(userId: string, org: TenantContext) {
    const visits = await this.prisma.cardVisit.findMany({
      where: {
        userId,
        card: {
          organizationId: org.organizationId,
          isArchived: false,
          board: { isArchived: false },
          OR: [{ leadId: userId }, { members: { some: { userId } } }],
        },
      },
      include: {
        card: {
          select: {
            id: true,
            title: true,
            cardColor: true,
            dueDate: true,
            list: { select: { id: true, name: true } },
            board: { select: { id: true, name: true, color: true, visibility: true } },
            members: {
              take: 4,
              select: {
                user: { select: { id: true, name: true, avatarUrl: true } },
              },
            },
            labels: { select: { label: { select: { id: true, name: true, color: true } } } },
          },
        },
      },
      orderBy: { visitedAt: 'desc' },
      take: 12,
    });
    return visits.map((v) => ({ visitedAt: v.visitedAt, card: v.card }));
  }

  /**
   * Registra uma visita do user a um card. Idempotente por (userId, cardId)
   * — atualiza o `visitedAt` em vez de inserir nova row. Chamado pelo
   * CardsController no GET /cards/:id.
   */
  async recordVisit(userId: string, cardId: string) {
    await this.prisma.cardVisit.upsert({
      where: { userId_cardId: { userId, cardId } },
      create: { userId, cardId },
      update: { visitedAt: new Date() },
    });
  }

  /**
   * Resumo do estado de tarefas do user — counts dos 4 buckets (overdue/today/
   * next7/noDate). Usado pelos contadores na lista de membros (/empresa) e
   * no banner do modo "ver como".
   *
   * Mistura ChecklistItem (com card não arquivado) + standalone Task. Mesmo
   * filtro de getTasks, só que retorna count em vez do payload completo.
   */
  async getSummary(userId: string, org: TenantContext) {
    const { startOfDayUtc, endOfDayUtc, endOfNext7Utc } = this.brtDayBoundaries();

    const baseWhereCl = {
      assigneeId: userId,
      isDone: false,
      checklist: {
        card: {
          organizationId: org.organizationId,
          isArchived: false,
          board: { isArchived: false },
        },
      },
    } as const;

    const baseWhereTask = {
      assigneeId: userId,
      isDone: false,
      organizationId: org.organizationId,
    } as const;

    const [
      clOverdue,
      clToday,
      clNext7,
      clNoDate,
      tOverdue,
      tToday,
      tNext7,
      tNoDate,
      recentActivityCount,
    ] = await Promise.all([
      this.prisma.checklistItem.count({
        where: { ...baseWhereCl, dueDate: { lt: startOfDayUtc } },
      }),
      this.prisma.checklistItem.count({
        where: { ...baseWhereCl, dueDate: { gte: startOfDayUtc, lt: endOfDayUtc } },
      }),
      this.prisma.checklistItem.count({
        where: { ...baseWhereCl, dueDate: { gte: endOfDayUtc, lt: endOfNext7Utc } },
      }),
      this.prisma.checklistItem.count({ where: { ...baseWhereCl, dueDate: null } }),
      this.prisma.task.count({ where: { ...baseWhereTask, dueDate: { lt: startOfDayUtc } } }),
      this.prisma.task.count({
        where: { ...baseWhereTask, dueDate: { gte: startOfDayUtc, lt: endOfDayUtc } },
      }),
      this.prisma.task.count({
        where: { ...baseWhereTask, dueDate: { gte: endOfDayUtc, lt: endOfNext7Utc } },
      }),
      this.prisma.task.count({ where: { ...baseWhereTask, dueDate: null } }),
      this.prisma.activity.count({
        where: {
          organizationId: org.organizationId,
          actorId: userId,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
        },
      }),
    ]);

    return {
      overdue: clOverdue + tOverdue,
      today: clToday + tToday,
      next7: clNext7 + tNext7,
      noDate: clNoDate + tNoDate,
      recentActivityCount,
    };
  }

  /**
   * Últimas N atividades onde o user foi o ator. Usado pela aba "Atividade
   * recente" no modo "ver como".
   */
  async getRecentActivity(userId: string, org: TenantContext, limit = 10) {
    return this.prisma.activity.findMany({
      where: {
        organizationId: org.organizationId,
        actorId: userId,
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 50),
      select: {
        id: true,
        type: true,
        payload: true,
        createdAt: true,
        cardId: true,
        boardId: true,
        card: {
          select: {
            id: true,
            title: true,
            board: { select: { id: true, name: true, color: true } },
          },
        },
      },
    });
  }

  /**
   * Doc 41: Activity feed da Org inteira, filtrado por boards acessiveis
   * ao user. Usado na pagina /quadros pra mostrar pulso da equipe.
   * Por isso traz `actor` (quem fez), card (alvo) e board (contexto).
   *
   * Bypass de role: OWNER/ADMIN/GESTOR veem tudo da Org. MEMBER/GUEST
   * veem so de boards onde sao membros OU boards com visibility=ORGANIZATION.
   */
  async getOrgRecentActivity(userId: string, org: TenantContext, limit = 10) {
    const bypass = org.role === 'OWNER' || org.role === 'ADMIN' || org.role === 'GESTOR';
    // Activity nao tem relacao direta com Board no Prisma; filtra via
    // boardId IN (...) calculando os acessiveis primeiro pra MEMBER/GUEST.
    let accessibleBoardIds: string[] | null = null;
    if (!bypass) {
      const accessibleBoards = await this.prisma.board.findMany({
        where: {
          organizationId: org.organizationId,
          isArchived: false,
          OR: [{ members: { some: { userId } } }, { visibility: 'ORGANIZATION' as const }],
        },
        select: { id: true },
      });
      accessibleBoardIds = accessibleBoards.map((b) => b.id);
      if (accessibleBoardIds.length === 0) return [];
    }

    return this.prisma.activity.findMany({
      where: {
        organizationId: org.organizationId,
        boardId: accessibleBoardIds ? { in: accessibleBoardIds } : { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 50),
      select: {
        id: true,
        type: true,
        payload: true,
        createdAt: true,
        cardId: true,
        boardId: true,
        actor: { select: { id: true, name: true, avatarUrl: true } },
        card: {
          select: {
            id: true,
            title: true,
            shortCode: true,
            board: { select: { id: true, name: true, color: true } },
          },
        },
      },
    });
  }

  /**
   * GET /me/calendar?month=YYYY-MM — pontos por dia do mês.
   * Por enquanto só conta tarefas (ChecklistItems com dueDate) atribuídas
   * ao user. Eventos vão entrar na Fase 2.
   */
  async getCalendar(userId: string, org: TenantContext, month?: string) {
    const ref = month ? new Date(`${month}-01T00:00:00-03:00`) : new Date();
    const y = ref.getFullYear();
    const m = ref.getMonth();
    // Janela do mês em BRT
    const startUtc = new Date(Date.UTC(y, m, 1, 3, 0, 0, 0));
    const endUtc = new Date(Date.UTC(y, m + 1, 1, 3, 0, 0, 0));

    const [clItems, tItems] = await Promise.all([
      this.prisma.checklistItem.findMany({
        where: {
          assigneeId: userId,
          dueDate: { gte: startUtc, lt: endUtc },
          checklist: {
            card: {
              organizationId: org.organizationId,
              isArchived: false,
              board: { isArchived: false },
            },
          },
        },
        select: { dueDate: true, isDone: true },
      }),
      this.prisma.task.findMany({
        where: {
          assigneeId: userId,
          dueDate: { gte: startUtc, lt: endUtc },
          organizationId: org.organizationId,
        },
        select: { dueDate: true, isDone: true },
      }),
    ]);

    const items = [...clItems, ...tItems];

    // Agrupa por dia (BRT) com contagem total + pendentes
    const byDay = new Map<string, { total: number; pending: number }>();
    for (const it of items) {
      if (!it.dueDate) continue;
      const localMs = it.dueDate.getTime() - 3 * 3600 * 1000; // UTC → BRT
      const local = new Date(localMs);
      const key = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`;
      const cur = byDay.get(key) ?? { total: 0, pending: 0 };
      cur.total += 1;
      if (!it.isDone) cur.pending += 1;
      byDay.set(key, cur);
    }
    return {
      month: `${y}-${String(m + 1).padStart(2, '0')}`,
      days: Array.from(byDay.entries()).map(([date, counts]) => ({ date, ...counts })),
    };
  }
}
