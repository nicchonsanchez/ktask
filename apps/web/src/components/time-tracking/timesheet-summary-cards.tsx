'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { UserAvatar } from '@/components/user-avatar';
import { formatDuration, type TimesheetSummary } from '@/lib/queries/time-tracking';

export function TimesheetSummaryCards({
  summary,
  loading,
}: {
  summary: TimesheetSummary | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="border-border/60 bg-bg-subtle/30 flex items-center justify-center rounded-md border py-8">
        <Loader2 size={16} className="text-fg-muted animate-spin" />
      </div>
    );
  }

  const totalSec = summary?.totalSec ?? 0;
  const byUser = summary?.byUser ?? [];

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_1fr]">
      <div className="border-border/60 bg-bg flex flex-col rounded-md border p-4">
        <p className="text-fg-muted text-[10px] font-semibold uppercase tracking-wider">
          Total de horas no período
        </p>
        <p className="text-fg mt-2 font-mono text-3xl font-bold tabular-nums">
          {formatDuration(totalSec)}
        </p>
        <p className="text-fg-subtle mt-1 text-[11px]">Soma das durações no recorte selecionado</p>
      </div>

      <div className="border-border/60 bg-bg flex flex-col rounded-md border p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-fg-muted text-[10px] font-semibold uppercase tracking-wider">
            Por usuário
          </p>
          <p className="text-fg-subtle text-[11px]">{byUser.length} pessoas</p>
        </div>

        {byUser.length === 0 ? (
          <p className="text-fg-muted text-[12px]">Nenhum lançamento no período.</p>
        ) : (
          <ul className="flex flex-col gap-2 overflow-x-auto">
            {byUser.map((entry) => (
              <UserRow key={entry.user.id} entry={entry} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function UserRow({ entry }: { entry: TimesheetSummary['byUser'][number] }) {
  return (
    <li className="border-border/40 flex items-center gap-3 rounded-md border px-3 py-2">
      <UserAvatar
        name={entry.user.name}
        userId={entry.user.id}
        avatarUrl={entry.user.avatarUrl}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className="text-fg truncate text-[13px] font-medium">{entry.user.name}</p>
        <p className="text-fg-muted truncate text-[10px]">{entry.user.email}</p>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-fg font-mono text-[13px] font-semibold tabular-nums">
          {formatDuration(entry.totalSec)}
        </span>
        {entry.activeNow && <ActiveBadge startedAt={entry.activeNow.startedAt} />}
      </div>
    </li>
  );
}

function ActiveBadge({ startedAt }: { startedAt: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);
  void tick;

  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
      <span className="relative inline-flex size-1.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/50" />
        <span className="relative size-1.5 rounded-full bg-emerald-500" />
      </span>
      <span className="font-mono tabular-nums">{formatDuration(elapsed)}</span>
    </span>
  );
}
