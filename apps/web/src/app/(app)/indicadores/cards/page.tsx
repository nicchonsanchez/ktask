'use client';

import { useQuery } from '@tanstack/react-query';
import { Archive, Calendar, CheckCircle2, ClipboardList, Flag, Loader2 } from 'lucide-react';

import { indicatorsQueries, type Priority } from '@/lib/queries/indicators';
import { UserAvatar } from '@/components/user-avatar';

const PRIORITY_LABEL: Record<Priority, string> = {
  NONE: 'Sem prioridade',
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

const PRIORITY_COLOR: Record<Priority, string> = {
  NONE: 'bg-fg-muted/50',
  LOW: 'bg-slate-400',
  MEDIUM: 'bg-yellow-500',
  HIGH: 'bg-red-500',
  URGENT: 'bg-red-500',
};

const PRIORITY_ORDER: Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];

export default function IndicadoresCardsPage() {
  const { data, isLoading, isError } = useQuery(indicatorsQueries.cards());

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

  const { summary, byPriority, byBoard, topLeads, throughput } = data;
  const maxBoardCount = Math.max(...byBoard.map((b) => b.count), 1);
  const maxThroughput = Math.max(...throughput.map((t) => t.count), 1);

  // Cards ativos (denominador pra distribuição por prioridade)
  const totalActiveByPriority = byPriority.reduce((acc, p) => acc + p.count, 0) || 1;

  return (
    <div className="container flex flex-col gap-6 py-6">
      {/* Resumo: cards numéricos */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<ClipboardList size={16} />}
          label="Cards ativos"
          value={summary.active}
          accent="text-primary"
        />
        <StatCard
          icon={<CheckCircle2 size={16} />}
          label="Concluídos no mês"
          value={summary.completedThisMonth}
          accent="text-emerald-500"
          hint={`${summary.completedThisWeek} esta semana`}
        />
        <StatCard
          icon={<Calendar size={16} />}
          label="Vencem hoje"
          value={summary.dueToday}
          accent="text-amber-500"
        />
        <StatCard
          icon={<Flag size={16} />}
          label="Atrasados"
          value={summary.overdue}
          accent="text-red-500"
        />
      </section>

      {/* Distribuição por prioridade */}
      <section className="border-border/60 bg-bg flex flex-col gap-3 rounded-lg border p-4">
        <header className="flex items-center justify-between">
          <h2 className="text-fg text-sm font-semibold">Por prioridade (cards ativos)</h2>
          <span className="text-fg-muted text-xs">{summary.active} cards</span>
        </header>
        <div className="flex flex-col gap-2">
          {PRIORITY_ORDER.map((p) => {
            const item = byPriority.find((b) => b.priority === p);
            const count = item?.count ?? 0;
            const pct = Math.round((count / totalActiveByPriority) * 100);
            return (
              <div key={p} className="flex items-center gap-3 text-xs">
                <span className="w-32 shrink-0 truncate" title={PRIORITY_LABEL[p]}>
                  <span
                    aria-hidden
                    className={`mr-2 inline-block size-2 rounded-full ${PRIORITY_COLOR[p]}`}
                  />
                  {PRIORITY_LABEL[p]}
                </span>
                <div className="bg-bg-muted relative h-2 flex-1 overflow-hidden rounded-full">
                  <div
                    className={`h-full ${PRIORITY_COLOR[p]} transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-fg-muted w-16 shrink-0 text-right tabular-nums">
                  {count} <span className="text-fg-subtle">({pct}%)</span>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Distribuição por fluxo */}
      <section className="border-border/60 bg-bg flex flex-col gap-3 rounded-lg border p-4">
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
              <span className="text-fg-muted w-10 shrink-0 text-right tabular-nums">{b.count}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Top líderes */}
      <section className="border-border/60 bg-bg flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-fg text-sm font-semibold">Top líderes (cards ativos liderados)</h2>
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
      </section>

      {/* Throughput diário (últimos 30d) */}
      <section className="border-border/60 bg-bg flex flex-col gap-3 rounded-lg border p-4">
        <header className="flex items-center justify-between">
          <h2 className="text-fg text-sm font-semibold">Throughput (cards finalizados/dia)</h2>
          <span className="text-fg-muted text-xs">Últimos 30 dias</span>
        </header>
        {throughput.length === 0 ? (
          <p className="text-fg-muted text-xs">Sem finalizações nos últimos 30 dias.</p>
        ) : (
          <div className="flex h-32 items-end gap-0.5">
            {throughput.map((t) => {
              const h = Math.max(2, (t.count / maxThroughput) * 100);
              const date = new Date(t.day);
              return (
                <div
                  key={t.day}
                  className="bg-primary/70 hover:bg-primary group relative flex-1 rounded-sm transition-colors"
                  style={{ height: `${h}%` }}
                  title={`${date.toLocaleDateString('pt-BR')}: ${t.count}`}
                >
                  <span className="bg-bg border-border text-fg pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded border px-1.5 py-0.5 text-[10px] shadow group-hover:block">
                    {t.count}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Stats secundários */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<ClipboardList size={14} />}
          label="Total no histórico"
          value={summary.total}
          accent="text-fg-muted"
        />
        <StatCard
          icon={<CheckCircle2 size={14} />}
          label="Concluídos (todos)"
          value={summary.completedTotal}
          accent="text-fg-muted"
        />
        <StatCard
          icon={<Archive size={14} />}
          label="Arquivados"
          value={summary.archived}
          accent="text-fg-muted"
        />
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: string;
  hint?: string;
}) {
  return (
    <div className="border-border/60 bg-bg flex flex-col gap-1 rounded-lg border p-3">
      <div className={`flex items-center gap-2 text-xs ${accent}`}>
        {icon}
        <span className="text-fg-muted truncate">{label}</span>
      </div>
      <div className="text-fg text-2xl font-bold tabular-nums leading-none">{value}</div>
      {hint && <div className="text-fg-subtle text-[10px]">{hint}</div>}
    </div>
  );
}
