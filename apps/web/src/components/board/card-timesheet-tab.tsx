'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, ExternalLink, Loader2, Play, User as UserIcon } from 'lucide-react';
import Link from 'next/link';

import { timeTrackingQueries, type TimeEntryWithUser } from '@/lib/queries/time-tracking';
import { UserAvatar } from '@/components/user-avatar';

/**
 * Aba "Timesheet" do card. Agrega TimeEntries do card e mostra:
 *   - Header com total geral + total de pessoas + total de entries
 *   - Lista agrupada por pessoa (avatar + nome + total + count)
 *   - Histórico cronológico reverso de entries (data, duração, source, nota)
 *   - Atalho pra /indicadores/timesheet filtrado pelo card (visão completa)
 *
 * Backend: GET /api/v1/cards/:cardId/time (já existe, devolve TimeEntryWithUser).
 * MVP por pessoa — sem amarrar a item de checklist (TimeEntry hoje nao tem
 * checklistItemId). Quando der pra refinar, agrupa tambem por tarefa.
 */
export function CardTimesheetTab({ cardId }: { cardId: string }) {
  const entriesQ = useQuery(timeTrackingQueries.byCard(cardId));
  const entries = entriesQ.data ?? [];

  const stats = useMemo(() => aggregateByUser(entries), [entries]);

  if (entriesQ.isLoading) {
    return (
      <div className="text-fg-muted flex items-center justify-center gap-2 py-12 text-sm">
        <Loader2 size={14} className="animate-spin" /> Carregando timesheet…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6">
      <header className="mb-5">
        <h2 className="text-fg flex items-center gap-2 text-base font-semibold">
          <Clock size={16} /> Timesheet
        </h2>
        <p className="text-fg-muted mt-0.5 text-xs">
          Tempo registrado neste card. Soma agregada por pessoa abaixo.
        </p>
      </header>

      <section className="mb-6 grid grid-cols-3 gap-2">
        <Metric label="Total" value={formatHM(stats.totalSec)} />
        <Metric label="Colaboradores" value={String(stats.byUser.length)} />
        <Metric label="Lançamentos" value={String(entries.length)} />
      </section>

      <section className="mb-6">
        <h3 className="text-fg-muted mb-2 text-[11px] font-semibold uppercase tracking-wide">
          Por pessoa
        </h3>
        <ul className="border-border bg-bg divide-border/60 flex flex-col divide-y rounded-md border">
          {stats.byUser.map((row) => (
            <li key={row.user.id} className="flex items-center gap-3 px-3 py-2.5">
              <UserAvatar
                name={row.user.name}
                userId={row.user.id}
                avatarUrl={row.user.avatarUrl}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="text-fg truncate text-sm font-medium">{row.user.name}</p>
                <p className="text-fg-subtle text-[11px]">
                  {row.count} lançamento{row.count === 1 ? '' : 's'}
                </p>
              </div>
              <span className="text-fg text-sm font-semibold tabular-nums">
                {formatHM(row.totalSec)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-6">
        <h3 className="text-fg-muted mb-2 text-[11px] font-semibold uppercase tracking-wide">
          Histórico ({entries.length})
        </h3>
        <ul className="border-border bg-bg divide-border/60 flex flex-col divide-y rounded-md border">
          {[...entries]
            .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
            .map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-3 py-2.5">
                <div className="flex shrink-0 items-center gap-2">
                  <UserAvatar
                    name={e.user.name}
                    userId={e.user.id}
                    avatarUrl={e.user.avatarUrl}
                    size="sm"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-fg text-[13px]">
                    <span className="font-medium">{e.user.name}</span>
                    <span className="text-fg-muted"> · {formatRange(e.startedAt, e.endedAt)}</span>
                  </p>
                  {e.note && <p className="text-fg-muted mt-0.5 text-[11px]">{e.note}</p>}
                  <p className="text-fg-subtle mt-0.5 text-[10px] uppercase tracking-wide">
                    {e.source === 'TIMER' ? (
                      <span className="inline-flex items-center gap-1">
                        <Play size={9} /> Timer
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <UserIcon size={9} /> Manual
                      </span>
                    )}
                  </p>
                </div>
                <span className="text-fg shrink-0 text-[13px] font-medium tabular-nums">
                  {e.durationSec ? formatHM(e.durationSec) : '—'}
                </span>
              </li>
            ))}
        </ul>
      </section>

      <Link
        href={`/indicadores/timesheet?cardId=${cardId}`}
        className="text-primary hover:text-primary-hover inline-flex items-center gap-1.5 text-xs font-medium"
      >
        Abrir no timesheet completo
        <ExternalLink size={12} />
      </Link>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border bg-bg rounded-md border p-3">
      <p className="text-fg-muted text-[11px]">{label}</p>
      <p className="text-fg mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-fg-muted flex flex-col items-center gap-3 py-12 text-center text-sm">
      <Clock size={32} className="text-fg-subtle" />
      <div>
        <p className="text-fg font-medium">Nenhum tempo lançado ainda</p>
        <p className="text-fg-muted mt-1 text-xs">
          Use o botão de play no topo do card pra iniciar o timer, ou lance manualmente em
          /indicadores/timesheet.
        </p>
      </div>
    </div>
  );
}

function aggregateByUser(entries: TimeEntryWithUser[]) {
  const map = new Map<
    string,
    {
      user: TimeEntryWithUser['user'];
      totalSec: number;
      count: number;
    }
  >();
  let totalSec = 0;
  for (const e of entries) {
    const sec = e.durationSec ?? 0;
    totalSec += sec;
    const prev = map.get(e.userId);
    if (prev) {
      prev.totalSec += sec;
      prev.count += 1;
    } else {
      map.set(e.userId, { user: e.user, totalSec: sec, count: 1 });
    }
  }
  const byUser = Array.from(map.values()).sort((a, b) => b.totalSec - a.totalSec);
  return { totalSec, byUser };
}

function formatHM(seconds: number): string {
  if (!seconds || seconds <= 0) return '0h';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m.toString().padStart(2, '0')}min`;
}

function formatRange(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt);
  const dateLabel = start.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  });
  const startTime = start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (!endedAt) return `${dateLabel} ${startTime} · em andamento`;
  const endTime = new Date(endedAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${dateLabel} ${startTime}–${endTime}`;
}
