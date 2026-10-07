'use client';

import { AlertTriangle, Target } from 'lucide-react';
import {
  GOAL_METRIC_LABELS,
  GOAL_PERIOD_LABELS,
  type GoalDto,
  type GoalPeriodProgress,
} from '@ktask/contracts';

/**
 * Doc 52 (Fase 4, D10) — cartao de progresso de uma meta. Mostra o periodo
 * atual com barra e os 3 periodos anteriores (cada um contra o alvo que
 * valia na epoca).
 */

export function periodLabel(p: GoalPeriodProgress): string {
  const fmt = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
  return p.start === p.end ? fmt(p.start) : `${fmt(p.start)}–${fmt(p.end)}`;
}

function pct(value: number, target: number) {
  return target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
}

export function GoalProgressCard({ goal }: { goal: GoalDto }) {
  const current = goal.progress[0]!;
  const p = pct(current.value, current.target);
  const reached = current.target > 0 && current.value >= current.target;
  return (
    <div className="border-border/60 bg-bg flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-fg truncate text-sm font-medium" title={goal.name}>
            {goal.name}
          </p>
          <p className="text-fg-muted truncate text-[11px]">
            {goal.scopeLabel} · {GOAL_METRIC_LABELS[goal.metric]} ·{' '}
            {GOAL_PERIOD_LABELS[goal.period].toLowerCase()}
          </p>
        </div>
        <Target
          size={14}
          className={reached ? 'shrink-0 text-emerald-600' : 'text-fg-subtle shrink-0'}
        />
      </div>

      {goal.needsConfig ? (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          {goal.needsConfig}
        </p>
      ) : (
        <>
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-fg text-lg font-semibold tabular-nums">
              {current.value}
              <span className="text-fg-muted text-xs font-normal">/{current.target}</span>
            </span>
            <span className={`tabular-nums ${reached ? 'text-emerald-600' : 'text-fg-muted'}`}>
              {p}%
            </span>
          </div>
          <div
            className="bg-bg-muted h-2 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={current.value}
            aria-valuemin={0}
            aria-valuemax={current.target}
            aria-label={`${goal.name}: ${current.value} de ${current.target}`}
          >
            <div
              className={`h-full ${reached ? 'bg-emerald-500' : 'bg-primary'}`}
              style={{ width: `${p}%` }}
            />
          </div>
          {goal.progress.length > 1 && (
            <ul className="text-fg-muted flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
              {goal.progress.slice(1).map((h) => (
                <li
                  key={h.start}
                  className="tabular-nums"
                  title={`${periodLabel(h)}: ${h.value} de ${h.target}`}
                >
                  {periodLabel(h)}: {h.value}/{h.target}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
