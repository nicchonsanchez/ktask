'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';

import {
  timeTrackingQueries,
  type TimeEntrySource,
  type TimesheetFilter,
} from '@/lib/queries/time-tracking';
import { boardsQueries } from '@/lib/queries/boards';
import { orgMembersQuery } from '@/lib/queries/cards';
import { useAuthStore } from '@/stores/auth-store';
import { TimesheetFiltersBar } from '@/components/time-tracking/timesheet-filters-bar';
import { TimesheetSummaryCards } from '@/components/time-tracking/timesheet-summary-cards';
import { TimesheetTable } from '@/components/time-tracking/timesheet-table';
import { ManualEntryDialog } from '@/components/time-tracking/manual-entry-dialog';

interface UiFilters {
  source: TimeEntrySource | 'ALL';
  dateFrom: string;
  dateTo: string;
  userIds: string[];
  boardId: string | null;
}

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
}

export default function TimesheetPage() {
  const me = useAuthStore((s) => s.user);
  const [manualOpen, setManualOpen] = useState(false);

  const initialRange = useMemo(defaultRange, []);
  const [filters, setFilters] = useState<UiFilters>(() => ({
    source: 'ALL',
    dateFrom: initialRange.from,
    dateTo: initialRange.to,
    userIds: me ? [me.id] : [],
    boardId: null,
  }));

  // Sincroniza userIds com user logado quando ele carregar (caso me chegue depois)
  useEffect(() => {
    if (me && filters.userIds.length === 0) {
      setFilters((f) => ({ ...f, userIds: [me.id] }));
    }
  }, [me, filters.userIds.length]);

  const apiFilter: TimesheetFilter = {
    userIds: filters.userIds.length > 0 ? filters.userIds : undefined,
    source: filters.source === 'ALL' ? undefined : filters.source,
    dateFrom: filters.dateFrom ? `${filters.dateFrom}T00:00:00.000Z` : undefined,
    dateTo: filters.dateTo ? `${filters.dateTo}T23:59:59.999Z` : undefined,
    boardId: filters.boardId ?? undefined,
    limit: 20,
  };

  const summaryQuery = useQuery({ ...timeTrackingQueries.summary(apiFilter) });
  const timesheetQuery = useQuery({ ...timeTrackingQueries.timesheet(apiFilter) });
  const membersQuery = useQuery({ ...orgMembersQuery });
  const boardsQuery = useQuery({ ...boardsQueries.all() });

  return (
    <div className="container flex flex-col gap-5 py-5">
      <TimesheetFiltersBar
        filters={filters}
        onChange={setFilters}
        members={membersQuery.data ?? []}
        boards={boardsQuery.data ?? []}
        membersLoading={membersQuery.isLoading}
      />

      <TimesheetSummaryCards summary={summaryQuery.data ?? null} loading={summaryQuery.isLoading} />

      <section className="border-border/60 flex flex-col rounded-md border">
        <header className="border-border/60 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-fg text-sm font-semibold">Timesheet da organização</h2>
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium"
            >
              <Plus size={12} />
              Adicionar
            </button>
          </div>
          <div className="text-fg-muted text-[11px]">
            {timesheetQuery.isLoading
              ? 'Carregando…'
              : `${timesheetQuery.data?.items.length ?? 0} entrada${(timesheetQuery.data?.items.length ?? 0) === 1 ? '' : 's'} no período`}
          </div>
        </header>

        {timesheetQuery.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={18} className="text-fg-muted animate-spin" />
          </div>
        ) : (timesheetQuery.data?.items.length ?? 0) === 0 ? (
          <EmptyState />
        ) : (
          <TimesheetTable items={timesheetQuery.data?.items ?? []} />
        )}
      </section>

      <ManualEntryDialog open={manualOpen} onOpenChange={setManualOpen} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <p className="text-fg text-sm font-medium">Nenhuma entrada no período</p>
      <p className="text-fg-muted max-w-sm text-[12px] leading-relaxed">
        Ajuste os filtros acima ou registre tempo manualmente em um card. O cronômetro do header
        também grava aqui automaticamente.
      </p>
      <Link href="/quadros" className="text-primary mt-1 text-[12px] font-medium hover:underline">
        Ir para os fluxos
      </Link>
    </div>
  );
}
