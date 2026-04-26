'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';

import {
  cardsQueries,
  addLabelToCard,
  removeLabelFromCard,
  type CardDetail,
} from '@/lib/queries/cards';
import {
  labelsQueries,
  createLabel,
  updateLabel,
  deleteLabel,
  type Label,
} from '@/lib/queries/labels';
import { useConfirm, useNotify } from '@/components/ui/dialogs';

/**
 * Picker de etiquetas do card. Mostra um botão "Etiqueta +" que abre
 * um popover com:
 *   - Busca por nome
 *   - Lista de etiquetas do quadro (toggle: marca/desmarca no card)
 *   - Editar inline (lápis) e excluir (lixeira) cada etiqueta
 *   - Criar nova com nome + paleta de cores curadas
 *
 * Liga em GET/POST/PATCH/DELETE /boards/:boardId/labels e
 * POST/DELETE /cards/:cardId/labels.
 */

const PALETTE = [
  '#EF4444',
  '#F97316',
  '#F59E0B',
  '#EAB308',
  '#84CC16',
  '#22C55E',
  '#10B981',
  '#06B6D4',
  '#3B82F6',
  '#6366F1',
  '#8B5CF6',
  '#A855F7',
  '#D946EF',
  '#EC4899',
  '#F43F5E',
  '#64748B',
];

export function LabelPicker({ card, boardId }: { card: CardDetail; boardId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Label | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const notify = useNotify();
  const confirm = useConfirm();

  const labelsQuery = useQuery({ ...labelsQueries.byBoard(boardId), enabled: open });

  const cardLabelIds = useMemo(() => new Set(card.labels.map((cl) => cl.labelId)), [card.labels]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: cardsQueries.detail(card.id).queryKey });
    queryClient.invalidateQueries({ queryKey: labelsQueries.byBoard(boardId).queryKey });
    queryClient.invalidateQueries({ queryKey: ['boards', boardId] });
  }

  const addMut = useMutation({
    mutationFn: (labelId: string) => addLabelToCard(card.id, labelId),
    onSuccess: invalidate,
    onError: () => notify.error('Falha ao adicionar etiqueta.'),
  });
  const removeMut = useMutation({
    mutationFn: (labelId: string) => removeLabelFromCard(card.id, labelId),
    onSuccess: invalidate,
    onError: () => notify.error('Falha ao remover etiqueta.'),
  });
  const deleteLabelMut = useMutation({
    mutationFn: (labelId: string) => deleteLabel(labelId),
    onSuccess: invalidate,
    onError: () => notify.error('Falha ao excluir etiqueta.'),
  });

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const all = labelsQuery.data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((l) => l.name.toLowerCase().includes(q));
  }, [labelsQuery.data, query]);

  function toggle(label: Label) {
    if (cardLabelIds.has(label.id)) removeMut.mutate(label.id);
    else addMut.mutate(label.id);
  }

  async function handleDelete(label: Label) {
    const ok = await confirm({
      title: `Excluir etiqueta "${label.name}"?`,
      description:
        'A etiqueta será removida do quadro e de todos os cards que a usam. Não pode ser desfeito.',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (ok) deleteLabelMut.mutate(label.id);
  }

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Adicionar / gerenciar etiquetas"
        className="border-border text-fg-muted hover:border-border-strong hover:text-fg inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px]"
      >
        <Plus size={10} />
        Etiqueta
      </button>
      {open && (
        <div className="border-border bg-bg absolute left-0 top-full z-40 mt-1 flex w-72 flex-col overflow-hidden rounded-md border shadow-lg">
          <div className="border-border/70 flex items-center gap-2 border-b px-2 py-1.5">
            <Search size={12} className="text-fg-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar etiqueta…"
              className="w-full bg-transparent text-xs focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-fg-muted hover:bg-bg-muted hover:text-fg rounded p-0.5"
              aria-label="Fechar"
            >
              <X size={12} />
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {labelsQuery.isLoading && (
              <div className="flex items-center justify-center py-3">
                <Loader2 size={14} className="text-fg-muted animate-spin" />
              </div>
            )}
            {!labelsQuery.isLoading && filtered.length === 0 && (
              <p className="text-fg-muted px-2 py-3 text-center text-[11px]">
                {query ? 'Nenhuma etiqueta com esse nome.' : 'Crie a primeira etiqueta.'}
              </p>
            )}
            {filtered.map((label) =>
              editing?.id === label.id ? (
                <EditLabelRow
                  key={label.id}
                  label={label}
                  onCancel={() => setEditing(null)}
                  onSaved={() => {
                    setEditing(null);
                    invalidate();
                  }}
                />
              ) : (
                <div
                  key={label.id}
                  className="hover:bg-bg-muted group/lbl flex items-center gap-2 px-2 py-1"
                >
                  <button
                    type="button"
                    onClick={() => toggle(label)}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    <span
                      className="size-4 shrink-0 rounded"
                      style={{ backgroundColor: label.color }}
                    />
                    <span className="text-fg flex-1 truncate text-xs">{label.name}</span>
                    {cardLabelIds.has(label.id) && <Check size={12} className="text-primary" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(label)}
                    className="text-fg-muted hover:text-fg rounded p-0.5 opacity-0 group-hover/lbl:opacity-100"
                    aria-label="Editar etiqueta"
                    title="Editar"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(label)}
                    className="text-fg-muted hover:text-danger rounded p-0.5 opacity-0 group-hover/lbl:opacity-100"
                    aria-label="Excluir etiqueta"
                    title="Excluir"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ),
            )}
          </div>

          {creating ? (
            <CreateLabelRow
              boardId={boardId}
              onCancel={() => setCreating(false)}
              onCreated={() => {
                setCreating(false);
                invalidate();
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="border-border/70 text-primary hover:bg-primary-subtle flex items-center gap-1.5 border-t px-3 py-2 text-[11px] font-medium"
            >
              <Plus size={12} />
              Criar nova etiqueta
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CreateLabelRow({
  boardId,
  onCancel,
  onCreated,
}: {
  boardId: string;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[0]!);
  const notify = useNotify();
  const createMut = useMutation({
    mutationFn: () => createLabel(boardId, { name: name.trim(), color }),
    onSuccess: onCreated,
    onError: () => notify.error('Falha ao criar etiqueta.'),
  });

  return (
    <div className="border-border/70 flex flex-col gap-2 border-t p-2">
      <div className="flex items-center gap-2">
        <span className="size-4 shrink-0 rounded" style={{ backgroundColor: color }} />
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim().length > 0) createMut.mutate();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="Nome da etiqueta"
          maxLength={40}
          className="border-border focus:border-primary flex-1 rounded border px-2 py-1 text-xs focus:outline-none"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={`size-5 rounded ${color === c ? 'ring-fg ring-2 ring-offset-1' : ''}`}
            style={{ backgroundColor: c }}
            aria-label={`Cor ${c}`}
          />
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-fg-muted hover:text-fg text-[11px]"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => createMut.mutate()}
          disabled={name.trim().length === 0 || createMut.isPending}
          className="bg-primary text-primary-fg rounded px-2 py-0.5 text-[11px] font-medium disabled:opacity-60"
        >
          {createMut.isPending ? 'Criando…' : 'Criar'}
        </button>
      </div>
    </div>
  );
}

function EditLabelRow({
  label,
  onCancel,
  onSaved,
}: {
  label: Label;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState(label.color);
  const notify = useNotify();
  const updateMut = useMutation({
    mutationFn: () => updateLabel(label.id, { name: name.trim(), color }),
    onSuccess: onSaved,
    onError: () => notify.error('Falha ao salvar etiqueta.'),
  });

  return (
    <div className="bg-bg-subtle border-border/70 flex flex-col gap-2 border-y p-2">
      <div className="flex items-center gap-2">
        <span className="size-4 shrink-0 rounded" style={{ backgroundColor: color }} />
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim().length > 0) updateMut.mutate();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="Nome"
          maxLength={40}
          className="border-border focus:border-primary flex-1 rounded border px-2 py-1 text-xs focus:outline-none"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={`size-5 rounded ${color === c ? 'ring-fg ring-2 ring-offset-1' : ''}`}
            style={{ backgroundColor: c }}
            aria-label={`Cor ${c}`}
          />
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-fg-muted hover:text-fg text-[11px]"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => updateMut.mutate()}
          disabled={name.trim().length === 0 || updateMut.isPending}
          className="bg-primary text-primary-fg rounded px-2 py-0.5 text-[11px] font-medium disabled:opacity-60"
        >
          {updateMut.isPending ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
