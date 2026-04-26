'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addChecklistItem,
  cardsQueries,
  createChecklist,
  orgMembersQuery,
  removeChecklist,
  removeChecklistItem,
  renameChecklist,
  updateChecklistItem,
  type CardDetail,
  type Checklist,
  type ChecklistItem,
  type TaskPriority,
} from '@/lib/queries/cards';
import { CalendarDays, Flag, Loader2, Plus, Trash2, UserRoundPlus, X } from 'lucide-react';

import { Button } from '@ktask/ui';
import { UserAvatar } from '@/components/user-avatar';
import { useConfirm } from '@/components/ui/dialogs';

export function ChecklistBlock({ card, boardId }: { card: CardDetail; boardId: string }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: cardsQueries.detail(card.id).queryKey });
    queryClient.invalidateQueries({ queryKey: ['boards', boardId] });
  }

  const createMut = useMutation({
    mutationFn: () =>
      createChecklist({
        cardId: card.id,
        title: newTitle.trim() || undefined,
      }),
    onSuccess: () => {
      setAdding(false);
      setNewTitle('');
      invalidate();
    },
  });

  return (
    <div className="flex flex-col gap-5">
      {card.checklists.map((cl) => (
        <ChecklistSection key={cl.id} checklist={cl} onChange={invalidate} />
      ))}
      {/* nota: AssigneePicker usa orgMembersQuery diretamente — qualquer membro
          da Org pode ser atribuído (mesmo critério do LeadPicker do card). */}

      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMut.mutate();
          }}
          className="flex items-center gap-2"
        >
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setAdding(false);
                setNewTitle('');
              }
            }}
            placeholder="Título da lista"
            maxLength={200}
            className="bg-bg border-border focus-visible:ring-primary flex-1 rounded-md border px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2"
          />
          <Button type="submit" size="sm" disabled={createMut.isPending}>
            {createMut.isPending && <Loader2 size={12} className="animate-spin" />}
            Adicionar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setAdding(false);
              setNewTitle('');
            }}
          >
            Cancelar
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="border-border/70 text-fg-muted hover:text-primary hover:border-primary/50 inline-flex w-fit items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-xs font-medium transition-colors"
        >
          <Plus size={12} />
          Adicionar lista
        </button>
      )}
    </div>
  );
}

function ChecklistSection({ checklist, onChange }: { checklist: Checklist; onChange: () => void }) {
  const confirm = useConfirm();
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(checklist.title);
  useEffect(() => setTitle(checklist.title), [checklist.title]);

  const [newItemText, setNewItemText] = useState('');
  const [addingItem, setAddingItem] = useState(false);

  const renameMut = useMutation({
    mutationFn: (t: string) => renameChecklist(checklist.id, t),
    onSuccess: onChange,
  });

  const removeListMut = useMutation({
    mutationFn: () => removeChecklist(checklist.id),
    onSuccess: onChange,
  });

  const addMut = useMutation({
    mutationFn: () => addChecklistItem(checklist.id, newItemText.trim()),
    onSuccess: () => {
      setNewItemText('');
      setAddingItem(false);
      onChange();
    },
  });

  const done = checklist.items.filter((i) => i.isDone).length;
  const total = checklist.items.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  function saveTitle() {
    const trimmed = title.trim();
    if (!trimmed || trimmed === checklist.title) {
      setTitle(checklist.title);
      setEditingTitle(false);
      return;
    }
    renameMut.mutate(trimmed);
    setEditingTitle(false);
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {editingTitle ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveTitle();
              if (e.key === 'Escape') {
                setTitle(checklist.title);
                setEditingTitle(false);
              }
            }}
            maxLength={200}
            className="bg-bg-muted focus-visible:ring-primary flex-1 rounded px-2 py-0.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2"
          />
        ) : (
          <button
            type="button"
            onDoubleClick={() => setEditingTitle(true)}
            className="flex-1 truncate text-left text-sm font-semibold"
            title="Clique duas vezes para renomear"
          >
            {checklist.title}
          </button>
        )}
        <span className="text-fg-muted text-[11px] tabular-nums">
          {done}/{total}
        </span>
        <button
          type="button"
          onClick={async () => {
            const ok = await confirm({
              title: `Remover lista "${checklist.title}"?`,
              description: `Todos os ${total} ${total === 1 ? 'item' : 'itens'} serão apagados.`,
              confirmLabel: 'Remover lista',
              danger: true,
            });
            if (ok) removeListMut.mutate();
          }}
          disabled={removeListMut.isPending}
          className="text-fg-muted hover:text-danger rounded p-1"
          aria-label="Remover lista"
          title="Remover lista"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {total > 0 && (
        <div className="bg-bg-muted h-1 overflow-hidden rounded-full">
          <div
            className="bg-accent h-full transition-all duration-300"
            style={{ width: `${pct}%` }}
            aria-label={`${pct}% concluído`}
          />
        </div>
      )}

      <ul className="flex flex-col gap-0.5">
        {checklist.items.map((item) => (
          <ItemRow key={item.id} item={item} onChange={onChange} />
        ))}
      </ul>

      {addingItem ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newItemText.trim().length === 0) return;
            addMut.mutate();
          }}
          className="flex flex-col gap-2"
        >
          <textarea
            autoFocus
            rows={2}
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                (e.currentTarget.form as HTMLFormElement).requestSubmit();
              }
              if (e.key === 'Escape') {
                setAddingItem(false);
                setNewItemText('');
              }
            }}
            placeholder="Texto da tarefa"
            maxLength={500}
            className="bg-bg border-border focus-visible:ring-primary w-full resize-none rounded-md border px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2"
          />
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={addMut.isPending || newItemText.trim() === ''}
            >
              {addMut.isPending && <Loader2 size={12} className="animate-spin" />}
              Adicionar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setAddingItem(false);
                setNewItemText('');
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAddingItem(true)}
          className="text-fg-muted hover:text-primary inline-flex w-fit items-center gap-1 rounded px-1.5 py-1 text-xs"
        >
          <Plus size={12} />
          Adicionar tarefa
        </button>
      )}
    </section>
  );
}

function ItemRow({ item, onChange }: { item: ChecklistItem; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  useEffect(() => setText(item.text), [item.text]);
  const textRef = useRef<HTMLInputElement>(null);

  const toggleMut = useMutation({
    mutationFn: () => updateChecklistItem(item.id, { isDone: !item.isDone }),
    onSuccess: onChange,
  });
  const updateMut = useMutation({
    mutationFn: (t: string) => updateChecklistItem(item.id, { text: t }),
    onSuccess: onChange,
  });
  const removeMut = useMutation({
    mutationFn: () => removeChecklistItem(item.id),
    onSuccess: onChange,
  });
  const assignMut = useMutation({
    mutationFn: (userId: string | null) => updateChecklistItem(item.id, { assigneeId: userId }),
    onSuccess: onChange,
  });
  const dueMut = useMutation({
    mutationFn: (iso: string | null) => updateChecklistItem(item.id, { dueDate: iso }),
    onSuccess: onChange,
  });
  const priorityMut = useMutation({
    mutationFn: (p: TaskPriority) => updateChecklistItem(item.id, { priority: p }),
    onSuccess: onChange,
  });

  function saveText() {
    const trimmed = text.trim();
    if (!trimmed || trimmed === item.text) {
      setText(item.text);
      setEditing(false);
      return;
    }
    updateMut.mutate(trimmed);
    setEditing(false);
  }

  const priorityMeta = PRIORITY_META[item.priority];
  const borderClass =
    !item.isDone && item.priority !== 'NONE' ? `border-l-2 ${priorityMeta.borderClass}` : '';

  return (
    <li
      className={`group/item hover:bg-bg-muted/60 -mx-1 flex items-center gap-2 rounded py-1 pl-1 pr-1 ${borderClass}`}
    >
      <input
        type="checkbox"
        checked={item.isDone}
        onChange={() => toggleMut.mutate()}
        disabled={toggleMut.isPending}
        className="accent-primary size-4 shrink-0 cursor-pointer"
      />
      {editing ? (
        <input
          ref={textRef}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={saveText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveText();
            if (e.key === 'Escape') {
              setText(item.text);
              setEditing(false);
            }
          }}
          maxLength={500}
          className="bg-bg-muted focus-visible:ring-primary flex-1 rounded px-1.5 py-0.5 text-sm focus-visible:outline-none focus-visible:ring-2"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`flex-1 truncate text-left text-sm ${
            item.isDone ? 'text-fg-muted line-through' : ''
          }`}
        >
          {item.text}
        </button>
      )}

      <DueDatePicker
        dueDate={item.dueDate}
        onChange={(iso) => dueMut.mutate(iso)}
        disabled={dueMut.isPending}
      />

      <PriorityPicker
        priority={item.priority}
        onChange={(p) => priorityMut.mutate(p)}
        disabled={priorityMut.isPending}
      />

      <AssigneePicker
        assignee={item.assignee}
        onAssign={(userId) => assignMut.mutate(userId)}
        disabled={assignMut.isPending}
      />

      <button
        type="button"
        onClick={() => removeMut.mutate()}
        disabled={removeMut.isPending}
        className="text-fg-muted hover:text-danger rounded p-0.5 opacity-0 transition-opacity group-hover/item:opacity-100"
        aria-label="Remover item"
        title="Remover item"
      >
        <X size={12} />
      </button>
    </li>
  );
}

const PRIORITY_META: Record<
  TaskPriority,
  { label: string; dotClass: string; borderClass: string; textClass: string }
> = {
  NONE: {
    label: 'Sem prioridade',
    dotClass: 'bg-fg-muted/40',
    borderClass: 'border-transparent',
    textClass: 'text-fg-muted',
  },
  LOW: {
    label: 'Baixa',
    dotClass: 'bg-blue-400',
    borderClass: 'border-blue-400',
    textClass: 'text-blue-500',
  },
  MEDIUM: {
    label: 'Média',
    dotClass: 'bg-amber-400',
    borderClass: 'border-amber-400',
    textClass: 'text-amber-500',
  },
  HIGH: {
    label: 'Alta',
    dotClass: 'bg-orange-500',
    borderClass: 'border-orange-500',
    textClass: 'text-orange-500',
  },
  URGENT: {
    label: 'Urgente',
    dotClass: 'bg-red-500',
    borderClass: 'border-red-500',
    textClass: 'text-red-500',
  },
};

function formatDueLabel(iso: string): { label: string; tone: 'past' | 'today' | 'future' } {
  const due = new Date(iso);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60_000);
  const dayAfter = new Date(today.getTime() + 2 * 24 * 60 * 60_000);

  if (due.getTime() === today.getTime()) return { label: 'Hoje', tone: 'today' };
  if (due.getTime() < today.getTime())
    return { label: due.toLocaleDateString('pt-BR'), tone: 'past' };
  if (due.getTime() < dayAfter.getTime() && due.getTime() >= tomorrow.getTime())
    return { label: 'Amanhã', tone: 'future' };
  return { label: due.toLocaleDateString('pt-BR'), tone: 'future' };
}

function DueDatePicker({
  dueDate,
  onChange,
  disabled,
}: {
  dueDate: string | null;
  onChange: (iso: string | null) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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

  function setToday() {
    const d = new Date();
    d.setHours(23, 59, 0, 0);
    onChange(d.toISOString());
    setOpen(false);
  }
  function setTomorrow() {
    const d = new Date(Date.now() + 24 * 60 * 60_000);
    d.setHours(23, 59, 0, 0);
    onChange(d.toISOString());
    setOpen(false);
  }
  function clear() {
    onChange(null);
    setOpen(false);
  }
  function setExact(value: string) {
    if (!value) return;
    // value vem como YYYY-MM-DD; interpretamos no fuso local com 23:59
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return;
    const dt = new Date(y, m - 1, d, 23, 59, 0, 0);
    onChange(dt.toISOString());
    setOpen(false);
  }

  const display = dueDate ? formatDueLabel(dueDate) : null;

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title={display ? `Prazo: ${display.label}` : 'Definir prazo'}
        className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] transition-opacity ${
          display
            ? display.tone === 'today'
              ? 'text-emerald-600 dark:text-emerald-400'
              : display.tone === 'past'
                ? 'text-red-500'
                : 'text-fg-muted'
            : 'text-fg-muted hover:text-fg opacity-0 group-hover/item:opacity-100'
        }`}
        aria-label="Definir prazo"
      >
        {display ? (
          <span className="font-medium">{display.label}</span>
        ) : (
          <CalendarDays size={13} />
        )}
      </button>
      {open && (
        <div className="border-border bg-bg absolute right-0 top-full z-30 mt-1 flex w-56 flex-col overflow-hidden rounded-md border p-2 shadow-lg">
          <div className="mb-2 flex items-center gap-1">
            <button
              type="button"
              onClick={setToday}
              className="bg-primary text-primary-fg hover:bg-primary-hover flex-1 rounded-md px-2 py-1 text-[11px] font-medium"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={setTomorrow}
              className="border-border text-fg hover:bg-bg-muted flex-1 rounded-md border px-2 py-1 text-[11px]"
            >
              Amanhã
            </button>
            <button
              type="button"
              onClick={clear}
              className="border-border text-fg hover:bg-bg-muted flex-1 rounded-md border px-2 py-1 text-[11px]"
            >
              Sem data
            </button>
          </div>
          <input
            type="date"
            defaultValue={dueDate ? new Date(dueDate).toISOString().slice(0, 10) : ''}
            onChange={(e) => setExact(e.target.value)}
            className="border-border bg-bg w-full rounded-md border px-2 py-1 text-xs"
          />
        </div>
      )}
    </div>
  );
}

function PriorityPicker({
  priority,
  onChange,
  disabled,
}: {
  priority: TaskPriority;
  onChange: (p: TaskPriority) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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

  const meta = PRIORITY_META[priority];
  const isSet = priority !== 'NONE';

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title={`Prioridade: ${meta.label}`}
        className={`inline-flex items-center justify-center rounded p-0.5 transition-opacity ${
          isSet
            ? meta.textClass
            : 'text-fg-muted hover:text-fg opacity-0 group-hover/item:opacity-100'
        }`}
        aria-label="Definir prioridade"
      >
        <Flag size={13} fill={isSet ? 'currentColor' : 'none'} />
      </button>
      {open && (
        <div className="border-border bg-bg absolute right-0 top-full z-30 mt-1 flex w-44 flex-col overflow-hidden rounded-md border p-1 shadow-lg">
          {(['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'] as TaskPriority[]).map((p) => {
            const m = PRIORITY_META[p];
            const isCurrent = p === priority;
            return (
              <button
                key={p}
                type="button"
                onClick={() => {
                  onChange(p);
                  setOpen(false);
                }}
                className={`hover:bg-bg-muted flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] ${
                  isCurrent ? 'bg-bg-muted' : ''
                }`}
              >
                <span aria-hidden className={`size-2.5 rounded-full ${m.dotClass}`} />
                <span className="text-fg flex-1">{m.label}</span>
                {isCurrent && <span className="text-primary text-[10px]">atual</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Picker de responsável da tarefa (ChecklistItem). Quando há assignee,
 * mostra o avatar dele; quando não há, mostra ícone discreto que aparece
 * só no hover. Click abre popover com membros da Org pra escolher.
 */
function AssigneePicker({
  assignee,
  onAssign,
  disabled,
}: {
  assignee: ChecklistItem['assignee'];
  onAssign: (userId: string | null) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const membersQ = useQuery({ ...orgMembersQuery, enabled: open });

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

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className={`inline-flex items-center justify-center rounded-full transition-opacity ${
          assignee
            ? 'opacity-100'
            : 'text-fg-muted hover:text-fg opacity-0 group-hover/item:opacity-100'
        }`}
        title={assignee ? `Responsável: ${assignee.name}` : 'Atribuir responsável'}
        aria-label={assignee ? `Responsável: ${assignee.name}` : 'Atribuir responsável'}
      >
        {assignee ? (
          <UserAvatar
            name={assignee.name}
            userId={assignee.id}
            avatarUrl={assignee.avatarUrl}
            size="sm"
          />
        ) : (
          <span className="bg-bg-muted hover:bg-bg-emphasis flex size-6 items-center justify-center rounded-full">
            <UserRoundPlus size={12} />
          </span>
        )}
      </button>
      {open && (
        <div className="border-border bg-bg absolute right-0 top-full z-30 mt-1 flex w-56 flex-col overflow-hidden rounded-md border shadow-lg">
          <div className="border-border/70 px-2 py-1.5">
            <p className="text-fg text-[12px] font-semibold">Responsável</p>
            <p className="text-fg-muted text-[10px]">A pessoa será notificada.</p>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {membersQ.isLoading && (
              <div className="flex items-center justify-center py-2">
                <Loader2 size={12} className="text-fg-muted animate-spin" />
              </div>
            )}
            {(membersQ.data ?? []).map((m) => {
              const isCurrent = assignee?.id === m.userId;
              return (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => {
                    onAssign(isCurrent ? null : m.userId);
                    setOpen(false);
                  }}
                  className="hover:bg-bg-muted flex w-full items-center gap-2 px-2 py-1 text-left text-xs"
                >
                  <UserAvatar
                    name={m.user.name}
                    userId={m.user.id}
                    avatarUrl={m.user.avatarUrl}
                    size="sm"
                  />
                  <span className="flex-1 truncate">{m.user.name}</span>
                  {isCurrent && <span className="text-primary text-[10px]">atual</span>}
                </button>
              );
            })}
          </div>
          {assignee && (
            <button
              type="button"
              onClick={() => {
                onAssign(null);
                setOpen(false);
              }}
              className="border-border/70 text-fg-muted hover:text-danger border-t px-2 py-1.5 text-left text-[11px]"
            >
              Remover responsável
            </button>
          )}
        </div>
      )}
    </div>
  );
}
