'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Maximize2, Pause, Play } from 'lucide-react';

import {
  startFreeTimer,
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
 *
 * Comportamento UX (Ummense-inspired):
 *   - Em mobile (< md): pílula sempre expandida (mostra o tempo).
 *   - Em desktop (md+): colapsa por padrão pra ícone-only; expande no hover
 *     (ou enquanto o popover de detalhes estiver aberto). Reduz ruído visual
 *     no header.
 *
 * Estados:
 *   - idle (sem timer): pílula verde com Play. Click sem card aberto inicia
 *     um timer "livre" (sem cardId). Click com card aberto inicia nesse card.
 *   - running: pílula magenta com Pause + tempo HH:MM:SS + ícone de expandir.
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

  const startFreeMut = useMutation({
    mutationFn: () => startFreeTimer(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-tracking'] });
    },
    onError: (err) => {
      console.error('[timer] start free failed:', err);
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
    // Sem card no contexto: inicia timer livre (sem cardId vinculado).
    // Aparece na lista pessoal de timers; pode ser editado depois pra atribuir.
    if (!cardInContext) {
      if (active) {
        // Se já tem timer ativo (mesmo livre), não faz nada — só mostra detalhes.
        return;
      }
      startFreeMut.mutate();
      return;
    }
    if (active && active.cardId !== cardInContext) {
      openConflict({
        active: {
          id: active.id,
          cardId: active.cardId,
          cardTitle: active.card?.title ?? null,
          boardName: active.card?.board.name ?? null,
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
    const pending = startMut.isPending || startFreeMut.isPending;
    return (
      <div ref={anchorRef} className="relative">
        <button
          type="button"
          onClick={handlePlayClick}
          disabled={pending}
          className="group/timer inline-flex h-9 items-center gap-2 rounded-full bg-emerald-600 pl-1 pr-3 text-xs font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 hover:shadow disabled:opacity-60 md:gap-0 md:pr-1 md:hover:gap-2 md:hover:pr-3"
          title={
            cardInContext
              ? 'Iniciar cronômetro neste card'
              : 'Iniciar cronômetro (sem card vinculado)'
          }
          aria-label="Iniciar cronômetro"
        >
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-white/20 transition-colors group-hover/timer:bg-white/30">
            {pending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Play size={12} fill="currentColor" />
            )}
          </span>
          <span className="whitespace-nowrap font-mono tabular-nums md:hidden md:group-hover/timer:inline">
            00:00:00
          </span>
        </button>
      </div>
    );
  }

  return (
    <div ref={anchorRef} className="relative">
      <RunningPill
        active={active}
        forceExpanded={popoverOpen}
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
  forceExpanded,
  onPause,
  onExpand,
  loadingPause,
}: {
  active: ActiveTimer;
  forceExpanded: boolean;
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
  void tick;

  const cardTitle = active.card?.title ?? 'Cronômetro sem card';

  // Classes condicionais: quando forceExpanded (popover aberto), parent fica
  // sempre expandido. Senão, em md+ colapsa e expande no hover.
  const parentExpand = forceExpanded
    ? 'gap-2 pr-1'
    : 'gap-2 pr-1 md:gap-0 md:pr-0 md:hover:gap-2 md:hover:pr-1';
  const childShow = forceExpanded
    ? 'inline-flex'
    : 'inline-flex md:hidden md:group-hover/running:inline-flex';
  const textShow = forceExpanded ? 'inline' : 'inline md:hidden md:group-hover/running:inline';

  return (
    <div
      className={`group/running inline-flex h-9 items-center rounded-full bg-fuchsia-600 pl-1 text-white shadow-sm transition-all hover:shadow ${parentExpand}`}
      title={`Cronometrando: ${cardTitle}`}
    >
      <button
        type="button"
        onClick={onPause}
        disabled={loadingPause}
        className="inline-flex size-7 items-center justify-center rounded-full bg-white/15 transition-colors hover:bg-white/30 disabled:opacity-60"
        aria-label="Parar cronômetro"
        title={`Parar — ${cardTitle}`}
      >
        {loadingPause ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Pause size={11} fill="currentColor" />
        )}
      </button>
      <span
        className={`select-none whitespace-nowrap font-mono text-xs font-semibold tabular-nums ${textShow}`}
      >
        {formatDuration(elapsedSec)}
      </span>
      <button
        type="button"
        onClick={onExpand}
        className={`size-7 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/20 hover:text-white ${childShow}`}
        aria-label="Detalhes do cronômetro"
        title="Detalhes do cronômetro"
      >
        <Maximize2 size={11} />
      </button>
    </div>
  );
}
