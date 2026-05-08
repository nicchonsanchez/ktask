'use client';

// Doc 42: faixa expansivel de colunas marcadas com flag (isBacklog ou
// isFinalList). Espelho do Ummense onde colunas "ENTRADA"/"INFORMACOES"
// ficam num dock estreito a esquerda e "Finalizado" num dock estreito
// a direita. Click expande inline mostrando as colunas como normais.

import { useEffect, useState, type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ChevronLeft, ChevronRight, Inbox, CheckCircle2 } from 'lucide-react';

import type { ListWithCards } from '@/lib/queries/boards';

export type DockSide = 'left' | 'right';
export type DockKind = 'backlog' | 'final';

const DOCK_LABEL: Record<DockKind, string> = {
  backlog: 'Backlog',
  final: 'Finalizado',
};

const DOCK_ICON = {
  backlog: Inbox,
  final: CheckCircle2,
};

// Dock usa o mesmo bg-bg das ListColumn pra manter consistencia visual
// (operador, ajuste pos-tonal-layering). Tom (verde/cinza) fica reservado
// pro icone — fundo branco no light, dark segue tokens automaticamente.
const DOCK_TONE = {
  backlog: { bg: 'bg-bg', icon: 'text-fg-muted', accent: 'bg-fg-muted/15' },
  final: { bg: 'bg-bg', icon: 'text-success', accent: 'bg-success/15' },
};

/**
 * Renderiza N colunas como um dock — colapsado por padrao em uma faixa
 * estreita; click expande pra mostrar as colunas como ListColumn normais.
 *
 * Renderizar `children` recebe as colunas pra cada lista, na mesma ordem.
 * Pattern: o page.tsx mapeia `lists.map((list) => <ListColumn ...>)` e
 * passa esses elementos via `renderColumn`.
 */
export function ColumnDock({
  lists,
  kind,
  side,
  renderColumn,
}: {
  lists: ListWithCards[];
  kind: DockKind;
  side: DockSide;
  renderColumn: (list: ListWithCards) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Droppable do estado colapsado: quando um card e arrastado por cima do
  // dock, ele auto-expande pra revelar as colunas reais (que sao droppables
  // de verdade). User solta o card na coluna que quiser dentro do dock.
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `dock:${kind}`,
    data: { type: 'dock', kind },
    disabled: open,
  });
  useEffect(() => {
    if (isOver && !open) setOpen(true);
  }, [isOver, open]);

  if (lists.length === 0) return null;

  const Icon = DOCK_ICON[kind];
  const tone = DOCK_TONE[kind];
  const totalCards = lists.reduce((sum, l) => sum + (l.cards?.length ?? 0), 0);
  const Chevron =
    side === 'left' ? (open ? ChevronLeft : ChevronRight) : open ? ChevronRight : ChevronLeft;

  if (!open) {
    // Colapsado: largura fixa igual a uma coluna normal. Click ou drag-over
    // expande pra mostrar as colunas reais como ListColumn.
    return (
      <button
        type="button"
        ref={setDropRef}
        onClick={() => setOpen(true)}
        title={`${DOCK_LABEL[kind]} — ${lists.length} coluna${lists.length === 1 ? '' : 's'}, ${totalCards} card${totalCards === 1 ? '' : 's'}. Clique pra expandir.`}
        aria-label={`Expandir ${DOCK_LABEL[kind]}`}
        className={`dark:border-border/40 flex h-full shrink-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-lg py-3 shadow-sm transition-shadow hover:shadow-md dark:border ${tone.bg} ${
          kind === 'backlog' ? 'w-[100px]' : 'w-[85vw] max-w-[300px] sm:w-[280px]'
        } ${isOver ? 'ring-primary/40 ring-2' : ''}`}
      >
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-full ${tone.accent} ${tone.icon}`}
        >
          <Icon size={18} />
        </div>
        <span className="text-fg-muted text-[11px] font-semibold uppercase tracking-wide">
          {DOCK_LABEL[kind]}
        </span>
        <span className="text-fg text-base font-semibold tabular-nums">{totalCards}</span>
        {lists.length > 1 && (
          <span className="text-fg-subtle text-[10px]" aria-hidden>
            {lists.length} colunas
          </span>
        )}
      </button>
    );
  }

  // Expandido: header compacto + colunas em linha
  return (
    <div className={`flex h-full shrink-0 flex-row gap-3 rounded-lg p-2 ${tone.bg}`}>
      <button
        type="button"
        onClick={() => setOpen(false)}
        title={`Recolher ${DOCK_LABEL[kind]}`}
        aria-label={`Recolher ${DOCK_LABEL[kind]}`}
        className={`hover:bg-bg-muted text-fg-muted hover:text-fg flex h-full w-7 shrink-0 flex-col items-center justify-center gap-1 rounded transition-colors`}
      >
        <Chevron size={14} />
        <span
          className="text-[10px] font-semibold uppercase tracking-wide"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          {DOCK_LABEL[kind]}
        </span>
      </button>
      {lists.map((list) => (
        <div key={list.id}>{renderColumn(list)}</div>
      ))}
    </div>
  );
}
