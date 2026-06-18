'use client';

import { CalendarRange } from 'lucide-react';

/**
 * Par de inputs nativos de data (`<input type="date">`) para o filtro
 * "Personalizado" da Visao Gerencial. Sai do escopo dos selects pre-definidos
 * (overdue/today/next7/noDate) e deixa o gestor recortar exatamente um intervalo.
 *
 * - Apenas `from` ou apenas `to` ja eh valido: o backend interpreta range aberto.
 * - Quando `dateField` eh fornecido, mostra tambem o toggle "Prazo / Concluido"
 *   (usado em /finalizados). Em /cards o toggle nao aparece — so existe `due`.
 */
export function CustomDateRange({
  from,
  to,
  onChangeFrom,
  onChangeTo,
  dateField,
  onChangeField,
}: {
  from: string;
  to: string;
  onChangeFrom: (v: string) => void;
  onChangeTo: (v: string) => void;
  /** Quando definido, renderiza toggle Prazo|Concluido. */
  dateField?: 'due' | 'completed';
  onChangeField?: (v: 'due' | 'completed') => void;
}) {
  const showFieldToggle = dateField !== undefined && onChangeField !== undefined;
  return (
    <div className="border-border bg-bg inline-flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
      <CalendarRange size={12} className="text-fg-muted" />
      {showFieldToggle && (
        <select
          value={dateField}
          onChange={(e) => onChangeField!(e.target.value as 'due' | 'completed')}
          className="border-border bg-bg-subtle rounded border px-1 py-0.5 text-[11px]"
          aria-label="Campo de data"
        >
          <option value="due">Prazo</option>
          <option value="completed">Concluído</option>
        </select>
      )}
      <span className="text-fg-muted">de</span>
      <input
        type="date"
        value={from}
        // Impede `from > to` no browser. Se to=='', sem limite superior.
        max={to || undefined}
        onChange={(e) => onChangeFrom(e.target.value)}
        className="border-border bg-bg-subtle rounded border px-1.5 py-0.5 text-[11px]"
      />
      <span className="text-fg-muted">até</span>
      <input
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => onChangeTo(e.target.value)}
        className="border-border bg-bg-subtle rounded border px-1.5 py-0.5 text-[11px]"
      />
    </div>
  );
}
