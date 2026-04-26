'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Calendar, Layers, Loader2, RotateCcw, X } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@ktask/ui';
import {
  boardArchivedQuery,
  boardsQueries,
  restoreCard,
  restoreList,
  type ArchivedCard,
  type ArchivedList,
} from '@/lib/queries/boards';
import { useNotify } from '@/components/ui/dialogs';

/**
 * Drawer/diálogo "Arquivados" — lista cards e colunas arquivados de um
 * board com ação de restaurar. Acessível pelo menu do header do board.
 *
 * Decisões:
 *   - Tabs: Cards · Colunas (cards costuma ser o uso mais comum)
 *   - Restaurar é uma ação imediata (sem confirm) — é reversível, não destrói
 *   - Dialog grande (max-w-2xl) — não é modal pequeno, é uma "tela"
 */
export function ArchivedDrawer({
  boardId,
  open,
  onOpenChange,
}: {
  boardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState<'cards' | 'lists'>('cards');
  const queryClient = useQueryClient();
  const notify = useNotify();

  const archivedQuery = useQuery({
    ...boardArchivedQuery(boardId),
    enabled: open,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: boardArchivedQuery(boardId).queryKey });
    queryClient.invalidateQueries({ queryKey: boardsQueries.detail(boardId).queryKey });
  }

  const restoreCardMut = useMutation({
    mutationFn: (cardId: string) => restoreCard(cardId),
    onSuccess: () => {
      invalidate();
      notify.success('Card restaurado.');
    },
    onError: () => notify.error('Falha ao restaurar card.'),
  });

  const restoreListMut = useMutation({
    mutationFn: (listId: string) => restoreList(listId),
    onSuccess: () => {
      invalidate();
      notify.success('Coluna restaurada.');
    },
    onError: () => notify.error('Falha ao restaurar coluna.'),
  });

  const cards = archivedQuery.data?.cards ?? [];
  const lists = archivedQuery.data?.lists ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="flex h-[80vh] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-md p-0"
      >
        <header className="border-border/60 flex shrink-0 items-center justify-between border-b px-5 py-3">
          <div className="flex items-center gap-2">
            <Archive size={16} className="text-fg-muted" />
            <DialogTitle className="text-fg text-sm font-semibold">Arquivados</DialogTitle>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-fg-muted hover:bg-bg-muted hover:text-fg rounded p-1"
            aria-label="Fechar"
          >
            <X size={14} />
          </button>
        </header>

        <nav role="tablist" className="border-border/60 flex shrink-0 gap-1 border-b px-3">
          <TabButton
            active={tab === 'cards'}
            count={cards.length}
            onClick={() => setTab('cards')}
            label="Cards"
          />
          <TabButton
            active={tab === 'lists'}
            count={lists.length}
            onClick={() => setTab('lists')}
            label="Colunas"
          />
        </nav>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {archivedQuery.isLoading && (
            <div className="text-fg-muted flex items-center justify-center gap-2 py-12 text-sm">
              <Loader2 size={14} className="animate-spin" />
              Carregando…
            </div>
          )}

          {!archivedQuery.isLoading && tab === 'cards' && (
            <CardsList
              cards={cards}
              onRestore={(id) => restoreCardMut.mutate(id)}
              pendingId={
                restoreCardMut.isPending ? (restoreCardMut.variables as string) : undefined
              }
            />
          )}

          {!archivedQuery.isLoading && tab === 'lists' && (
            <ListsList
              lists={lists}
              onRestore={(id) => restoreListMut.mutate(id)}
              pendingId={
                restoreListMut.isPending ? (restoreListMut.variables as string) : undefined
              }
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${
        active ? 'text-primary' : 'text-fg-muted hover:text-fg'
      }`}
    >
      {label}
      <span className={`text-[11px] tabular-nums ${active ? 'text-primary' : 'text-fg-subtle'}`}>
        {count}
      </span>
      {active && (
        <span aria-hidden className="bg-primary absolute inset-x-2 -bottom-px h-0.5 rounded-full" />
      )}
    </button>
  );
}

function CardsList({
  cards,
  onRestore,
  pendingId,
}: {
  cards: ArchivedCard[];
  onRestore: (id: string) => void;
  pendingId: string | undefined;
}) {
  if (cards.length === 0) {
    return (
      <p className="text-fg-muted px-5 py-12 text-center text-sm">
        Nenhum card arquivado neste quadro.
      </p>
    );
  }
  return (
    <ul className="divide-border/40 flex flex-col divide-y">
      {cards.map((c) => (
        <li
          key={c.id}
          className="hover:bg-bg-subtle/50 flex items-start gap-3 px-5 py-3 transition-colors"
        >
          <div className="min-w-0 flex-1">
            <p className="text-fg truncate text-sm font-medium">{c.title}</p>
            <div className="text-fg-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              <span className="inline-flex items-center gap-1">
                <Layers size={11} />
                {c.list.name}
                {c.list.isArchived && <span className="text-fg-subtle">(coluna arquivada)</span>}
              </span>
              {c.dueDate && (
                <span className="inline-flex items-center gap-1">
                  <Calendar size={11} />
                  {new Date(c.dueDate).toLocaleDateString('pt-BR')}
                </span>
              )}
              {c.labels.length > 0 && (
                <span className="flex items-center gap-1">
                  {c.labels.slice(0, 3).map((cl) => (
                    <span
                      key={cl.label.id}
                      className="size-2 rounded-full"
                      style={{ backgroundColor: cl.label.color }}
                      title={cl.label.name}
                    />
                  ))}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRestore(c.id)}
            disabled={pendingId === c.id}
            className="text-primary hover:text-primary-hover hover:bg-primary-subtle inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium disabled:opacity-60"
          >
            {pendingId === c.id ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RotateCcw size={12} />
            )}
            Restaurar
          </button>
        </li>
      ))}
    </ul>
  );
}

function ListsList({
  lists,
  onRestore,
  pendingId,
}: {
  lists: ArchivedList[];
  onRestore: (id: string) => void;
  pendingId: string | undefined;
}) {
  if (lists.length === 0) {
    return (
      <p className="text-fg-muted px-5 py-12 text-center text-sm">
        Nenhuma coluna arquivada neste quadro.
      </p>
    );
  }
  return (
    <ul className="divide-border/40 flex flex-col divide-y">
      {lists.map((l) => (
        <li
          key={l.id}
          className="hover:bg-bg-subtle/50 flex items-start gap-3 px-5 py-3 transition-colors"
        >
          <div className="min-w-0 flex-1">
            <p className="text-fg truncate text-sm font-medium">{l.name}</p>
            <p className="text-fg-muted mt-0.5 text-[11px]">
              {l._count.cards} {l._count.cards === 1 ? 'card arquivado' : 'cards arquivados'} ·{' '}
              {new Date(l.updatedAt).toLocaleDateString('pt-BR')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRestore(l.id)}
            disabled={pendingId === l.id}
            className="text-primary hover:text-primary-hover hover:bg-primary-subtle inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium disabled:opacity-60"
          >
            {pendingId === l.id ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RotateCcw size={12} />
            )}
            Restaurar
          </button>
        </li>
      ))}
    </ul>
  );
}
