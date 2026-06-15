'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  AlertCircle,
  Building2,
  CheckSquare,
  Filter,
  Loader2,
  UserMinus,
  Users,
} from 'lucide-react';

import { api } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { boardsQueries } from '@/lib/queries/boards';
import { membersQueries } from '@/lib/queries/members';
import { contactsQueries } from '@/lib/queries/contacts';
import {
  managementQueries,
  type ManagementTasksFilters,
  type ManagementTaskItem,
} from '@/lib/queries/management';
import { updateChecklistItem, cardsQueries } from '@/lib/queries/cards';
import { UserAvatar } from '@/components/user-avatar';
import { PRIORITY_META } from '@/components/board/checklist-item-pickers';
import type { OrgRole } from '@ktask/contracts';

interface CurrentOrg {
  myRole: OrgRole;
}

const PRIVILEGED_ROLES: OrgRole[] = ['OWNER', 'ADMIN', 'GESTOR'];

const DUE_STATUS_OPTIONS: Array<{ value: ManagementTasksFilters['dueStatus']; label: string }> = [
  { value: undefined, label: 'Qualquer prazo' },
  { value: 'overdue', label: 'Atrasadas' },
  { value: 'today', label: 'Vencem hoje' },
  { value: 'next7', label: 'Próximos 7 dias' },
  { value: 'noDate', label: 'Sem prazo' },
];

const DONE_FILTER_OPTIONS: Array<{ value: ManagementTasksFilters['doneFilter']; label: string }> = [
  { value: 'pending', label: 'Pendentes' },
  { value: 'done', label: 'Concluídas' },
  { value: 'all', label: 'Todas' },
];

/**
 * Visao Gerencial de TAREFAS (checklist items).
 *
 * Diferenca da visao de Cards: 1 linha por item. Foco no responsavel da
 * tarefa (assignee), nao do card. Default: pendentes.
 */
export default function VisaoGerencialTarefasPage() {
  const { user } = useAuthStore();

  const orgQuery = useQuery({
    queryKey: ['org', 'current'],
    queryFn: () => api.get<CurrentOrg>('/api/v1/organizations/current'),
    enabled: !!user,
  });

  const isPrivileged = orgQuery.data ? PRIVILEGED_ROLES.includes(orgQuery.data.myRole) : false;

  const [q, setQ] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [boardIds, setBoardIds] = useState<string[]>([]);
  const [dueStatus, setDueStatus] = useState<ManagementTasksFilters['dueStatus']>(undefined);
  const [doneFilter, setDoneFilter] = useState<ManagementTasksFilters['doneFilter']>('pending');
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    setPage(1);
  }, [q, assigneeIds, companyIds, boardIds, dueStatus, doneFilter, unassignedOnly]);

  const filters: ManagementTasksFilters = useMemo(
    () => ({
      q: q.trim() || undefined,
      assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
      companyIds: companyIds.length > 0 ? companyIds : undefined,
      boardIds: boardIds.length > 0 ? boardIds : undefined,
      dueStatus,
      doneFilter,
      unassignedOnly: unassignedOnly || undefined,
      page,
      pageSize,
    }),
    [q, assigneeIds, companyIds, boardIds, dueStatus, doneFilter, unassignedOnly, page],
  );

  const tasksQ = useQuery({ ...managementQueries.tasks(filters), enabled: isPrivileged });
  const boardsForFilter = useQuery({ ...boardsQueries.all(), enabled: isPrivileged });
  const membersQ = useQuery({ ...membersQueries.all(), enabled: isPrivileged });
  const companiesQ = useQuery({
    ...contactsQueries.list({ type: 'COMPANY' }),
    enabled: isPrivileged,
  });

  if (orgQuery.isLoading || !orgQuery.data) {
    return (
      <div className="text-fg-muted flex items-center gap-2 p-6 text-sm">
        <Loader2 size={14} className="animate-spin" />
        Carregando…
      </div>
    );
  }

  if (!isPrivileged) {
    return (
      <div className="container mx-auto max-w-md py-12 text-center">
        <CheckSquare size={32} className="text-fg-muted mx-auto mb-3" />
        <h1 className="text-lg font-semibold">Visão Gerencial — Tarefas</h1>
        <p className="text-fg-muted mt-2 text-sm">Exclusiva para gestores.</p>
      </div>
    );
  }

  const items = tasksQ.data?.items ?? [];
  const metrics = tasksQ.data?.metrics;
  const total = tasksQ.data?.total ?? 0;
  const hasFilters =
    q.trim() !== '' ||
    assigneeIds.length > 0 ||
    companyIds.length > 0 ||
    boardIds.length > 0 ||
    dueStatus !== undefined ||
    doneFilter !== 'pending' ||
    unassignedOnly;

  function clearFilters() {
    setQ('');
    setAssigneeIds([]);
    setCompanyIds([]);
    setBoardIds([]);
    setDueStatus(undefined);
    setDoneFilter('pending');
    setUnassignedOnly(false);
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6">
      <header className="mb-5 flex items-center gap-3">
        <CheckSquare size={22} className="text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Visão Gerencial — Tarefas</h1>
          <p className="text-fg-muted text-sm">
            Cada linha é um item de checklist. Responsável aqui é o dono da tarefa.
          </p>
        </div>
      </header>

      <section className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard
          icon={<CheckSquare size={14} />}
          label="Pendentes"
          value={metrics?.pending ?? 0}
        />
        <MetricCard
          icon={<AlertCircle size={14} className="text-danger" />}
          label="Atrasadas"
          value={metrics?.overdue ?? 0}
          accent={metrics?.overdue ? 'danger' : undefined}
        />
        <MetricCard
          icon={<UserMinus size={14} />}
          label="Sem responsável"
          value={metrics?.unassigned ?? 0}
        />
        <MetricCard
          icon={<Users size={14} />}
          label="Responsáveis"
          value={metrics?.assignees ?? 0}
        />
      </section>

      <div className="border-border bg-bg-subtle mb-4 flex flex-wrap items-center gap-2 rounded-md border p-3">
        <Filter size={14} className="text-fg-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar tarefa…"
          className="border-border bg-bg w-56 rounded-md border px-2 py-1.5 text-xs"
        />
        <select
          value={doneFilter}
          onChange={(e) => setDoneFilter(e.target.value as ManagementTasksFilters['doneFilter'])}
          className="border-border bg-bg rounded-md border px-2 py-1.5 text-xs"
        >
          {DONE_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={dueStatus ?? ''}
          onChange={(e) =>
            setDueStatus((e.target.value || undefined) as ManagementTasksFilters['dueStatus'])
          }
          className="border-border bg-bg rounded-md border px-2 py-1.5 text-xs"
        >
          {DUE_STATUS_OPTIONS.map((o) => (
            <option key={o.label} value={o.value ?? ''}>
              {o.label}
            </option>
          ))}
        </select>
        <MultiSelect
          label="Responsável"
          options={(membersQ.data ?? []).map((m) => ({ value: m.user.id, label: m.user.name }))}
          selected={assigneeIds}
          onChange={setAssigneeIds}
        />
        <MultiSelect
          label="Cliente"
          options={(companiesQ.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          selected={companyIds}
          onChange={setCompanyIds}
        />
        <MultiSelect
          label="Quadro"
          options={(boardsForFilter.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
          selected={boardIds}
          onChange={setBoardIds}
        />
        <label className="text-fg-muted inline-flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={unassignedOnly}
            onChange={(e) => setUnassignedOnly(e.target.checked)}
            className="accent-primary"
          />
          Sem responsável
        </label>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-fg-muted hover:text-fg ml-auto text-xs underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {tasksQ.isLoading ? (
        <div className="text-fg-muted flex items-center justify-center gap-2 py-12 text-sm">
          <Loader2 size={14} className="animate-spin" /> Carregando tarefas…
        </div>
      ) : items.length === 0 ? (
        <div className="text-fg-muted py-12 text-center text-sm">
          Nenhuma tarefa com esses filtros.
        </div>
      ) : (
        <TasksTable items={items} />
      )}

      {total > pageSize && (
        <div className="mt-4 flex items-center justify-between text-xs">
          <span className="text-fg-muted">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="border-border hover:bg-bg-muted rounded-md border px-2 py-1 disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={page * pageSize >= total}
              className="border-border hover:bg-bg-muted rounded-md border px-2 py-1 disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: 'danger';
}) {
  return (
    <div
      className={`border-border bg-bg rounded-md border p-3 ${
        accent === 'danger' ? 'border-danger/40' : ''
      }`}
    >
      <div className="text-fg-muted flex items-center gap-1.5 text-[11px]">
        {icon}
        {label}
      </div>
      <div className="text-fg mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function TasksTable({ items }: { items: ManagementTaskItem[] }) {
  const queryClient = useQueryClient();
  const toggleMut = useMutation({
    mutationFn: ({ id, isDone }: { id: string; isDone: boolean }) =>
      updateChecklistItem(id, { isDone }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['management', 'tasks'] });
      const cardId = items.find((it) => it.id === id)?.card.id;
      if (cardId) {
        queryClient.invalidateQueries({ queryKey: cardsQueries.detail(cardId).queryKey });
      }
    },
  });

  return (
    <div className="border-border bg-bg overflow-hidden rounded-md border">
      <table className="w-full text-xs">
        <thead className="bg-bg-subtle text-fg-muted text-[11px] uppercase tracking-wide">
          <tr>
            <th className="w-8 px-3 py-2"></th>
            <th className="px-3 py-2 text-left font-semibold">Tarefa</th>
            <th className="px-3 py-2 text-left font-semibold">Responsável</th>
            <th className="px-3 py-2 text-left font-semibold">Card</th>
            <th className="px-3 py-2 text-left font-semibold">Cliente</th>
            <th className="px-3 py-2 text-left font-semibold">Prazo</th>
            <th className="px-3 py-2 text-left font-semibold">Quadro</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const isOverdue =
              !it.isDone && it.dueDate && new Date(it.dueDate).getTime() < Date.now() - 86400000;
            const priorityMeta = PRIORITY_META[it.priority];
            return (
              <tr
                key={it.id}
                className={`border-border hover:bg-bg-muted/40 border-t ${
                  isOverdue ? 'border-l-danger border-l-2' : ''
                }`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={it.isDone}
                    onChange={(e) => toggleMut.mutate({ id: it.id, isDone: e.target.checked })}
                    className="accent-primary cursor-pointer"
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    {priorityMeta && it.priority !== 'NONE' && (
                      <span
                        title={priorityMeta.label}
                        className={`inline-block size-2 shrink-0 rounded-full ${priorityMeta.dotClass}`}
                      />
                    )}
                    <span className={it.isDone ? 'text-fg-muted line-through' : 'text-fg'}>
                      {it.text}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  {it.assignee ? (
                    <div className="flex items-center gap-1.5">
                      <UserAvatar
                        name={it.assignee.name}
                        userId={it.assignee.id}
                        avatarUrl={it.assignee.avatarUrl}
                        size="sm"
                      />
                      <span className="text-fg-muted">{it.assignee.name}</span>
                    </div>
                  ) : (
                    <span className="text-fg-subtle">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/visao-gerencial/tarefas?card=${it.card.id}`}
                    className="text-fg hover:text-primary inline-flex items-center gap-1.5 font-medium"
                  >
                    {it.card.cardColor && (
                      <span
                        aria-hidden
                        className="inline-block size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: it.card.cardColor }}
                      />
                    )}
                    <span className="line-clamp-1">{it.card.title}</span>
                  </Link>
                  <p className="text-fg-subtle mt-0.5 text-[10px]">{it.card.list.name}</p>
                </td>
                <td className="px-3 py-2">
                  {it.card.companies.length === 0 ? (
                    <span className="text-fg-subtle">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {it.card.companies.slice(0, 2).map((c) => (
                        <span
                          key={c.id}
                          className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] text-purple-900 dark:bg-purple-900/30 dark:text-purple-200"
                        >
                          <Building2 size={9} />
                          {c.name}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  {it.dueDate ? (
                    <span className={isOverdue ? 'text-danger font-semibold' : 'text-fg-muted'}>
                      {new Date(it.dueDate).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </span>
                  ) : (
                    <span className="text-fg-subtle">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span
                    style={{
                      borderLeftColor: it.card.board.color ?? undefined,
                    }}
                    className={`text-fg-muted inline-block ${
                      it.card.board.color ? 'border-l-2 pl-2' : ''
                    }`}
                  >
                    {it.card.board.name}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="border-border bg-bg hover:bg-bg-muted inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs"
      >
        {label}
        {selected.length > 0 && (
          <span className="bg-primary text-primary-fg rounded-full px-1.5 text-[10px]">
            {selected.length}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="border-border bg-bg absolute right-0 top-full z-20 mt-1 flex max-h-72 w-56 flex-col overflow-y-auto rounded-md border p-1 shadow-lg">
            {options.length === 0 ? (
              <p className="text-fg-muted px-2 py-1.5 text-xs">Nenhum.</p>
            ) : (
              options.map((o) => {
                const checked = selected.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggle(o.value)}
                    className="text-fg hover:bg-bg-muted flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs"
                  >
                    <input type="checkbox" checked={checked} readOnly className="accent-primary" />
                    {o.label}
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
