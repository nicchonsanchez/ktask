'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Maximize2, Pause, Play } from 'lucide-react';

import {
  startTimer,
  stopTimer,
  timeTrackingQueries,
  formatDuration,
  type ActiveTimer,
} from '@/lib/queries/time-tracking';
import { ApiError } from '@/lib/api-client';
import { useNotify } from '@/components/ui/dialogs';
import { useTimerStore } from '@/stores/timer-store';
import { TimerPopover } from './timer-popover';

/**
 * Cronômetro flutuante no header global.
 * - idle: pílula verde compacta com Play.
 * - running: pílula magenta com Pause + tempo HH:MM:SS + ícone de expandir.
 *
 * Tempo é sempre `Date.now() - startedAt` (sobrevive a refresh, sleep, etc).
 */
export function TimerWidget() {
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const cardInContext = params.get('card');
  const openConflict = useTimerStore((s) => s.openConflict);
  const notify = useNotify();

  const activeQuery = useQuery({ ...timeTrackingQueries.active() });
  const active = activeQuery.data;
  const [popoverOpen, setPopoverOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  const startMut = useMutation({
    mutationFn: (cardId: string) => startTimer(cardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-tracking'] });
    },
    onError: (err) => {
      console.error('[timer] start failed:', err);
      if (err instanceof ApiError) notify.error(err.message);
    },
  });

  const stopMut = useMutation({
    mutationFn: (entryId: string) => stopTimer(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-tracking'] });
    },
    onError: (err) => {
      console.error('[timer] stop failed:', err);
      if (err instanceof ApiError) notify.error(err.message);
    },
  });

  function handlePlayClick() {
    if (!cardInContext) {
      notify.info('Abra um card primeiro. Você pode iniciar o cronômetro dentro do modal do card.');
      return;
    }
    if (active && active.cardId !== cardInContext) {
      // Conflito — abre diálogo
      openConflict({
        active: {
          id: active.id,
          cardId: active.cardId,
          cardTitle: active.card.title,
          boardName: active.card.board.name,
          startedAt: active.startedAt,
        },
        target: { cardId: cardInContext },
        onResolved: () => {
          queryClient.invalidateQueries({ queryKey: ['time-tracking'] });
        },
      });
      return;
    }
    if (active && active.cardId === cardInContext) {
      // No-op: já tá rodando nesse card
      return;
    }
    startMut.mutate(cardInContext);
  }

  function handlePauseClick() {
    if (!active) return;
    stopMut.mutate(active.id);
  }

  if (activeQuery.isLoading && !active) {
    return (
      <div
        ref={anchorRef}
        className="bg-bg-muted text-fg-muted inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs"
      >
        <Loader2 size={14} className="animate-spin" />
      </div>
    );
  }

  if (!active) {
    return (
      <div ref={anchorRef} className="relative">
        <button
          type="button"
          onClick={handlePlayClick}
          disabled={startMut.isPending}
          className="group/timer inline-flex h-9 items-center gap-2 rounded-full bg-emerald-600 pl-1 pr-3 text-xs font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 hover:shadow disabled:opacity-60"
          title={
            cardInContext
              ? 'Iniciar cronômetro neste card'
              : 'Abra um card pra iniciar o cronômetro'
          }
          aria-label="Iniciar cronômetro"
        >
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-white/20 transition-colors group-hover/timer:bg-white/30">
            {startMut.isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Play size={12} fill="currentColor" />
            )}
          </span>
          <span className="font-mono tabular-nums">00:00:00</span>
        </button>
      </div>
    );
  }

  return (
    <div ref={anchorRef} className="relative">
      <RunningPill
        active={active}
        onPause={handlePauseClick}
        onExpand={() => setPopoverOpen((v) => !v)}
        loadingPause={stopMut.isPending}
      />
      {popoverOpen && (
        <TimerPopover
          active={active}
          onClose={() => setPopoverOpen(false)}
          onStop={handlePauseClick}
          stopping={stopMut.isPending}
        />
      )}
    </div>
  );
}

function RunningPill({
  active,
  onPause,
  onExpand,
  loadingPause,
}: {
  active: ActiveTimer;
  onPause: () => void;
  onExpand: () => void;
  loadingPause: boolean;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedSec = Math.max(
    0,
    Math.floor((Date.now() - new Date(active.startedAt).getTime()) / 1000),
  );
  void tick; // só pra forçar re-render

  return (
    <div
      className="group/running inline-flex h-9 items-center rounded-full bg-fuchsia-600 pr-1 text-white shadow-sm transition-shadow hover:shadow"
      title={`Cronometrando: ${active.card.title}`}
    >
      <button
        type="button"
        onClick={onPause}
        disabled={loadingPause}
        className="mr-2 inline-flex size-7 items-center justify-center rounded-full bg-white/15 transition-colors hover:bg-white/30 disabled:opacity-60"
        aria-label="Parar cronômetro"
        title={`Parar — ${active.card.title}`}
      >
        {loadingPause ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Pause size={11} fill="currentColor" />
        )}
      </button>
      <span className="select-none font-mono text-xs font-semibold tabular-nums">
        {formatDuration(elapsedSec)}
      </span>
      <button
        type="button"
        onClick={onExpand}
        className="ml-2 inline-flex size-7 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/20 hover:text-white"
        aria-label="Detalhes do cronômetro"
        title="Detalhes do cronômetro"
      >
        <Maximize2 size={11} />
      </button>
    </div>
  );
}
