'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Maximize2, Pause, Play } from 'lucide-react';

import { ApiError } from '@/lib/api-client';
import {
  formatDuration,
  startTimer,
  stopTimer,
  timeTrackingQueries,
  type ActiveTimer,
} from '@/lib/queries/time-tracking';
import { useAuthStore } from '@/stores/auth-store';
import { useNotify } from '@/components/ui/dialogs';
import { useTimerStore } from '@/stores/timer-store';
import { TimerPopover } from '@/components/time-tracking/timer-popover';

/**
 * Botão Play/Pause de cronômetro DENTRO do popup do card.
 *
 * UX (Ummense-inspired):
 *   - Em mobile: pílula sempre expandida.
 *   - Em desktop: ícone-only por padrão; expande no hover (ou enquanto o
 *     popover de detalhes estiver aberto).
 *
 * Estados:
 *   - sem timer ativo → Play (verde). Click inicia neste card.
 *   - timer ativo NESTE card → Pause (magenta) com HH:MM:SS + Maximize.
 *     Click no pause → para. Click no maximize → abre popover de detalhes.
 *   - timer ativo em OUTRO card → Play (azul) com tooltip "Em outro card".
 *     Click abre conflict dialog (parar lá pra começar aqui).
 */
export function CardTimerButton({ cardId }: { cardId: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const notify = useNotify();
  const openConflict = useTimerStore((s) => s.openConflict);
  const me = useAuthStore((s) => s.user);

  const activeQuery = useQuery({ ...timeTrackingQueries.active() });
  const active = activeQuery.data;
  const isThisCard = active?.cardId === cardId;
  const isOtherCard = active && !isThisCard;

  function goToTimesheet() {
    const path = me ? `/indicadores/timesheet?userId=${me.id}` : '/indicadores/timesheet';
    router.push(path);
  }

  const startMut = useMutation({
    mutationFn: () => startTimer(cardId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['time-tracking'] }),
    onError: (err) => {
      if (err instanceof ApiError) notify.error(err.message);
    },
  });

  const stopMut = useMutation({
    mutationFn: (entryId: string) => stopTimer(entryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['time-tracking'] }),
    onError: (err) => {
      if (err instanceof ApiError) notify.error(err.message);
    },
  });

  function handleClick() {
    if (isThisCard && active) {
      stopMut.mutate(active.id);
      return;
    }
    if (isOtherCard) {
      openConflict({
        active: {
          id: active.id,
          cardId: active.cardId,
          cardTitle: active.card?.title ?? null,
          boardName: active.card?.board.name ?? null,
          startedAt: active.startedAt,
        },
        target: { cardId },
        onResolved: () => queryClient.invalidateQueries({ queryKey: ['time-tracking'] }),
      });
      return;
    }
    startMut.mutate();
  }

  if (activeQuery.isLoading) {
    return (
      <span className="bg-bg-muted text-fg-muted inline-flex h-8 items-center justify-center rounded-full px-2.5">
        <Loader2 size={14} className="animate-spin" />
      </span>
    );
  }

  if (isThisCard && active) {
    return <RunningButton active={active} onStop={handleClick} stopping={stopMut.isPending} />;
  }

  return (
    <div
      className={
        isOtherCard
          ? 'group/play bg-bg-muted text-fg-muted inline-flex h-8 items-center gap-0 rounded-full pl-1 pr-1 text-[12px] font-semibold transition-all hover:gap-1.5 hover:bg-sky-600 hover:text-white hover:shadow'
          : 'group/play bg-bg-muted text-fg-muted inline-flex h-8 items-center gap-0 rounded-full pl-1 pr-1 text-[12px] font-semibold transition-all hover:gap-1.5 hover:bg-emerald-600 hover:text-white hover:shadow'
      }
      title={
        isOtherCard
          ? `Cronômetro rodando em outro card (${active.card?.title ?? 'sem card'}). Click pra parar lá e começar aqui.`
          : 'Iniciar cronômetro neste card'
      }
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={startMut.isPending}
        className="bg-fg/10 inline-flex size-6 items-center justify-center rounded-full transition-colors disabled:opacity-60 group-hover/play:bg-white/25"
        aria-label="Iniciar cronômetro"
      >
        {startMut.isPending ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Play size={11} fill="currentColor" />
        )}
      </button>
      <span className="hidden whitespace-nowrap font-mono tabular-nums group-hover/play:inline">
        00:00:00
      </span>
      <button
        type="button"
        onClick={goToTimesheet}
        className="hidden size-6 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/20 hover:text-white group-hover/play:inline-flex"
        aria-label="Ver meus cronômetros"
        title="Ver meus cronômetros"
      >
        <Maximize2 size={10} />
      </button>
    </div>
  );
}

function RunningButton({
  active,
  onStop,
  stopping,
}: {
  active: ActiveTimer;
  onStop: () => void;
  stopping: boolean;
}) {
  const [tick, setTick] = useState(0);
  const [popoverOpen, setPopoverOpen] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);
  void tick;

  const elapsedSec = Math.max(
    0,
    Math.floor((Date.now() - new Date(active.startedAt).getTime()) / 1000),
  );

  const cardTitle = active.card?.title ?? 'Cronômetro sem card';

  // Quando popoverOpen, pílula sempre aberta. Senão, ícone-only (círculo
  // 32×32 com pl-1 pr-1), expande só no hover (qualquer viewport).
  const parentExpand = popoverOpen ? 'gap-1.5 pr-1' : 'gap-0 pr-1 hover:gap-1.5';
  const childShow = popoverOpen ? 'inline-flex' : 'hidden group-hover/running:inline-flex';
  const textShow = popoverOpen ? 'inline' : 'hidden group-hover/running:inline';

  return (
    <div className="relative inline-flex">
      <div
        className={`group/running inline-flex h-8 items-center rounded-full bg-fuchsia-600 pl-1 text-white shadow-sm transition-all hover:shadow ${parentExpand}`}
        title={`Cronometrando: ${cardTitle}`}
        data-entry-id={active.id}
      >
        <button
          type="button"
          onClick={onStop}
          disabled={stopping}
          className="inline-flex size-6 items-center justify-center rounded-full bg-white/15 transition-colors hover:bg-white/30 disabled:opacity-60"
          aria-label="Parar cronômetro"
          title="Parar cronômetro"
        >
          {stopping ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Pause size={10} fill="currentColor" />
          )}
        </button>
        <span
          className={`select-none whitespace-nowrap font-mono text-[12px] font-semibold tabular-nums ${textShow}`}
        >
          {formatDuration(elapsedSec)}
        </span>
        <button
          type="button"
          onClick={() => setPopoverOpen((v) => !v)}
          className={`size-6 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/20 hover:text-white ${childShow}`}
          aria-label="Detalhes do cronômetro"
          title="Detalhes do cronômetro"
        >
          <Maximize2 size={10} />
        </button>
      </div>
      {popoverOpen && (
        <TimerPopover
          active={active}
          onClose={() => setPopoverOpen(false)}
          onStop={() => {
            onStop();
            setPopoverOpen(false);
          }}
          stopping={stopping}
        />
      )}
    </div>
  );
}
