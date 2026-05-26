'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  Archive,
  CheckCircle2,
  ClipboardList,
  Clock,
  Flag,
  Loader2,
  RotateCcw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import { indicatorsQueries, type CardsStatsParams } from '@/lib/queries/indicators';
import { boardsQueries } from '@/lib/queries/boards';
import { orgMembersQuery } from '@/lib/queries/cards';
import { UserAvatar } from '@/components/user-avatar';

type RangeKey = '7d' | '30d' | '90d' | '12m';

function rangeFromKey(key: RangeKey): { from: string; to: string } {
  const now = new Date();
  const days = key === '7d' ? 7 : key === '30d' ? 30 : key === '90d' ? 90 : 365;
  const from = new Date(now.getTime() - days * 24 * 60 * 60_000);
  return { from: from.toISOString(), to: now.toISOString() };
}

export default function IndicadoresCardsPage() {
  const [range, setRange] = useState<RangeKey>('30d');
  const [boardIds, setBoardIds] = useState<string[]>([]);
  const [leadId, setLeadId] = useState<string>('');

  const params: CardsStatsParams = useMemo(() => {
    const r = rangeFromKey(range);
    return {
      from: r.from,
      to: r.to,
      boardIds: boardIds.length ? boardIds : undefined,
      leadId: leadId || undefined,
    };
  }, [range, boardIds, leadId]);

  const { data, isLoading, isError } = useQuery(indicatorsQueries.cards(params));
  const boardsQ = useQuery(boardsQueries.all());
  const membersQ = useQuery(orgMembersQuery);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="text-fg-muted animate-spin" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="container py-10">
        <p className="text-fg-muted text-sm">Não foi possível carregar os indicadores.</p>
      </div>
    );
  }

  const {
    summary,
    leadTime,
    aging,
    byColumn,
    flowInOut,
    byBoard,
    byLabel,
    topLeads,
    delta,
    sparkline,
  } = data;

  const maxBoardCount = Math.max(...byBoard.map((b) => b.count), 1);
  const maxLabelCount = Math.max(...byLabel.map((l) => l.count), 1);
  const maxColumnWip = Math.max(...byColumn.map((c) => c.wip), 1);

  return (
    <div className="container flex flex-col gap-5 py-5">
      {/* Filtros */}
      <FilterBar
        range={range}
        onRangeChange={setRange}
        boards={boardsQ.data ?? []}
        boardIds={boardIds}
        onBoardIdsChange={setBoardIds}
        members={membersQ.data ?? []}
        leadId={leadId}
        onLeadIdChange={setLeadId}
      />

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          icon={<Clock size={14} />}
          label="Lead time médio"
          value={leadTime.sampleSize > 0 ? `${leadTime.avgDays.toFixed(1)}d` : '—'}
          hint={
            leadTime.sampleSize > 0
              ? `mediana ${leadTime.medianDays}d · p95 ${leadTime.p95Days}d`
              : 'sem amostras'
          }
          accent="text-primary"
        />
        <KpiCard
          icon={<TrendingUp size={14} />}
          label="Throughput"
          value={String(summary.completedInPeriod)}
          hint="cards finalizados no período"
          accent="text-emerald-500"
          delta={delta.throughput}
          deltaInverted={false}
          spark={sparkline.throughput}
        />
        <KpiCard
          icon={<CheckCircle2 size={14} />}
          label="No prazo"
          value={summary.onTimeRate === null ? '—' : `${Math.round(summary.onTimeRate * 100)}%`}
          hint={
            summary.onTimeRate === null
              ? 'sem cards com prazo'
              : `${summary.onTimeNumerator} de ${summary.onTimeDenominator}`
          }
          accent="text-emerald-500"
        />
        <KpiCard
          icon={<Activity size={14} />}
          label="WIP"
          value={String(summary.wip)}
          hint="cards ativos agora"
          accent="text-primary"
        />
        <KpiCard
          icon={<Flag size={14} />}
          label="Atrasados"
          value={String(summary.overdue)}
          hint={`${summary.dueToday} vencem hoje`}
          accent="text-red-500"
        />
        <KpiCard
          icon={<RotateCcw size={14} />}
          label="Reabertos"
          value={String(summary.reopenedInPeriod)}
          hint="finalizados que voltaram"
          accent="text-amber-500"
          delta={delta.reopened}
          deltaInverted={true}
        />
      </section>

      {/* Entrada vs Saída */}
      <section className="border-border/60 bg-bg flex flex-col gap-3 rounded-lg border p-4">
        <header className="flex items-center justify-between">
          <h2 className="text-fg text-sm font-semibold">Entrada vs Saída</h2>
          <span className="text-fg-muted text-xs">
            cards criados (azul) vs finalizados (verde) no período
          </span>
        </header>
        <FlowInOutChart data={flowInOut} />
      </section>

      {/* Saúde por coluna */}
      <section className="border-border/60 bg-bg flex flex-col gap-3 rounded-lg border p-4">
        <header className="flex items-center justify-between">
          <h2 className="text-fg text-sm font-semibold">Saúde por coluna</h2>
          <span className="text-fg-muted text-xs">WIP atual + tempo médio na coluna</span>
        </header>
        {byColumn.length === 0 ? (
          <p className="text-fg-muted text-xs">Nenhum card ativo no momento.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {byColumn.map((c) => (
              <div key={c.list.id} className="flex items-center gap-3 text-xs">
                <span className="flex w-48 shrink-0 items-center gap-1.5" title={c.list.name}>
                  {c.board && (
                    <span
                      aria-hidden
                      className="inline-block size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: c.board.color ?? '#888' }}
                    />
                  )}
                  <span className="text-fg-muted shrink-0 truncate">{c.board?.name ?? '—'}</span>
                  <span className="text-fg-subtle shrink-0">·</span>
                  <span className="truncate">{c.list.name}</span>
                </span>
                <div className="bg-bg-muted relative h-2 flex-1 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full"
                    style={{ width: `${(c.wip / maxColumnWip) * 100}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right tabular-nums">{c.wip}</span>
                <span className="text-fg-muted w-20 shrink-0 text-right tabular-nums">
                  {c.avgDaysInColumn.toFixed(1)}d
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Aging */}
      <section className="border-border/60 bg-bg flex flex-col gap-3 rounded-lg border p-4">
        <header className="flex items-center justify-between">
          <h2 className="text-fg text-sm font-semibold">Cards parados</h2>
          <span className="text-fg-muted text-xs">sem atualização há…</span>
        </header>
        <div className="grid grid-cols-3 gap-2">
          <AgingBucket label="7+ dias" value={aging.buckets.stale7} tone="muted" />
          <AgingBucket label="30+ dias" value={aging.buckets.stale30} tone="warn" />
          <AgingBucket label="60+ dias" value={aging.buckets.stale60} tone="danger" />
        </div>
        {aging.samples.length > 0 && (
          <ul className="border-border/60 divide-border/40 mt-1 flex flex-col divide-y rounded border">
            {aging.samples.map((s) => (
              <li key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                {s.board && (
                  <span
                    aria-hidden
                    className="inline-block size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: s.board.color ?? '#888' }}
                  />
                )}
                <span className="text-fg-muted shrink-0">{s.board?.name ?? '—'}</span>
                <span className="text-fg-subtle shrink-0">·</span>
                <Link
                  href={`?card=${s.id}`}
                  className="hover:text-primary min-w-0 flex-1 truncate"
                  title={s.title}
                >
                  {s.title}
                </Link>
                <span className="text-fg-muted shrink-0 tabular-nums">{s.lastUpdateDays}d</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Distribuições */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Por fluxo */}
        <div className="border-border/60 bg-bg flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="text-fg text-sm font-semibold">Cards ativos por fluxo</h2>
          {byBoard.length === 0 && (
            <p className="text-fg-muted text-xs">Nenhum card ativo no momento.</p>
          )}
          <div className="flex flex-col gap-2">
            {byBoard.map((b) => (
              <div key={b.board.id} className="flex items-center gap-3 text-xs">
                <span
                  className="flex w-40 shrink-0 items-center gap-1.5 truncate"
                  title={b.board.name}
                >
                  {b.board.icon && <span>{b.board.icon}</span>}
                  <span className="truncate">{b.board.name}</span>
                </span>
                <div className="bg-bg-muted relative h-2 flex-1 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full"
                    style={{ width: `${(b.count / maxBoardCount) * 100}%` }}
                  />
                </div>
                <span className="text-fg-muted w-10 shrink-0 text-right tabular-nums">
                  {b.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top líderes */}
        <div className="border-border/60 bg-bg flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="text-fg text-sm font-semibold">Top líderes</h2>
          {topLeads.length === 0 && (
            <p className="text-fg-muted text-xs">Nenhum card com líder atribuído.</p>
          )}
          <div className="flex flex-col gap-2">
            {topLeads.map((l) => (
              <div key={l.user?.id ?? Math.random()} className="flex items-center gap-3 text-xs">
                {l.user ? (
                  <>
                    <UserAvatar
                      name={l.user.name}
                      userId={l.user.id}
                      avatarUrl={l.user.avatarUrl}
                      size="sm"
                    />
                    <span className="flex-1 truncate">{l.user.name}</span>
                  </>
                ) : (
                  <span className="text-fg-muted flex-1">Sem líder</span>
                )}
                <span className="text-fg-muted shrink-0 tabular-nums">
                  {l.count} {l.count === 1 ? 'card' : 'cards'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Por etiqueta */}
        <div className="border-border/60 bg-bg flex flex-col gap-3 rounded-lg border p-4">
          <h2 className="text-fg text-sm font-semibold">Top etiquetas</h2>
          {byLabel.length === 0 && (
            <p className="text-fg-muted text-xs">Nenhuma etiqueta nos cards ativos.</p>
          )}
          <div className="flex flex-col gap-2">
            {byLabel.map((l) => (
              <div key={l.label.id} className="flex items-center gap-3 text-xs">
                <span
                  className="flex w-40 shrink-0 items-center gap-1.5 truncate"
                  title={l.label.name}
                >
                  <span
                    aria-hidden
                    className="inline-block size-2 rounded-full"
                    style={{ backgroundColor: l.label.color }}
                  />
                  <span className="truncate">{l.label.name}</span>
                </span>
                <div className="bg-bg-muted relative h-2 flex-1 overflow-hidden rounded-full">
                  <div
                    className="h-full"
                    style={{
                      width: `${(l.count / maxLabelCount) * 100}%`,
                      backgroundColor: l.label.color,
                    }}
                  />
                </div>
                <span className="text-fg-muted w-10 shrink-0 text-right tabular-nums">
                  {l.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats secundários */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<ClipboardList size={14} />}
          label="Total no histórico"
          value={summary.total}
        />
        <StatCard
          icon={<CheckCircle2 size={14} />}
          label="Concluídos (todos)"
          value={summary.completedTotal}
        />
        <StatCard icon={<Archive size={14} />} label="Arquivados" value={summary.archived} />
      </section>
    </div>
  );
}

function FilterBar({
  range,
  onRangeChange,
  boards,
  boardIds,
  onBoardIdsChange,
  members,
  leadId,
  onLeadIdChange,
}: {
  range: RangeKey;
  onRangeChange: (r: RangeKey) => void;
  boards: Array<{ id: string; name: string }>;
  boardIds: string[];
  onBoardIdsChange: (ids: string[]) => void;
  members: Array<{ userId: string; user: { id: string; name: string } }>;
  leadId: string;
  onLeadIdChange: (id: string) => void;
}) {
  return (
    <div className="border-border/60 bg-bg sticky top-[52px] z-10 -mx-4 flex flex-wrap items-center gap-2 border-b px-4 py-2 sm:-mx-0 sm:rounded-md sm:border">
      <div className="bg-bg-muted inline-flex items-center rounded-md p-0.5">
        {(['7d', '30d', '90d', '12m'] as RangeKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onRangeChange(k)}
            className={`rounded-[4px] px-2 py-1 text-[11px] font-medium transition-colors ${
              range === k ? 'bg-bg text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
            }`}
          >
            {k}
          </button>
        ))}
      </div>
      <select
        multiple={false}
        value={boardIds[0] ?? ''}
        onChange={(e) => onBoardIdsChange(e.target.value ? [e.target.value] : [])}
        className="border-border bg-bg text-fg rounded-md border px-2 py-1 text-[11px] focus:outline-none"
      >
        <option value="" className="bg-bg text-fg">
          Todos os fluxos
        </option>
        {boards.map((b) => (
          <option key={b.id} value={b.id} className="bg-bg text-fg">
            {b.name}
          </option>
        ))}
      </select>
      <select
        value={leadId}
        onChange={(e) => onLeadIdChange(e.target.value)}
        className="border-border bg-bg text-fg rounded-md border px-2 py-1 text-[11px] focus:outline-none"
      >
        <option value="" className="bg-bg text-fg">
          Todos os líderes
        </option>
        {members.map((m) => (
          <option key={m.userId} value={m.userId} className="bg-bg text-fg">
            {m.user.name}
          </option>
        ))}
      </select>
      {(boardIds.length > 0 || leadId) && (
        <button
          type="button"
          onClick={() => {
            onBoardIdsChange([]);
            onLeadIdChange('');
          }}
          className="text-fg-muted hover:text-fg ml-auto text-[11px]"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}

function FlowInOutChart({
  data,
}: {
  data: Array<{ day: string; created: number; completed: number }>;
}) {
  if (data.length === 0) {
    return <p className="text-fg-muted text-xs">Sem dados no período.</p>;
  }
  const max = Math.max(...data.map((d) => Math.max(d.created, d.completed)), 1);
  const w = 100; // largura SVG em %
  const h = 100;
  function pathFor(key: 'created' | 'completed') {
    return data
      .map((d, i) => {
        const x = (i / (data.length - 1 || 1)) * w;
        const y = h - (d[key] / max) * h;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  }
  return (
    <div className="relative h-32 w-full">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <path d={pathFor('created')} fill="none" stroke="rgb(99 102 241)" strokeWidth="0.6" />
        <path d={pathFor('completed')} fill="none" stroke="rgb(16 185 129)" strokeWidth="0.6" />
      </svg>
      <div className="text-fg-subtle absolute bottom-0 left-0 text-[10px]">
        {new Date(data[0]!.day).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
      </div>
      <div className="text-fg-subtle absolute bottom-0 right-0 text-[10px]">
        {new Date(data[data.length - 1]!.day).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'short',
        })}
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  accent,
  delta,
  deltaInverted,
  spark,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent: string;
  delta?: number;
  /** Quando true, delta positivo é ruim (ex.: reaberturas). Inverte cor. */
  deltaInverted?: boolean;
  spark?: number[];
}) {
  const isUp = delta !== undefined && delta > 0;
  const isDown = delta !== undefined && delta < 0;
  const deltaIsBad = deltaInverted ? isUp : isDown;
  const deltaColor =
    delta === undefined || delta === 0
      ? 'text-fg-muted'
      : deltaIsBad
        ? 'text-red-500'
        : 'text-emerald-500';

  return (
    <div className="border-border/60 bg-bg flex flex-col gap-1 rounded-lg border p-3">
      <div className={`flex items-center gap-2 text-xs ${accent}`}>
        {icon}
        <span className="text-fg-muted truncate">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="text-fg text-2xl font-bold tabular-nums leading-none">{value}</div>
        {spark && spark.length > 1 && <Sparkline values={spark} />}
      </div>
      <div className="flex items-center justify-between gap-2">
        {hint ? <div className="text-fg-subtle truncate text-[10px]">{hint}</div> : <span />}
        {delta !== undefined && delta !== 0 && (
          <div className={`flex items-center gap-0.5 text-[10px] font-medium ${deltaColor}`}>
            {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {Math.abs(delta)}%
          </div>
        )}
      </div>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 50;
  const h = 16;
  const max = Math.max(...values, 1);
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - (v / max) * h;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="text-primary/60">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function AgingBucket({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'muted' | 'warn' | 'danger';
}) {
  const cls =
    tone === 'danger'
      ? 'border-red-500/30 bg-red-500/5 text-red-500'
      : tone === 'warn'
        ? 'border-amber-500/30 bg-amber-500/5 text-amber-600'
        : 'border-border/60 bg-bg-muted/30 text-fg-muted';
  return (
    <div className={`flex flex-col gap-1 rounded-md border p-3 ${cls}`}>
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide">
        <AlertTriangle size={11} />
        {label}
      </div>
      <div className="text-fg text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="border-border/60 bg-bg flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="text-fg-muted flex items-center gap-2 text-xs">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="text-fg text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}
