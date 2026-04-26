'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Loader2, Pause, X } from 'lucide-react';

import { useAuthStore } from '@/stores/auth-store';
import { UserAvatar } from '@/components/user-avatar';
import { formatDuration, updateTimeEntry, type ActiveTimer } from '@/lib/queries/time-tracking';

/**
 * Popover de detalhes do cronômetro ativo.
 * Aberto pelo ícone "expandir" do TimerWidget.
 */
export function TimerPopover({
  active,
  onClose,
  onStop,
  stopping,
}: {
  active: ActiveTimer;
  onClose: () => void;
  onStop: () => void;
  stopping: boolean;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const [note, setNote] = useState(active.note ?? '');
  const [tick, setTick] = useState(0);

  useEffect(() => setNote(active.note ?? ''), [active.id, active.note]);

  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedSec = Math.max(
    0,
    Math.floor((Date.now() - new Date(active.startedAt).getTime()) / 1000),
  );
  void tick;

  const noteMut = useMutation({
    mutationFn: (next: string) => updateTimeEntry(active.id, { note: next || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-tracking', 'active'] });
    },
  });

  // Debounce salvamento da nota.
  // Deps: o efeito depende apenas de `note`. As outras refs (active.note,
  // noteMut) sao estaveis o suficiente; incluir noteMut causa re-trigger
  // espurio. Mantemos a lista enxuta intencionalmente.
  useEffect(() => {
    if ((note ?? '') === (active.note ?? '')) return;
    const id = setTimeout(() => noteMut.mutate(note), 500);
    return () => clearTimeout(id);
  }, [note, active.note, noteMut]);

  function goToTimesheet() {
    if (!me) return;
    router.push(`/indicadores/timesheet?userId=${me.id}`);
    onClose();
  }

  function goToCard() {
    if (!active.card) return;
    router.push(`/b/${active.card.boardId}?card=${active.cardId}`);
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Detalhes do cronômetro"
        className={
          // Mobile (< sm): posicao fixed no topo da viewport, full-width com
          // margens — evita overflow quando o trigger esta proximo do meio/direita.
          // Desktop (sm+): volta ao comportamento ancorado ao trigger.
          'border-border bg-bg z-40 flex flex-col gap-3 rounded-md border p-4 shadow-lg ' +
          'fixed inset-x-2 top-[4.5rem]' +
          'sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[min(360px,calc(100vw-1rem))]'
        }
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Cronômetro</p>
            <p className="text-fg-muted text-[11px]">Em andamento</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-muted hover:bg-bg-muted hover:text-fg rounded p-1"
            aria-label="Fechar"
          >
            <X size={14} />
          </button>
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anotação (opcional)"
          rows={2}
          maxLength={500}
          className="border-border bg-bg focus-visible:ring-primary w-full resize-none rounded-md border px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2"
        />

        {active.card ? (
          <button
            type="button"
            onClick={goToCard}
            className="border-border hover:bg-bg-muted flex items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="text-fg-muted text-[10px] uppercase tracking-wide">Card vinculado</p>
              <p className="truncate text-xs font-medium">{active.card.title}</p>
              <p className="text-fg-muted truncate text-[11px]">
                {active.card.board.name} · {active.card.list.name}
              </p>
            </div>
          </button>
        ) : (
          <div className="border-border bg-bg-subtle/50 flex items-start gap-2 rounded-md border border-dashed px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-fg-muted text-[10px] uppercase tracking-wide">Sem card</p>
              <p className="text-fg-muted text-[11px]">
                Cronômetro livre. Você pode atribuir um card depois pelo timesheet.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onStop}
            disabled={stopping}
            className="inline-flex items-center gap-2 rounded-full bg-fuchsia-600 py-1.5 pl-1.5 pr-3 text-white transition-colors hover:bg-fuchsia-700 disabled:opacity-60"
            aria-label="Parar cronômetro"
          >
            <span className="inline-flex size-6 items-center justify-center rounded-full hover:bg-white/20">
              {stopping ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Pause size={12} fill="currentColor" />
              )}
            </span>
            <span className="font-mono text-xs tabular-nums">{formatDuration(elapsedSec)}</span>
          </button>

          {me && (
            <div className="flex items-center gap-2">
              <UserAvatar
                name={me.name}
                userId={me.id}
                avatarUrl={me.avatarUrl ?? null}
                size="sm"
              />
              <div className="flex flex-col">
                <span className="text-xs font-medium">{me.name}</span>
                <button
                  type="button"
                  onClick={goToTimesheet}
                  className="text-primary text-[10px] hover:underline"
                >
                  Meu timesheet
                </button>
              </div>
            </div>
          )}
        </div>

        {noteMut.isPending && <p className="text-fg-muted text-[10px]">Salvando anotação...</p>}
      </div>
    </>
  );
}
