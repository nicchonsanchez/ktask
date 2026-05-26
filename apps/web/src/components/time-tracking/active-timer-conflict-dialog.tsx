'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, Timer, X } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@ktask/ui';
import { startTimer, stopTimer, formatDuration } from '@/lib/queries/time-tracking';
import { ApiError } from '@/lib/api-client';
import { useTimerStore } from '@/stores/timer-store';

/**
 * Diálogo "Existe um timer ativo" — ver doc 18 §2b.
 * Aberto via useTimerStore.openConflict() de qualquer ponto do app.
 */
export function ActiveTimerConflictDialog() {
  const queryClient = useQueryClient();
  // Zustand v5: seletores devem retornar valor primitivo. Objeto novo a cada
  // render causa loop infinito ("getSnapshot should be cached") — usar
  // chamadas separadas pra cada slice.
  const conflict = useTimerStore((s) => s.conflict);
  const closeConflict = useTimerStore((s) => s.closeConflict);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!conflict) return;
    const id = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [conflict]);

  const stopAndStartMut = useMutation({
    mutationFn: async () => {
      if (!conflict) return;
      await stopTimer(conflict.active.id);
      await startTimer(conflict.target.cardId, conflict.target.note);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-tracking'] });
      conflict?.onResolved?.();
      closeConflict();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Falha ao trocar de cronômetro.');
    },
  });

  if (!conflict) return null;

  const elapsed = Math.max(
    0,
    Math.floor((Date.now() - new Date(conflict.active.startedAt).getTime()) / 1000),
  );
  void tick;

  return (
    <Dialog open onOpenChange={(open) => !open && closeConflict()}>
      <DialogContent hideClose className="max-w-[520px] gap-0 overflow-hidden p-0">
        <div className="flex items-start gap-3 px-6 pb-2 pt-6">
          <span className="bg-warning-subtle text-warning inline-flex size-9 shrink-0 items-center justify-center rounded-full">
            <AlertCircle size={18} />
          </span>
          <div className="min-w-0 flex-1 pt-1">
            <DialogTitle className="text-fg text-[15px] font-semibold leading-tight">
              Existe um timer ativo
            </DialogTitle>
          </div>
          <button
            type="button"
            onClick={() => closeConflict()}
            className="text-fg-muted hover:bg-bg-muted hover:text-fg -mr-1 -mt-1 shrink-0 rounded-full p-1.5 transition-colors"
            aria-label="Fechar"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-6 pb-5 pt-2">
          <p className="text-fg-muted pl-12 text-[13px] leading-relaxed">
            Para iniciar o cronômetro em um novo card, você precisa parar o que está rodando agora.
            Como deseja prosseguir?
          </p>

          <div className="relative overflow-hidden rounded-lg border border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/10 via-fuchsia-500/5 to-transparent px-4 py-3">
            <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-fuchsia-500" />
            <div className="flex items-center gap-3">
              <span className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-fuchsia-500/20 text-fuchsia-500">
                <Timer size={16} />
                <span
                  aria-hidden
                  className="absolute inset-0 animate-ping rounded-full bg-fuchsia-500/30"
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-fg-muted text-[10px] font-semibold uppercase tracking-wider">
                  Cronometrando agora
                </p>
                <p className="text-fg truncate text-sm font-semibold leading-snug">
                  {conflict.active.cardTitle}
                </p>
                <p className="text-fg-muted truncate text-[11px]">{conflict.active.boardName}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-base font-bold tabular-nums text-fuchsia-500">
                  {formatDuration(elapsed)}
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-danger-subtle text-danger flex items-start gap-2 rounded-md px-3 py-2 text-[12px]">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer: empilha vertical em mobile, lado-a-lado em sm+. Botoes
            podem ter texto longo (PT-BR) — sem flex-col em telas pequenas
            os botoes overflowam pra direita e somem (bug visto em 2026-05). */}
        <div className="border-border/60 bg-bg-subtle/40 flex flex-col-reverse gap-2 border-t px-6 py-3 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={() => stopAndStartMut.mutate()}
            disabled={stopAndStartMut.isPending}
            className="text-fg-muted hover:text-fg hover:bg-bg-muted inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors disabled:opacity-50"
          >
            {stopAndStartMut.isPending && <Loader2 size={13} className="animate-spin" />}
            Parar e iniciar no novo
          </button>
          <button
            type="button"
            onClick={() => closeConflict()}
            disabled={stopAndStartMut.isPending}
            className="bg-primary text-primary-fg hover:bg-primary-hover rounded-md px-4 py-2 text-[13px] font-semibold shadow-sm transition-all hover:shadow disabled:opacity-50"
          >
            Manter cronômetro atual
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
