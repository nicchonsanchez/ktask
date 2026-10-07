import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CONCLUSION_CATEGORIES,
  GOAL_METRIC_COUNTER,
  PERFORMANCE_AREA_LABELS,
  PERFORMANCE_AREAS,
  type CreateGoalRequest,
  type GoalDto,
  type GoalMetric,
  type GoalPeriod,
  type GoalScopeType,
  type PerformanceArea,
  type PerformanceColumnConfig,
  type UpdateGoalRequest,
} from '@ktask/contracts';

import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';

import { periodRangeUtc, recentPeriods, targetForPeriod } from './goal-periods';
import { aggregate, dayKey, type DerivedPerformanceEvent } from './performance-aggregate';
import { PerformanceConfigService } from './performance-config.service';
import { PerformanceReportService, type PerformanceFilters } from './performance-report.service';

const HISTORY_PERIODS = 4;

/**
 * Doc 52 (Fase 4, D10) — metas configuraveis (Dono/Admin).
 * Progresso = o mesmo numero do relatorio (mesmo motor, mesmos filtros),
 * no alcance e periodo da meta. Alvo versionado por periodo.
 */
@Injectable()
export class PerformanceGoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PerformanceConfigService,
    private readonly report: PerformanceReportService,
  ) {}

  private async timezone(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    return org?.timezone || 'America/Sao_Paulo';
  }

  /** Valida que o alcance existe na org e devolve o rotulo legivel. */
  private async scopeLabel(
    tenant: TenantContext,
    scopeType: GoalScopeType,
    scopeId: string,
  ): Promise<string | null> {
    if (scopeType === 'AREA') {
      return (PERFORMANCE_AREAS as readonly string[]).includes(scopeId)
        ? PERFORMANCE_AREA_LABELS[scopeId as PerformanceArea]
        : null;
    }
    if (scopeType === 'USER') {
      const m = await this.prisma.membership.findFirst({
        where: { organizationId: tenant.organizationId, userId: scopeId },
        select: { user: { select: { name: true } } },
      });
      return m?.user.name ?? null;
    }
    const b = await this.prisma.board.findFirst({
      where: { id: scopeId, organizationId: tenant.organizationId },
      select: { name: true },
    });
    return b?.name ?? null;
  }

  private filtersFor(
    scopeType: GoalScopeType,
    scopeId: string,
    from: Date,
    to: Date,
  ): PerformanceFilters {
    if (scopeType === 'USER') return { from, to, userIds: [scopeId] };
    if (scopeType === 'AREA') return { from, to, area: scopeId as PerformanceArea };
    return { from, to, boardIds: [scopeId] };
  }

  /**
   * Metricas que dependem de configuracao: avisa em vez de mostrar 0
   * (0 pareceria "ninguem trabalhou").
   */
  private async needsConfig(
    tenant: TenantContext,
    metric: GoalMetric,
    scopeType: GoalScopeType,
    scopeId: string,
  ): Promise<string | null> {
    const configs = await this.prisma.boardPerformanceConfig.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...(scopeType === 'BOARD' ? { boardId: scopeId } : {}),
        ...(scopeType === 'AREA' ? { area: scopeId } : {}),
      },
      select: {
        contactLoggingEnabled: true,
        versions: {
          where: { effectiveFrom: { lte: new Date() } },
          orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
          take: 1,
          select: { columns: true },
        },
      },
    });
    const columns = configs.flatMap(
      (c) => ((c.versions[0]?.columns ?? []) as unknown as PerformanceColumnConfig[]) ?? [],
    );
    switch (metric) {
      case 'CONTACTS_DONE':
      case 'MEETINGS_HELD':
      case 'PROPOSALS_SENT':
        return configs.some((c) => c.contactLoggingEnabled)
          ? null
          : 'Ligue o registro de contato no fluxo para medir esta meta.';
      case 'MEETINGS_SCHEDULED':
        return columns.some((c) => c.meetingScheduled)
          ? null
          : 'Marque a coluna de reunião agendada na configuração do fluxo.';
      case 'ADVANCES':
        return columns.some((c) => c.progressOrder !== null)
          ? null
          : 'Configure a ordem do funil do fluxo para medir esta meta.';
      case 'COMPLETIONS':
        return columns.some((c) => c.category && CONCLUSION_CATEGORIES.includes(c.category))
          ? null
          : 'Defina a coluna de finalizado do fluxo para medir esta meta.';
    }
  }

  async list(tenant: TenantContext): Promise<GoalDto[]> {
    this.config.assertCanManage(tenant);
    const timeZone = await this.timezone(tenant.organizationId);
    const goals = await this.prisma.performanceGoal.findMany({
      where: { organizationId: tenant.organizationId, deletedAt: null },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { targets: true },
    });
    const now = new Date();

    const out: GoalDto[] = [];
    for (const g of goals) {
      const metric = g.metric as GoalMetric;
      const scopeType = g.scopeType as GoalScopeType;
      const period = g.period as GoalPeriod;
      const periods = recentPeriods(period, now, timeZone, HISTORY_PERIODS);
      const oldest = periods[periods.length - 1]!;
      const span = periodRangeUtc(oldest.start, periods[0]!.end, timeZone);
      const to = span.to > now ? now : span.to;

      const [label, needsConfig, loaded] = await Promise.all([
        this.scopeLabel(tenant, scopeType, g.scopeId),
        this.needsConfig(tenant, metric, scopeType, g.scopeId),
        g.isActive
          ? this.report.loadEvents(tenant, this.filtersFor(scopeType, g.scopeId, span.from, to))
          : Promise.resolve({ events: [] as DerivedPerformanceEvent[] }),
      ]);

      const byPeriod = new Map<string, DerivedPerformanceEvent[]>();
      for (const e of loaded.events) {
        const k = dayKey(e.createdAt, timeZone);
        const p = periods.find((x) => k >= x.start && k <= x.end);
        if (!p) continue;
        const arr = byPeriod.get(p.start) ?? [];
        arr.push(e);
        byPeriod.set(p.start, arr);
      }
      const counter = GOAL_METRIC_COUNTER[metric];
      const progress = periods.map((p) => ({
        start: p.start,
        end: p.end,
        value: aggregate(byPeriod.get(p.start) ?? [])[counter],
        target: targetForPeriod(g.targets, periodRangeUtc(p.start, p.end, timeZone).to),
      }));

      out.push({
        id: g.id,
        name: g.name,
        metric,
        scopeType,
        scopeId: g.scopeId,
        scopeLabel: label ?? '(removido)',
        period,
        isActive: g.isActive,
        target: progress[0]!.target,
        progress,
        needsConfig,
        createdAt: g.createdAt.toISOString(),
      });
    }
    return out;
  }

  /** Alvo novo vale desde o inicio do periodo atual. */
  private async currentPeriodStart(organizationId: string, period: GoalPeriod) {
    const tz = await this.timezone(organizationId);
    const [p] = recentPeriods(period, new Date(), tz, 1);
    return periodRangeUtc(p!.start, p!.end, tz).from;
  }

  async create(userId: string, tenant: TenantContext, body: CreateGoalRequest): Promise<GoalDto> {
    this.config.assertCanManage(tenant);
    const label = await this.scopeLabel(tenant, body.scopeType, body.scopeId);
    if (!label) throw new BadRequestException('Alcance da meta não encontrado nesta organização.');
    const effectiveFrom = await this.currentPeriodStart(tenant.organizationId, body.period);
    const goal = await this.prisma.performanceGoal.create({
      data: {
        organizationId: tenant.organizationId,
        name: body.name,
        metric: body.metric,
        scopeType: body.scopeType,
        scopeId: body.scopeId,
        period: body.period,
        isActive: body.isActive ?? true,
        createdById: userId,
        targets: { create: { target: body.target, effectiveFrom, createdById: userId } },
      },
      select: { id: true },
    });
    return this.one(tenant, goal.id);
  }

  async update(
    userId: string,
    tenant: TenantContext,
    id: string,
    body: UpdateGoalRequest,
  ): Promise<GoalDto> {
    this.config.assertCanManage(tenant);
    const goal = await this.getOrThrow(tenant, id);
    await this.prisma.$transaction(async (tx) => {
      if (body.name !== undefined || body.isActive !== undefined) {
        await tx.performanceGoal.update({
          where: { id },
          data: {
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          },
        });
      }
      if (body.target !== undefined) {
        const effectiveFrom = await this.currentPeriodStart(
          tenant.organizationId,
          goal.period as GoalPeriod,
        );
        // Mesmo periodo editado de novo: atualiza o alvo em vez de empilhar.
        const same = await tx.performanceGoalTarget.findFirst({
          where: { goalId: id, effectiveFrom },
          select: { id: true },
        });
        if (same) {
          await tx.performanceGoalTarget.update({
            where: { id: same.id },
            data: { target: body.target, createdById: userId },
          });
        } else {
          await tx.performanceGoalTarget.create({
            data: { goalId: id, target: body.target, effectiveFrom, createdById: userId },
          });
        }
      }
    });
    return this.one(tenant, id);
  }

  async remove(tenant: TenantContext, id: string) {
    this.config.assertCanManage(tenant);
    await this.getOrThrow(tenant, id);
    await this.prisma.performanceGoal.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  private async getOrThrow(tenant: TenantContext, id: string) {
    const g = await this.prisma.performanceGoal.findFirst({
      where: { id, organizationId: tenant.organizationId, deletedAt: null },
      select: { id: true, period: true },
    });
    if (!g) throw new NotFoundException('Meta não encontrada.');
    return g;
  }

  private async one(tenant: TenantContext, id: string): Promise<GoalDto> {
    const all = await this.list(tenant);
    const g = all.find((x) => x.id === id);
    if (!g) throw new NotFoundException('Meta não encontrada.');
    return g;
  }
}
