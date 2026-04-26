'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Loader2, Plus } from 'lucide-react';

import { meQueries, bulkRescheduleToday, type MeTask } from '@/lib/queries/me';
import { useConfirm, useNotify } from '@/components/ui/dialogs';
import { TarefaRow } from './tarefa-row';

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
export function TarefasPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const tasksQuery = useQuery({ ...meQueries.tasks() });
  const data = tasksQuery.data;

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
          <button
            type="button"
            disabled
            title="Adicionar tarefa rápida (em breve)"
            aria-label="Adicionar tarefa"
            className="bg-primary-subtle text-primary inline-flex size-6 items-center justify-center rounded transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="flex flex-col">
          {tasksQuery.isLoading && (
            <div className="text-fg-muted flex items-center justify-center gap-2 py-8 text-sm">
              <Loader2 size={14} className="animate-spin" />
              Carregando…
            </div>
          )}

          {!tasksQuery.isLoading && data && (
            <>
              {data.overdue.length > 0 && <OverdueSection tasks={data.overdue} />}
              <TodaySection tasks={data.today} />
              {data.next7.length > 0 && <Next7Section tasks={data.next7} />}
              {data.noDate.length > 0 && <NoDateSection tasks={data.noDate} />}

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

function OverdueSection({ tasks }: { tasks: MeTask[] }) {
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
        <button
          type="button"
          onClick={handleRescheduleAll}
          disabled={rescheduleMut.isPending}
          className="text-primary hover:text-primary-hover text-[11px] font-medium disabled:opacity-60"
        >
          {rescheduleMut.isPending ? 'Atualizando…' : 'Atualizar todas as tarefas para hoje'}
        </button>
      </div>
      {tasks.map((t) => (
        <TarefaRow key={t.id} task={t} variant="overdue" />
      ))}
    </div>
  );
}

function TodaySection({ tasks }: { tasks: MeTask[] }) {
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
        <p className="text-fg-subtle px-4 py-3 text-[12px] italic">
          Sem tarefas pra hoje. Bom dia tranquilo.
        </p>
      ) : (
        tasks.map((t) => <TarefaRow key={t.id} task={t} variant="today" />)
      )}
    </div>
  );
}

function Next7Section({ tasks }: { tasks: MeTask[] }) {
  return (
    <div>
      <p className="text-fg-muted px-3 pb-1 pt-3 text-[12px] font-medium sm:px-4">
        Próximos 7 dias
      </p>
      {tasks.map((t) => (
        <TarefaRow key={t.id} task={t} variant="next7" />
      ))}
    </div>
  );
}

function NoDateSection({ tasks }: { tasks: MeTask[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? tasks : tasks.slice(0, 5);
  return (
    <div>
      <p className="text-fg-muted px-3 pb-1 pt-3 text-[12px] font-medium sm:px-4">Sem data</p>
      {visible.map((t) => (
        <TarefaRow key={t.id} task={t} variant="noDate" />
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
