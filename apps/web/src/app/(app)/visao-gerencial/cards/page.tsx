'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  LayoutDashboard,
  List as ListIcon,
  Loader2,
  Search,
  Trello,
  Users,
  X,
} from 'lucide-react';
import type { OrgRole } from '@ktask/contracts';

import { api } from '@/lib/api-client';
import {
  managementQueries,
  type ManagementCardItem,
  type ManagementFilters,
} from '@/lib/queries/management';
import { boardsQueries } from '@/lib/queries/boards';
import { contactsQueries } from '@/lib/queries/contacts';
import { membersQueries } from '@/lib/queries/members';
import { useAuthStore } from '@/stores/auth-store';
import { UserAvatar } from '@/components/user-avatar';
import { ManagementKanban } from '@/components/management/management-kanban';
import { CustomDateRange } from '@/components/management/custom-date-range';

interface CurrentOrg {
  id: string;
  myRole: OrgRole;
}

const PRIVILEGED_ROLES: OrgRole[] = ['OWNER', 'ADMIN', 'GESTOR'];

const CARD_STATUS_OPTIONS: Array<{
  value: NonNullable<ManagementFilters['cardStatuses']>[number];
  label: string;
}> = [
  { value: 'ACTIVE', label: 'Ativos' },
  { value: 'WAITING', label: 'Aguardando' },
  { value: 'COMPLETED', label: 'Concluídos' },
  { value: 'CANCELED', label: 'Cancelados' },
];

const DUE_STATUS_OPTIONS: Array<{ value: ManagementFilters['dueStatus']; label: string }> = [
  { value: undefined, label: 'Qualquer prazo' },
  { value: 'overdue', label: 'Atrasados' },
  { value: 'today', label: 'Vence hoje' },
  { value: 'next7', label: 'Próximos 7 dias' },
  { value: 'noDate', label: 'Sem data' },
  { value: 'custom', label: 'Personalizado…' },
];

/**
 * Visão Gerencial Consolidada.
 *
 * Tabela de cards de todos os boards aos quais o gestor tem acesso, com
 * filtros server-side (cliente / responsável / quadro / prazo / busca) e
 * métricas agregadas no topo.
 *
 * Acesso: OWNER | ADMIN | GESTOR. Demais roles veem mensagem de bloqueio.
 *
 * Nota: kanban com colunas unificadas aguarda decisão (tarefas-md/17).
 * Por enquanto entrega lista plana — funciona pra qualquer modelo de
 * colunas que vier depois.
 */
export default function VisaoGerencialPage() {
  const { user } = useAuthStore();

  const orgQuery = useQuery({
    queryKey: ['org', 'current'],
    queryFn: () => api.get<CurrentOrg>('/api/v1/organizations/current'),
    enabled: !!user,
  });

  const isPrivileged = orgQuery.data ? PRIVILEGED_ROLES.includes(orgQuery.data.myRole) : false;

  const [view, setView] = useState<'lista' | 'kanban'>('lista');
  const [q, setQ] = useState('');
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [boardIds, setBoardIds] = useState<string[]>([]);
  const [dueStatus, setDueStatus] = useState<ManagementFilters['dueStatus']>(undefined);
  // Range custom — so usado quando dueStatus = 'custom'. Inputs YYYY-MM-DD do
  // tipo date nativo (zero deps, validacao do browser). Range aberto eh OK:
  // backend aceita so `from`, so `to`, ou nenhum (degenera em sem filtro).
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [cardStatuses, setCardStatuses] = useState<NonNullable<ManagementFilters['cardStatuses']>>(
    [],
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Reset pra pagina 1 sempre que o conjunto de filtros mudar — evita
  // "tela vazia" quando o filtro novo tem menos resultados que a pagina atual.
  useEffect(() => {
    setPage(1);
  }, [q, companyIds, userIds, boardIds, dueStatus, dateFrom, dateTo, cardStatuses, pageSize]);

  // Quando o user troca pra 'Personalizado' sem ter setado nenhuma data,
  // o backend ignora — entao a tela continua mostrando o conjunto anterior.
  // Para evitar "filtro fantasma" so envia o dueStatus quando ha algo de
  // verdade pra filtrar.
  const dueStatusToSend = dueStatus === 'custom' && !dateFrom && !dateTo ? undefined : dueStatus;

  const filters: ManagementFilters = useMemo(
    () => ({
      q: q.trim() || undefined,
      companyIds: companyIds.length > 0 ? companyIds : undefined,
      userIds: userIds.length > 0 ? userIds : undefined,
      boardIds: boardIds.length > 0 ? boardIds : undefined,
      cardStatuses: cardStatuses.length > 0 ? cardStatuses : undefined,
      dueStatus: dueStatusToSend,
      dateFrom: dueStatus === 'custom' && dateFrom ? dateFrom : undefined,
      dateTo: dueStatus === 'custom' && dateTo ? dateTo : undefined,
      page,
      pageSize,
    }),
    [
      q,
      companyIds,
      userIds,
      boardIds,
      cardStatuses,
      dueStatus,
      dueStatusToSend,
      dateFrom,
      dateTo,
      page,
      pageSize,
    ],
  );

  const cardsQ = useQuery({
    ...managementQueries.cards(filters),
    enabled: isPrivileged,
    // Visao gerencial nao escuta socket por board (gestor olha varios boards
    // ao mesmo tempo). Refetch periodico + ao voltar foco resolve sem precisar
    // joinar todas as rooms. Janela 60s eh suficiente pra "voce ve atualizar
    // sem F5" sem martelar API.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const boardsForFilter = useQuery({ ...boardsQueries.all() });
  const companiesQ = useQuery({
    ...contactsQueries.list({ type: 'COMPANY' }),
    enabled: isPrivileged,
  });
  const membersQ = useQuery({ ...membersQueries.all(), enabled: isPrivileged });

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
        <LayoutDashboard size={32} className="text-fg-muted mx-auto mb-3" />
        <h1 className="text-lg font-semibold">Visão Gerencial</h1>
        <p className="text-fg-muted mt-2 text-sm">
          Esta tela é exclusiva para gestores. Fale com um administrador da organização se você
          precisa de acesso.
        </p>
      </div>
    );
  }

  const items = cardsQ.data?.items ?? [];
  const metrics = cardsQ.data?.metrics;
  const hasFilters =
    q.trim() !== '' ||
    companyIds.length > 0 ||
    userIds.length > 0 ||
    boardIds.length > 0 ||
    cardStatuses.length > 0 ||
    dueStatus !== undefined;

  function clearFilters() {
    setQ('');
    setCompanyIds([]);
    setUserIds([]);
    setBoardIds([]);
    setCardStatuses([]);
    setDueStatus(undefined);
    setDateFrom('');
    setDateTo('');
  }

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <LayoutDashboard size={22} className="text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Visão Gerencial</h1>
            <p className="text-fg-muted text-sm">
              Cards de todos os quadros num só lugar — sem precisar simular conta.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle Lista | Kanban */}
          <div className="border-border inline-flex overflow-hidden rounded-md border">
            <button
              type="button"
              onClick={() => setView('lista')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium ${
                view === 'lista' ? 'bg-primary text-primary-fg' : 'hover:bg-bg-muted'
              }`}
            >
              <ListIcon size={13} /> Lista
            </button>
            <button
              type="button"
              onClick={() => setView('kanban')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium ${
                view === 'kanban' ? 'bg-primary text-primary-fg' : 'hover:bg-bg-muted'
              }`}
            >
              <Trello size={13} /> Kanban
            </button>
          </div>
          <Link
            href="/visao-gerencial/finalizados"
            className="border-border hover:bg-bg-muted inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium"
          >
            <CheckCircle2 size={13} />
            Finalizados
          </Link>
          <Link
            href="/visao-gerencial/arquivados"
            className="border-border hover:bg-bg-muted inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium"
          >
            <Archive size={13} />
            Arquivados
          </Link>
        </div>
      </header>

      {view === 'kanban' && <ManagementKanban />}

      {view === 'lista' && (
        <>
          {/* Métricas */}
          <section className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricCard
              icon={<LayoutDashboard size={14} />}
              label="Cards em aberto"
              value={metrics?.total ?? 0}
              loading={cardsQ.isLoading}
            />
            <MetricCard
              icon={<AlertTriangle size={14} />}
              label="Atrasados"
              value={metrics?.overdue ?? 0}
              tone={metrics && metrics.overdue > 0 ? 'danger' : 'default'}
              loading={cardsQ.isLoading}
            />
            <MetricCard
              icon={<Users size={14} />}
              label="Colaboradores"
              value={metrics?.collaborators ?? 0}
              loading={cardsQ.isLoading}
            />
            <MetricCard
              icon={<Building2 size={14} />}
              label="Clientes"
              value={metrics?.clients ?? 0}
              loading={cardsQ.isLoading}
            />
          </section>

          {/* Filtros */}
          <section className="border-border bg-bg-subtle/40 mb-4 flex flex-col gap-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search
                  size={13}
                  className="text-fg-muted pointer-events-none absolute left-2 top-1/2 -translate-y-1/2"
                />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar pelo título…"
                  className="border-border bg-bg focus-visible:ring-primary w-full rounded-md border py-1.5 pl-7 pr-2 text-xs focus-visible:outline-none focus-visible:ring-2"
                />
              </div>

              <FilterMultiSelect
                icon={<Building2 size={12} />}
                label="Cliente"
                options={(companiesQ.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
                selected={companyIds}
                onChange={setCompanyIds}
              />

              <FilterMultiSelect
                icon={<Users size={12} />}
                label="Responsável"
                options={(membersQ.data ?? []).map((m) => ({
                  value: m.userId,
                  label: m.user.name,
                }))}
                selected={userIds}
                onChange={setUserIds}
              />

              <FilterMultiSelect
                icon={<LayoutDashboard size={12} />}
                label="Quadro"
                options={(boardsForFilter.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
                selected={boardIds}
                onChange={setBoardIds}
              />

              <select
                value={dueStatus ?? ''}
                onChange={(e) =>
                  setDueStatus((e.target.value || undefined) as ManagementFilters['dueStatus'])
                }
                className="border-border bg-bg focus-visible:ring-primary rounded-md border px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2"
              >
                {DUE_STATUS_OPTIONS.map((o) => (
                  <option key={o.label} value={o.value ?? ''}>
                    {o.label}
                  </option>
                ))}
              </select>

              {dueStatus === 'custom' && (
                <CustomDateRange
                  from={dateFrom}
                  to={dateTo}
                  onChangeFrom={setDateFrom}
                  onChangeTo={setDateTo}
                />
              )}

              <FilterMultiSelect
                icon={<CheckCircle2 size={12} />}
                label="Status"
                options={CARD_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                selected={cardStatuses}
                onChange={(next) =>
                  setCardStatuses(next as NonNullable<ManagementFilters['cardStatuses']>)
                }
              />

              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-fg-muted hover:text-fg inline-flex items-center gap-1 rounded px-2 py-1 text-[11px]"
                >
                  <X size={11} /> Limpar
                </button>
              )}
            </div>
          </section>

          {/* Tabela */}
          {cardsQ.isLoading ? (
            <div className="text-fg-muted flex items-center gap-2 py-12 text-sm">
              <Loader2 size={14} className="animate-spin" />
              Carregando cards…
            </div>
          ) : items.length === 0 ? (
            <div className="text-fg-muted py-12 text-center text-sm">
              <Filter size={20} className="mx-auto mb-2 opacity-50" />
              Nenhum card encontrado com esses filtros.
            </div>
          ) : (
            <>
              <CardsTable items={items} />
              <PaginationBar
                total={cardsQ.data?.total ?? 0}
                page={page}
                pageSize={pageSize}
                onPage={setPage}
                onPageSize={setPageSize}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Barra de paginacao reutilizavel. Mostra "X-Y de Z", selector de
 * pageSize (50/100/200) e botoes anterior/proximo. Otimizada pra
 * teclado: anterior/proximo respeitam disabled quando nao ha mais
 * pagina nesse sentido.
 */
export function PaginationBar({
  total,
  page,
  pageSize,
  onPage,
  onPageSize,
}: {
  total: number;
  page: number;
  pageSize: number;
  onPage: (n: number) => void;
  onPageSize: (n: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="border-border mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
      <div className="text-fg-muted">
        Mostrando <span className="text-fg font-medium">{start}</span>–
        <span className="text-fg font-medium">{end}</span> de{' '}
        <span className="text-fg font-medium">{total}</span>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-fg-muted inline-flex items-center gap-1">
          <span>por página:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="border-border bg-bg rounded-md border px-1 py-0.5 text-[11px]"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </label>
        <div className="border-border bg-bg flex items-center gap-0.5 rounded-md border">
          <button
            type="button"
            onClick={() => onPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="text-fg-muted hover:text-fg p-1 disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Página anterior"
          >
            <ChevronLeft size={13} />
          </button>
          <span className="text-fg-muted px-1 tabular-nums">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="text-fg-muted hover:text-fg p-1 disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Próxima página"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone = 'default',
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: 'default' | 'danger';
  loading?: boolean;
}) {
  return (
    <div
      className={`border-border bg-bg flex items-center gap-3 rounded-md border px-3 py-2.5 ${
        tone === 'danger' ? 'border-danger/40' : ''
      }`}
    >
      <span
        className={`shrink-0 ${tone === 'danger' ? 'text-danger' : 'text-fg-muted'}`}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-fg-muted text-[11px] leading-tight">{label}</p>
        <p
          className={`text-lg font-semibold leading-tight ${
            tone === 'danger' ? 'text-danger' : 'text-fg'
          }`}
        >
          {loading ? '—' : value}
        </p>
      </div>
    </div>
  );
}

function FilterMultiSelect({
  icon,
  label,
  options,
  selected,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`border-border bg-bg hover:bg-bg-muted inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs ${
          selected.length > 0 ? 'border-primary/50 text-fg' : 'text-fg-muted'
        }`}
      >
        {icon}
        <span>{label}</span>
        {selected.length > 0 && (
          <span className="bg-primary text-primary-fg rounded-full px-1.5 text-[10px] font-semibold">
            {selected.length}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="border-border bg-bg absolute left-0 top-full z-20 mt-1 w-64 rounded-md border shadow-lg">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Buscar ${label.toLowerCase()}…`}
              className="border-border w-full border-b bg-transparent px-2 py-1.5 text-xs focus:outline-none"
              autoFocus
            />
            <ul className="max-h-56 overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <li className="text-fg-muted px-2 py-2 text-center text-[11px]">Nenhuma opção.</li>
              ) : (
                filtered.map((o) => {
                  const on = selected.includes(o.value);
                  return (
                    <li key={o.value}>
                      <button
                        type="button"
                        onClick={() => toggle(o.value)}
                        className="hover:bg-bg-muted flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => undefined}
                          tabIndex={-1}
                          className="pointer-events-none"
                        />
                        <span className="truncate">{o.label}</span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

export function CardsTable({
  items,
  showCompletedAt = false,
}: {
  items: ManagementCardItem[];
  /**
   * Quando true, renderiza coluna "Finalizado em" no lugar de "Prazo".
   * Usado na tela /finalizados — prazo eh irrelevante quando o card ja
   * foi concluido; o que importa eh QUANDO foi.
   */
  showCompletedAt?: boolean;
}) {
  return (
    <div className="border-border overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="bg-bg-subtle text-fg-muted text-[11px] uppercase tracking-wide">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Título</th>
            <th className="px-3 py-2 text-left font-semibold">Cliente</th>
            <th className="px-3 py-2 text-left font-semibold">Responsável</th>
            <th className="px-3 py-2 text-left font-semibold">
              {showCompletedAt ? 'Finalizado em' : 'Prazo'}
            </th>
            <th className="px-3 py-2 text-left font-semibold">Coluna</th>
            <th className="px-3 py-2 text-left font-semibold">Quadro</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <CardRow key={c.id} card={c} showCompletedAt={showCompletedAt} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CardRow({
  card,
  showCompletedAt = false,
}: {
  card: ManagementCardItem;
  showCompletedAt?: boolean;
}) {
  const overdue = isOverdue(card.dueDate, card.status);
  return (
    <tr
      className={`border-border hover:bg-bg-muted/40 border-t ${
        overdue ? 'border-l-danger border-l-2' : ''
      }`}
    >
      <td className="px-3 py-2">
        <Link
          href={`/visao-gerencial/cards?card=${card.id}`}
          className="text-fg hover:text-primary inline-flex items-center gap-1.5 font-medium"
        >
          {card.cardColor && (
            <span
              aria-hidden
              className="inline-block size-2 shrink-0 rounded-full"
              style={{ backgroundColor: card.cardColor }}
            />
          )}
          <span className="line-clamp-2">{card.title}</span>
        </Link>
        {card.otherFlowsCount > 0 && (
          <span className="text-fg-subtle ml-1 text-[10px]">+{card.otherFlowsCount} fluxos</span>
        )}
      </td>
      <td className="px-3 py-2">
        {card.companies.length === 0 ? (
          <span className="text-fg-subtle">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {card.companies.slice(0, 2).map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] text-purple-900 dark:bg-purple-900/30 dark:text-purple-200"
              >
                <Building2 size={9} />
                {c.name}
              </span>
            ))}
            {card.companies.length > 2 && (
              <span className="text-fg-muted text-[10px]">+{card.companies.length - 2}</span>
            )}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center -space-x-1.5">
          {card.lead && (
            <UserAvatar
              name={card.lead.name}
              userId={card.lead.id}
              avatarUrl={card.lead.avatarUrl}
              size="sm"
            />
          )}
          {card.members
            .filter((m) => m.id !== card.lead?.id)
            .slice(0, 3)
            .map((m) => (
              <UserAvatar
                key={m.id}
                name={m.name}
                userId={m.id}
                avatarUrl={m.avatarUrl}
                size="sm"
              />
            ))}
          {card.members.length === 0 && !card.lead && <span className="text-fg-subtle">—</span>}
        </div>
      </td>
      {showCompletedAt ? (
        <td className="text-fg-muted px-3 py-2">
          {card.completedAt ? (
            <span className="inline-flex items-center gap-1">
              <CalendarClock size={11} />
              {formatDate(card.completedAt)}
            </span>
          ) : (
            <span className="text-fg-subtle">—</span>
          )}
        </td>
      ) : (
        <td className={`px-3 py-2 ${overdue ? 'text-danger font-medium' : 'text-fg-muted'}`}>
          {card.dueDate ? (
            <span className="inline-flex items-center gap-1">
              <CalendarClock size={11} />
              {formatDate(card.dueDate)}
            </span>
          ) : (
            <span className="text-fg-subtle">—</span>
          )}
        </td>
      )}
      <td className="text-fg-muted px-3 py-2">{card.list.name}</td>
      <td className="px-3 py-2">
        <span
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
          style={{ backgroundColor: card.board.color ?? '#6b7280', color: '#fff' }}
        >
          {card.board.name}
        </span>
      </td>
    </tr>
  );
}

export function isOverdue(dueDate: string | null, status: ManagementCardItem['status']): boolean {
  if (!dueDate) return false;
  // COMPLETED e CANCELED nao demandam mais acao — nao pintam como atrasado.
  if (status === 'COMPLETED' || status === 'CANCELED') return false;
  return new Date(dueDate).getTime() < startOfDayLocal();
}

function startOfDayLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
