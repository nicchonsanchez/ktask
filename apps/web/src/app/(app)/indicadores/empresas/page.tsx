'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Building2, Loader2 } from 'lucide-react';

import { boardsQueries } from '@/lib/queries/boards';
import {
  indicatorsQueries,
  type CompaniesStats,
  type CompaniesStatsRow,
} from '@/lib/queries/indicators';

/**
 * Doc 38: agregacoes por empresa cliente. Por padrao mostra os ultimos
 * 30 dias da Org inteira; permite filtrar periodo e board.
 *
 * Linha "(sem empresa)" aparece sempre — torna visivel cards nao
 * vinculados, util pra acionar o time a categorizar.
 */
export default function IndicadoresEmpresasPage() {
  const initial = useMemo(() => {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    return {
      from: from.toISOString().slice(0, 10),
      to: now.toISOString().slice(0, 10),
    };
  }, []);

  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [boardId, setBoardId] = useState<string>('');

  const boardsQ = useQuery(boardsQueries.all());
  const statsQ = useQuery(
    indicatorsQueries.companies({
      from: `${from}T00:00:00.000Z`,
      to: `${to}T23:59:59.999Z`,
      boardId: boardId || undefined,
    }),
  );

  return (
    <div className="container py-6">
      <header className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-fg-muted text-[11px] font-medium">De</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border-border bg-bg rounded-md border px-2 py-1 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-fg-muted text-[11px] font-medium">Até</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border-border bg-bg rounded-md border px-2 py-1 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-fg-muted text-[11px] font-medium">Fluxo</label>
          <select
            value={boardId}
            onChange={(e) => setBoardId(e.target.value)}
            className="border-border bg-bg rounded-md border px-2 py-1 text-sm"
          >
            <option value="">Todos os fluxos</option>
            {(boardsQ.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <p className="text-fg-subtle ml-auto max-w-md text-[11px] leading-snug">
          Cards e horas atribuídos via empresa vinculada (Contatos do card). Card vinculado a 2
          empresas conta nas duas — mostra envolvimento real.
        </p>
      </header>

      {statsQ.isLoading && (
        <div className="text-fg-muted flex items-center gap-2 py-12 text-sm">
          <Loader2 size={14} className="animate-spin" /> Carregando…
        </div>
      )}

      {statsQ.data && <StatsTable data={statsQ.data} />}
    </div>
  );
}

function StatsTable({ data }: { data: CompaniesStats }) {
  const empty = data.rows.length === 0;
  const noCompanyEmpty =
    data.noCompany.cardsCreated === 0 &&
    data.noCompany.cardsCompleted === 0 &&
    data.noCompany.hoursSeconds === 0 &&
    data.noCompany.cardsOpen === 0;

  if (empty && noCompanyEmpty) {
    return (
      <div className="border-border bg-bg-muted/20 flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
        <Building2 size={28} className="text-fg-muted" />
        <p className="text-sm font-medium">Nenhum dado no período.</p>
        <p className="text-fg-muted text-xs">
          Tente expandir o intervalo ou trocar o fluxo filtrado.
        </p>
      </div>
    );
  }

  return (
    <div className="border-border bg-bg overflow-hidden rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-bg-muted/40 text-fg-muted text-[11px] uppercase tracking-wide">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Empresa</th>
            <th className="px-3 py-2 text-right font-medium">Cards criados</th>
            <th className="px-3 py-2 text-right font-medium">Cards finalizados</th>
            <th className="px-3 py-2 text-right font-medium">Horas trabalhadas</th>
            <th className="px-3 py-2 text-right font-medium">Em aberto agora</th>
          </tr>
        </thead>
        <tbody className="divide-border/60 divide-y">
          {data.rows.map((row) => (
            <CompanyRow key={row.company.id} row={row} />
          ))}
          {!noCompanyEmpty && (
            <tr className="bg-bg-muted/20">
              <td className="px-3 py-2">
                <span className="text-fg-subtle italic">(sem empresa vinculada)</span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{data.noCompany.cardsCreated}</td>
              <td className="px-3 py-2 text-right tabular-nums">{data.noCompany.cardsCompleted}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatHours(data.noCompany.hoursSeconds)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{data.noCompany.cardsOpen}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CompanyRow({ row }: { row: CompaniesStatsRow }) {
  return (
    <tr className="hover:bg-bg-muted/30">
      <td className="px-3 py-2">
        <Link
          href={`/contatos?type=COMPANY`}
          className="hover:text-primary inline-flex items-center gap-2"
        >
          <Building2 size={13} className="text-fg-muted shrink-0" />
          <span className="text-fg font-medium">{row.company.name}</span>
        </Link>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{row.cardsCreated}</td>
      <td className="px-3 py-2 text-right tabular-nums">{row.cardsCompleted}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatHours(row.hoursSeconds)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{row.cardsOpen}</td>
    </tr>
  );
}

function formatHours(seconds: number): string {
  if (seconds === 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}
