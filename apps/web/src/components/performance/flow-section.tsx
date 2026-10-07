'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock3, Hourglass, Timer, Workflow } from 'lucide-react';
import type { FlowBoardMetrics } from '@ktask/contracts';

import { cn } from '@/lib/cn';
import { performanceQueries, type PerformanceParams } from '@/lib/queries/performance';
import { EmptyState, IconChip, Panel, SectionHeading, Spinner, TONE_TEXT, type Tone } from './ui';

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

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div
      className="bg-bg flex flex-col justify-center gap-1 px-3 py-3 last:col-span-2 sm:last:col-span-1"
      title={hint}
    >
      <span className="text-fg-muted text-[11px] leading-tight">{label}</span>
      <span
        className={cn(
          'text-lg font-semibold tabular-nums',
          tone && value !== 0 && value !== '—' ? TONE_TEXT[tone] : 'text-fg',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function TimeStat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="bg-bg-subtle flex items-center gap-3 rounded-lg px-3 py-2.5" title={hint}>
      <IconChip tone="primary" size="sm">
        {icon}
      </IconChip>
      <div className="flex flex-col">
        <span className="text-fg-muted text-[11px]">{label}</span>
        <span className="text-fg text-base font-semibold tabular-nums">{value}</span>
      </div>
    </div>
  );
}

function BoardFlow({ m }: { m: FlowBoardMetrics }) {
  const configured = m.level !== 'NONE';
  const max = Math.max(1, ...m.stages.map((s) => s.avgHours));
  const slowest =
    m.stages.length > 1
      ? m.stages.reduce((a, b) => (b.avgHours > a.avgHours ? b : a), m.stages[0]!)
      : null;
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block size-2.5 rounded-full"
            style={{ backgroundColor: m.board.color ?? '#888' }}
          />
          {m.board.name}
        </span>
      }
      bodyClassName="flex flex-col gap-5"
    >
      {!configured && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle size={14} className="mt-px shrink-0" />
          Classificação de progresso não configurada para este quadro: aparecem só recebidos e tempo
          por etapa.
        </p>
      )}

      <div className="flex flex-col gap-3 xl:flex-row">
        <div className="border-border/70 bg-border/70 grid flex-1 grid-cols-2 gap-px overflow-hidden rounded-lg border sm:grid-cols-4 lg:grid-cols-7">
          <Stat
            label="Recebidos"
            value={m.received}
            hint="Cards que entraram no fluxo no período"
          />
          <Stat
            label="Iniciados"
            value={configured ? m.started : '—'}
            hint="Saíram da coluna de entrada pela 1ª vez"
          />
          <Stat
            label="Aguardando agora"
            value={configured ? m.waitingNow : '—'}
            hint="Cards ativos em coluna Aguardando cliente/terceiro"
            tone="warning"
          />
          <Stat label="Foram p/ aguardando" value={configured ? m.waitingEntries : '—'} />
          <Stat
            label="Devolvidos"
            value={configured ? m.returned : '—'}
            hint="Retrocessos no período"
            tone="negative"
          />
          <Stat label="Concluídos" value={configured ? m.completed : '—'} tone="positive" />
          <Stat label="Reabertos" value={configured ? m.reopened : '—'} />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:w-56 xl:grid-cols-1">
          <TimeStat
            icon={<Timer size={14} />}
            label="1º atendimento"
            value={formatHours(m.avgFirstResponseHours)}
            hint="Média da entrada no fluxo até sair da coluna de entrada"
          />
          <TimeStat
            icon={<Clock3 size={14} />}
            label="Tempo médio até concluir"
            value={formatHours(m.avgCycleHours)}
            hint="Média da entrada no fluxo até a conclusão"
          />
        </div>
      </div>

      {m.stages.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-fg text-xs font-semibold">Tempo médio em cada etapa</p>
            {slowest && (
              <p className="text-fg-muted flex items-center gap-1 text-[11px]">
                <Hourglass size={12} className="text-amber-500" />
                Onde o trabalho mais demora:{' '}
                <strong className="text-fg font-medium">{slowest.name}</strong>
              </p>
            )}
          </div>
          <ul className="flex flex-col gap-2.5">
            {m.stages.map((s) => {
              const isSlowest = slowest?.listId === s.listId;
              return (
                <li
                  key={s.listId}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-xs sm:grid-cols-[12rem_minmax(0,1fr)_5rem_3rem]"
                >
                  <span
                    className={cn('truncate', isSlowest ? 'text-fg font-medium' : 'text-fg')}
                    title={s.name}
                  >
                    {s.name}
                  </span>
                  <span className="order-3 col-span-2 sm:order-none sm:col-span-1">
                    <span className="bg-bg-muted block h-2.5 overflow-hidden rounded-full">
                      <span
                        className={cn(
                          'block h-full rounded-full',
                          isSlowest ? 'bg-amber-500' : 'bg-primary/70',
                        )}
                        style={{ width: `${Math.max(2, (s.avgHours / max) * 100)}%` }}
                      />
                    </span>
                  </span>
                  <span className="text-fg text-right font-medium tabular-nums">
                    {formatHours(s.avgHours)}
                  </span>
                  <span
                    className="text-fg-subtle hidden text-right tabular-nums sm:inline"
                    title="Saídas da coluna no período"
                  >
                    {s.samples}×
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Panel>
  );
}

export function FlowSection({ params }: { params: PerformanceParams }) {
  const enabled = !!(params.area || params.boardIds?.length);
  const q = useQuery({ ...performanceQueries.flow(params), enabled });
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading
        description={
          enabled
            ? 'Mede o fluxo de cada quadro (inclui movimentações feitas por automação).'
            : undefined
        }
      >
        Fluxo do trabalho
      </SectionHeading>
      {!enabled ? (
        <div className="border-border rounded-xl border border-dashed">
          <EmptyState icon={<Workflow size={16} />} title="Escolha uma área ou um fluxo">
            Filtre por área ou por fluxo para ver recebidos, tempo de atendimento e tempo por etapa
            de cada quadro.
          </EmptyState>
        </div>
      ) : q.isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : q.isError || !q.data ? (
        <p className="text-fg-muted text-xs">Não foi possível carregar o fluxo do trabalho.</p>
      ) : q.data.boards.length === 0 ? (
        <p className="text-fg-muted text-xs">Nenhum fluxo nesta área ainda.</p>
      ) : (
        q.data.boards.map((m) => <BoardFlow key={m.board.id} m={m} />)
      )}
    </section>
  );
}
