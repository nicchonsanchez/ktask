'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Settings2, Trash2, X, Layers, CalendarClock } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@ktask/ui';
import {
  managementKanbanQuery,
  createKanbanColumn,
  updateKanbanColumn,
  deleteKanbanColumn,
  addKanbanSource,
  removeKanbanSource,
  type KanbanColumn,
  type KanbanCard,
} from '@/lib/queries/management';
import { boardsQueries } from '@/lib/queries/boards';
import { useConfirm, useNotify } from '@/components/ui/dialogs';
import { UserAvatar } from '@/components/user-avatar';

/**
 * Kanban gerencial: colunas virtuais que agregam cards de listas de quadros
 * diferentes. Read-only (D1) — clicar abre o modal global do card. Card que
 * aparece em N colunas leva selo "também em" (D4). Config compartilhada.
 */
export function ManagementKanban() {
  const kanbanQ = useQuery(managementKanbanQuery());
  const [configOpen, setConfigOpen] = useState(false);

  const columns = kanbanQ.data?.columns ?? [];

  if (kanbanQ.isLoading) {
    return (
      <div className="text-fg-muted flex items-center justify-center gap-2 py-16 text-sm">
        <Loader2 size={16} className="animate-spin" /> Carregando Kanban…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setConfigOpen(true)}
          className="border-border hover:bg-bg-muted inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium"
        >
          <Settings2 size={13} /> Configurar colunas
        </button>
      </div>

      {columns.length === 0 ? (
        <EmptyState onConfigure={() => setConfigOpen(true)} />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {columns.map((col) => (
            <KanbanColumnView key={col.id} column={col} />
          ))}
        </div>
      )}

      <ConfigDialog open={configOpen} onOpenChange={setConfigOpen} columns={columns} />
    </div>
  );
}

function EmptyState({ onConfigure }: { onConfigure: () => void }) {
  return (
    <div className="border-border bg-bg-subtle/40 flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center">
      <Layers size={30} className="text-fg-muted" />
      <p className="text-sm font-medium">Nenhuma coluna ainda</p>
      <p className="text-fg-muted max-w-md text-xs">
        Monte colunas virtuais (ex: A fazer, Fazendo, Aprovação, Concluídos) e escolha quais listas
        de quais quadros aparecem em cada uma. É só leitura — não move os cards nos quadros reais.
      </p>
      <button
        type="button"
        onClick={onConfigure}
        className="bg-primary text-primary-fg hover:bg-primary-hover mt-2 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold"
      >
        <Plus size={13} /> Montar primeira coluna
      </button>
    </div>
  );
}

function KanbanColumnView({ column }: { column: KanbanColumn }) {
  return (
    <div className="bg-bg-subtle/40 border-border/60 flex w-[300px] shrink-0 flex-col rounded-lg border">
      <div className="border-border/60 flex items-center justify-between gap-2 border-b px-3 py-2">
        <h3 className="text-fg truncate text-sm font-semibold">{column.name}</h3>
        <span className="text-fg-muted bg-bg-muted shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums">
          {column.cards.length}
        </span>
      </div>
      <div className="flex max-h-[calc(100vh-22rem)] flex-col gap-2 overflow-y-auto p-2">
        {column.cards.length === 0 ? (
          <p className="text-fg-subtle px-2 py-6 text-center text-[11px]">
            {column.sources.length === 0 ? 'Sem listas configuradas.' : 'Nenhum card.'}
          </p>
        ) : (
          column.cards.map((card) => (
            <KanbanCardView key={`${column.id}-${card.id}`} card={card} columnId={column.id} />
          ))
        )}
      </div>
    </div>
  );
}

function KanbanCardView({ card, columnId }: { card: KanbanCard; columnId: string }) {
  const pathname = usePathname();
  const isOverdue =
    card.dueDate &&
    card.status !== 'COMPLETED' &&
    card.status !== 'CANCELED' &&
    new Date(card.dueDate) < new Date();
  const repeated = card.inColumnIds.length > 1;

  return (
    <Link
      href={`${pathname}?card=${card.id}`}
      className="border-border/70 bg-bg hover:border-border-strong block rounded-md border p-2.5 shadow-sm transition-colors"
      style={card.cardColor ? { borderLeftColor: card.cardColor, borderLeftWidth: 3 } : undefined}
    >
      <p className="text-fg line-clamp-2 text-[13px] font-medium leading-snug">{card.title}</p>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {/* Chip do quadro de origem — essencial num kanban cross-board. */}
        <span
          className="inline-flex max-w-[140px] items-center gap-1 truncate rounded-full px-1.5 py-0.5 text-[10px] font-medium"
          style={{
            backgroundColor: card.board.color ? `${card.board.color}22` : undefined,
            color: card.board.color ?? undefined,
          }}
        >
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: card.board.color ?? 'var(--color-fg-muted)' }}
          />
          {card.board.name}
        </span>
        {card.shortCode && (
          <span className="text-fg-subtle font-mono text-[10px]">#{card.shortCode}</span>
        )}
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {card.lead && (
            <UserAvatar
              name={card.lead.name}
              userId={card.lead.id}
              avatarUrl={card.lead.avatarUrl}
              size="xs"
            />
          )}
          {isOverdue && (
            <span className="text-danger inline-flex items-center gap-0.5 text-[10px] font-medium">
              <CalendarClock size={10} /> atrasado
            </span>
          )}
        </div>
        {repeated && (
          <span
            className="bg-warning-subtle text-warning rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
            title={`Aparece em ${card.inColumnIds.length} colunas deste Kanban`}
          >
            +{card.inColumnIds.length - 1} coluna{card.inColumnIds.length - 1 > 1 ? 's' : ''}
          </span>
        )}
      </div>
      {/* columnId reservado pra futura lógica de origem; evita warning */}
      <span hidden>{columnId}</span>
    </Link>
  );
}

// ============================================================
// Dialog de configuração das colunas + fontes
// ============================================================

function ConfigDialog({
  open,
  onOpenChange,
  columns,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  columns: KanbanColumn[];
}) {
  const queryClient = useQueryClient();
  const notify = useNotify();
  const [newColName, setNewColName] = useState('');

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['management', 'kanban'] });
  }

  const createMut = useMutation({
    mutationFn: (name: string) => createKanbanColumn(name),
    onSuccess: () => {
      setNewColName('');
      invalidate();
    },
    onError: () => notify.error('Falha ao criar coluna.'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="flex max-h-[85vh] max-w-2xl flex-col gap-0 p-0">
        <header className="border-border/60 flex items-center justify-between border-b px-5 py-4">
          <DialogTitle className="text-fg text-[15px] font-semibold">
            Configurar colunas do Kanban
          </DialogTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-fg-muted hover:bg-bg-muted hover:text-fg rounded-full p-1.5"
            aria-label="Fechar"
          >
            <X size={15} />
          </button>
        </header>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
          {columns.map((col) => (
            <ColumnConfig key={col.id} column={col} onChanged={invalidate} />
          ))}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newColName.trim()) createMut.mutate(newColName.trim());
            }}
            className="border-border/60 flex items-center gap-2 rounded-md border border-dashed p-2"
          >
            <input
              type="text"
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              placeholder="Nome da nova coluna (ex: A fazer)"
              maxLength={60}
              className="border-border focus:border-primary flex-1 rounded-md border px-2 py-1.5 text-sm focus:outline-none"
            />
            <button
              type="submit"
              disabled={!newColName.trim() || createMut.isPending}
              className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              {createMut.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Plus size={12} />
              )}
              Adicionar
            </button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ColumnConfig({ column, onChanged }: { column: KanbanColumn; onChanged: () => void }) {
  const notify = useNotify();
  const confirm = useConfirm();
  const [name, setName] = useState(column.name);

  const renameMut = useMutation({
    mutationFn: () => updateKanbanColumn(column.id, { name: name.trim() }),
    onSuccess: onChanged,
    onError: () => notify.error('Falha ao renomear.'),
  });
  const deleteMut = useMutation({
    mutationFn: () => deleteKanbanColumn(column.id),
    onSuccess: onChanged,
    onError: () => notify.error('Falha ao remover coluna.'),
  });
  const removeSourceMut = useMutation({
    mutationFn: (sourceId: string) => removeKanbanSource(sourceId),
    onSuccess: onChanged,
    onError: () => notify.error('Falha ao remover fonte.'),
  });

  async function handleDelete() {
    const ok = await confirm({
      title: `Remover a coluna "${column.name}"?`,
      description:
        'As fontes configuradas serão removidas. Os cards e quadros reais não são afetados.',
      confirmLabel: 'Remover',
      danger: true,
    });
    if (ok) deleteMut.mutate();
  }

  return (
    <div className="border-border rounded-md border p-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== column.name && renameMut.mutate()}
          maxLength={60}
          className="border-border focus:border-primary flex-1 rounded-md border px-2 py-1 text-sm font-medium focus:outline-none"
        />
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleteMut.isPending}
          className="text-fg-muted hover:text-danger rounded p-1.5"
          aria-label="Remover coluna"
          title="Remover coluna"
        >
          {deleteMut.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Trash2 size={14} />
          )}
        </button>
      </div>

      {/* Fontes (board + lista) */}
      <div className="mt-2 flex flex-col gap-1">
        {column.sources.map((s) => (
          <div
            key={s.id}
            className="bg-bg-muted/50 flex items-center justify-between gap-2 rounded px-2 py-1 text-[11px]"
          >
            <span className="truncate">
              <span className="font-medium">{s.boardName}</span>
              <span className="text-fg-muted"> → {s.listName}</span>
            </span>
            <button
              type="button"
              onClick={() => removeSourceMut.mutate(s.id)}
              className="text-fg-muted hover:text-danger shrink-0 rounded p-0.5"
              aria-label="Remover fonte"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <SourceAdder columnId={column.id} onAdded={onChanged} />
      </div>
    </div>
  );
}

function SourceAdder({ columnId, onAdded }: { columnId: string; onAdded: () => void }) {
  const notify = useNotify();
  const [boardId, setBoardId] = useState('');
  const boardsQ = useQuery(boardsQueries.all({ includeArchived: false }));
  const boardDetailQ = useQuery({ ...boardsQueries.detail(boardId), enabled: !!boardId });

  const addMut = useMutation({
    mutationFn: (listId: string) => addKanbanSource(columnId, { boardId, listId }),
    onSuccess: () => {
      onAdded();
    },
    onError: () => notify.error('Falha ao adicionar fonte.'),
  });

  const lists = (boardDetailQ.data?.lists ?? []).filter((l) => !l.isArchived);

  return (
    <div className="mt-1 flex flex-col gap-1.5 sm:flex-row">
      <select
        value={boardId}
        onChange={(e) => setBoardId(e.target.value)}
        className="border-border focus:border-primary rounded-md border px-2 py-1.5 text-[12px] focus:outline-none sm:flex-1"
      >
        <option value="">Escolher quadro…</option>
        {(boardsQ.data ?? []).map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <select
        value=""
        disabled={!boardId || boardDetailQ.isLoading || addMut.isPending}
        onChange={(e) => e.target.value && addMut.mutate(e.target.value)}
        className="border-border focus:border-primary rounded-md border px-2 py-1.5 text-[12px] focus:outline-none disabled:opacity-50 sm:flex-1"
      >
        <option value="">{boardDetailQ.isLoading ? 'Carregando…' : 'Adicionar lista…'}</option>
        {lists.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  );
}
