'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Archive, Loader2, Trash2 } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@ktask/ui';
import { ApiError } from '@/lib/api-client';
import {
  boardDeletePreviewQuery,
  executeBoardDelete,
  type BoardDetail,
  type DeleteBoardStrategy,
} from '@/lib/queries/boards';

type Strategy = 'archive-cascade' | 'delete-all';

/**
 * Dialogo de exclusao de fluxo (doc 29).
 *
 * V1: 2 estrategias.
 *   archive-cascade: arquiva board + cards exclusivos. Reversivel.
 *   delete-all:      hard delete via cascade. Exige confirmacao por digitar
 *                    o nome do board exatamente.
 *
 * Estrategias previstas pra V2 (doc 29):
 *   delete-orphans, unlink, move-to-other-board.
 */
export function DeleteBoardDialog({
  board,
  open,
  onOpenChange,
  onSuccess,
}: {
  board: Pick<BoardDetail, 'id' | 'name'>;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Chamado depois do sucesso. Caller decide redirect/invalidate. */
  onSuccess: (result: { strategy: Strategy }) => void;
}) {
  const [strategy, setStrategy] = useState<Strategy>('archive-cascade');
  const [confirmName, setConfirmName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const previewQ = useQuery({
    ...boardDeletePreviewQuery(board.id),
    enabled: open,
    staleTime: 0,
  });

  const deleteMut = useMutation({
    mutationFn: (body: DeleteBoardStrategy) => executeBoardDelete(board.id, body),
    onSuccess: (result) => {
      setError(null);
      onSuccess({ strategy: result.strategy });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Erro ao excluir.'),
  });

  function handleConfirm() {
    setError(null);
    if (strategy === 'archive-cascade') {
      deleteMut.mutate({ strategy: 'archive-cascade' });
    } else {
      deleteMut.mutate({ strategy: 'delete-all', confirmName: confirmName.trim() });
    }
  }

  const canConfirmDeleteAll = strategy === 'delete-all' && confirmName.trim() === board.name.trim();
  const canConfirm = strategy === 'archive-cascade' || canConfirmDeleteAll;
  const pending = deleteMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="w-[calc(100vw-2rem)] max-w-lg gap-0 rounded-md p-0">
        <div className="p-5">
          <DialogTitle className="text-fg flex items-center gap-2 text-base font-semibold leading-snug">
            <AlertTriangle size={16} className="text-danger" />
            Excluir fluxo &quot;{board.name}&quot;?
          </DialogTitle>

          {previewQ.isPending ? (
            <div className="text-fg-muted mt-4 flex items-center gap-2 text-sm">
              <Loader2 size={14} className="animate-spin" />
              Calculando impacto…
            </div>
          ) : previewQ.isError ? (
            <p className="text-danger mt-4 text-sm">
              {previewQ.error instanceof ApiError
                ? previewQ.error.message
                : 'Erro ao carregar preview.'}
            </p>
          ) : previewQ.data ? (
            <>
              <div className="border-border bg-bg-subtle/40 mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md border p-3 text-xs">
                <Stat label="Cards no fluxo" value={previewQ.data.totalCards} />
                <Stat
                  label="Exclusivos deste fluxo"
                  value={previewQ.data.exclusiveCards}
                  emphasis={previewQ.data.exclusiveCards > 0}
                />
                <Stat label="Em outros fluxos também" value={previewQ.data.multiFlowCards} />
                <Stat label="Colunas" value={previewQ.data.totalLists} />
                <Stat label="Atividades registradas" value={previewQ.data.totalActivities} />
              </div>

              <div className="mt-4 flex flex-col gap-2">
                {/* Estrategia 1: archive-cascade */}
                <label
                  className={`border-border/70 hover:border-border-strong flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                    strategy === 'archive-cascade' ? 'border-primary bg-primary-subtle/30' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="delete-strategy"
                    value="archive-cascade"
                    checked={strategy === 'archive-cascade'}
                    onChange={() => setStrategy('archive-cascade')}
                    className="accent-primary mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-fg flex items-center gap-1.5 text-sm font-medium">
                      <Archive size={13} />
                      Arquivar fluxo (recomendado)
                    </p>
                    <p className="text-fg-muted mt-0.5 text-[12px] leading-snug">
                      O fluxo some da listagem.{' '}
                      {previewQ.data.exclusiveCards > 0 && (
                        <>
                          <strong>{previewQ.data.exclusiveCards}</strong> cards exclusivos são
                          arquivados junto.{' '}
                        </>
                      )}
                      {previewQ.data.multiFlowCards > 0 && (
                        <>
                          {previewQ.data.multiFlowCards} cards multi-fluxo permanecem ativos nos
                          outros fluxos.{' '}
                        </>
                      )}
                      Reversível pela tela de fluxos arquivados.
                    </p>
                  </div>
                </label>

                {/* Estrategia 2: delete-all */}
                <label
                  className={`border-border/70 hover:border-border-strong flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                    strategy === 'delete-all' ? 'border-danger bg-danger-subtle/30' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="delete-strategy"
                    value="delete-all"
                    checked={strategy === 'delete-all'}
                    onChange={() => setStrategy('delete-all')}
                    className="accent-danger mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-fg flex items-center gap-1.5 text-sm font-medium">
                      <Trash2 size={13} className="text-danger" />
                      Excluir definitivamente (irreversível)
                    </p>
                    <p className="text-fg-muted mt-0.5 text-[12px] leading-snug">
                      Apaga o fluxo, todas as <strong>{previewQ.data.totalLists}</strong> colunas e{' '}
                      <strong>{previewQ.data.totalCards}</strong> cards (mesmo os multi-fluxo).
                      Atividades vinculadas aos cards somem junto. Esta ação não pode ser desfeita.
                    </p>
                    {strategy === 'delete-all' && (
                      <div className="mt-3">
                        <label className="text-fg-muted mb-1 block text-[11px]">
                          Para confirmar, digite{' '}
                          <code className="text-fg bg-bg-muted rounded px-1">{board.name}</code>:
                        </label>
                        <input
                          type="text"
                          value={confirmName}
                          onChange={(e) => setConfirmName(e.target.value)}
                          placeholder={board.name}
                          autoComplete="off"
                          className="border-border bg-bg focus:border-danger w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                </label>
              </div>
            </>
          ) : null}

          {error && (
            <p className="bg-danger-subtle text-danger mt-3 rounded px-2 py-1.5 text-xs">{error}</p>
          )}
        </div>

        <div className="border-border/60 bg-bg-subtle/50 flex flex-col-reverse gap-2 border-t px-5 py-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className="border-border text-fg hover:bg-bg-muted inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending || !canConfirm || previewQ.isPending}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${
              strategy === 'delete-all'
                ? 'bg-danger hover:bg-danger/90'
                : 'bg-primary hover:bg-primary-hover'
            }`}
          >
            {pending && <Loader2 size={13} className="animate-spin" />}
            {strategy === 'delete-all' ? 'Excluir definitivamente' : 'Arquivar fluxo'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, emphasis }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-fg-muted">{label}</span>
      <span className={`font-semibold ${emphasis ? 'text-warning' : 'text-fg'}`}>{value}</span>
    </div>
  );
}
