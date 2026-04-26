'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, Plus } from 'lucide-react';

import {
  formatDuration,
  timeTrackingQueries,
  type TimeEntrySource,
  type TimesheetFilter,
  type TimesheetItem,
} from '@/lib/queries/time-tracking';
import { boardsQueries } from '@/lib/queries/boards';
import { orgMembersQuery } from '@/lib/queries/cards';
import { useAuthStore } from '@/stores/auth-store';
import { useNotify } from '@/components/ui/dialogs';
import { downloadCsv } from '@/lib/csv';
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
  const queryClient = useQueryClient();
  const notify = useNotify();
  const [manualOpen, setManualOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  async function handleExport() {
    setExporting(true);
    try {
      // Busca tudo do periodo (sem cursor) — limit alto cobre uso interno
      const data = await queryClient.fetchQuery(
        timeTrackingQueries.timesheet({ ...apiFilter, limit: 5000, cursor: undefined }),
      );
      const items = data.items;
      if (items.length === 0) {
        notify.info('Nenhuma entrada no período pra exportar.');
        return;
      }
      downloadCsv(
        `timesheet_${filters.dateFrom}_${filters.dateTo}.csv`,
        [
          'Usuário',
          'Email',
          'Card',
          'Fluxo',
          'Etiquetas',
          'Equipe',
          'Data inicial',
          'Hora inicial',
          'Data final',
          'Hora final',
          'Duração',
          'Tipo',
          'Anotação',
        ],
        items.map((item) => itemToRow(item)),
      );
      notify.success(
        `${items.length} entrada${items.length === 1 ? '' : 's'} exportada${items.length === 1 ? '' : 's'}.`,
      );
    } catch {
      notify.error('Falha ao exportar dados.');
    } finally {
      setExporting(false);
    }
  }

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
          <div className="flex items-center gap-3">
            <span className="text-fg-muted text-[11px]">
              {timesheetQuery.isLoading
                ? 'Carregando…'
                : `${timesheetQuery.data?.items.length ?? 0} entrada${(timesheetQuery.data?.items.length ?? 0) === 1 ? '' : 's'} no período`}
            </span>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || timesheetQuery.isLoading}
              className="border-border/70 text-fg hover:bg-bg-muted inline-flex items-center gap-1.5 rounded-md border bg-transparent px-2.5 py-1 text-[12px] transition-colors disabled:opacity-50"
              title="Exportar CSV com os filtros aplicados"
            >
              {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              Exportar dados
            </button>
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

function itemToRow(item: TimesheetItem): Array<string | number | null> {
  const start = new Date(item.startedAt);
  const end = item.endedAt ? new Date(item.endedAt) : null;
  return [
    item.user.name,
    item.user.email,
    item.card.title,
    item.card.board.name,
    item.card.labels.map((l) => l.label.name).join(', '),
    item.card.members.map((m) => m.user.name).join(', '),
    formatDate(start),
    formatTime(start),
    end ? formatDate(end) : '',
    end ? formatTime(end) : '',
    formatDuration(item.durationSec ?? 0),
    item.source === 'TIMER' ? 'Cronômetro' : 'Manual',
    item.note ?? '',
  ];
}

function formatDate(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
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
