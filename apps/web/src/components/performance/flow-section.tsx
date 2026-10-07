'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { FlowBoardMetrics } from '@ktask/contracts';

import { performanceQueries, type PerformanceParams } from '@/lib/queries/performance';

/**
 * Doc 52 (Fase 5, spec §15) — "Fluxo do trabalho" por quadro: recebidos,
 * iniciados, aguardando, devolvidos, concluidos, reabertos, tempos e tempo
 * por etapa. Mede o FLUXO (nao a pessoa): conta movimentos de automacao
 * tambem. So aparece com filtro de area ou fluxo.
 */

export function formatHours(h: number | null): string {
  if (h === null) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)} h`;
  return `${(h / 24).toFixed(1)} dias`;
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="flex flex-col" title={hint}>
      <span className="text-fg-muted text-[11px]">{label}</span>
      <span className="text-fg text-base font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function BoardFlow({ m }: { m: FlowBoardMetrics }) {
  const configured = m.level !== 'NONE';
  const max = Math.max(1, ...m.stages.map((s) => s.avgHours));
  return (
    <div className="border-border/60 bg-bg flex flex-col gap-3 rounded-lg border p-4">
      <header className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block size-2 rounded-full"
          style={{ backgroundColor: m.board.color ?? '#888' }}
        />
        <h3 className="text-fg text-sm font-semibold">{m.board.name}</h3>
      </header>
      {!configured && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          Classificação de progresso não configurada para este quadro: aparecem só recebidos e tempo
          por etapa.
        </p>
      )}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Stat label="Recebidos" value={m.received} hint="Cards que entraram no fluxo no período" />
        <Stat
          label="Iniciados"
          value={configured ? m.started : '—'}
          hint="Saíram da coluna de entrada pela 1ª vez"
        />
        <Stat
          label="Aguardando agora"
          value={configured ? m.waitingNow : '—'}
          hint="Cards ativos em coluna Aguardando cliente/terceiro"
        />
        <Stat label="Foram p/ aguardando" value={configured ? m.waitingEntries : '—'} />
        <Stat
          label="Devolvidos"
          value={configured ? m.returned : '—'}
          hint="Retrocessos no período"
        />
        <Stat label="Concluídos" value={configured ? m.completed : '—'} />
        <Stat label="Reabertos" value={configured ? m.reopened : '—'} />
        <Stat
          label="1º atendimento"
          value={formatHours(m.avgFirstResponseHours)}
          hint="Média da entrada no fluxo até sair da coluna de entrada"
        />
      </div>
      <p className="text-fg-muted text-xs">
        Tempo médio até concluir:{' '}
        <strong className="text-fg">{formatHours(m.avgCycleHours)}</strong>
      </p>
      {m.stages.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-fg-muted text-[11px] font-medium">Tempo médio em cada etapa</p>
          {m.stages.map((s) => (
            <div key={s.listId} className="flex items-center gap-3 text-xs">
              <span className="w-40 shrink-0 truncate" title={s.name}>
                {s.name}
              </span>
              <div className="bg-bg-muted relative h-2 flex-1 overflow-hidden rounded-full">
                <div
                  className="bg-primary/70 h-full"
                  style={{ width: `${(s.avgHours / max) * 100}%` }}
                />
              </div>
              <span className="w-20 shrink-0 text-right tabular-nums">
                {formatHours(s.avgHours)}
              </span>
              <span
                className="text-fg-subtle w-14 shrink-0 text-right tabular-nums"
                title="Saídas da coluna no período"
              >
                {s.samples}×
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FlowSection({ params }: { params: PerformanceParams }) {
  const enabled = !!(params.area || params.boardIds?.length);
  const q = useQuery({ ...performanceQueries.flow(params), enabled });
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-fg-muted text-xs font-semibold uppercase tracking-wide">
        Fluxo do trabalho
      </h2>
      {!enabled ? (
        <p className="text-fg-muted text-xs">
          Filtre por área ou por fluxo para ver recebidos, tempo de atendimento e tempo por etapa de
          cada quadro.
        </p>
      ) : q.isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 size={16} className="text-fg-muted animate-spin" />
        </div>
      ) : q.isError || !q.data ? (
        <p className="text-fg-muted text-xs">Não foi possível carregar o fluxo do trabalho.</p>
      ) : q.data.boards.length === 0 ? (
        <p className="text-fg-muted text-xs">Nenhum fluxo nesta área ainda.</p>
      ) : (
        <>
          <p className="text-fg-muted text-[11px]">
            Mede o fluxo de cada quadro (inclui movimentações feitas por automação).
          </p>
          {q.data.boards.map((m) => (
            <BoardFlow key={m.board.id} m={m} />
          ))}
        </>
      )}
    </section>
  );
}
