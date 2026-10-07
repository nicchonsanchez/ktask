'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  FileText,
  PhoneCall,
  PhoneOutgoing,
  Presentation,
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  CheckCircle2,
  Layers,
  Loader2,
  MessageSquare,
  MousePointerClick,
  Settings2,
  Shuffle,
} from 'lucide-react';
import {
  canViewPerformanceReport,
  type PerformanceArea,
  type PerformanceCounters,
  type PerformanceMetric,
} from '@ktask/contracts';

import { api } from '@/lib/api-client';
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

/**
 * Doc 52 — aba "Desempenho da equipe" (spec §10–§13).
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

  function update(next: Partial<PerformanceFilterState>) {
    const qs = writeFilters({ ...filters, ...next });
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  if (orgQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="text-fg-muted animate-spin" />
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
    .map((m) => ({ id: m.user.id, name: m.user.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const selectedUser = members.find((m) => m.id === filters.userId) ?? null;
  const periodText =
    range.fromKey === range.toKey
      ? dayLabel(range.fromKey)
      : `${dayLabel(range.fromKey)} a ${dayLabel(range.toKey)}`;

  const drillParams: PerformanceParams = drill?.userId
    ? { ...params, userIds: [drill.userId] }
    : params;

  return (
    <div className="container flex flex-col gap-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-fg-muted text-xs">
          O que cada pessoa fez no período. Conta só ações feitas por pessoas — automações e ações
          do sistema não entram. Clique em qualquer número para ver os registros.
        </p>
        <Link
          href="/indicadores/desempenho/configuracao"
          className="border-border text-fg-muted hover:text-fg inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs"
        >
          <Settings2 size={13} /> Configurar relatórios
        </Link>
      </div>

      {/* Metas ativas (Fase 4, D10) */}
      {(goalsQ.data ?? []).some((g) => g.isActive) && (
        <section className="flex flex-col gap-2">
          <header className="flex items-center justify-between">
            <h2 className="text-fg-muted text-xs font-semibold uppercase tracking-wide">Metas</h2>
            <Link
              href="/indicadores/desempenho/metas"
              className="text-primary text-xs hover:underline"
            >
              Gerenciar metas
            </Link>
          </header>
          <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:scroll-px-0 sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-3">
            {(goalsQ.data ?? [])
              .filter((g) => g.isActive)
              .map((g) => (
                <div key={g.id} className="w-[85%] shrink-0 snap-start sm:w-auto">
                  <GoalProgressCard goal={g} />
                </div>
              ))}
          </div>
        </section>
      )}
      {goalsQ.data && !goalsQ.data.some((g) => g.isActive) && (
        <Link
          href="/indicadores/desempenho/metas"
          className="text-primary w-fit text-xs hover:underline"
        >
          Criar metas
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
          <Loader2 size={20} className="text-fg-muted animate-spin" />
        </div>
      ) : summaryQ.isError || !summaryQ.data ? (
        <p className="text-fg-muted text-sm">Não foi possível carregar o relatório.</p>
      ) : (
        <>
          <p className="text-fg text-sm font-medium">
            {selectedUser ? `${selectedUser.name} · ` : ''}
            {periodText}
          </p>

          {/* KPIs (spec §5.6/§10) */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <Kpi
              icon={<Layers size={14} />}
              label="Cards trabalhados"
              value={summaryQ.data.totals.cardsWorked}
              onClick={() => setDrill({ metric: 'CARDS' })}
            />
            <Kpi
              icon={<MousePointerClick size={14} />}
              label="Ações"
              value={summaryQ.data.totals.actions}
              onClick={() => setDrill({ metric: 'ACTIONS' })}
            />
            <Kpi
              icon={<Shuffle size={14} />}
              label="Movimentações"
              value={summaryQ.data.totals.moves}
              onClick={() => setDrill({ metric: 'MOVES' })}
            />
            <Kpi
              icon={<ArrowUpRight size={14} />}
              label="Avanços"
              value={summaryQ.data.totals.advances}
              accent="text-emerald-600"
              onClick={() => setDrill({ metric: 'AVANCO' })}
            />
            <Kpi
              icon={<ArrowDownLeft size={14} />}
              label="Retrocessos"
              value={summaryQ.data.totals.retreats}
              accent="text-red-500"
              onClick={() => setDrill({ metric: 'RETROCESSO' })}
            />
            <Kpi
              icon={<ArrowRightLeft size={14} />}
              label="Transferências"
              value={summaryQ.data.totals.transfers}
              accent="text-sky-600"
              onClick={() => setDrill({ metric: 'TRANSFERENCIA' })}
            />
            <Kpi
              icon={<CheckCircle2 size={14} />}
              label="Finalizações"
              value={summaryQ.data.totals.completions}
              accent="text-emerald-600"
              onClick={() => setDrill({ metric: 'FINALIZACOES' })}
            />
            <Kpi
              icon={<MessageSquare size={14} />}
              label="Comentários"
              value={summaryQ.data.totals.comments}
              onClick={() => setDrill({ metric: 'COMMENTS' })}
            />
          </section>

          {/* Comercial (Fase 3, spec §14) — so com registros ou filtro Comercial */}
          {(summaryQ.data.totals.contacts > 0 ||
            summaryQ.data.followUps.pending > 0 ||
            filters.area === 'COMERCIAL') && (
            <section className="flex flex-col gap-2">
              <h2 className="text-fg-muted text-xs font-semibold uppercase tracking-wide">
                Comercial
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
                <Kpi
                  icon={<PhoneCall size={14} />}
                  label="Registros de contato"
                  value={summaryQ.data.totals.contacts}
                  onClick={() => setDrill({ metric: 'CONTACTS' })}
                />
                <Kpi
                  icon={<PhoneOutgoing size={14} />}
                  label="Contatos realizados"
                  value={summaryQ.data.totals.contactsDone}
                  accent="text-emerald-600"
                  onClick={() => setDrill({ metric: 'CONTACTS_DONE' })}
                />
                <Kpi
                  icon={<Presentation size={14} />}
                  label="Reuniões agendadas"
                  value={summaryQ.data.totals.meetingsScheduled}
                  onClick={() => setDrill({ metric: 'MEETINGS_SCHEDULED' })}
                />
                <Kpi
                  icon={<Presentation size={14} />}
                  label="Reuniões realizadas"
                  value={summaryQ.data.totals.meetingsHeld}
                  onClick={() => setDrill({ metric: 'CONTACTS' })}
                />
                <Kpi
                  icon={<FileText size={14} />}
                  label="Propostas enviadas"
                  value={summaryQ.data.totals.proposalsSent}
                  onClick={() => setDrill({ metric: 'CONTACTS' })}
                />
                <StaticKpi
                  icon={<CalendarClock size={14} />}
                  label="Follow-ups pendentes"
                  value={summaryQ.data.followUps.pending}
                  hint="tarefas de retorno em aberto agora"
                />
                <StaticKpi
                  icon={<CalendarClock size={14} />}
                  label="Follow-ups vencidos"
                  value={summaryQ.data.followUps.overdue}
                  hint="aparecem na Home de quem registrou"
                  accent="text-red-500"
                />
              </div>
            </section>
          )}

          {/* Aviso de fluxo sem classificacao (spec §5.8) */}
          {summaryQ.data.unconfiguredBoards.length > 0 && (
            <section className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
              <div className="flex flex-col gap-1">
                <p>
                  Classificação de progresso não configurada para este quadro:{' '}
                  {summaryQ.data.unconfiguredBoards.map((b, i) => (
                    <span key={b.id}>
                      {i > 0 && ', '}
                      <strong>{b.name}</strong> ({b.unclassifiedMoves})
                    </span>
                  ))}
                  .
                </p>
                <p className="text-fg-muted">
                  Essas movimentações aparecem no total, mas não como avanço, retrocesso,
                  transferência ou finalização.{' '}
                  <Link
                    href="/indicadores/desempenho/configuracao"
                    className="text-primary hover:underline"
                  >
                    Configurar relatórios
                  </Link>
                  {' · '}
                  <button
                    type="button"
                    onClick={() => setDrill({ metric: 'NAO_CLASSIFICADA' })}
                    className="text-primary hover:underline"
                  >
                    ver movimentações
                  </button>
                </p>
              </div>
            </section>
          )}

          {/* Resumo por colaborador (spec §11) */}
          {!selectedUser && (
            <section className="border-border/60 bg-bg flex flex-col gap-3 rounded-lg border p-4">
              <header className="flex items-center justify-between">
                <h2 className="text-fg text-sm font-semibold">Resumo por colaborador</h2>
                <span className="text-fg-muted text-xs">
                  ordem alfabética · clique no nome para ver o histórico
                </span>
              </header>
              {summaryQ.data.byUser.length === 0 ? (
                <p className="text-fg-muted text-xs">Nenhuma ação registrada no período.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-xs">
                    <thead className="text-fg-muted text-left">
                      <tr>
                        <th className="py-1.5 pr-2 font-medium">Colaborador</th>
                        <th className="px-2 text-right font-medium">Cards trabalhados</th>
                        <th className="px-2 text-right font-medium">Ações</th>
                        <th className="px-2 text-right font-medium">Movimentações</th>
                        <th className="px-2 text-right font-medium">Avanços</th>
                        <th className="px-2 text-right font-medium">Finalizações</th>
                        <th className="px-2 text-right font-medium">Comentários</th>
                        {summaryQ.data.totals.contacts > 0 && (
                          <th className="px-2 text-right font-medium">Contatos</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-border/40 divide-y">
                      {summaryQ.data.byUser.map(({ user: u, counters }) => {
                        const cell = (metric: PerformanceMetric, value: number) => (
                          <td className="px-2 text-right tabular-nums">
                            <button
                              type="button"
                              disabled={value === 0}
                              onClick={() => setDrill({ metric, userId: u.id, userName: u.name })}
                              className="hover:text-primary disabled:text-fg-subtle hover:underline disabled:no-underline"
                            >
                              {value}
                            </button>
                          </td>
                        );
                        return (
                          <tr key={u.id}>
                            <td className="py-1.5 pr-2">
                              <button
                                type="button"
                                onClick={() => update({ userId: u.id })}
                                className="hover:text-primary flex items-center gap-2"
                              >
                                <UserAvatar
                                  name={u.name}
                                  userId={u.id}
                                  avatarUrl={u.avatarUrl}
                                  size="sm"
                                />
                                <span className="truncate">{u.name}</span>
                              </button>
                            </td>
                            {cell('CARDS', counters.cardsWorked)}
                            {cell('ACTIONS', counters.actions)}
                            {cell('MOVES', counters.moves)}
                            {cell('AVANCO', counters.advances)}
                            {cell('FINALIZACOES', counters.completions)}
                            {cell('COMMENTS', counters.comments)}
                            {summaryQ.data.totals.contacts > 0 &&
                              cell('CONTACTS_DONE', counters.contactsDone)}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Evolucao no periodo (spec §13) + visao por dia (spec §5.7) */}
          {summaryQ.data.daily.length > 1 && (
            <section className="border-border/60 bg-bg flex flex-col gap-3 rounded-lg border p-4">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-fg text-sm font-semibold">Evolução no período</h2>
                <div className="bg-bg-muted inline-flex flex-wrap items-center rounded-md p-0.5">
                  {CHART_METRICS.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setChartMetric(m.key)}
                      className={`rounded-[4px] px-2 py-1 text-[11px] font-medium ${
                        chartMetric === m.key
                          ? 'bg-bg text-fg shadow-sm'
                          : 'text-fg-muted hover:text-fg'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </header>
              <DailyBars data={summaryQ.data.daily} metric={chartMetric} />
              <MovesSentence t={summaryQ.data.totals} />
              {summaryQ.data.daily.length <= 31 && <DailyTable data={summaryQ.data.daily} />}
            </section>
          )}

          {/* Fluxo do trabalho por quadro (Fase 5, spec §15) */}
          {!selectedUser && <FlowSection params={params} />}

          {/* Visao individual (spec §12) */}
          {selectedUser && (
            <section className="border-border/60 bg-bg flex flex-col gap-3 rounded-lg border p-4">
              <header className="flex items-center justify-between">
                <h2 className="text-fg text-sm font-semibold">Histórico de {selectedUser.name}</h2>
                <button
                  type="button"
                  onClick={() => update({ userId: '' })}
                  className="text-fg-muted hover:text-fg text-xs"
                >
                  Ver equipe toda
                </button>
              </header>
              <EventsList
                key={JSON.stringify(params)}
                params={params}
                metric="ACTIONS"
                timeZone={timeZone}
                showActor={false}
              />
            </section>
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

function Kpi({
  icon,
  label,
  value,
  accent = 'text-primary',
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Ver os registros de ${label.toLowerCase()}`}
      className="border-border/60 bg-bg hover:border-primary/50 flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors"
    >
      <span className={`flex items-center gap-1.5 text-[11px] font-medium ${accent}`}>
        {icon}
        <span className="text-fg-muted truncate">{label}</span>
      </span>
      <span className="text-fg text-xl font-semibold tabular-nums">{value}</span>
    </button>
  );
}

function StaticKpi({
  icon,
  label,
  value,
  hint,
  accent = 'text-primary',
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint: string;
  accent?: string;
}) {
  return (
    <div className="border-border/60 bg-bg flex flex-col gap-1 rounded-lg border p-3" title={hint}>
      <span className={`flex items-center gap-1.5 text-[11px] font-medium ${accent}`}>
        {icon}
        <span className="text-fg-muted truncate">{label}</span>
      </span>
      <span className="text-fg text-xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function DailyBars({
  data,
  metric,
}: {
  data: Array<{ day: string; counters: PerformanceCounters }>;
  metric: ChartMetric;
}) {
  const max = Math.max(1, ...data.map((d) => d.counters[metric]));
  const w = 100 / data.length;
  return (
    <div className="flex flex-col gap-1">
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="h-36 w-full"
        role="img"
        aria-label="Gráfico diário"
      >
        {data.map((d, i) => {
          const v = d.counters[metric];
          const h = (v / max) * 36;
          return (
            <rect
              key={d.day}
              x={i * w + w * 0.15}
              y={40 - h}
              width={w * 0.7}
              height={h}
              className="fill-primary/70"
            >
              <title>{`${dayLabel(d.day)}: ${v}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="text-fg-muted flex justify-between text-[10px]">
        <span>{dayLabel(data[0]!.day)}</span>
        <span>máx. {max}</span>
        <span>{dayLabel(data[data.length - 1]!.day)}</span>
      </div>
    </div>
  );
}

function MovesSentence({ t }: { t: PerformanceCounters }) {
  if (t.moves === 0) return null;
  return (
    <p className="text-fg-muted text-xs">
      {t.moves} movimentações = {t.advances} avanços, {t.retreats} retrocessos, {t.transfers}{' '}
      transferências e {t.completions} finalizações
      {t.unclassifiedMoves > 0 ? ` (${t.unclassifiedMoves} sem classificação)` : ''}.
    </p>
  );
}

function DailyTable({ data }: { data: Array<{ day: string; counters: PerformanceCounters }> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-xs">
        <thead className="text-fg-muted text-left">
          <tr>
            <th className="py-1.5 pr-2 font-medium">Dia</th>
            <th className="px-2 text-right font-medium">{METRIC_LABELS.CARDS}</th>
            <th className="px-2 text-right font-medium">Avanços</th>
            <th className="px-2 text-right font-medium">Retrocessos</th>
            <th className="px-2 text-right font-medium">Finalizações</th>
          </tr>
        </thead>
        <tbody className="divide-border/40 divide-y">
          {data.map((d) => (
            <tr key={d.day} className={d.counters.actions === 0 ? 'text-fg-subtle' : ''}>
              <td className="py-1 pr-2 capitalize">{dayLabel(d.day)}</td>
              <td className="px-2 text-right tabular-nums">{d.counters.cardsWorked}</td>
              <td className="px-2 text-right tabular-nums">{d.counters.advances}</td>
              <td className="px-2 text-right tabular-nums">{d.counters.retreats}</td>
              <td className="px-2 text-right tabular-nums">{d.counters.completions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
