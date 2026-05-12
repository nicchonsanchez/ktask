'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronUp, Loader2, Plus, X } from 'lucide-react';

import {
  meQueries,
  bulkRescheduleToday,
  createStandaloneTask,
  type MeTask,
  type MeTasksResponse,
} from '@/lib/queries/me';
import { userViewQueries } from '@/lib/queries/user-view';
import { useConfirm, useNotify } from '@/components/ui/dialogs';
import { TarefaRow } from './tarefa-row';
import { CreateTaskDialog } from './create-task-dialog';

/**
 * Painel "Tarefas" da home pessoal — card colapsável com 4 seções:
 * Atrasadas, Hoje, Próximos 7 dias, Sem data.
 *
 * Inspirado no Ummense:
 *   - Cabeçalho: chevron · "Tarefas" · botão `+` · ações (… kebab placeholder)
 *   - Seção Atrasadas com link "Atualizar todas as tarefas para hoje"
 *   - Seção Hoje com barra de progresso (% concluído)
 *   - Linhas: ver `TarefaRow`
 */
export function TarefasPanel({
  selectedDay,
  onClearFilter,
  viewAsUserId,
  boardFilter,
}: {
  selectedDay?: string | null;
  onClearFilter?: () => void;
  viewAsUserId?: string;
  boardFilter?: string | null;
}) {
  const readOnly = !!viewAsUserId;
  const [collapsed, setCollapsed] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const tasksQuery = useQuery<MeTasksResponse>(
    viewAsUserId ? userViewQueries.tasks(viewAsUserId) : meQueries.tasks(),
  );
  const rawData = tasksQuery.data;
  const data = boardFilter && rawData ? filterTasksByBoard(rawData, boardFilter) : rawData;
  const filteredTasks = selectedDay && data ? filterTasksByDay(data, selectedDay) : null;

  return (
    <section className="border-border bg-bg overflow-hidden rounded-lg border">
      {/* Cabeçalho */}
      <div className="border-border/60 flex items-center justify-between gap-2 border-b px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="text-fg-muted hover:bg-bg-muted hover:text-fg rounded p-1"
            aria-label={collapsed ? 'Expandir tarefas' : 'Recolher tarefas'}
          >
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
          <h2 className="text-fg text-sm font-semibold">Tarefas</h2>
          {!readOnly && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              title="Adicionar tarefa rápida"
              aria-label="Adicionar tarefa"
              className="bg-primary-subtle text-primary hover:bg-primary hover:text-primary-fg inline-flex size-6 items-center justify-center rounded transition-colors"
            >
              <Plus size={13} />
            </button>
          )}
        </div>
      </div>
      <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} />

      {!collapsed && (
        <div className="flex flex-col">
          {tasksQuery.isLoading && (
            <div className="text-fg-muted flex items-center justify-center gap-2 py-8 text-sm">
              <Loader2 size={14} className="animate-spin" />
              Carregando…
            </div>
          )}

          {!tasksQuery.isLoading && filteredTasks && (
            <FilteredDaySection
              tasks={filteredTasks}
              day={selectedDay!}
              onClearFilter={() => onClearFilter?.()}
              readOnly={readOnly}
            />
          )}

          {!tasksQuery.isLoading && data && !filteredTasks && (
            <>
              {data.overdue.length > 0 && (
                <OverdueSection tasks={data.overdue} readOnly={readOnly} />
              )}
              <TodaySection tasks={data.today} readOnly={readOnly} />
              {data.next7.length > 0 && <Next7Section tasks={data.next7} readOnly={readOnly} />}
              {data.noDate.length > 0 && <NoDateSection tasks={data.noDate} readOnly={readOnly} />}

              {data.overdue.length === 0 &&
                data.today.length === 0 &&
                data.next7.length === 0 &&
                data.noDate.length === 0 && (
                  <p className="text-fg-muted px-4 py-10 text-center text-sm">
                    Você não tem tarefas atribuídas. Comece criando ou pegando alguma num card.
                  </p>
                )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function OverdueSection({ tasks, readOnly }: { tasks: MeTask[]; readOnly?: boolean }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const notify = useNotify();

  const rescheduleMut = useMutation({
    mutationFn: () => bulkRescheduleToday(tasks.map((t) => t.id)),
    onSuccess: ({ updated }) => {
      queryClient.invalidateQueries({ queryKey: meQueries.tasks().queryKey });
      notify.success(
        `${updated} tarefa${updated === 1 ? '' : 's'} reagendada${updated === 1 ? '' : 's'} pra hoje.`,
      );
    },
    onError: () => notify.error('Falhou ao reagendar tarefas.'),
  });

  async function handleRescheduleAll() {
    const ok = await confirm({
      title: 'Atualizar todas as tarefas atrasadas pra hoje?',
      description: `${tasks.length} tarefa${tasks.length === 1 ? '' : 's'} atrasada${tasks.length === 1 ? '' : 's'} terá${tasks.length === 1 ? '' : 'ão'} o prazo movido pra hoje.`,
      confirmLabel: 'Atualizar todas',
    });
    if (ok) rescheduleMut.mutate();
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-3 sm:px-4">
        <p className="text-fg-muted text-[12px] font-medium">Atrasadas</p>
        {!readOnly && (
          <button
            type="button"
            onClick={handleRescheduleAll}
            disabled={rescheduleMut.isPending}
            className="text-primary hover:text-primary-hover text-[11px] font-medium disabled:opacity-60"
          >
            {rescheduleMut.isPending ? 'Atualizando…' : 'Atualizar todas as tarefas para hoje'}
          </button>
        )}
      </div>
      {tasks.map((t) => (
        <TarefaRow key={t.id} task={t} variant="overdue" readOnly={readOnly} />
      ))}
    </div>
  );
}

function TodaySection({ tasks, readOnly }: { tasks: MeTask[]; readOnly?: boolean }) {
  const total = tasks.length;
  const done = 0; // a query só traz isDone=false; future: incluir done de hoje
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div>
      <div className="flex items-center gap-3 px-3 pb-1 pt-3 sm:px-4">
        <p className="text-fg-muted text-[12px] font-medium">Hoje</p>
        {total > 0 && (
          <>
            <div className="bg-bg-muted h-1 flex-1 overflow-hidden rounded-full">
              <div className="bg-success h-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-fg-muted text-[11px]">{pct}% concluído</span>
          </>
        )}
      </div>
      {tasks.length === 0 ? (
        <p className="text-fg-subtle px-4 pb-1 pt-3 text-[12px] italic">
          Sem tarefas pra hoje. Bom dia tranquilo.
        </p>
      ) : (
        tasks.map((t) => <TarefaRow key={t.id} task={t} variant="today" readOnly={readOnly} />)
      )}
      {!readOnly && <InlineAddTaskRow />}
    </div>
  );
}

/**
 * Linha "Adicionar tarefa" inline no rodapé da seção Hoje.
 * Cria standalone task com dueDate=hoje (assigneeId default = user logado
 * via backend).
 */
function InlineAddTaskRow() {
  const [text, setText] = useState('');
  const [active, setActive] = useState(false);
  const queryClient = useQueryClient();
  const notify = useNotify();
  const createMut = useMutation({
    mutationFn: () => {
      // Hoje em BRT — fixar 00:00 do dia local pra alinhar com a janela
      // de "today" do /me/tasks.
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      return createStandaloneTask({ text: text.trim(), dueDate: today.toISOString() });
    },
    onSuccess: () => {
      setText('');
      setActive(false);
      queryClient.invalidateQueries({ queryKey: meQueries.tasks().queryKey });
    },
    onError: () => notify.error('Falha ao criar tarefa.'),
  });

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => setActive(true)}
        className="text-fg-muted hover:text-primary inline-flex w-full items-center gap-1.5 px-3 pb-3 pt-1 text-left text-[12px] sm:px-4"
      >
        <Plus size={12} />
        Adicionar tarefa
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim().length === 0 || createMut.isPending) return;
        createMut.mutate();
      }}
      className="flex items-center gap-2 px-3 pb-3 pt-1 sm:px-4"
    >
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setActive(false);
            setText('');
          }
        }}
        onBlur={() => {
          if (text.trim().length === 0) setActive(false);
        }}
        placeholder="Nova tarefa pra hoje"
        maxLength={500}
        className="bg-bg border-border focus:border-primary flex-1 rounded-md border px-2 py-1 text-sm focus:outline-none"
      />
      <button
        type="submit"
        disabled={text.trim().length === 0 || createMut.isPending}
        className="bg-primary text-primary-fg inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium disabled:opacity-60"
      >
        {createMut.isPending && <Loader2 size={11} className="animate-spin" />}
        Adicionar
      </button>
    </form>
  );
}

function Next7Section({ tasks, readOnly }: { tasks: MeTask[]; readOnly?: boolean }) {
  return (
    <div>
      <p className="text-fg-muted px-3 pb-1 pt-3 text-[12px] font-medium sm:px-4">
        Próximos 7 dias
      </p>
      {tasks.map((t) => (
        <TarefaRow key={t.id} task={t} variant="next7" readOnly={readOnly} />
      ))}
    </div>
  );
}

function NoDateSection({ tasks, readOnly }: { tasks: MeTask[]; readOnly?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? tasks : tasks.slice(0, 5);
  return (
    <div>
      <p className="text-fg-muted px-3 pb-1 pt-3 text-[12px] font-medium sm:px-4">Sem data</p>
      {visible.map((t) => (
        <TarefaRow key={t.id} task={t} variant="noDate" readOnly={readOnly} />
      ))}
      {tasks.length > 5 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-primary hover:text-primary-hover px-4 py-2 text-[11px] font-medium"
        >
          {expanded ? 'Mostrar menos' : `Ver mais (${tasks.length - 5})`}
        </button>
      )}
    </div>
  );
}

/**
 * Quando há um dia selecionado no MiniCalendar, substitui as 4 seções
 * normais por uma única seção "Tarefas de DD/MM" com todas as tarefas
 * cuja dueDate é esse dia (independente do bucket original).
 */
function FilteredDaySection({
  tasks,
  day,
  onClearFilter,
  readOnly,
}: {
  tasks: MeTask[];
  day: string;
  onClearFilter: () => void;
  readOnly?: boolean;
}) {
  const [y, m, d] = day.split('-').map(Number);
  const label = new Date(y!, m! - 1, d!).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
  });
  const [doneOpen, setDoneOpen] = useState(false);
  const doneQuery = useQuery(meQueries.tasksDone(day));
  const doneTasks = doneQuery.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-3 sm:px-4">
        <p className="text-fg-muted text-[12px] font-medium">Tarefas de {label}</p>
        <button
          type="button"
          onClick={onClearFilter}
          className="text-fg-muted hover:text-fg inline-flex items-center gap-1 text-[11px] font-medium"
          aria-label="Limpar filtro do calendário"
        >
          <X size={12} />
          Limpar filtro
        </button>
      </div>
      {tasks.length === 0 && doneTasks.length === 0 ? (
        <p className="text-fg-subtle px-4 py-6 text-center text-[12px] italic">
          Nenhuma tarefa atribuída a você nesse dia.
        </p>
      ) : (
        <>
          {tasks.length === 0 ? (
            <p className="text-fg-subtle px-4 py-3 text-center text-[12px] italic">
              Sem tarefas pendentes neste dia.
            </p>
          ) : (
            tasks.map((t) => (
              <TarefaRow
                key={t.id}
                task={t}
                variant={inferVariantForDay(t.dueDate, day)}
                readOnly={readOnly}
              />
            ))
          )}

          {doneTasks.length > 0 && (
            <div className="border-border/40 border-t">
              <button
                type="button"
                onClick={() => setDoneOpen((v) => !v)}
                className="text-fg-muted hover:bg-bg-subtle/50 flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium sm:px-4"
                aria-expanded={doneOpen}
              >
                {doneOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                <Check size={13} className="text-success" />
                Concluídas ({doneTasks.length})
              </button>
              {doneOpen &&
                doneTasks.map((t) => (
                  <div key={t.id} className="opacity-70">
                    <TarefaRow
                      task={t}
                      variant={inferVariantForDay(t.dueDate, day)}
                      readOnly={readOnly}
                    />
                  </div>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Filtra todas as 4 listas pra retornar só as tarefas cuja dueDate cai
 * no dia selecionado (em fuso BRT — comparação por componentes locais).
 */
function filterTasksByDay(
  data: { overdue: MeTask[]; today: MeTask[]; next7: MeTask[]; noDate: MeTask[] },
  day: string,
): MeTask[] {
  const all = [...data.overdue, ...data.today, ...data.next7, ...data.noDate];
  return all.filter((t) => {
    if (!t.dueDate) return false;
    const dt = new Date(t.dueDate);
    const localKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    return localKey === day;
  });
}

function filterTasksByBoard(data: MeTasksResponse, boardId: string): MeTasksResponse {
  function pick(t: MeTask): boolean {
    if (t.kind === 'checklist') return t.checklist.card.boardId === boardId;
    return false; // standalone tasks não têm board — escondidas no filtro
  }
  return {
    overdue: data.overdue.filter(pick),
    today: data.today.filter(pick),
    next7: data.next7.filter(pick),
    noDate: data.noDate.filter(pick),
  };
}

function inferVariantForDay(
  iso: string | null,
  day: string,
): 'overdue' | 'today' | 'next7' | 'noDate' {
  if (!iso) return 'noDate';
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (day < todayKey) return 'overdue';
  if (day === todayKey) return 'today';
  return 'next7';
}
