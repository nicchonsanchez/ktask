'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@ktask/ui';
import type { ListWithCards } from '@/lib/queries/boards';

/**
 * Diálogo de confirmação ao arquivar coluna que tem cards.
 *
 * Apresenta 2 opções claras:
 *   - Mover os cards pra outra coluna (selecionar destino)
 *   - Arquivar todos os cards junto com a coluna
 *
 * Se a coluna está vazia, o componente pai não precisa abrir esse diálogo —
 * pode arquivar direto via `useConfirm` simples.
 */
export function ArchiveListDialog({
  open,
  onOpenChange,
  list,
  otherLists,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Coluna a ser arquivada (lê `name` e `cards.length`). */
  list: ListWithCards;
  /** Outras colunas do mesmo board (não arquivadas) — opções de destino. */
  otherLists: ListWithCards[];
  onConfirm: (action: 'archive' | 'move', targetListId?: string) => void;
  pending: boolean;
}) {
  const [action, setAction] = useState<'archive' | 'move'>('move');
  const [targetListId, setTargetListId] = useState<string>(otherLists[0]?.id ?? '');
  const cardsCount = list.cards.length;
  const cardsLabel = cardsCount === 1 ? 'card' : 'cards';
  const canMove = otherLists.length > 0;

  function handleConfirm() {
    if (action === 'move') {
      if (!targetListId) return;
      onConfirm('move', targetListId);
    } else {
      onConfirm('archive');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="w-[calc(100vw-2rem)] max-w-md gap-0 rounded-md p-0">
        <div className="p-5">
          <DialogTitle className="text-fg text-base font-semibold leading-snug">
            Arquivar coluna &quot;{list.name}&quot;?
          </DialogTitle>
          <p className="text-fg-muted mt-1.5 text-sm leading-relaxed">
            Esta coluna tem <strong>{cardsCount}</strong> {cardsLabel}. Escolha o que fazer com{' '}
            {cardsCount === 1 ? 'ele' : 'eles'}:
          </p>

          <div className="mt-4 flex flex-col gap-2">
            <label
              className={`border-border/70 hover:border-border-strong flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                action === 'move' && canMove ? 'border-primary bg-primary-subtle/30' : ''
              } ${!canMove ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <input
                type="radio"
                name="cards-action"
                value="move"
                checked={action === 'move'}
                onChange={() => setAction('move')}
                disabled={!canMove}
                className="accent-primary mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <p className="text-fg text-sm font-medium">
                  Mover {cardsCount === 1 ? 'o card' : `os ${cardsCount} cards`} para outra coluna
                </p>
                <p className="text-fg-muted mt-0.5 text-[12px]">
                  {canMove
                    ? 'Os cards continuam ativos no quadro, agora numa coluna diferente.'
                    : 'Sem outras colunas disponíveis no quadro.'}
                </p>
                {action === 'move' && canMove && (
                  <select
                    value={targetListId}
                    onChange={(e) => setTargetListId(e.target.value)}
                    className="border-border focus:border-primary mt-2 w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none"
                  >
                    {otherLists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.cards.length})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </label>

            <label
              className={`border-border/70 hover:border-border-strong flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                action === 'archive' ? 'border-danger bg-danger-subtle/30' : ''
              }`}
            >
              <input
                type="radio"
                name="cards-action"
                value="archive"
                checked={action === 'archive'}
                onChange={() => setAction('archive')}
                className="accent-danger mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <p className="text-fg text-sm font-medium">
                  Arquivar {cardsCount === 1 ? 'o card' : `os ${cardsCount} cards`} junto com a
                  coluna
                </p>
                <p className="text-fg-muted mt-0.5 text-[12px]">
                  Tudo some da listagem. Pode ser restaurado depois pela tela de Arquivados.
                </p>
              </div>
            </label>
          </div>
        </div>
        <div className="border-border/60 bg-bg-subtle/50 flex justify-end gap-2 border-t px-5 py-3">
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
            disabled={pending || (action === 'move' && (!canMove || !targetListId))}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 ${
              action === 'archive'
                ? 'bg-danger hover:bg-danger/90'
                : 'bg-primary hover:bg-primary-hover'
            }`}
          >
            {pending && <Loader2 size={13} className="animate-spin" />}
            {action === 'move' ? 'Mover e arquivar coluna' : 'Arquivar tudo'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
