'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Loader2, X } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@ktask/ui';
import { boardsQueries, type BoardListItem } from '@/lib/queries/boards';
import {
  cardsQueries,
  duplicateCard,
  type CardDetail,
  type DuplicateCardOptions,
} from '@/lib/queries/cards';
import { ApiError } from '@/lib/api-client';

const TOGGLES: Array<{
  key: keyof DuplicateCardOptions;
  label: string;
  defaultOn: boolean;
}> = [
  { key: 'copyLead', label: 'Líder', defaultOn: false },
  { key: 'copyTeam', label: 'Equipe', defaultOn: false },
  { key: 'copyDescription', label: 'Descrição', defaultOn: false },
  { key: 'copyTags', label: 'Tags', defaultOn: false },
  { key: 'copyDueDate', label: 'Prazo', defaultOn: false },
  { key: 'copyChecklists', label: 'Tarefas do card', defaultOn: false },
  { key: 'copyAttachments', label: 'Anexos', defaultOn: false },
  { key: 'copyParent', label: 'Vínculo com card pai', defaultOn: false },
];

export function DuplicateCardDialog({
  card,
  open,
  onOpenChange,
}: {
  card: CardDetail;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [opts, setOpts] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(TOGGLES.map((t) => [t.key, t.defaultOn])),
  );
  const [count, setCount] = useState(1);
  const [boardSel, setBoardSel] = useState<BoardListItem | null>(null);
  const [listSel, setListSel] = useState<{ id: string; name: string } | null>(null);
  // Rascunho de descricao pro card duplicado — so eh enviado quando o
  // check "Descrição" (copyDescription) esta desmarcado. Se marcado, o
  // textarea some e o valor eh ignorado no submit.
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset ao reabrir
  useEffect(() => {
    if (open) {
      setOpts(Object.fromEntries(TOGGLES.map((t) => [t.key, t.defaultOn])));
      setCount(1);
      setBoardSel(null);
      setListSel(null);
      setDescriptionDraft('');
      setError(null);
    }
  }, [open]);

  function toggleAll() {
    const allOn = TOGGLES.every((t) => opts[t.key]);
    const next = !allOn;
    setOpts(Object.fromEntries(TOGGLES.map((t) => [t.key, next])));
  }

  const allOn = TOGGLES.every((t) => opts[t.key]);

  const mut = useMutation({
    mutationFn: () =>
      duplicateCard(card.id, {
        ...opts,
        count,
        targetBoardId: boardSel?.id ?? null,
        targetListId: listSel?.id ?? null,
        // Envia descriptionOverride so quando o check copyDescription NAO
        // esta ativo — se o user marcou "copiar descricao do original", o
        // rascunho manual eh ignorado no backend.
        descriptionOverride:
          !opts.copyDescription && descriptionDraft.trim().length > 0 ? descriptionDraft : null,
      } as DuplicateCardOptions),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      queryClient.invalidateQueries({ queryKey: cardsQueries.detail(card.id).queryKey });
      onOpenChange(false);
      // Cópia unica -> navega pra ela (equivalente a clicar no card criado).
      // Para N > 1 mantem o comportamento antigo (volta pro original) —
      // abrir automaticamente a primeira de 10 seria estranho.
      if (count === 1 && data.cards[0]) {
        const params = new URLSearchParams(searchParams.toString());
        params.set('card', data.cards[0].id);
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      }
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Erro ao duplicar.');
    },
  });

  const canSubmit =
    count >= 1 &&
    count <= 10 &&
    !mut.isPending &&
    // Se escolheu board, tem que ter escolhido lista também
    ((!boardSel && !listSel) || (boardSel && listSel));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="max-w-md gap-0 p-0">
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
          <div>
            <DialogTitle className="text-base font-semibold">Duplicar card</DialogTitle>
            <p className="text-fg-muted mt-1 text-xs">
              Selecione quais informações do card serão copiadas.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-fg-muted hover:bg-bg-muted rounded p-1"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5 pb-5">
          {/* Selecionar todas */}
          <div className="flex items-center justify-between">
            <span className="text-sm">Selecionar todas</span>
            <Switch checked={allOn} onChange={toggleAll} />
          </div>

          {/* Nome (sempre marcado, disabled) */}
          <div className="flex items-center gap-2 text-sm">
            <Checkbox checked disabled />
            <span className="text-fg-muted">
              Nome do card —{' '}
              <span className="text-fg">
                "{card.title} (cópia{count > 1 ? ` 1` : ''})"
              </span>
            </span>
          </div>

          {/* Toggles */}
          {TOGGLES.map((t) => (
            <div key={t.key} className="flex flex-col gap-1.5">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={!!opts[t.key]}
                  onChange={() => setOpts((prev) => ({ ...prev, [t.key]: !prev[t.key] }))}
                />
                <span>{t.label}</span>
              </label>
              {/* Textarea de descricao inicial — so aparece pro check "Descrição"
                  quando ele esta desmarcado. Se o user marca copiar, o campo some
                  (nao faz sentido ter os dois). */}
              {t.key === 'copyDescription' && !opts.copyDescription && (
                <textarea
                  value={descriptionDraft}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
                  placeholder="Descrição inicial (opcional) — deixe em branco pra criar sem descrição"
                  rows={3}
                  maxLength={5000}
                  className="border-border bg-bg-subtle focus-visible:ring-primary ml-6 resize-none rounded-md border px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2"
                />
              )}
            </div>
          ))}

          {/* Vincular a outro fluxo */}
          <div className="border-border/70 mt-1 flex flex-col gap-2 border-t pt-3">
            <p className="text-fg text-sm font-semibold">
              Vincular cards duplicados a um fluxo (opcional)
            </p>
            <BoardCombobox
              value={boardSel}
              onChange={(b) => {
                setBoardSel(b);
                setListSel(null);
              }}
            />
            {boardSel && (
              <ListCombobox boardId={boardSel.id} value={listSel} onChange={setListSel} />
            )}
          </div>

          {error && (
            <p className="bg-danger-subtle text-danger rounded-md px-3 py-2 text-xs">{error}</p>
          )}

          {/* Footer */}
          <div className="border-border/70 mt-1 flex items-center justify-between border-t pt-3">
            <div className="flex items-center gap-2 text-xs">
              <label htmlFor="dup-count" className="text-fg-muted">
                Número de cópias:
              </label>
              <input
                id="dup-count"
                type="number"
                min={1}
                max={10}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                className="bg-bg border-border focus-visible:ring-primary w-16 rounded-md border px-2 py-1 text-center text-xs focus-visible:outline-none focus-visible:ring-2"
              />
            </div>
            <button
              type="button"
              onClick={() => mut.mutate()}
              disabled={!canSubmit}
              className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mut.isPending && <Loader2 size={14} className="animate-spin" />}
              Duplicar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------- subcomponentes -------------------- */

function Checkbox({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      role="checkbox"
      aria-checked={checked}
      className={`flex size-4 shrink-0 items-center justify-center rounded border transition-colors ${
        checked
          ? 'bg-primary border-primary text-primary-fg'
          : 'border-border bg-bg hover:border-border-strong'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      {checked && <Check size={11} />}
    </button>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-primary' : 'bg-bg-emphasis'
      }`}
    >
      <span
        className={`absolute size-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]'
        }`}
      />
    </button>
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
        <div className="flex items-center gap-1">
          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="text-fg-muted hover:text-fg"
              aria-label="Limpar"
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown size={14} className="text-fg-muted" />
        </div>
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
}: {
  boardId: string;
  value: { id: string; name: string } | null;
  onChange: (l: { id: string; name: string } | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const boardQ = useQuery({ ...boardsQueries.detail(boardId) });

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
        onClick={() => setOpen((v) => !v)}
        className="border-border bg-bg hover:border-border-strong flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm"
      >
        <span className={value ? 'text-fg' : 'text-fg-muted'}>
          {value ? value.name : 'Selecione a coluna'}
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
