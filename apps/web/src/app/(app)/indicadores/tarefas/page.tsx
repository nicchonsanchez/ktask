'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, ListChecks, Loader2 } from 'lucide-react';

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
  LOW: 'bg-blue-400',
  MEDIUM: 'bg-amber-400',
  HIGH: 'bg-orange-500',
  URGENT: 'bg-red-500',
};

const PRIORITY_ORDER: Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];

export default function IndicadoresTarefasPage() {
  const { data, isLoading, isError } = useQuery(indicatorsQueries.tasks());

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

  const { summary, byPriority, byAssignee, doneByDay } = data;
  const totalActiveByPriority = byPriority.reduce((acc, p) => acc + p.count, 0) || 1;
  const maxAssignee = Math.max(...byAssignee.map((a) => a.count), 1);
  const maxDoneByDay = Math.max(...doneByDay.map((d) => d.count), 1);

  return (
    <div className="container flex flex-col gap-6 py-6">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<ListChecks size={16} />}
          label="Tarefas ativas"
          value={summary.active}
          accent="text-primary"
        />
        <StatCard
          icon={<CheckCircle2 size={16} />}
          label="Concluídas"
          value={summary.done}
          accent="text-emerald-500"
          hint={`${summary.completionRate}% do total`}
        />
        <StatCard
          icon={<Clock size={16} />}
          label="Atrasadas"
          value={summary.overdue}
          accent="text-red-500"
        />
        <StatCard
          icon={<ListChecks size={16} />}
          label="Total no histórico"
          value={summary.total}
          accent="text-fg-muted"
        />
      </section>

      <section className="border-border/60 bg-bg flex flex-col gap-3 rounded-lg border p-4">
        <header className="flex items-center justify-between">
          <h2 className="text-fg text-sm font-semibold">Taxa de conclusão</h2>
          <span className="text-fg text-lg font-bold tabular-nums">{summary.completionRate}%</span>
        </header>
        <div className="bg-bg-muted relative h-3 w-full overflow-hidden rounded-full">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${summary.completionRate}%` }}
          />
        </div>
        <div className="text-fg-muted flex justify-between text-[11px]">
          <span>{summary.done} concluídas</span>
          <span>{summary.active} pendentes</span>
        </div>
      </section>

      <section className="border-border/60 bg-bg flex flex-col gap-3 rounded-lg border p-4">
        <header className="flex items-center justify-between">
          <h2 className="text-fg text-sm font-semibold">Por prioridade (tarefas pendentes)</h2>
          <span className="text-fg-muted text-xs">{summary.active} tarefas</span>
        </header>
        <div className="flex flex-col gap-2">
          {PRIORITY_ORDER.map((p) => {
            const item = byPriority.find((b) => b.priority === p);
            const count = item?.count ?? 0;
            const pct = Math.round((count / totalActiveByPriority) * 100);
            return (
              <div key={p} className="flex items-center gap-3 text-xs">
                <span className="w-32 shrink-0 truncate">
                  <span
                    aria-hidden
                    className={`mr-2 inline-block size-2 rounded-full ${PRIORITY_COLOR[p]}`}
                  />
                  {PRIORITY_LABEL[p]}
                </span>
                <div className="bg-bg-muted relative h-2 flex-1 overflow-hidden rounded-full">
                  <div className={`h-full ${PRIORITY_COLOR[p]}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-fg-muted w-16 shrink-0 text-right tabular-nums">
                  {count} <span className="text-fg-subtle">({pct}%)</span>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="border-border/60 bg-bg flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-fg text-sm font-semibold">Top responsáveis (tarefas pendentes)</h2>
        {byAssignee.length === 0 && (
          <p className="text-fg-muted text-xs">Nenhuma tarefa com responsável atribuído.</p>
        )}
        <div className="flex flex-col gap-2">
          {byAssignee.map((a) => (
            <div key={a.user?.id ?? Math.random()} className="flex items-center gap-3 text-xs">
              {a.user && (
                <UserAvatar
                  name={a.user.name}
                  userId={a.user.id}
                  avatarUrl={a.user.avatarUrl}
                  size="sm"
                />
              )}
              <span className="w-32 truncate">{a.user?.name ?? 'Sem responsável'}</span>
              <div className="bg-bg-muted relative h-2 flex-1 overflow-hidden rounded-full">
                <div
                  className="h-full bg-amber-400"
                  style={{ width: `${(a.count / maxAssignee) * 100}%` }}
                />
              </div>
              <span className="text-fg-muted w-10 shrink-0 text-right tabular-nums">{a.count}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="border-border/60 bg-bg flex flex-col gap-3 rounded-lg border p-4">
        <header className="flex items-center justify-between">
          <h2 className="text-fg text-sm font-semibold">Conclusões por dia</h2>
          <span className="text-fg-muted text-xs">Últimos 30 dias</span>
        </header>
        {doneByDay.length === 0 ? (
          <p className="text-fg-muted text-xs">Sem conclusões nos últimos 30 dias.</p>
        ) : (
          <div className="flex h-32 items-end gap-0.5">
            {doneByDay.map((t) => {
              const h = Math.max(2, (t.count / maxDoneByDay) * 100);
              const date = new Date(t.day);
              return (
                <div
                  key={t.day}
                  className="group relative flex-1 rounded-sm bg-emerald-500/70 transition-colors hover:bg-emerald-500"
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
