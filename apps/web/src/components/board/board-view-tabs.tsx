'use client';

import { LayoutGrid, Table2 } from 'lucide-react';

export type BoardView = 'quadro' | 'tabela';

/**
 * Segmented control no header do board pra alternar entre visualizacao
 * Kanban (default) e Tabela. Estado mora na URL (?view=tabela) — assim
 * deep-links funcionam e voltar do browser preserva o modo.
 */
export function BoardViewTabs({
  view,
  onChange,
}: {
  view: BoardView;
  onChange: (next: BoardView) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Visualizacao do fluxo"
      className="bg-bg-muted/60 inline-flex shrink-0 items-center rounded-md p-0.5"
    >
      <ViewTab
        active={view === 'quadro'}
        onClick={() => onChange('quadro')}
        icon={<LayoutGrid size={13} />}
        label="Quadro"
      />
      <ViewTab
        active={view === 'tabela'}
        onClick={() => onChange('tabela')}
        icon={<Table2 size={13} />}
        label="Tabela"
      />
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[12px] font-medium transition-colors ${
        active ? 'bg-bg text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
