'use client';

import { ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@ktask/ui';
import { PERFORMANCE_AREA_LABELS, PERFORMANCE_AREAS, type PerformanceArea } from '@ktask/contracts';

import { PERIOD_PRESETS, type PeriodPreset } from '@/lib/performance-period';

export interface PerformanceFilterState {
  period: PeriodPreset;
  customFrom: string;
  customTo: string;
  area: PerformanceArea | '';
  boardIds: string[];
  userId: string;
  companyId: string;
}

const selectCls =
  'border-border bg-bg text-fg rounded-md border px-2 py-1 text-[11px] focus:outline-none';

/** Doc 52 — barra de filtros do Desempenho da Equipe (spec §10). */
export function PerformanceFilters({
  value,
  onChange,
  boards,
  members,
  companies,
}: {
  value: PerformanceFilterState;
  onChange: (next: Partial<PerformanceFilterState>) => void;
  boards: Array<{ id: string; name: string }>;
  members: Array<{ id: string; name: string }>;
  companies: Array<{ id: string; name: string }>;
}) {
  const hasFilters = !!(value.area || value.boardIds.length || value.userId || value.companyId);
  const boardLabel =
    value.boardIds.length === 0
      ? 'Todos os fluxos'
      : value.boardIds.length === 1
        ? (boards.find((b) => b.id === value.boardIds[0])?.name ?? '1 fluxo')
        : `${value.boardIds.length} fluxos`;

  return (
    <div className="border-border/60 bg-bg -mx-4 flex flex-wrap items-center gap-2 border-b px-4 py-2 sm:sticky sm:top-[52px] sm:z-10 sm:-mx-0 sm:rounded-md sm:border">
      <div className="bg-bg-muted inline-flex flex-wrap items-center rounded-md p-0.5">
        {PERIOD_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange({ period: p.key })}
            className={`rounded-[4px] px-2 py-1 text-[11px] font-medium transition-colors ${
              value.period === p.key ? 'bg-bg text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {value.period === 'custom' && (
        <span className="flex items-center gap-1 text-[11px]">
          <input
            type="date"
            aria-label="Início"
            value={value.customFrom}
            onChange={(e) => onChange({ customFrom: e.target.value })}
            className={selectCls}
          />
          <span className="text-fg-muted">até</span>
          <input
            type="date"
            aria-label="Fim"
            value={value.customTo}
            onChange={(e) => onChange({ customTo: e.target.value })}
            className={selectCls}
          />
        </span>
      )}

      <select
        aria-label="Área"
        value={value.area}
        onChange={(e) => onChange({ area: e.target.value as PerformanceArea | '' })}
        className={selectCls}
      >
        <option value="">Todas as áreas</option>
        {PERFORMANCE_AREAS.map((a) => (
          <option key={a} value={a}>
            {PERFORMANCE_AREA_LABELS[a]}
          </option>
        ))}
      </select>

      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={`${selectCls} inline-flex items-center gap-1`}>
            <span className="max-w-[160px] truncate">{boardLabel}</span>
            <ChevronDown size={12} className="text-fg-muted" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="max-h-80 w-64 overflow-y-auto p-1">
          <button
            type="button"
            onClick={() => onChange({ boardIds: [] })}
            className="hover:bg-bg-muted w-full rounded px-2 py-1.5 text-left text-xs"
          >
            Todos os fluxos
          </button>
          {boards.map((b) => {
            const checked = value.boardIds.includes(b.id);
            return (
              <label
                key={b.id}
                className="hover:bg-bg-muted flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange({
                      boardIds: checked
                        ? value.boardIds.filter((id) => id !== b.id)
                        : [...value.boardIds, b.id],
                    })
                  }
                />
                <span className="truncate">{b.name}</span>
              </label>
            );
          })}
        </PopoverContent>
      </Popover>

      <select
        aria-label="Colaborador"
        value={value.userId}
        onChange={(e) => onChange({ userId: e.target.value })}
        className={selectCls}
      >
        <option value="">Todos os colaboradores</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>

      {companies.length > 0 && (
        <select
          aria-label="Cliente"
          value={value.companyId}
          onChange={(e) => onChange({ companyId: e.target.value })}
          className={`${selectCls} max-w-[180px]`}
        >
          <option value="">Todos os clientes</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      {hasFilters && (
        <button
          type="button"
          onClick={() => onChange({ area: '', boardIds: [], userId: '', companyId: '' })}
          className="text-fg-muted hover:text-fg ml-auto text-[11px]"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}
