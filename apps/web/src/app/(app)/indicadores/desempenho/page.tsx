'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRightLeft,
  ArrowUpRight,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  CheckCircle2,
  ChevronRight,
  FileText,
  Layers,
  MessageSquare,
  MousePointerClick,
  PhoneCall,
  PhoneOutgoing,
  Presentation,
  Settings2,
  Shuffle,
  Table2,
  Target,
  Users,
} from 'lucide-react';
import { buttonVariants } from '@ktask/ui';
import {
  canViewPerformanceReport,
  PERFORMANCE_AREA_LABELS,
  type PerformanceArea,
  type PerformanceCounters,
  type PerformanceMetric,
} from '@ktask/contracts';

import { api } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth-store';
import { boardsQueries } from '@/lib/queries/boards';
import { orgMembersQuery } from '@/lib/queries/cards';
import { contactsQueries } from '@/lib/queries/contacts';
import { goalsQuery, performanceQueries, type PerformanceParams } from '@/lib/queries/performance';
import { GoalProgressCard } from '@/components/performance/goals';
import { FlowSection } from '@/components/performance/flow-section';
import { periodRange, type PeriodPreset } from '@/lib/performance-period';
import { UserAvatar } from '@/components/user-avatar';
import {
  PerformanceFilters,
  type PerformanceFilterState,
} from '@/components/performance/performance-filters';
import {
  EventsList,
  METRIC_LABELS,
  PerformanceDrilldown,
} from '@/components/performance/performance-drilldown';
import {
  EmptyState,
  IconChip,
  Panel,
  SectionHeading,
  Segmented,
  Spinner,
  StatTile,
  TONE_BAR,
  TONE_TEXT,
  type Tone,
} from '@/components/performance/ui';

/**
 * Doc 52 — aba "Desempenho da equipe" (spec §10–§13). Visual: doc 53.
 *
 * Responde "o que cada pessoa fez no período", com todo número clicável
 * (drill-down). So conta acoes humanas: automacao, sistema, aprovacao e
 * importacao ficam de fora. Acompanhamento, nao ranking: tabela em ordem
 * alfabetica. Filtros na URL (link compartilhavel).
 */

const DEFAULT_TZ = 'America/Sao_Paulo';
const PRESETS: PeriodPreset[] = ['today', 'yesterday', '7d', '15d', '30d', '90d', 'custom'];

type ChartMetric =
  | 'actions'
  | 'cardsWorked'
  | 'moves'
  | 'advances'
  | 'completions'
  | 'comments'
  | 'contactsDone';
const CHART_METRICS: Array<{ key: ChartMetric; label: string }> = [
  { key: 'actions', label: 'Ações' },
  { key: 'cardsWorked', label: 'Cards trabalhados' },
  { key: 'moves', label: 'Movimentações' },
  { key: 'advances', label: 'Avanços' },
  { key: 'completions', label: 'Finalizações' },
  { key: 'comments', label: 'Comentários' },
  { key: 'contactsDone', label: 'Contatos realizados' },
];

function readFilters(sp: URLSearchParams): PerformanceFilterState {
  const period = sp.get('periodo') as PeriodPreset | null;
  return {
    period: period && PRESETS.includes(period) ? period : '7d',
    customFrom: sp.get('de') ?? '',
    customTo: sp.get('ate') ?? '',
    area: (sp.get('area') as PerformanceArea | null) ?? '',
    boardIds: (sp.get('fluxos') ?? '').split(',').filter(Boolean),
    userId: sp.get('user') ?? '',
    companyId: sp.get('cliente') ?? '',
  };
}

function writeFilters(f: PerformanceFilterState): string {
  const sp = new URLSearchParams();
  if (f.period !== '7d') sp.set('periodo', f.period);
  if (f.period === 'custom') {
    if (f.customFrom) sp.set('de', f.customFrom);
    if (f.customTo) sp.set('ate', f.customTo);
  }
  if (f.area) sp.set('area', f.area);
  if (f.boardIds.length) sp.set('fluxos', f.boardIds.join(','));
  if (f.userId) sp.set('user', f.userId);
  if (f.companyId) sp.set('cliente', f.companyId);
  return sp.toString();
}

const dayLabel = (key: string) => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const wd = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(dt);
  return `${wd.replace('.', '')} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
};

export default function DesempenhoPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = readFilters(new URLSearchParams(searchParams.toString()));

  const orgQ = useQuery({
    queryKey: ['org', 'current'],
    queryFn: () => api.get<{ myRole: string; timezone?: string }>('/api/v1/organizations/current'),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
  const allowed = canViewPerformanceReport(orgQ.data?.myRole);
  const timeZone = orgQ.data?.timezone || DEFAULT_TZ;

  const boardsQ = useQuery({ ...boardsQueries.all(), enabled: allowed });
  const membersQ = useQuery({ ...orgMembersQuery, enabled: allowed });
  const companiesQ = useQuery({
    ...contactsQueries.list({ type: 'COMPANY', hasCards: true }),
    enabled: allowed,
  });

  const range = useMemo(
    () => periodRange(filters.period, timeZone, { from: filters.customFrom, to: filters.customTo }),
    [filters.period, filters.customFrom, filters.customTo, timeZone],
  );

  const boardKey = filters.boardIds.join(',');
  const params: PerformanceParams = useMemo(
    () => ({
      from: range.from,
      to: range.to,
      boardIds: boardKey ? boardKey.split(',') : undefined,
      userIds: filters.userId ? [filters.userId] : undefined,
      area: filters.area || undefined,
      companyId: filters.companyId || undefined,
    }),
    [range.from, range.to, boardKey, filters.userId, filters.area, filters.companyId],
  );

  const summaryQ = useQuery({ ...performanceQueries.summary(params), enabled: allowed });
  const goalsQ = useQuery({ ...goalsQuery(), enabled: allowed });

  const [drill, setDrill] = useState<{
    metric: PerformanceMetric;
    userId?: string;
    userName?: string;
  } | null>(null);
  const [chartMetric, setChartMetric] = useState<ChartMetric>('actions');
  const [dailyView, setDailyView] = useState<'chart' | 'table'>('chart');

  function update(next: Partial<PerformanceFilterState>) {
    const qs = writeFilters({ ...filters, ...next });
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  if (orgQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="container py-10">
        <p className="text-fg-muted text-sm">
          O Desempenho da Equipe está disponível apenas para Dono e Administrador.
        </p>
      </div>
    );
  }

  const members = (membersQ.data ?? [])
    .map((m) => ({ id: m.user.id, name: m.user.name, avatarUrl: m.user.avatarUrl }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const selectedUser = members.find((m) => m.id === filters.userId) ?? null;
  const periodText =
    range.fromKey === range.toKey
      ? dayLabel(range.fromKey)
      : `${dayLabel(range.fromKey)} a ${dayLabel(range.toKey)}`;

  const drillParams: PerformanceParams = drill?.userId
    ? { ...params, userIds: [drill.userId] }
    : params;

  const activeGoals = (goalsQ.data ?? []).filter((g) => g.isActive);
  const data = summaryQ.data;

  return (
    <div className="container flex flex-col gap-6 py-6">
      {/* Cabecalho da aba */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-fg text-xl font-semibold tracking-tight">Desempenho da equipe</h2>
          <p className="text-fg-muted mt-1 text-sm">
            O que cada pessoa fez no período. Conta só ações feitas por pessoas — automações e ações
            do sistema não entram. Clique em qualquer número para ver os registros.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/indicadores/desempenho/metas"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Target size={14} /> Gerenciar metas
          </Link>
          <Link
            href="/indicadores/desempenho/configuracao"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Settings2 size={14} /> Configurar relatórios
          </Link>
        </div>
      </div>

      {/* Metas ativas (Fase 4, D10) */}
      {activeGoals.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeading
            description="Período atual de cada meta, com os 3 anteriores"
            actions={
              <Link
                href="/indicadores/desempenho/metas"
                className="text-primary inline-flex items-center gap-0.5 text-xs font-medium hover:underline"
              >
                Gerenciar metas <ChevronRight size={14} />
              </Link>
            }
          >
            Metas
          </SectionHeading>
          <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:scroll-px-0 sm:grid-cols-[repeat(auto-fill,minmax(250px,1fr))] sm:overflow-visible sm:px-0 sm:pb-0">
            {activeGoals.map((g) => (
              <div key={g.id} className="w-[82%] shrink-0 snap-start sm:w-auto">
                <GoalProgressCard goal={g} />
              </div>
            ))}
          </div>
        </section>
      )}
      {goalsQ.data && activeGoals.length === 0 && (
        <Link
          href="/indicadores/desempenho/metas"
          className="border-border hover:border-primary/50 hover:bg-primary/5 flex items-center gap-3 rounded-xl border border-dashed p-4 transition-colors"
        >
          <IconChip tone="primary" size="sm">
            <Target size={14} />
          </IconChip>
          <span className="flex flex-col">
            <span className="text-fg text-sm font-medium">Criar metas</span>
            <span className="text-fg-muted text-xs">
              Contatos, reuniões, propostas, avanços e fechamentos por pessoa, área ou fluxo.
            </span>
          </span>
          <ChevronRight size={16} className="text-fg-muted ml-auto" />
        </Link>
      )}

      <PerformanceFilters
        value={filters}
        onChange={update}
        boards={(boardsQ.data ?? []).map((b) => ({ id: b.id, name: b.name }))}
        members={members}
        companies={(companiesQ.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
      />

      {summaryQ.isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      ) : summaryQ.isError || !data ? (
        <p className="text-fg-muted text-sm">Não foi possível carregar o relatório.</p>
      ) : (
        <>
          {/* Contexto do resultado */}
          <div className="flex flex-wrap items-center gap-2">
            {selectedUser && (
              <span className="bg-primary/10 text-primary inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-xs font-medium">
                <UserAvatar
                  name={selectedUser.name}
                  userId={selectedUser.id}
                  avatarUrl={selectedUser.avatarUrl}
                  size="xs"
                />
                {selectedUser.name}
              </span>
            )}
            <span className="text-fg inline-flex items-center gap-1.5 text-sm font-medium">
              <CalendarDays size={15} className="text-fg-muted" />
              <span className="inline-block first-letter:uppercase">{periodText}</span>
            </span>
            {filters.area && (
              <span className="bg-bg-muted text-fg-muted rounded-full px-2.5 py-0.5 text-[11px] font-medium">
                {PERFORMANCE_AREA_LABELS[filters.area]}
              </span>
            )}
          </div>

          {/* KPIs (spec §5.6/§10): atividade + composicao das movimentacoes */}
          <div className="grid gap-4 lg:grid-cols-5">
            <Panel
              title="Atividade"
              icon={<MousePointerClick size={14} />}
              className="flex flex-col lg:col-span-2"
              bodyClassName="grid flex-1 grid-cols-3 content-center gap-2 pt-3 sm:gap-3 sm:pt-4"
            >
              <MiniStat
                icon={<Layers size={14} />}
                label="Cards trabalhados"
                value={data.totals.cardsWorked}
                onClick={() => setDrill({ metric: 'CARDS' })}
              />
              <MiniStat
                icon={<MousePointerClick size={14} />}
                label="Ações"
                value={data.totals.actions}
                onClick={() => setDrill({ metric: 'ACTIONS' })}
              />
              <MiniStat
                icon={<MessageSquare size={14} />}
                label="Comentários"
                value={data.totals.comments}
                onClick={() => setDrill({ metric: 'COMMENTS' })}
              />
            </Panel>
            <MovesPanel
              t={data.totals}
              className="lg:col-span-3"
              onDrill={(metric) => setDrill({ metric })}
            />
          </div>

          {/* Comercial (Fase 3, spec §14) — so com registros ou filtro Comercial */}
          {(data.totals.contacts > 0 ||
            data.followUps.pending > 0 ||
            filters.area === 'COMERCIAL') && (
            <Panel
              title="Comercial"
              description="Registros feitos pelos botões de contato nos cards"
              icon={<PhoneCall size={14} />}
              bodyClassName="flex flex-col gap-4 xl:flex-row"
            >
              <ol className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {[
                  {
                    icon: <PhoneCall size={14} />,
                    label: 'Registros de contato',
                    value: data.totals.contacts,
                    metric: 'CONTACTS' as const,
                    tone: 'primary' as const,
                  },
                  {
                    icon: <PhoneOutgoing size={14} />,
                    label: 'Contatos realizados',
                    value: data.totals.contactsDone,
                    metric: 'CONTACTS_DONE' as const,
                    tone: 'positive' as const,
                    sub:
                      data.totals.contacts > 0
                        ? `${Math.round((data.totals.contactsDone / data.totals.contacts) * 100)}% dos registros`
                        : undefined,
                  },
                  {
                    icon: <CalendarClock size={14} />,
                    label: 'Reuniões agendadas',
                    value: data.totals.meetingsScheduled,
                    metric: 'MEETINGS_SCHEDULED' as const,
                    tone: 'info' as const,
                  },
                  {
                    icon: <Presentation size={14} />,
                    label: 'Reuniões realizadas',
                    value: data.totals.meetingsHeld,
                    metric: 'CONTACTS' as const,
                    tone: 'info' as const,
                  },
                  {
                    icon: <FileText size={14} />,
                    label: 'Propostas enviadas',
                    value: data.totals.proposalsSent,
                    metric: 'CONTACTS' as const,
                    tone: 'positive' as const,
                  },
                ].map((s, i) => (
                  <li key={s.label} className="relative">
                    <StatTile
                      icon={s.icon}
                      label={s.label}
                      value={s.value}
                      tone={s.tone}
                      sub={s.sub}
                      className="h-full"
                      onClick={() => setDrill({ metric: s.metric })}
                    />
                    {i < 4 && (
                      <ChevronRight
                        aria-hidden
                        size={16}
                        className="text-fg-subtle bg-bg absolute -right-[14px] top-1/2 z-[1] hidden -translate-y-1/2 rounded-full lg:block"
                      />
                    )}
                  </li>
                ))}
              </ol>
              <div className="bg-bg-subtle grid grid-cols-2 gap-3 rounded-xl p-3 xl:w-64 xl:grid-cols-1">
                <FollowUpStat
                  label="Follow-ups pendentes"
                  value={data.followUps.pending}
                  hint="tarefas de retorno em aberto agora"
                />
                <FollowUpStat
                  label="Follow-ups vencidos"
                  value={data.followUps.overdue}
                  hint="aparecem na Home de quem registrou"
                  danger
                />
              </div>
            </Panel>
          )}

          {/* Resumo por colaborador (spec §11) */}
          {!selectedUser && (
            <Panel
              title="Resumo por colaborador"
              description="Ordem alfabética · clique no nome para ver o histórico"
              icon={<Users size={14} />}
              bodyClassName="px-0 pb-2 sm:px-0 sm:pb-2"
            >
              {data.byUser.length === 0 ? (
                <EmptyState icon={<Users size={16} />} title="Nenhuma ação registrada no período" />
              ) : (
                <UserTable
                  rows={data.byUser}
                  showContacts={data.totals.contacts > 0}
                  onPick={(id) => update({ userId: id })}
                  onDrill={(metric, u) => setDrill({ metric, userId: u.id, userName: u.name })}
                />
              )}
            </Panel>
          )}

          {/* Evolucao no periodo (spec §13) + visao por dia (spec §5.7) */}
          {data.daily.length > 1 && (
            <Panel
              title="Evolução no período"
              icon={<ChartColumn size={14} />}
              actions={
                data.daily.length <= 31 ? (
                  <Segmented
                    ariaLabel="Visualização"
                    size="sm"
                    value={dailyView}
                    onChange={setDailyView}
                    options={[
                      {
                        key: 'chart',
                        label: (
                          <span className="inline-flex items-center gap-1">
                            <ChartColumn size={12} /> Gráfico
                          </span>
                        ),
                      },
                      {
                        key: 'table',
                        label: (
                          <span className="inline-flex items-center gap-1">
                            <Table2 size={12} /> Tabela por dia
                          </span>
                        ),
                      },
                    ]}
                  />
                ) : undefined
              }
              bodyClassName="flex flex-col gap-4"
            >
              {dailyView === 'table' && data.daily.length <= 31 ? (
                <DailyTable data={data.daily} />
              ) : (
                <>
                  <Segmented
                    ariaLabel="Métrica do gráfico"
                    size="sm"
                    value={chartMetric}
                    onChange={setChartMetric}
                    options={CHART_METRICS}
                  />
                  <DailyBars data={data.daily} metric={chartMetric} />
                </>
              )}
            </Panel>
          )}

          {/* Fluxo do trabalho por quadro (Fase 5, spec §15) */}
          {!selectedUser && <FlowSection params={params} />}

          {/* Visao individual (spec §12) */}
          {selectedUser && (
            <Panel
              title={
                <span className="flex items-center gap-2.5">
                  <UserAvatar
                    name={selectedUser.name}
                    userId={selectedUser.id}
                    avatarUrl={selectedUser.avatarUrl}
                    size="lg"
                  />
                  Histórico de {selectedUser.name}
                </span>
              }
              description={
                <span className="inline-block first-letter:uppercase">{periodText}</span>
              }
              actions={
                <button
                  type="button"
                  onClick={() => update({ userId: '' })}
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                >
                  <ArrowLeft size={14} /> Ver equipe toda
                </button>
              }
            >
              <EventsList
                key={JSON.stringify(params)}
                params={params}
                metric="ACTIONS"
                timeZone={timeZone}
                showActor={false}
              />
            </Panel>
          )}
        </>
      )}

      {drill && (
        <PerformanceDrilldown
          open
          onOpenChange={(v) => !v && setDrill(null)}
          params={drillParams}
          metric={drill.metric}
          subtitle={`${drill.userName ? `${drill.userName} · ` : selectedUser ? `${selectedUser.name} · ` : ''}${periodText}`}
          timeZone={timeZone}
        />
      )}
    </div>
  );
}

/** Numero grande clicavel dentro de um painel (sem borda propria). */
function MiniStat({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Ver os registros de ${label.toLowerCase()}`}
      className="hover:bg-bg-subtle focus-visible:ring-primary/30 flex min-w-0 flex-col gap-2 rounded-lg p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 sm:p-3"
    >
      <span className="text-fg-muted flex items-start gap-1.5 text-xs font-medium leading-tight">
        <span className="text-primary mt-px shrink-0">{icon}</span>
        <span>{label}</span>
      </span>
      <span className="text-fg text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">
        {value}
      </span>
    </button>
  );
}

const MOVE_PARTS: Array<{
  key: 'advances' | 'retreats' | 'transfers' | 'completions';
  label: string;
  metric: PerformanceMetric;
  tone: Tone;
  icon: React.ReactNode;
}> = [
  {
    key: 'advances',
    label: 'Avanços',
    metric: 'AVANCO',
    tone: 'positive',
    icon: <ArrowUpRight size={14} />,
  },
  {
    key: 'retreats',
    label: 'Retrocessos',
    metric: 'RETROCESSO',
    tone: 'negative',
    icon: <ArrowDownLeft size={14} />,
  },
  {
    key: 'transfers',
    label: 'Transferências',
    metric: 'TRANSFERENCIA',
    tone: 'info',
    icon: <ArrowRightLeft size={14} />,
  },
  {
    key: 'completions',
    label: 'Finalizações',
    metric: 'FINALIZACOES',
    tone: 'primary',
    icon: <CheckCircle2 size={14} />,
  },
];

/** Movimentacoes + composicao (avancos, retrocessos, transferencias, finalizacoes). */
function MovesPanel({
  t,
  className,
  onDrill,
}: {
  t: PerformanceCounters;
  className?: string;
  onDrill: (metric: PerformanceMetric) => void;
}) {
  const parts = MOVE_PARTS.map((p) => ({ ...p, value: t[p.key] }));
  const sum = parts.reduce((a, p) => a + p.value, 0);
  const total = Math.max(t.moves, sum, 1);
  return (
    <Panel
      title="Movimentações"
      icon={<Shuffle size={14} />}
      className={className}
      actions={
        <button
          type="button"
          onClick={() => onDrill('MOVES')}
          title="Ver os registros de movimentações"
          className="hover:text-primary text-fg text-3xl font-semibold tabular-nums tracking-tight transition-colors"
        >
          {t.moves}
        </button>
      }
      bodyClassName="flex flex-col gap-4 pt-3 sm:pt-4"
    >
      <div
        className="bg-bg-muted flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full"
        aria-hidden
      >
        {parts.map((p) =>
          p.value > 0 ? (
            <span
              key={p.key}
              className={cn('h-full first:rounded-l-full last:rounded-r-full', TONE_BAR[p.tone])}
              style={{ width: `${(p.value / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {parts.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onDrill(p.metric)}
            title={`Ver os registros de ${p.label.toLowerCase()}`}
            className="hover:bg-bg-subtle focus-visible:ring-primary/30 flex flex-col gap-1 rounded-lg p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2"
          >
            <span className="text-fg-muted flex items-center gap-1.5 text-xs font-medium">
              <span className={cn('size-2 shrink-0 rounded-full', TONE_BAR[p.tone])} />
              {p.label}
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-fg text-xl font-semibold tabular-nums">{p.value}</span>
              <span className={cn('shrink-0', TONE_TEXT[p.tone])}>{p.icon}</span>
            </span>
          </button>
        ))}
      </div>
      <MovesSentence t={t} />
    </Panel>
  );
}

function FollowUpStat({
  label,
  value,
  hint,
  danger,
}: {
  label: string;
  value: number;
  hint: string;
  danger?: boolean;
}) {
  const alert = danger && value > 0;
  return (
    <div className="flex items-start gap-3" title={hint}>
      <IconChip tone={alert ? 'negative' : 'neutral'} size="sm">
        <CalendarClock size={14} />
      </IconChip>
      <div className="flex min-w-0 flex-col">
        <span className="text-fg-muted text-xs font-medium">{label}</span>
        <span
          className={cn(
            'text-xl font-semibold tabular-nums',
            alert ? TONE_TEXT.negative : 'text-fg',
          )}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

function UserTable({
  rows,
  showContacts,
  onPick,
  onDrill,
}: {
  rows: Array<{
    user: { id: string; name: string; avatarUrl: string | null };
    counters: PerformanceCounters;
  }>;
  showContacts: boolean;
  onPick: (userId: string) => void;
  onDrill: (metric: PerformanceMetric, u: { id: string; name: string }) => void;
}) {
  const maxActions = Math.max(1, ...rows.map((r) => r.counters.actions));
  const th =
    'px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap';
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-bg-subtle text-fg-muted border-border/60 border-y text-left">
          <tr>
            <th className={cn(th, 'pl-4 text-left sm:pl-5')}>Colaborador</th>
            <th className={th}>Cards trabalhados</th>
            <th className={cn(th, 'w-40')}>Ações</th>
            <th className={th}>Movimentações</th>
            <th className={th}>Avanços</th>
            <th className={th}>Finalizações</th>
            <th className={cn(th, !showContacts && 'pr-4 sm:pr-5')}>Comentários</th>
            {showContacts && <th className={cn(th, 'pr-4 sm:pr-5')}>Contatos</th>}
          </tr>
        </thead>
        <tbody className="divide-border/50 divide-y">
          {rows.map(({ user: u, counters }) => {
            const cell = (metric: PerformanceMetric, value: number, last = false) => (
              <td className={cn('px-3 py-3 text-right tabular-nums', last && 'pr-4 sm:pr-5')}>
                {value === 0 ? (
                  <span className="text-fg-subtle">–</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onDrill(metric, u)}
                    title={`Ver ${METRIC_LABELS[metric].toLowerCase()} de ${u.name}`}
                    className="text-fg hover:text-primary hover:bg-primary/10 -mx-1.5 rounded px-1.5 py-0.5 font-medium transition-colors"
                  >
                    {value}
                  </button>
                )}
              </td>
            );
            return (
              <tr key={u.id} className="hover:bg-bg-subtle/60 transition-colors">
                <td className="py-3 pl-4 pr-3 sm:pl-5">
                  <button
                    type="button"
                    onClick={() => onPick(u.id)}
                    className="group flex min-w-0 items-center gap-3 text-left"
                  >
                    <UserAvatar name={u.name} userId={u.id} avatarUrl={u.avatarUrl} size="lg" />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-fg group-hover:text-primary truncate font-medium">
                        {u.name}
                      </span>
                      <span className="text-fg-muted inline-flex items-center gap-0.5 text-[11px]">
                        Ver histórico <ChevronRight size={12} />
                      </span>
                    </span>
                  </button>
                </td>
                {cell('CARDS', counters.cardsWorked)}
                <td className="px-3 py-3 text-right tabular-nums">
                  <div className="flex items-center justify-end gap-2">
                    <span className="bg-bg-muted hidden h-1.5 w-16 overflow-hidden rounded-full sm:block">
                      <span
                        className="bg-primary/60 block h-full rounded-full"
                        style={{ width: `${(counters.actions / maxActions) * 100}%` }}
                      />
                    </span>
                    {counters.actions === 0 ? (
                      <span className="text-fg-subtle">–</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onDrill('ACTIONS', u)}
                        title={`Ver ações de ${u.name}`}
                        className="text-fg hover:text-primary hover:bg-primary/10 -mx-1.5 rounded px-1.5 py-0.5 font-medium transition-colors"
                      >
                        {counters.actions}
                      </button>
                    )}
                  </div>
                </td>
                {cell('MOVES', counters.moves)}
                {cell('AVANCO', counters.advances)}
                {cell('FINALIZACOES', counters.completions)}
                {cell('COMMENTS', counters.comments, !showContacts)}
                {showContacts && cell('CONTACTS_DONE', counters.contactsDone, true)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function niceMax(v: number): number {
  if (v <= 4) return Math.max(1, v);
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = pow / 2;
  return Math.ceil(v / step) * step;
}

function DailyBars({
  data,
  metric,
}: {
  data: Array<{ day: string; counters: PerformanceCounters }>;
  metric: ChartMetric;
}) {
  const realMax = Math.max(0, ...data.map((d) => d.counters[metric]));
  const max = niceMax(realMax);
  const showValues = data.length <= 31;
  const labelEvery = data.length <= 15 ? 1 : data.length <= 31 ? 3 : 7;
  const total = data.reduce((a, d) => a + d.counters[metric], 0);
  const label = CHART_METRICS.find((m) => m.key === metric)?.label ?? '';
  return (
    <figure className="flex flex-col gap-2" aria-label={`Gráfico diário de ${label}`}>
      <div className="relative h-52 pl-8 sm:h-60">
        {[1, 0.5, 0].map((f) => (
          <div
            key={f}
            className="absolute inset-x-0 flex items-center gap-2"
            style={{ bottom: `${f * 100}%`, transform: 'translateY(50%)' }}
            aria-hidden
          >
            <span className="text-fg-subtle w-6 text-right text-[10px] tabular-nums">
              {Math.round(max * f)}
            </span>
            <span
              className={cn(
                'h-px flex-1',
                f === 0 ? 'bg-border' : 'bg-border/60 [background-image:none]',
              )}
            />
          </div>
        ))}
        <div className="relative flex h-full items-end gap-1 sm:gap-2">
          {data.map((d) => {
            const v = d.counters[metric];
            return (
              <div
                key={d.day}
                className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                title={`${dayLabel(d.day)}: ${v}`}
              >
                {showValues && v > 0 && (
                  <span className="text-fg-muted group-hover:text-fg mb-1 text-[10px] font-medium tabular-nums">
                    {v}
                  </span>
                )}
                <div
                  className={cn(
                    'w-full max-w-12 rounded-t-md transition-colors',
                    v > 0 ? 'bg-primary/75 group-hover:bg-primary' : 'bg-transparent',
                  )}
                  style={{ height: `${(v / max) * 100}%` }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex gap-1 pl-8 sm:gap-2" aria-hidden>
        {data.map((d, i) => (
          <span
            key={d.day}
            className="text-fg-muted min-w-0 flex-1 truncate text-center text-[10px] capitalize"
          >
            {i % labelEvery === 0 || i === data.length - 1 ? (
              <>
                <span className="hidden sm:inline">{dayLabel(d.day)}</span>
                <span className="sm:hidden">{dayLabel(d.day).split(' ')[1]?.slice(0, 5)}</span>
              </>
            ) : (
              ''
            )}
          </span>
        ))}
      </div>
      <figcaption className="text-fg-muted text-xs">
        Total no período: <strong className="text-fg font-semibold">{total}</strong> · pico de{' '}
        {realMax} em um dia
      </figcaption>
    </figure>
  );
}

function MovesSentence({ t }: { t: PerformanceCounters }) {
  if (t.moves === 0) return null;
  return (
    <p className="text-fg-muted border-border/60 border-t pt-3 text-xs">
      {t.moves} movimentações = {t.advances} avanços, {t.retreats} retrocessos, {t.transfers}{' '}
      transferências e {t.completions} finalizações
      {t.unclassifiedMoves > 0 ? ` (${t.unclassifiedMoves} sem classificação)` : ''}.
    </p>
  );
}

function DailyTable({ data }: { data: Array<{ day: string; counters: PerformanceCounters }> }) {
  const th =
    'px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap';
  return (
    <div className="border-border/60 overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="bg-bg-subtle text-fg-muted text-left">
          <tr>
            <th className={cn(th, 'pl-4 text-left')}>Dia</th>
            <th className={th}>{METRIC_LABELS.CARDS}</th>
            <th className={th}>Avanços</th>
            <th className={th}>Retrocessos</th>
            <th className={cn(th, 'pr-4')}>Finalizações</th>
          </tr>
        </thead>
        <tbody className="divide-border/50 divide-y">
          {data.map((d) => (
            <tr
              key={d.day}
              className={cn('hover:bg-bg-subtle/60', d.counters.actions === 0 && 'text-fg-subtle')}
            >
              <td className="py-2.5 pl-4 pr-3 font-medium capitalize">{dayLabel(d.day)}</td>
              <td className="px-3 text-right tabular-nums">{d.counters.cardsWorked}</td>
              <td className="px-3 text-right tabular-nums">{d.counters.advances}</td>
              <td className="px-3 text-right tabular-nums">{d.counters.retreats}</td>
              <td className="px-3 pr-4 text-right tabular-nums">{d.counters.completions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
