'use client';

// Doc 42: faixa expansivel de colunas marcadas com flag (isBacklog ou
// isFinalList). Espelho do Ummense onde colunas "ENTRADA"/"INFORMACOES"
// ficam num dock estreito a esquerda e "Finalizado" num dock estreito
// a direita. Click expande inline mostrando as colunas como normais.

import { useState, type ReactNode } from 'react';
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

const DOCK_TONE = {
  backlog: { bg: 'bg-bg-muted/40', icon: 'text-fg-muted', accent: 'bg-fg-muted/15' },
  final: { bg: 'bg-success-subtle/30', icon: 'text-success', accent: 'bg-success/15' },
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
  if (lists.length === 0) return null;

  const Icon = DOCK_ICON[kind];
  const tone = DOCK_TONE[kind];
  const totalCards = lists.reduce((sum, l) => sum + (l.cards?.length ?? 0), 0);
  const Chevron =
    side === 'left' ? (open ? ChevronLeft : ChevronRight) : open ? ChevronRight : ChevronLeft;

  if (!open) {
    // Colapsado: faixa estreita ~56px com icone + label vertical + contador
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`${DOCK_LABEL[kind]} — ${lists.length} coluna${lists.length === 1 ? '' : 's'}, ${totalCards} card${totalCards === 1 ? '' : 's'}. Clique pra expandir.`}
        aria-label={`Expandir ${DOCK_LABEL[kind]}`}
        className={`group/dock border-border/60 flex h-full w-14 shrink-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border py-3 shadow-sm transition-all duration-200 hover:w-32 hover:shadow-md ${tone.bg}`}
      >
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-full ${tone.accent} ${tone.icon}`}
        >
          <Icon size={18} />
        </div>
        <span
          className={`text-fg-muted hidden text-[11px] font-semibold uppercase tracking-wide group-hover/dock:block`}
        >
          {DOCK_LABEL[kind]}
        </span>
        <span className={`text-fg text-xs font-semibold tabular-nums`}>{totalCards}</span>
        <span className={`text-fg-subtle hidden text-[10px] group-hover/dock:block`} aria-hidden>
          {lists.length} coluna{lists.length === 1 ? '' : 's'}
        </span>
      </button>
    );
  }

  // Expandido: header compacto + colunas em linha
  return (
    <div
      className={`flex h-full shrink-0 flex-row gap-3 rounded-lg border border-dashed p-2 ${tone.bg} border-fg-muted/30`}
    >
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
