'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@ktask/ui';
import { boardsQueries, type BoardListItem } from '@/lib/queries/boards';
import { cardFamilyQuery, cardsQueries, setCardParent, type CardDetail } from '@/lib/queries/cards';
import { searchGlobal } from '@/lib/queries/search';
import { ApiError } from '@/lib/api-client';

/**
 * Dialog "Tornar filho de..." — vincula o card atual como filho de outro
 * card existente. Backend ja valida ciclos e self-parent.
 *
 * UX:
 *   - Filtro de Fluxo (opcional): limita a busca de cards a 1 quadro.
 *   - Input de busca: autocomplete por nome via /api/v1/search global,
 *     filtrado por boardId quando o fluxo esta selecionado.
 *   - Sem coluna: o card pai pode estar em qualquer coluna do fluxo —
 *     listar por coluna so atrapalha o operador.
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

  const [boardSel, setBoardSel] = useState<BoardListItem | null>(null);
  const [cardSel, setCardSel] = useState<{ id: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setBoardSel(null);
      setCardSel(null);
      setError(null);
    }
  }, [open, card.id]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!cardSel) throw new Error('Selecione um card pai.');
      await setCardParent(card.id, cardSel.id);
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
          <p className="text-fg-muted text-xs leading-relaxed">
            Escolha o card existente que vai virar pai deste. Filtre por fluxo se quiser restringir;
            depois digite o nome do card pra buscar.
          </p>

          <div className="flex flex-col gap-2">
            <label className="text-fg text-xs font-medium">
              Fluxo <span className="text-fg-subtle font-normal">(opcional)</span>
            </label>
            <BoardCombobox
              value={boardSel}
              onChange={(b) => {
                setBoardSel(b);
                setCardSel(null);
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-fg text-xs font-medium">Card pai</label>
            <CardSearchPicker
              boardFilter={boardSel}
              excludeCardId={card.id}
              value={cardSel}
              onChange={setCardSel}
            />
          </div>

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
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setQuery('');
          }}
          className="border-border bg-bg hover:border-border-strong flex flex-1 items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm"
        >
          <span className={value ? 'text-fg' : 'text-fg-muted'}>
            {value ? value.name : 'Todos os fluxos'}
          </span>
          <ChevronDown size={14} className="text-fg-muted" />
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="border-border text-fg-muted hover:text-fg hover:bg-bg-muted rounded-md border px-2 py-2"
            title="Limpar filtro de fluxo"
            aria-label="Limpar filtro de fluxo"
          >
            <X size={13} />
          </button>
        )}
      </div>
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

/**
 * Picker de card pai via busca textual. Usa /api/v1/search global,
 * filtrando client-side pelo boardId quando o filtro de fluxo esta
 * setado. Debounce de 250ms pra nao floodar o backend a cada tecla.
 */
function CardSearchPicker({
  boardFilter,
  excludeCardId,
  value,
  onChange,
}: {
  boardFilter: BoardListItem | null;
  excludeCardId: string;
  value: { id: string; title: string } | null;
  onChange: (c: { id: string; title: string } | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) return;
    const id = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query, focused]);

  useEffect(() => {
    function click(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setFocused(false);
    }
    if (focused) document.addEventListener('mousedown', click);
    return () => document.removeEventListener('mousedown', click);
  }, [focused]);

  const searchQ = useQuery({
    queryKey: ['search', 'cards-for-parent', debounced],
    queryFn: () => searchGlobal(debounced),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });

  const results = useMemo(() => {
    const all = searchQ.data?.cards ?? [];
    return all
      .filter((c) => c.id !== excludeCardId)
      .filter((c) => (boardFilter ? c.boardId === boardFilter.id : true))
      .slice(0, 30);
  }, [searchQ.data, excludeCardId, boardFilter]);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search
          size={14}
          className="text-fg-muted pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
        />
        <input
          type="text"
          value={value && !focused ? value.title : query}
          onFocus={() => {
            setFocused(true);
            if (value) setQuery(value.title);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            if (value) onChange(null);
          }}
          placeholder={
            boardFilter ? `Buscar cards em "${boardFilter.name}"…` : 'Buscar cards por nome…'
          }
          className="border-border bg-bg focus-visible:ring-primary w-full rounded-md border py-2 pl-8 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2"
        />
        {(query || value) && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              onChange(null);
            }}
            className="text-fg-muted hover:text-fg absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5"
            aria-label="Limpar"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {focused && (
        <div className="border-border bg-bg absolute left-0 right-0 top-full z-50 mt-1 flex max-h-72 flex-col overflow-hidden rounded-md border shadow-lg">
          {debounced.length < 2 ? (
            <p className="text-fg-muted px-3 py-3 text-center text-xs">
              Digite ao menos 2 caracteres pra buscar.
            </p>
          ) : searchQ.isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 size={14} className="text-fg-muted animate-spin" />
            </div>
          ) : results.length === 0 ? (
            <p className="text-fg-muted px-3 py-3 text-center text-xs">
              {boardFilter
                ? `Nenhum card encontrado em "${boardFilter.name}".`
                : 'Nenhum card encontrado.'}
            </p>
          ) : (
            <div className="overflow-y-auto py-1">
              {results.map((c) => {
                const isSelected = value?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onChange({ id: c.id, title: c.title });
                      setQuery(c.title);
                      setFocused(false);
                    }}
                    className={`hover:bg-bg-muted flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm ${
                      isSelected ? 'bg-primary-subtle text-primary' : ''
                    }`}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{c.title}</span>
                      <span className="text-fg-subtle text-[10px]">
                        {c.boardName} · {c.listName}
                        {c.isCompleted && ' · concluído'}
                      </span>
                    </span>
                    {isSelected && <Check size={13} className="text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
