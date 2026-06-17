'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ChevronLeft, Loader2, Search } from 'lucide-react';
import type { OrgRole } from '@ktask/contracts';

import { api } from '@/lib/api-client';
import { managementQueries, type ManagementFilters } from '@/lib/queries/management';
import { useAuthStore } from '@/stores/auth-store';
import { CustomDateRange } from '@/components/management/custom-date-range';

import { CardsTable, PaginationBar } from '../cards/page';

const DATE_FILTER_OPTIONS: Array<{ value: 'all' | 'custom'; label: string }> = [
  { value: 'all', label: 'Todo o período' },
  { value: 'custom', label: 'Personalizado…' },
];

interface CurrentOrg {
  myRole: OrgRole;
}

const PRIVILEGED_ROLES: OrgRole[] = ['OWNER', 'ADMIN', 'GESTOR'];

/**
 * Tela secundaria — lista apenas cards em colunas marcadas como
 * `isFinalList = true` (ex: "Finalizado"). Mesmo padrao da
 * `/arquivados`. Util pra revisar entregas recentes sem poluir a
 * visao principal de "em aberto".
 */
export default function VisaoGerencialFinalizadosPage() {
  const { user } = useAuthStore();
  const orgQuery = useQuery({
    queryKey: ['org', 'current'],
    queryFn: () => api.get<CurrentOrg>('/api/v1/organizations/current'),
    enabled: !!user,
  });

  const isPrivileged = orgQuery.data ? PRIVILEGED_ROLES.includes(orgQuery.data.myRole) : false;

  const [q, setQ] = useState('');
  // Filtro de periodo: 'all' = sem range (default), 'custom' = range explicito.
  // Default 'completed' faz mais sentido em /finalizados: o gestor quase sempre
  // pergunta "o que concluimos no periodo X?", nao "o que tinha prazo no X?".
  // Toggle continua disponivel pra revisar entregas pelo prazo original.
  const [dateMode, setDateMode] = useState<'all' | 'custom'>('all');
  const [dateField, setDateField] = useState<'due' | 'completed'>('completed');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    setPage(1);
  }, [q, dateMode, dateField, dateFrom, dateTo, pageSize]);

  const filters: ManagementFilters = useMemo(() => {
    const isCustom = dateMode === 'custom' && (dateFrom || dateTo);
    return {
      q: q.trim() || undefined,
      dueStatus: isCustom ? 'custom' : undefined,
      dateFrom: isCustom && dateFrom ? dateFrom : undefined,
      dateTo: isCustom && dateTo ? dateTo : undefined,
      dateField: isCustom ? dateField : undefined,
      page,
      pageSize,
    };
  }, [q, dateMode, dateField, dateFrom, dateTo, page, pageSize]);

  const cardsQ = useQuery({
    ...managementQueries.finalized(filters),
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
        <CheckCircle2 size={32} className="text-fg-muted mx-auto mb-3" />
        <h1 className="text-lg font-semibold">Cards finalizados</h1>
        <p className="text-fg-muted mt-2 text-sm">Acesso restrito a gestores.</p>
      </div>
    );
  }

  const items = cardsQ.data?.items ?? [];

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/visao-gerencial/cards"
            className="text-fg-muted hover:text-fg inline-flex items-center gap-1 text-sm"
          >
            <ChevronLeft size={14} />
            Visão Gerencial
          </Link>
          <span className="text-fg-subtle">/</span>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-fg-muted" />
            <h1 className="text-lg font-semibold">Cards finalizados</h1>
          </div>
        </div>
      </header>

      <section className="border-border bg-bg-subtle/40 mb-4 flex flex-wrap items-center gap-2 rounded-md border p-3">
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

        <select
          value={dateMode}
          onChange={(e) => setDateMode(e.target.value as 'all' | 'custom')}
          className="border-border bg-bg focus-visible:ring-primary rounded-md border px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2"
        >
          {DATE_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {dateMode === 'custom' && (
          <CustomDateRange
            from={dateFrom}
            to={dateTo}
            onChangeFrom={setDateFrom}
            onChangeTo={setDateTo}
            dateField={dateField}
            onChangeField={setDateField}
          />
        )}

        <span className="text-fg-muted text-[11px]">
          {cardsQ.data?.total ?? 0} card{(cardsQ.data?.total ?? 0) === 1 ? '' : 's'}
        </span>
      </section>

      {cardsQ.isLoading ? (
        <div className="text-fg-muted flex items-center gap-2 py-12 text-sm">
          <Loader2 size={14} className="animate-spin" />
          Carregando…
        </div>
      ) : items.length === 0 ? (
        <div className="text-fg-muted py-12 text-center text-sm">
          Nenhum card finalizado encontrado.
        </div>
      ) : (
        <>
          <CardsTable items={items} showCompletedAt />
          <PaginationBar
            total={cardsQ.data?.total ?? 0}
            page={page}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={setPageSize}
          />
        </>
      )}
    </div>
  );
}
