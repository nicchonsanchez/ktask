'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Loader2, X } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@ktask/ui';
import { boardsQueries, type BoardListItem } from '@/lib/queries/boards';
import {
  cardFamilyQuery,
  cardsQueries,
  moveCardInFlow,
  setCardParent,
  type CardDetail,
} from '@/lib/queries/cards';
import { ApiError } from '@/lib/api-client';

/**
 * Dialog "Tornar filho de..." — vincula o card atual como filho de outro
 * card existente. Backend já valida ciclos e self-parent.
 *
 * Fluxo: selecionar fluxo → coluna → card destino → confirmar.
 */
export function SetParentCardDialog({
  card,
  open,
  onOpenChange,
}: {
  card: CardDetail;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();

  // Pre-fill com a posicao atual do card — geralmente o pai estara
  // no mesmo fluxo/coluna, entao economiza cliques. User pode trocar.
  // Board nao vem em CardDetail (so boardId), entao buscamos da lista
  // de boards quando o dialog abre.
  const boardsQ = useQuery({ ...boardsQueries.all() });
  const initialBoard = useMemo<BoardListItem | null>(() => {
    const found = (boardsQ.data ?? []).find((b) => b.id === card.boardId);
    return found ?? null;
  }, [boardsQ.data, card.boardId]);
  const initialList = card.list ? { id: card.list.id, name: card.list.name } : null;

  const [boardSel, setBoardSel] = useState<BoardListItem | null>(null);
  const [listSel, setListSel] = useState<{ id: string; name: string } | null>(initialList);
  const [cardSel, setCardSel] = useState<{ id: string; title: string } | null>(null);

  // Quando boardsQ resolve depois do dialog ja aberto, aplicamos o
  // initialBoard. Evita ficar com boardSel=null no primeiro render.
  useEffect(() => {
    if (open && initialBoard && !boardSel) {
      setBoardSel(initialBoard);
    }
  }, [open, initialBoard, boardSel]);
  // Toggle opcional: depois de vincular, mover este card pra mesma
  // coluna do pai. Util quando o filho "segue" o pai no kanban.
  const [moveToParent, setMoveToParent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      // initialBoard pode estar null quando o boardsQ ainda nao resolveu —
      // o useEffect de cima aplica quando chegar. listSel pre-fill da
      // CardDetail (sem depender de boardsQ).
      setBoardSel(initialBoard);
      setListSel(initialList);
      setCardSel(null);
      setMoveToParent(false);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, card.id]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!cardSel) throw new Error('Selecione um card pai.');
      await setCardParent(card.id, cardSel.id);
      // Move opcional: se o user quer que o filho siga o pai, fazemos
      // moveInFlow no board+list onde o pai esta. Best-effort — se der
      // erro (ex: card nao tem presence no board do pai), nao desfaz o
      // setParent, so reporta.
      if (moveToParent && boardSel && listSel) {
        try {
          await moveCardInFlow(card.id, boardSel.id, { toListId: listSel.id });
        } catch (err) {
          throw new Error(
            err instanceof ApiError
              ? `Vinculado ao pai, mas não conseguiu mover: ${err.message}`
              : 'Vinculado ao pai, mas não conseguiu mover.',
          );
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cardFamilyQuery(card.id).queryKey });
      queryClient.invalidateQueries({ queryKey: cardsQueries.detail(card.id).queryKey });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      onOpenChange(false);
    },
    onError: (err) => {
      setError(
        err instanceof ApiError
          ? err.message
          : (err as Error)?.message || 'Erro ao vincular card pai.',
      );
    },
  });

  const canSubmit = !!cardSel && !mut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="max-h-[calc(100vh-2rem)] w-[min(520px,calc(100vw-1rem))] max-w-[520px] gap-0 overflow-y-auto p-0"
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
          <DialogTitle className="text-base font-semibold">Tornar filho de…</DialogTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-fg-muted hover:bg-bg-muted rounded p-1"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 pb-5">
          <p className="text-fg-muted text-xs">
            Selecione o card que vai virar pai deste. Funciona em qualquer fluxo da organização —
            não precisa ser o mesmo fluxo do card atual. Já vem pré-selecionado o fluxo e a coluna
            onde este card está agora.
          </p>

          <div className="flex flex-col gap-2">
            <label className="text-fg text-xs font-medium">1. Fluxo</label>
            <BoardCombobox
              value={boardSel}
              onChange={(b) => {
                setBoardSel(b);
                setListSel(null);
                setCardSel(null);
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className={`text-xs font-medium ${boardSel ? 'text-fg' : 'text-fg-subtle'}`}>
              2. Coluna
            </label>
            <ListCombobox
              boardId={boardSel?.id ?? null}
              value={listSel}
              onChange={(l) => {
                setListSel(l);
                setCardSel(null);
              }}
              disabled={!boardSel}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              className={`text-xs font-medium ${
                boardSel && listSel ? 'text-fg' : 'text-fg-subtle'
              }`}
            >
              3. Card pai
            </label>
            <CardCombobox
              boardId={boardSel?.id ?? null}
              listId={listSel?.id ?? null}
              excludeCardId={card.id}
              value={cardSel}
              onChange={setCardSel}
              disabled={!boardSel || !listSel}
            />
          </div>

          {/* Toggle opcional: mover este card pra mesma posicao do pai. */}
          <label
            className={`border-border/60 flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-xs ${
              boardSel && listSel ? '' : 'opacity-60'
            }`}
          >
            <input
              type="checkbox"
              checked={moveToParent}
              onChange={(e) => setMoveToParent(e.target.checked)}
              disabled={!boardSel || !listSel}
              className="mt-0.5 size-3.5 shrink-0"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-fg font-medium">Mover este card pra mesma coluna do pai</span>
              <span className="text-fg-muted leading-relaxed">
                Quando marcado, depois de vincular, este card também é movido pra{' '}
                <strong>
                  {boardSel?.name ?? '…'}
                  {listSel ? ` → ${listSel.name}` : ''}
                </strong>
                . Útil quando o filho deve “seguir” o pai no kanban.
              </span>
            </span>
          </label>

          {error && (
            <p className="bg-danger-subtle text-danger rounded-md px-3 py-2 text-xs">{error}</p>
          )}

          <div className="border-border/70 mt-1 flex items-center justify-end gap-3 border-t pt-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-fg-muted hover:text-fg text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => mut.mutate()}
              disabled={!canSubmit}
              className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mut.isPending && <Loader2 size={14} className="animate-spin" />}
              Vincular como filho
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BoardCombobox({
  value,
  onChange,
}: {
  value: BoardListItem | null;
  onChange: (b: BoardListItem | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boardsQ = useQuery({ ...boardsQueries.all() });

  useEffect(() => {
    function click(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', click);
    return () => document.removeEventListener('mousedown', click);
  }, [open]);

  const filtered = useMemo(() => {
    const items = (boardsQ.data ?? []).filter((b) => !b.isArchived);
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((b) => b.name.toLowerCase().includes(q));
  }, [boardsQ.data, query]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setQuery('');
        }}
        className="border-border bg-bg hover:border-border-strong flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm"
      >
        <span className={value ? 'text-fg' : 'text-fg-muted'}>
          {value ? value.name : 'Selecione um fluxo'}
        </span>
        <ChevronDown size={14} className="text-fg-muted" />
      </button>
      {open && (
        <div className="border-border bg-bg absolute left-0 right-0 top-full z-50 mt-1 flex max-h-72 flex-col overflow-hidden rounded-md border shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Digite o nome do fluxo..."
            className="border-border/70 bg-bg border-b px-3 py-2 text-sm focus:outline-none"
          />
          <div className="overflow-y-auto py-1">
            {boardsQ.isLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={14} className="text-fg-muted animate-spin" />
              </div>
            )}
            {!boardsQ.isLoading && filtered.length === 0 && (
              <p className="text-fg-muted px-3 py-3 text-center text-xs">
                {query ? 'Nenhum fluxo encontrado.' : 'Sem fluxos disponíveis.'}
              </p>
            )}
            {filtered.map((b) => {
              const isSelected = value?.id === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    onChange(b);
                    setOpen(false);
                  }}
                  className={`hover:bg-bg-muted flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                    isSelected ? 'bg-primary-subtle text-primary' : ''
                  }`}
                >
                  <span className="flex-1 truncate">{b.name}</span>
                  {isSelected && <Check size={13} className="shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ListCombobox({
  boardId,
  value,
  onChange,
  disabled = false,
}: {
  boardId: string | null;
  value: { id: string; name: string } | null;
  onChange: (l: { id: string; name: string } | null) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const boardQ = useQuery({
    ...boardsQueries.detail(boardId ?? ''),
    enabled: Boolean(boardId),
  });

  useEffect(() => {
    function click(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', click);
    return () => document.removeEventListener('mousedown', click);
  }, [open]);

  const lists = boardQ.data?.lists ?? [];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className="border-border bg-bg hover:border-border-strong disabled:hover:border-border flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={value ? 'text-fg' : 'text-fg-muted'}>
          {value ? value.name : disabled ? 'Escolha um fluxo primeiro' : 'Selecione a coluna'}
        </span>
        <ChevronDown size={14} className="text-fg-muted" />
      </button>
      {open && (
        <div className="border-border bg-bg absolute left-0 right-0 top-full z-50 mt-1 flex max-h-64 flex-col overflow-y-auto rounded-md border py-1 shadow-lg">
          {boardQ.isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 size={14} className="text-fg-muted animate-spin" />
            </div>
          )}
          {!boardQ.isLoading && lists.length === 0 && (
            <p className="text-fg-muted px-3 py-3 text-center text-xs">
              Esse fluxo não tem colunas.
            </p>
          )}
          {lists.map((l) => {
            const isSelected = value?.id === l.id;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  onChange({ id: l.id, name: l.name });
                  setOpen(false);
                }}
                className={`hover:bg-bg-muted flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                  isSelected ? 'bg-primary-subtle text-primary' : ''
                }`}
              >
                <span className="flex-1 truncate">{l.name}</span>
                {isSelected && <Check size={13} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CardCombobox({
  boardId,
  listId,
  excludeCardId,
  value,
  onChange,
  disabled = false,
}: {
  boardId: string | null;
  listId: string | null;
  excludeCardId: string;
  value: { id: string; title: string } | null;
  onChange: (c: { id: string; title: string } | null) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boardQ = useQuery({
    ...boardsQueries.detail(boardId ?? ''),
    enabled: Boolean(boardId),
  });

  useEffect(() => {
    function click(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', click);
    return () => document.removeEventListener('mousedown', click);
  }, [open]);

  const cards = useMemo(() => {
    if (!listId) return [];
    const list = boardQ.data?.lists.find((l) => l.id === listId);
    const all = (list?.cards ?? []).filter((c) => c.id !== excludeCardId);
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((c) => c.title.toLowerCase().includes(q));
  }, [boardQ.data, listId, excludeCardId, query]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
          setQuery('');
        }}
        disabled={disabled}
        className="border-border bg-bg hover:border-border-strong disabled:hover:border-border flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={value ? 'text-fg' : 'text-fg-muted'}>
          {value
            ? value.title
            : disabled
              ? 'Escolha o fluxo e a coluna primeiro'
              : 'Selecione o card pai'}
        </span>
        <ChevronDown size={14} className="text-fg-muted" />
      </button>
      {open && (
        <div className="border-border bg-bg absolute left-0 right-0 top-full z-50 mt-1 flex max-h-72 flex-col overflow-hidden rounded-md border shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Digite o título do card..."
            className="border-border/70 bg-bg border-b px-3 py-2 text-sm focus:outline-none"
          />
          <div className="overflow-y-auto py-1">
            {boardQ.isLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={14} className="text-fg-muted animate-spin" />
              </div>
            )}
            {!boardQ.isLoading && cards.length === 0 && (
              <p className="text-fg-muted px-3 py-3 text-center text-xs">
                {query ? 'Nenhum card encontrado.' : 'Essa coluna não tem cards.'}
              </p>
            )}
            {cards.map((c) => {
              const isSelected = value?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onChange({ id: c.id, title: c.title });
                    setOpen(false);
                  }}
                  className={`hover:bg-bg-muted flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                    isSelected ? 'bg-primary-subtle text-primary' : ''
                  }`}
                >
                  <span className="flex-1 truncate">{c.title}</span>
                  {isSelected && <Check size={13} className="shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
