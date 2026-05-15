'use client';

import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  Archive,
  Bot,
  CheckCircle2,
  GripVertical,
  Inbox,
  MoreHorizontal,
  Pencil,
  Plus,
} from 'lucide-react';

import { Button } from '@ktask/ui';
import {
  archiveList,
  boardsQueries,
  createCard,
  updateList,
  type ListWithCards,
} from '@/lib/queries/boards';
import { useConfirm } from '@/components/ui/dialogs';
import { ArchiveListDialog } from './archive-list-dialog';
import { ColumnAutomationsDialog } from './column-automations-dialog';

/** Prefixo usado nos IDs de colunas no DndContext pra não colidir com cardIds. */
export const LIST_SORT_PREFIX = 'col:';

export function ListColumn({
  list,
  otherLists,
  isAdmin,
  children,
}: {
  list: ListWithCards;
  /** Outras colunas não-arquivadas do mesmo board, pra alimentar o seletor de destino do modal de arquivar. */
  otherLists: ListWithCards[];
  /** Se true, mostra controles de admin (drag, rename, archive, automações). MEMBER vê coluna normal sem esses. */
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const sortable = useSortable({
    id: `${LIST_SORT_PREFIX}${list.id}`,
    data: { type: 'list', listId: list.id },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: list.id });
  const params = useParams<{ boardId: string }>();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(list.name);
  useEffect(() => setName(list.name), [list.name]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: boardsQueries.detail(params.boardId).queryKey });
  }

  const mutation = useMutation({
    mutationFn: (title: string) => createCard({ listId: list.id, title }),
    onSuccess: () => {
      invalidate();
      setDraft('');
    },
  });

  const renameMut = useMutation({
    mutationFn: (newName: string) => updateList(list.id, { name: newName }),
    onSuccess: invalidate,
  });

  // Doc 42: toggle Backlog (esquerda) e Finalizado (direita). Mutuamente
  // exclusivos — ativar um desativa o outro automaticamente.
  const toggleBacklogMut = useMutation({
    mutationFn: (next: boolean) =>
      updateList(list.id, { isBacklog: next, ...(next ? { isFinalList: false } : {}) }),
    onSuccess: invalidate,
  });
  const toggleFinalMut = useMutation({
    mutationFn: (next: boolean) =>
      updateList(list.id, { isFinalList: next, ...(next ? { isBacklog: false } : {}) }),
    onSuccess: invalidate,
  });

  const archiveMut = useMutation({
    mutationFn: (opts: { cardsAction?: 'archive' | 'move'; targetListId?: string } = {}) =>
      archiveList(list.id, opts),
    onSuccess: () => {
      invalidate();
      setArchiveDialogOpen(false);
    },
  });

  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [automationsOpen, setAutomationsOpen] = useState(false);

  function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === list.name) {
      setName(list.name);
      setEditingName(false);
      return;
    }
    renameMut.mutate(trimmed);
    setEditingName(false);
  }

  const {
    setNodeRef: setSortableRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = sortable;

  function setCombinedRef(node: HTMLDivElement | null) {
    setSortableRef(node);
    setDropRef(node);
  }

  return (
    <div
      ref={setCombinedRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...attributes}
      className={`bg-bg dark:border-border/40 flex h-full w-[72vw] max-w-[260px] shrink-0 flex-col rounded-lg shadow-sm sm:w-[280px] sm:max-w-none dark:border ${
        isOver ? 'ring-primary/40 ring-2' : ''
      }`}
    >
      <div className="group/header flex items-center justify-between gap-2 px-3 pb-1 pt-2.5">
        {isAdmin && (
          <button
            type="button"
            {...listeners}
            className="text-fg-muted hover:text-fg cursor-grab touch-none transition-opacity active:cursor-grabbing md:opacity-0 md:group-hover/header:opacity-100"
            aria-label="Reordenar coluna"
          >
            <GripVertical size={14} />
          </button>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {editingName ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName();
                if (e.key === 'Escape') {
                  setName(list.name);
                  setEditingName(false);
                }
              }}
              maxLength={120}
              className="bg-bg-muted focus-visible:ring-primary min-w-0 flex-1 rounded px-1.5 py-0.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2"
            />
          ) : (
            <button
              type="button"
              onDoubleClick={() => isAdmin && setEditingName(true)}
              className="min-w-0 flex-1 truncate text-left text-sm font-semibold"
              title={isAdmin ? 'Clique duas vezes para renomear' : list.name}
            >
              {list.name}
            </button>
          )}
          <span className="bg-bg-muted text-fg-muted shrink-0 rounded-full px-1.5 text-xs">
            {list.cards.length}
          </span>
        </div>
        {/* Robô = automações da coluna. Sempre visível (não é só hover).
            Abre modal com 3 tabs (Detalhes/Automações/Avançado). Engine
            ainda não está pronta — catálogo das 18 automações fica
            disabled "em breve" (ver tarefas-md/23-automacoes-coluna.md). */}
        {isAdmin && (
          <button
            type="button"
            onClick={() => setAutomationsOpen(true)}
            aria-label="Automações da coluna"
            title="Automações"
            className="text-fg-muted hover:bg-bg-muted hover:text-primary inline-flex shrink-0 items-center justify-center rounded p-1"
          >
            <Bot size={14} />
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            aria-label="Renomear coluna"
            title="Renomear"
            className="text-fg-muted hover:bg-bg-muted hover:text-fg focus-visible:ring-primary rounded p-1 transition-all focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 md:opacity-0 md:group-hover/header:opacity-100"
          >
            <Pencil size={13} />
          </button>
        )}
        {isAdmin && (
          <ListMenu
            isBacklog={list.isBacklog}
            isFinalList={list.isFinalList}
            onRename={() => setEditingName(true)}
            onToggleBacklog={() => toggleBacklogMut.mutate(!list.isBacklog)}
            onToggleFinal={() => toggleFinalMut.mutate(!list.isFinalList)}
            onArchive={async () => {
              // Coluna vazia: confirmação simples. Coluna com cards: dialog
              // dedicado pra escolher mover ou arquivar junto.
              if (list.cards.length === 0) {
                const ok = await confirm({
                  title: `Arquivar coluna "${list.name}"?`,
                  description: 'A coluna está vazia e pode ser restaurada depois.',
                  confirmLabel: 'Arquivar',
                  danger: true,
                });
                if (ok) archiveMut.mutate({});
              } else {
                setArchiveDialogOpen(true);
              }
            }}
          />
        )}
      </div>

      <div className="px-2 pt-1">
        {draft === null ? (
          <button
            type="button"
            onClick={() => setDraft('')}
            className="group/add bg-primary-subtle text-primary hover:bg-primary hover:text-primary-fg flex h-9 w-full items-center justify-center overflow-hidden rounded-md text-xs font-medium transition-colors duration-200 hover:shadow-sm"
            aria-label="Adicionar card"
          >
            <span className="flex items-center gap-1.5">
              <Plus
                size={14}
                className="transition-transform duration-200 group-hover/add:rotate-90"
              />
              <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover/add:max-w-[160px] group-hover/add:opacity-100">
                Adicionar card
              </span>
            </span>
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim().length === 0) return;
              mutation.mutate(draft.trim());
            }}
            className="flex flex-col gap-2"
          >
            <textarea
              autoFocus
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  (e.currentTarget.form as HTMLFormElement).requestSubmit();
                }
                if (e.key === 'Escape') setDraft(null);
              }}
              placeholder="Título do card"
              className="bg-bg border-border focus-visible:ring-primary w-full resize-none rounded-md border px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2"
            />
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={mutation.isPending}>
                Adicionar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </div>

      <div className="flex min-h-[60px] flex-1 flex-col gap-2.5 overflow-y-auto px-2 pb-2 pt-2">
        {list.cards.length === 0 && draft === null && (
          <div
            className={`border-border/70 text-fg-subtle flex flex-1 items-center justify-center rounded-md border border-dashed px-3 py-6 text-center text-[11px] leading-snug transition-colors ${isOver ? 'border-primary/60 bg-primary-subtle/40 text-primary' : ''}`}
          >
            {isOver ? 'Solte aqui' : 'Arraste cards pra cá ou clique em + acima'}
          </div>
        )}
        {children}
      </div>

      <ArchiveListDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        list={list}
        otherLists={otherLists}
        pending={archiveMut.isPending}
        onConfirm={(action, targetListId) =>
          archiveMut.mutate({ cardsAction: action, targetListId })
        }
      />
      <ColumnAutomationsDialog
        list={list}
        boardId={params.boardId}
        open={automationsOpen}
        onOpenChange={setAutomationsOpen}
      />
    </div>
  );
}

function ListMenu({
  onRename,
  onArchive,
  onToggleBacklog,
  onToggleFinal,
  isBacklog,
  isFinalList,
}: {
  onRename: () => void;
  onArchive: () => void;
  onToggleBacklog: () => void;
  onToggleFinal: () => void;
  isBacklog: boolean;
  isFinalList: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-fg-muted hover:bg-bg-muted hover:text-fg focus-visible:ring-primary rounded p-1 transition-all focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 aria-expanded:opacity-100 md:opacity-0 md:group-hover/header:opacity-100"
        aria-label="Opções da coluna"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div className="border-border bg-bg absolute right-0 top-full z-20 mt-1 flex w-48 flex-col rounded-md border p-1 text-sm shadow-lg">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onRename();
            }}
            className="text-fg hover:bg-bg-muted flex items-center gap-2 rounded-sm px-2 py-1.5 text-left"
          >
            <Pencil size={13} />
            Renomear
          </button>
          <div className="border-border/70 my-1 border-t" />
          {/* Doc 42: toggle Backlog (esquerda) / Finalizado (direita).
              Mutuamente exclusivos — ativar um desativa o outro. */}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onToggleBacklog();
            }}
            className="text-fg hover:bg-bg-muted flex items-center gap-2 rounded-sm px-2 py-1.5 text-left"
            title="Coloca a coluna na faixa estreita expansivel a esquerda do board"
          >
            <Inbox size={13} />
            <span className="flex-1">{isBacklog ? 'Tirar de Backlog' : 'Marcar como Backlog'}</span>
            {isBacklog && <span className="text-fg-subtle text-[10px]">ativo</span>}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onToggleFinal();
            }}
            className="text-fg hover:bg-bg-muted flex items-center gap-2 rounded-sm px-2 py-1.5 text-left"
            title="Coloca a coluna na faixa estreita expansivel a direita do board"
          >
            <CheckCircle2 size={13} />
            <span className="flex-1">
              {isFinalList ? 'Tirar de Finalizado' : 'Marcar como Finalizado'}
            </span>
            {isFinalList && <span className="text-fg-subtle text-[10px]">ativo</span>}
          </button>
          <div className="border-border/70 my-1 border-t" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onArchive();
            }}
            className="text-danger hover:bg-danger-subtle flex items-center gap-2 rounded-sm px-2 py-1.5 text-left"
          >
            <Archive size={13} />
            Arquivar coluna
          </button>
        </div>
      )}
    </div>
  );
}
