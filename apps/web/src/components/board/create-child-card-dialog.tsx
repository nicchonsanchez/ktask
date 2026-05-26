'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, usePathname } from 'next/navigation';
import { Check, ChevronDown, Loader2, X } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle, Input } from '@ktask/ui';
import { boardsQueries, type BoardListItem } from '@/lib/queries/boards';
import {
  cardFamilyQuery,
  cardsQueries,
  createChildCard,
  type CardDetail,
  type CreateChildInput,
} from '@/lib/queries/cards';
import { ApiError } from '@/lib/api-client';
import { RichEditor } from '@/components/editor';

/**
 * Toggles disponíveis no dialog. `available: false` = checkbox desabilitada
 * com tooltip "em breve" (depende de feature ainda não implementada).
 *
 * Ordem segue o padrão Ummense (Descrição, Líder, Equipe, Contatos, Tags,
 * Privacidade, Data do card, Campos personalizados, Arquivos).
 */
type ToggleKey =
  | 'copyDescription'
  | 'copyLead'
  | 'copyTeam'
  | 'copyContacts'
  | 'copyTags'
  | 'copyPrivacy'
  | 'copyDueDate'
  | 'copyCustomFields'
  | 'copyAttachments';

const TOGGLES: Array<{ key: ToggleKey; label: string; available: boolean; reason?: string }> = [
  { key: 'copyDescription', label: 'Descrição', available: true },
  { key: 'copyLead', label: 'Líder', available: true },
  { key: 'copyTeam', label: 'Equipe', available: true },
  {
    key: 'copyContacts',
    label: 'Contatos',
    available: false,
    reason: 'Em breve — depende da agenda de contatos externos.',
  },
  { key: 'copyTags', label: 'Tags', available: true },
  {
    key: 'copyPrivacy',
    label: 'Privacidade',
    available: false,
    reason: 'Em breve — privacidade por card ainda não implementada.',
  },
  { key: 'copyDueDate', label: 'Data do card', available: true },
  {
    key: 'copyCustomFields',
    label: 'Campos personalizados',
    available: false,
    reason: 'Em breve — campos personalizados ainda não implementados.',
  },
  { key: 'copyAttachments', label: 'Arquivos', available: true },
];

const AVAILABLE_KEYS: ToggleKey[] = TOGGLES.filter((t) => t.available).map((t) => t.key);

/**
 * `parent` aceita tanto um CardDetail completo (uso típico no card-modal)
 * quanto uma versão mínima (FamilyCard da aba Família, busca global, etc).
 * Os únicos campos efetivamente lidos: id, title, boardId, description.
 */
export type CreateChildCardParent = Pick<CardDetail, 'id' | 'title' | 'boardId'> & {
  description?: unknown | null;
};

export function CreateChildCardDialog({
  parent,
  open,
  onOpenChange,
}: {
  parent: CreateChildCardParent;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const [title, setTitle] = useState('');
  const [opts, setOpts] = useState<Record<string, boolean>>({});
  const [description, setDescription] = useState<unknown>(null);
  const [boardSel, setBoardSel] = useState<BoardListItem | null>(null);
  const [listSel, setListSel] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openAfterCreate, setOpenAfterCreate] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setOpts({});
      setDescription(null);
      setBoardSel(null);
      setListSel(null);
      setError(null);
      setOpenAfterCreate(false);
    }
  }, [open]);

  // Pre-popula a descrição do editor inline com a descrição do pai quando o
  // user marca "Descrição" — assim ele pode revisar/editar antes de criar.
  useEffect(() => {
    if (opts.copyDescription) {
      setDescription((prev: unknown) => (prev ? prev : (parent.description ?? null)));
    } else {
      setDescription(null);
    }
  }, [opts.copyDescription, parent.description]);

  const allSelected = useMemo(() => AVAILABLE_KEYS.every((k) => opts[k]), [opts]);

  function toggleAll(next: boolean) {
    const updated: Record<string, boolean> = { ...opts };
    AVAILABLE_KEYS.forEach((k) => {
      updated[k] = next;
    });
    setOpts(updated);
  }

  function toggleOne(key: ToggleKey) {
    setOpts((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const mut = useMutation({
    mutationFn: () => {
      const payload: CreateChildInput = {
        title: title.trim(),
        copyDescription: !!opts.copyDescription,
        copyLead: !!opts.copyLead,
        copyTeam: !!opts.copyTeam,
        copyTags: !!opts.copyTags,
        copyDueDate: !!opts.copyDueDate,
        copyAttachments: !!opts.copyAttachments,
        targetBoardId: boardSel?.id ?? null,
        targetListId: listSel?.id ?? null,
      };
      if (opts.copyDescription && description) {
        payload.description = description;
      }
      return createChildCard(parent.id, payload);
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: cardFamilyQuery(parent.id).queryKey });
      queryClient.invalidateQueries({ queryKey: cardsQueries.detail(parent.id).queryKey });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      onOpenChange(false);
      if (openAfterCreate && created?.id) {
        // Abre modal do card recem criado por cima da rota atual
        // (preserva contexto). Se quiser ver no board, usuario navega depois.
        router.push(`${pathname}?card=${created.id}`);
      }
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Erro ao criar card filho.');
    },
  });

  const canSubmit =
    title.trim().length > 0 && !mut.isPending && ((!boardSel && !listSel) || (boardSel && listSel));

  function submit(openAfter: boolean) {
    setOpenAfterCreate(openAfter);
    mut.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="max-h-[calc(100vh-2rem)] w-[min(560px,calc(100vw-1rem))] max-w-[560px] gap-0 overflow-y-auto p-0"
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
          <DialogTitle className="text-base font-semibold">Criar card filho</DialogTitle>
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
          <Input
            id="child-title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nome do card"
            maxLength={500}
          />

          <p className="text-fg-muted text-xs">
            Selecione quais informações do card serão copiadas.
          </p>

          {/* Toggle "Selecionar todas" */}
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <SwitchToggle checked={allSelected} onChange={() => toggleAll(!allSelected)} />
            <span className="text-fg-muted">Selecionar todas</span>
          </label>

          {/* Lista de checkboxes */}
          <div className="flex flex-col gap-2">
            {TOGGLES.map((t) => (
              <div key={t.key} className="flex flex-col gap-2">
                <label
                  className={`flex items-center gap-2 text-sm ${
                    t.available ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                  }`}
                  title={t.reason}
                >
                  <Checkbox
                    checked={!!opts[t.key]}
                    disabled={!t.available}
                    onChange={() => t.available && toggleOne(t.key)}
                  />
                  <span>{t.label}</span>
                  {!t.available && <span className="text-fg-subtle text-[10px]">em breve</span>}
                </label>

                {/* Editor inline da descrição quando marcada */}
                {t.key === 'copyDescription' && opts.copyDescription && (
                  <div className="ml-6">
                    <RichEditor
                      value={description}
                      onChange={(doc) => setDescription(doc)}
                      placeholder="Descrição"
                      debounceMs={0}
                      minHeight="6rem"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Vincular fluxo */}
          <div className="border-border/70 mt-1 flex flex-col gap-2 border-t pt-3">
            <p className="text-fg text-sm font-semibold">
              Vincular card filho a um fluxo (opcional)
            </p>
            <p className="text-fg-muted text-[11px]">Vazio = mesmo fluxo e coluna do pai.</p>
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

          {/* Botões */}
          <div className="border-border/70 mt-1 flex items-center justify-end gap-3 border-t pt-3">
            <button
              type="button"
              onClick={() => submit(true)}
              disabled={!canSubmit}
              className="text-primary text-sm font-medium hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mut.isPending && openAfterCreate && (
                <Loader2 size={14} className="mr-1 inline animate-spin" />
              )}
              Criar e abrir card filho
            </button>
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={!canSubmit}
              className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mut.isPending && !openAfterCreate && <Loader2 size={14} className="animate-spin" />}
              Criar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Checkbox({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange?: () => void;
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
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {checked && <Check size={11} />}
    </button>
  );
}

function SwitchToggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-primary' : 'bg-bg-emphasis'
      }`}
    >
      <span
        className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
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
