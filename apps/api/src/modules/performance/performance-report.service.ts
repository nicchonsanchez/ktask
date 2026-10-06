import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  PERFORMANCE_ACTION_TYPES,
  PERFORMANCE_MAX_RANGE_DAYS,
  type PerformanceArea,
  type PerformanceCardsResponse,
  type PerformanceColumnConfig,
  type PerformanceEventsResponse,
  type PerformanceMetric,
  type PerformanceSummaryResponse,
  type TransitionOverride,
} from '@ktask/contracts';

import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';

import type { PerformanceConfigVersionLike } from './movement-classifier';
import {
  aggregate,
  dayKey,
  daysBetween,
  deriveEvent,
  isValidAction,
  matchesMetric,
  type DerivedPerformanceEvent,
} from './performance-aggregate';
import { PerformanceConfigService } from './performance-config.service';

export interface PerformanceFilters {
  from: Date;
  to: Date;
  boardIds?: string[];
  userIds?: string[];
  area?: PerformanceArea;
  companyId?: string;
}

/**
 * Doc 52 — relatorio "Desempenho da Equipe".
 *
 * Fonte: Activity com origin = USER (automacao, sistema, aprovacao e
 * importacao nao contam pra ninguem). Read-only: nenhum metodo escreve.
 */
@Injectable()
export class PerformanceReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PerformanceConfigService,
  ) {}

  private validateRange(f: PerformanceFilters) {
    if (Number.isNaN(f.from.getTime()) || Number.isNaN(f.to.getTime())) {
      throw new BadRequestException('Período inválido.');
    }
    if (f.from > f.to) throw new BadRequestException('Início do período depois do fim.');
    const days = (f.to.getTime() - f.from.getTime()) / 86_400_000;
    if (days > PERFORMANCE_MAX_RANGE_DAYS) {
      throw new BadRequestException(`Período máximo de ${PERFORMANCE_MAX_RANGE_DAYS} dias.`);
    }
  }

  /** Carrega e deriva os eventos do periodo conforme filtros. */
  private async loadEvents(
    tenant: TenantContext,
    f: PerformanceFilters,
  ): Promise<{ events: DerivedPerformanceEvent[]; timezone: string }> {
    this.config.assertCanManage(tenant);
    this.validateRange(f);
    const orgId = tenant.organizationId;

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { timezone: true },
    });
    const timezone = org?.timezone || 'America/Sao_Paulo';

    // Escopo de fluxos: filtro explicito ∩ area (via configuracao gerencial).
    let boardScope: string[] | null = f.boardIds?.length ? f.boardIds : null;
    if (f.area) {
      const inArea = await this.prisma.boardPerformanceConfig.findMany({
        where: { organizationId: orgId, area: f.area },
        select: { boardId: true },
      });
      const ids = inArea.map((c) => c.boardId);
      boardScope = boardScope ? boardScope.filter((id) => ids.includes(id)) : ids;
    }
    if (boardScope && boardScope.length === 0) return { events: [], timezone };

    // Cliente: cards vinculados a empresa (CardContact).
    let cardScope: string[] | null = null;
    if (f.companyId) {
      const links = await this.prisma.cardContact.findMany({
        where: { contactId: f.companyId, contact: { organizationId: orgId } },
        select: { cardId: true },
      });
      cardScope = links.map((l) => l.cardId);
      if (cardScope.length === 0) return { events: [], timezone };
    }

    const where: Prisma.ActivityWhereInput = {
      organizationId: orgId,
      origin: 'USER',
      createdAt: { gte: f.from, lte: f.to },
      type: { in: [...PERFORMANCE_ACTION_TYPES] },
      actorId: f.userIds?.length ? { in: f.userIds } : { not: null },
      boardId: boardScope ? { in: boardScope } : { not: null },
      cardId: cardScope ? { in: cardScope } : { not: null },
    };

    const raw = await this.prisma.activity.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        type: true,
        payload: true,
        boardId: true,
        cardId: true,
        actorId: true,
        createdAt: true,
      },
    });

    const boardIds = [...new Set(raw.map((r) => r.boardId).filter((b): b is string => !!b))];
    const versions = boardIds.length
      ? await this.prisma.boardPerformanceConfigVersion.findMany({
          where: { boardId: { in: boardIds } },
          select: {
            boardId: true,
            effectiveFrom: true,
            createdAt: true,
            columns: true,
            transitionOverrides: true,
          },
        })
      : [];
    const byBoard = new Map<string, PerformanceConfigVersionLike[]>();
    for (const v of versions) {
      const arr = byBoard.get(v.boardId) ?? [];
      arr.push({
        effectiveFrom: v.effectiveFrom,
        createdAt: v.createdAt,
        columns: (Array.isArray(v.columns)
          ? v.columns
          : []) as unknown as PerformanceColumnConfig[],
        transitionOverrides: (Array.isArray(v.transitionOverrides)
          ? v.transitionOverrides
          : []) as unknown as TransitionOverride[],
      });
      byBoard.set(v.boardId, arr);
    }

    const events = raw.filter(isValidAction).map((r) => deriveEvent(r, byBoard));
    return { events, timezone };
  }

  async summary(tenant: TenantContext, f: PerformanceFilters): Promise<PerformanceSummaryResponse> {
    const { events, timezone } = await this.loadEvents(tenant, f);

    // Por colaborador
    const byUserMap = new Map<string, DerivedPerformanceEvent[]>();
    for (const e of events) {
      if (!e.actorId) continue;
      const arr = byUserMap.get(e.actorId) ?? [];
      arr.push(e);
      byUserMap.set(e.actorId, arr);
    }
    const users = byUserMap.size
      ? await this.prisma.user.findMany({
          where: { id: { in: [...byUserMap.keys()] } },
          select: { id: true, name: true, avatarUrl: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));
    // Ordem alfabetica (acompanhamento, nao ranking — spec §11).
    const byUser = [...byUserMap.entries()]
      .map(([id, evs]) => ({
        user: userMap.get(id) ?? { id, name: 'Usuário removido', avatarUrl: null },
        counters: aggregate(evs),
      }))
      .sort((a, b) => a.user.name.localeCompare(b.user.name, 'pt-BR'));

    // Por dia (fuso da org), inclusive dias sem nada
    const byDay = new Map<string, DerivedPerformanceEvent[]>();
    for (const e of events) {
      const k = dayKey(e.createdAt, timezone);
      const arr = byDay.get(k) ?? [];
      arr.push(e);
      byDay.set(k, arr);
    }
    const daily = daysBetween(f.from, f.to, timezone).map((day) => ({
      day,
      counters: aggregate(byDay.get(day) ?? []),
    }));

    // Fluxos com movimentacoes nao classificadas (spec §5.8: avisar)
    const unclassified = new Map<string, number>();
    for (const e of events) {
      if (e.isMove && e.movementClass === 'NAO_CLASSIFICADA' && e.boardId) {
        unclassified.set(e.boardId, (unclassified.get(e.boardId) ?? 0) + 1);
      }
    }
    const unBoards = unclassified.size
      ? await this.prisma.board.findMany({
          where: { id: { in: [...unclassified.keys()] } },
          select: { id: true, name: true },
        })
      : [];

    return {
      period: { from: f.from.toISOString(), to: f.to.toISOString(), timezone },
      totals: aggregate(events),
      byUser,
      daily,
      unconfiguredBoards: unBoards
        .map((b) => ({ id: b.id, name: b.name, unclassifiedMoves: unclassified.get(b.id) ?? 0 }))
        .sort((a, b) => b.unclassifiedMoves - a.unclassifiedMoves),
    };
  }

  /** Drill-down: eventos que compoem um numero, mais recentes primeiro. */
  async events(
    tenant: TenantContext,
    f: PerformanceFilters,
    metric: PerformanceMetric,
    page: number,
    pageSize: number,
  ): Promise<PerformanceEventsResponse> {
    const { events } = await this.loadEvents(tenant, f);
    const matched = events.filter((e) => matchesMetric(e, metric)).reverse();
    const slice = matched.slice((page - 1) * pageSize, page * pageSize);

    const cardIds = [...new Set(slice.map((e) => e.cardId).filter((x): x is string => !!x))];
    const boardIds = [...new Set(slice.map((e) => e.boardId).filter((x): x is string => !!x))];
    const actorIds = [...new Set(slice.map((e) => e.actorId).filter((x): x is string => !!x))];
    const listIds = [
      ...new Set(slice.flatMap((e) => [e.fromListId, e.toListId]).filter((x): x is string => !!x)),
    ];
    const [cards, boards, actors, lists] = await Promise.all([
      cardIds.length
        ? this.prisma.card.findMany({
            where: { id: { in: cardIds } },
            select: { id: true, title: true, shortCode: true },
          })
        : [],
      boardIds.length
        ? this.prisma.board.findMany({
            where: { id: { in: boardIds } },
            select: { id: true, name: true, color: true },
          })
        : [],
      actorIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, name: true, email: true, avatarUrl: true },
          })
        : [],
      listIds.length
        ? this.prisma.list.findMany({
            where: { id: { in: listIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);
    const cardMap = new Map(cards.map((c) => [c.id, c]));
    const boardMap = new Map(boards.map((b) => [b.id, b]));
    const actorMap = new Map(actors.map((a) => [a.id, a]));
    const listMap = new Map(lists.map((l) => [l.id, l.name]));

    return {
      total: matched.length,
      page,
      pageSize,
      items: slice.map((e) => {
        const p = (e.payload && typeof e.payload === 'object' ? e.payload : {}) as Record<
          string,
          unknown
        >;
        const name = (id: string | null, fallback: unknown) =>
          (id && listMap.get(id)) || (typeof fallback === 'string' ? fallback : null);
        return {
          id: e.id,
          type: e.type,
          payload: p,
          createdAt: e.createdAt.toISOString(),
          actor: e.actorId ? (actorMap.get(e.actorId) ?? null) : null,
          card: e.cardId ? (cardMap.get(e.cardId) ?? null) : null,
          board: e.boardId ? (boardMap.get(e.boardId) ?? null) : null,
          fromListName: e.isMove ? name(e.fromListId, p.fromListName) : null,
          toListName: e.isMove ? name(e.toListId, p.toListName) : null,
          movementClass: e.movementClass,
          conclusion: e.conclusion,
          isCompletion: e.isCompletion,
          isReopen: e.isReopen,
        };
      }),
    };
  }

  /** Drill-down de "Cards trabalhados": cards distintos com nº de acoes. */
  async cards(tenant: TenantContext, f: PerformanceFilters): Promise<PerformanceCardsResponse> {
    const { events } = await this.loadEvents(tenant, f);
    const agg = new Map<string, { boardId: string | null; actions: number; last: Date }>();
    for (const e of events) {
      if (!e.cardId) continue;
      const cur = agg.get(e.cardId) ?? { boardId: e.boardId, actions: 0, last: e.createdAt };
      cur.actions++;
      if (e.createdAt > cur.last) {
        cur.last = e.createdAt;
        cur.boardId = e.boardId;
      }
      agg.set(e.cardId, cur);
    }
    const ids = [...agg.keys()];
    const [cards, boards] = await Promise.all([
      ids.length
        ? this.prisma.card.findMany({
            where: { id: { in: ids } },
            select: { id: true, title: true, shortCode: true },
          })
        : [],
      this.prisma.board.findMany({
        where: {
          id: {
            in: [
              ...new Set([...agg.values()].map((v) => v.boardId).filter((x): x is string => !!x)),
            ],
          },
        },
        select: { id: true, name: true, color: true },
      }),
    ]);
    const boardMap = new Map(boards.map((b) => [b.id, b]));
    const items = cards
      .map((c) => {
        const a = agg.get(c.id)!;
        return {
          card: c,
          board: a.boardId ? (boardMap.get(a.boardId) ?? null) : null,
          actions: a.actions,
          lastActionAt: a.last.toISOString(),
        };
      })
      .sort((x, y) => y.lastActionAt.localeCompare(x.lastActionAt));
    return { total: items.length, items };
  }
}
