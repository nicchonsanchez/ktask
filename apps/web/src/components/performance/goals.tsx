'use client';

import { AlertTriangle, CheckCircle2, Kanban, Shapes, User } from 'lucide-react';
import {
  GOAL_METRIC_LABELS,
  GOAL_PERIOD_LABELS,
  type GoalDto,
  type GoalPeriodProgress,
} from '@ktask/contracts';

import { cn } from '@/lib/cn';

/**
 * Doc 52 (Fase 4, D10) / Doc 54 — cartao de progresso de uma meta. Mostra o
 * periodo atual com barra e os 3 periodos anteriores (cada um contra o alvo
 * que valia na epoca).
 */

export function periodLabel(p: GoalPeriodProgress): string {
  const fmt = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
  return p.start === p.end ? fmt(p.start) : `${fmt(p.start)}–${fmt(p.end)}`;
}

function pct(value: number, target: number) {
  return target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
}

const SCOPE_ICON = { USER: User, AREA: Shapes, BOARD: Kanban } as const;

export function GoalProgressCard({ goal, className }: { goal: GoalDto; className?: string }) {
  const current = goal.progress[0]!;
  const p = pct(current.value, current.target);
  const reached = current.target > 0 && current.value >= current.target;
  const ScopeIcon = SCOPE_ICON[goal.scopeType];
  return (
    <div
      className={cn(
        'border-border/70 bg-bg flex h-full flex-col gap-3 rounded-xl border p-4',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-fg truncate text-sm font-semibold" title={goal.name}>
            {goal.name}
          </p>
          <p className="text-fg-muted truncate text-[11px]">
            {GOAL_METRIC_LABELS[goal.metric]} · {GOAL_PERIOD_LABELS[goal.period].toLowerCase()}
          </p>
        </div>
        {!goal.needsConfig && (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
              reached
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-bg-muted text-fg-muted',
            )}
          >
            {reached && <CheckCircle2 size={12} />}
            {p}%
          </span>
        )}
      </div>

      {goal.needsConfig ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 p-2.5 text-[11px] text-amber-700 dark:text-amber-400">
          <AlertTriangle size={13} className="mt-px shrink-0" />
          {goal.needsConfig}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <p className="text-fg text-2xl font-semibold tabular-nums tracking-tight">
              {current.value}
              <span className="text-fg-muted text-sm font-normal"> / {current.target}</span>
            </p>
            <div
              className="bg-bg-muted h-2 overflow-hidden rounded-full"
              role="progressbar"
              aria-valuenow={current.value}
              aria-valuemin={0}
              aria-valuemax={current.target}
              aria-label={`${goal.name}: ${current.value} de ${current.target}`}
            >
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-500',
                  reached ? 'bg-emerald-500' : 'bg-primary',
                )}
                style={{ width: `${p}%` }}
              />
            </div>
          </div>
          {goal.progress.length > 1 && (
            <ul
              className="border-border/60 grid grid-cols-3 gap-2 border-t pt-3"
              aria-label="Períodos anteriores"
            >
              {goal.progress.slice(1).map((h) => {
                const hp = pct(h.value, h.target);
                const ok = h.target > 0 && h.value >= h.target;
                return (
                  <li
                    key={h.start}
                    className="flex min-w-0 flex-col gap-1"
                    title={`${periodLabel(h)}: ${h.value} de ${h.target}`}
                  >
                    <span className="text-fg-subtle truncate text-[10px] tabular-nums">
                      {periodLabel(h)}
                    </span>
                    <span className="bg-bg-muted h-1 overflow-hidden rounded-full">
                      <span
                        className={cn(
                          'block h-full rounded-full',
                          ok ? 'bg-emerald-500' : 'bg-fg-subtle',
                        )}
                        style={{ width: `${hp}%` }}
                      />
                    </span>
                    <span className="text-fg-muted text-[11px] tabular-nums">
                      {h.value}/{h.target}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <p className="text-fg-muted mt-auto flex min-w-0 items-center gap-1.5 text-[11px]">
        <ScopeIcon size={12} className="shrink-0" />
        <span className="truncate">{goal.scopeLabel}</span>
      </p>
    </div>
  );
}
