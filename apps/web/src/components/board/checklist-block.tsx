'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addChecklistItem,
  cardsQueries,
  createChecklist,
  removeChecklist,
  removeChecklistItem,
  renameChecklist,
  updateChecklistItem,
  type CardDetail,
  type Checklist,
  type ChecklistItem,
  type TaskPriority,
  type TaskRecurrence,
} from '@/lib/queries/cards';
import { RecurrencePicker } from './recurrence-picker';
import { Bot, Loader2, Plus, Trash2, X } from 'lucide-react';

import { Button } from '@ktask/ui';
import { useConfirm, useNotify, usePrompt } from '@/components/ui/dialogs';
import { ChecklistAutomationDialog } from './checklist-automation-dialog';
import {
  ChecklistAssigneePicker,
  ChecklistDueDatePicker,
  ChecklistPriorityPicker,
  PRIORITY_META,
} from './checklist-item-pickers';
import { automationsQueries } from '@/lib/queries/automations';
import type { ListWithCards } from '@/lib/queries/boards';
import {
  applyChecklistTemplate,
  checklistTemplatesQueries,
  saveChecklistAsTemplate,
  type ChecklistTemplate,
} from '@/lib/queries/checklist-templates';
import { ApiError } from '@/lib/api-client';
import { BookmarkPlus, FileText } from 'lucide-react';

export function ChecklistBlock({ card, boardId }: { card: CardDetail; boardId: string }) {
  const queryClient = useQueryClient();
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  // ID da lista recém-criada — usada pra ChecklistSection autodirecionar
  // foco pro input de adicionar tarefa (UX em 1 passo).
  const [autoOpenChecklistId, setAutoOpenChecklistId] = useState<string | null>(null);
  const notify = useNotify();

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: cardsQueries.detail(card.id).queryKey });
    queryClient.invalidateQueries({ queryKey: ['boards', boardId] });
    // Painel /Inicio (meQueries.tasks) consome ChecklistItem com assignee=me.
    // Sem invalidar aqui, marcar/criar/atribuir tarefa pelo card-modal nao
    // atualizava a Home ate window focus / refetchInterval 60s. Invalidate
    // direto entrega zero latencia pro proprio user agindo na sua tarefa.
    queryClient.invalidateQueries({ queryKey: ['me', 'tasks'] });
  }

  const createMut = useMutation({
    mutationFn: () =>
      createChecklist({
        cardId: card.id,
        // Default "Checklist" — user renomeia clicando no título depois.
        // Pula o input de título (UX simplificada).
        title: 'Checklist',
      }),
    onSuccess: (newChecklist) => {
      setAutoOpenChecklistId(newChecklist.id);
      invalidate();
    },
    onError: () => notify.error('Erro ao criar lista.'),
  });

  const applyTemplateMut = useMutation({
    mutationFn: (templateId: string) => applyChecklistTemplate({ templateId, cardId: card.id }),
    onSuccess: () => {
      setTemplatePickerOpen(false);
      invalidate();
      notify.success('Template aplicado.');
    },
    onError: (err) => {
      notify.error(err instanceof ApiError ? err.message : 'Erro ao aplicar template.');
    },
  });

  // Stub mínimo do List pra passar pro CreateAutomationForm via dialog.
  // O form usa list só pra exibir o nome no header e pra automation
  // list-scoped — quando scope=checklist/item, list.id não é usado.
  const listStub: ListWithCards = {
    id: card.list.id,
    name: card.list.name,
    position: 0,
    color: null,
    wipLimit: null,
    isArchived: false,
    isFinalList: false,
    isBacklog: false,
    cards: [],
  };

  return (
    <div className="flex flex-col gap-5">
      {card.checklists.map((cl) => (
        <ChecklistSection
          key={cl.id}
          checklist={cl}
          onChange={invalidate}
          list={listStub}
          boardId={boardId}
          cardId={card.id}
          autoOpenAddItem={cl.id === autoOpenChecklistId}
          onAutoOpenConsumed={() => setAutoOpenChecklistId(null)}
        />
      ))}
      {/* nota: AssigneePicker usa orgMembersQuery diretamente — qualquer membro
          da Org pode ser atribuído (mesmo critério do LeadPicker do card). */}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending}
          className="border-border/70 text-fg-muted hover:text-primary hover:border-primary/50 inline-flex w-fit items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60"
        >
          {createMut.isPending ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Plus size={12} />
          )}
          Adicionar lista
        </button>
        <button
          type="button"
          onClick={() => setTemplatePickerOpen(true)}
          className="border-border/70 text-fg-muted hover:text-primary hover:border-primary/50 inline-flex w-fit items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-xs font-medium transition-colors"
          title="Aplicar checklist a partir de um template salvo"
        >
          <FileText size={12} />
          Usar template
        </button>
      </div>

      {templatePickerOpen && (
        <TemplatePickerDialog
          onClose={() => setTemplatePickerOpen(false)}
          onPick={(id) => applyTemplateMut.mutate(id)}
          loading={applyTemplateMut.isPending}
        />
      )}
    </div>
  );
}

function TemplatePickerDialog({
  onClose,
  onPick,
  loading,
}: {
  onClose: () => void;
  onPick: (templateId: string) => void;
  loading: boolean;
}) {
  const { data, isLoading } = useQuery(checklistTemplatesQueries.list());
  const templates = data ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="border-border bg-bg flex w-full max-w-md flex-col rounded-md border shadow-2xl">
        <div className="border-border/60 flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-fg flex items-center gap-2 text-sm font-semibold">
            <FileText size={14} />
            Aplicar template
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-muted hover:text-fg rounded p-0.5"
            aria-label="Fechar"
          >
            <X size={14} />
          </button>
        </div>
        <div className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto p-3">
          {isLoading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={14} className="text-fg-muted animate-spin" />
            </div>
          )}
          {!isLoading && templates.length === 0 && (
            <p className="text-fg-muted py-4 text-center text-xs">
              Nenhum template salvo ainda. Salve uma checklist como template no botão de marcador.
            </p>
          )}
          {templates.map((t: ChecklistTemplate) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onPick(t.id)}
              disabled={loading}
              className="border-border/60 hover:border-border-strong hover:bg-bg-muted flex flex-col items-start gap-1 rounded-md border px-3 py-2 text-left text-sm transition-colors disabled:opacity-60"
            >
              <span className="text-fg flex w-full items-center justify-between gap-2 font-medium">
                <span className="truncate">{t.title}</span>
                <span className="text-fg-muted shrink-0 text-[10px]">
                  {t.items.length} {t.items.length === 1 ? 'item' : 'itens'}
                </span>
              </span>
              <span className="text-fg-muted line-clamp-2 text-[11px]">
                {t.items.slice(0, 3).join(' · ')}
                {t.items.length > 3 ? '…' : ''}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChecklistSection({
  checklist,
  onChange,
  list,
  boardId,
  cardId,
  autoOpenAddItem,
  onAutoOpenConsumed,
}: {
  checklist: Checklist;
  onChange: () => void;
  list: ListWithCards;
  boardId: string;
  cardId: string;
  /** Doc 50: quando true, abre o input de "Adicionar tarefa" automaticamente
   *  (UX: criar lista pula o passo do título e ja foca em adicionar item). */
  autoOpenAddItem?: boolean;
  onAutoOpenConsumed?: () => void;
}) {
  const confirm = useConfirm();
  const prompt = usePrompt();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(checklist.title);
  const [autoOpen, setAutoOpen] = useState(false);
  useEffect(() => setTitle(checklist.title), [checklist.title]);

  const automationsCount = useQuery({
    ...automationsQueries.byChecklist(checklist.id),
    select: (data) => data.filter((a) => a.isActive).length,
  });

  const [newItemText, setNewItemText] = useState('');
  const [addingItem, setAddingItem] = useState(false);

  // Doc 50: ao criar uma lista nova, parent (ChecklistBlock) marca esta
  // como auto-open. Abre o textarea de "Adicionar tarefa" focado e
  // consome o flag pra nao reabrir ao re-render.
  // Deps intencionalmente minimas: so reage a transicao do flag
  // autoOpenAddItem; addingItem e onAutoOpenConsumed sao lidos no
  // momento da mudanca sem precisar re-disparar o effect.
  useEffect(() => {
    if (autoOpenAddItem && !addingItem) {
      setAddingItem(true);
      onAutoOpenConsumed?.();
    }
  }, [autoOpenAddItem, addingItem, onAutoOpenConsumed]);

  const renameMut = useMutation({
    mutationFn: (t: string) => renameChecklist(checklist.id, t),
    onSuccess: onChange,
  });

  const removeListMut = useMutation({
    mutationFn: () => removeChecklist(checklist.id),
    onSuccess: onChange,
  });

  const saveTemplateMut = useMutation({
    mutationFn: (templateTitle: string) =>
      saveChecklistAsTemplate({
        checklistId: checklist.id,
        title: templateTitle.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist-templates'] });
      notify.success('Checklist salva como template.');
    },
    onError: (err) => {
      notify.error(err instanceof ApiError ? err.message : 'Erro ao salvar template.');
    },
  });

  const addMut = useMutation({
    mutationFn: () => {
      // Default: prazo = hoje (00:00 BRT local). User pode trocar clicando
      // no DueDatePicker da linha depois. Mesmo padrão do InlineAddTaskRow
      // da home pessoal.
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      return addChecklistItem(checklist.id, {
        text: newItemText.trim(),
        dueDate: today.toISOString(),
      });
    },
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
        {/* Doc 48: botão 🤖 para automacoes escopadas no checklist inteiro */}
        <button
          type="button"
          onClick={() => setAutoOpen(true)}
          className={`flex items-center gap-0.5 rounded p-1 ${
            (automationsCount.data ?? 0) > 0
              ? 'text-primary'
              : 'text-fg-subtle hover:text-primary opacity-60 hover:opacity-100'
          }`}
          aria-label="Automações do checklist"
          title="Automações quando este checklist for 100% concluído"
        >
          <Bot size={13} />
          {(automationsCount.data ?? 0) > 0 && (
            <span className="text-[10px] font-semibold tabular-nums">{automationsCount.data}</span>
          )}
        </button>
        <ChecklistAutomationDialog
          scope={{ kind: 'checklist', id: checklist.id, cardId }}
          scopeLabel={checklist.title}
          list={list}
          boardId={boardId}
          open={autoOpen}
          onOpenChange={setAutoOpen}
        />
        {total > 0 && (
          <button
            type="button"
            onClick={async () => {
              const tplTitle = await prompt({
                title: 'Salvar como template',
                description:
                  'O template fica disponível pra toda a Org e pode ser aplicado em qualquer card.',
                placeholder: checklist.title,
                confirmLabel: 'Salvar template',
                defaultValue: checklist.title,
              });
              if (tplTitle !== null) saveTemplateMut.mutate(tplTitle);
            }}
            disabled={saveTemplateMut.isPending}
            className="text-fg-muted hover:text-primary rounded p-1"
            aria-label="Salvar como template"
            title="Salvar como template"
          >
            <BookmarkPlus size={12} />
          </button>
        )}
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
          <ItemRow
            key={item.id}
            item={item}
            onChange={onChange}
            list={list}
            boardId={boardId}
            cardId={cardId}
          />
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

function ItemRow({
  item,
  onChange,
  list,
  boardId,
  cardId,
}: {
  item: ChecklistItem;
  onChange: () => void;
  list: ListWithCards;
  boardId: string;
  cardId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const [autoOpen, setAutoOpen] = useState(false);
  useEffect(() => setText(item.text), [item.text]);
  const textRef = useRef<HTMLInputElement>(null);

  const automationsCount = useQuery({
    ...automationsQueries.byChecklistItem(item.id),
    select: (data) => data.filter((a) => a.isActive).length,
  });

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
  const recurrenceMut = useMutation({
    mutationFn: (rec: TaskRecurrence | null) => updateChecklistItem(item.id, { recurrence: rec }),
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
  const hasPriorityStripe = !item.isDone && item.priority !== 'NONE';
  // Faixa esquerda colorida (border-l-4) + padding maior pra respiro
  // entre a faixa e o checkbox. Sem prioridade fica pl-1 (sem deslocar
  // visualmente).
  const borderClass = hasPriorityStripe ? `border-l-4 ${priorityMeta.borderClass}` : '';
  const paddingLeftClass = hasPriorityStripe ? 'pl-2' : 'pl-1';

  return (
    <li
      className={`group/item hover:bg-bg-muted/60 -mx-1 flex items-center gap-2 rounded py-1 pr-1 ${paddingLeftClass} ${borderClass}`}
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

      <ChecklistDueDatePicker
        dueDate={item.dueDate}
        onChange={(iso) => dueMut.mutate(iso)}
        disabled={dueMut.isPending}
      />

      <ChecklistPriorityPicker
        priority={item.priority}
        onChange={(p) => priorityMut.mutate(p)}
        disabled={priorityMut.isPending}
      />

      {/* Doc 49: recorrencia da tarefa. Click abre popover; ao concluir
          o item, backend cria nova instancia com prox dueDate. */}
      <RecurrencePicker value={item.recurrence} onChange={(rec) => recurrenceMut.mutate(rec)} />

      {/* Doc 48: botão 🤖 para automacao escopada NESTE item */}
      <button
        type="button"
        onClick={() => setAutoOpen(true)}
        className={`flex items-center gap-0.5 rounded p-0.5 ${
          (automationsCount.data ?? 0) > 0
            ? 'text-primary'
            : 'text-fg-subtle hover:text-primary opacity-60 hover:opacity-100'
        }`}
        aria-label="Automações da tarefa"
        title="Automações quando esta tarefa for concluída"
      >
        <Bot size={13} />
        {(automationsCount.data ?? 0) > 0 && (
          <span className="text-[10px] font-semibold tabular-nums">{automationsCount.data}</span>
        )}
      </button>
      <ChecklistAutomationDialog
        scope={{ kind: 'item', id: item.id, cardId }}
        scopeLabel={item.text}
        list={list}
        boardId={boardId}
        open={autoOpen}
        onOpenChange={setAutoOpen}
      />

      <ChecklistAssigneePicker
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
