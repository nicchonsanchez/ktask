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
              priority: true,
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
   * Cards arquivados ficam fora. Boards arquivados também.
   */
  async getRecentCards(userId: string, org: TenantContext) {
    const visits = await this.prisma.cardVisit.findMany({
      where: {
        userId,
        card: {
          organizationId: org.organizationId,
          isArchived: false,
          board: { isArchived: false },
        },
      },
      include: {
        card: {
          select: {
            id: true,
            title: true,
            priority: true,
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
