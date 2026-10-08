'use client';

import {
  Building2,
  CalendarRange,
  Check,
  ChevronDown,
  Kanban,
  Shapes,
  User,
  X,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@ktask/ui';
import { PERFORMANCE_AREA_LABELS, PERFORMANCE_AREAS, type PerformanceArea } from '@ktask/contracts';

import { cn } from '@/lib/cn';
import { PERIOD_PRESETS, type PeriodPreset } from '@/lib/performance-period';
import { Segmented } from './ui';

export interface PerformanceFilterState {
  period: PeriodPreset;
  customFrom: string;
  customTo: string;
  area: PerformanceArea | '';
  boardIds: string[];
  userId: string;
  companyId: string;
}

const chipBase =
  'border-border bg-bg text-fg relative inline-flex h-9 min-w-0 items-center gap-2 rounded-lg border pl-3 pr-8 text-xs font-medium transition-colors hover:border-border-strong focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20';
const chipActive = 'border-primary/40 bg-primary/5 text-primary';

/** Select nativo (acessivel e bom no celular) com aparencia de "chip". */
function FilterSelect({
  icon,
  label,
  value,
  onChange,
  children,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn(chipBase, value && chipActive, className)}>
      <span className={cn('shrink-0', value ? 'text-primary' : 'text-fg-muted')}>{icon}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 cursor-pointer appearance-none truncate bg-transparent focus:outline-none"
      >
        {children}
      </select>
      <ChevronDown size={14} className="text-fg-muted pointer-events-none absolute right-2.5" />
    </label>
  );
}

/** Doc 52/54 — barra de filtros do Desempenho da Equipe (spec §10). */
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
    <div className="border-border/70 bg-bg/95 supports-[backdrop-filter]:bg-bg/80 -mx-4 flex flex-col gap-3 border-y px-4 py-3 backdrop-blur sm:sticky sm:top-[152px] sm:z-10 sm:mx-0 sm:rounded-xl sm:border sm:shadow-sm lg:flex-row lg:items-center">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          ariaLabel="Período"
          value={value.period}
          options={PERIOD_PRESETS}
          onChange={(p) => onChange({ period: p })}
        />
        {value.period === 'custom' && (
          <span className="flex flex-wrap items-center gap-2 text-xs">
            <label className={cn(chipBase, 'pr-3')}>
              <CalendarRange size={14} className="text-fg-muted shrink-0" />
              <input
                type="date"
                aria-label="Início"
                value={value.customFrom}
                onChange={(e) => onChange({ customFrom: e.target.value })}
                className="bg-transparent focus:outline-none"
              />
            </label>
            <span className="text-fg-muted">até</span>
            <label className={cn(chipBase, 'pr-3')}>
              <CalendarRange size={14} className="text-fg-muted shrink-0" />
              <input
                type="date"
                aria-label="Fim"
                value={value.customTo}
                onChange={(e) => onChange({ customTo: e.target.value })}
                className="bg-transparent focus:outline-none"
              />
            </label>
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-1 sm:flex-wrap sm:items-center">
        <FilterSelect
          icon={<Shapes size={14} />}
          label="Área"
          value={value.area}
          onChange={(v) => onChange({ area: v as PerformanceArea | '' })}
        >
          <option value="">Todas as áreas</option>
          {PERFORMANCE_AREAS.map((a) => (
            <option key={a} value={a}>
              {PERFORMANCE_AREA_LABELS[a]}
            </option>
          ))}
        </FilterSelect>

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(chipBase, 'text-left', value.boardIds.length > 0 && chipActive)}
            >
              <Kanban
                size={14}
                className={cn(
                  'shrink-0',
                  value.boardIds.length > 0 ? 'text-primary' : 'text-fg-muted',
                )}
              />
              <span className="min-w-0 truncate sm:max-w-[180px]">{boardLabel}</span>
              <ChevronDown size={14} className="text-fg-muted absolute right-2.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="max-h-80 w-72 overflow-y-auto p-1.5">
            <button
              type="button"
              onClick={() => onChange({ boardIds: [] })}
              className="hover:bg-bg-muted flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium"
            >
              <span className="grid size-4 place-items-center">
                {value.boardIds.length === 0 && <Check size={14} className="text-primary" />}
              </span>
              Todos os fluxos
            </button>
            <div className="bg-border/70 my-1 h-px" />
            {boards.map((b) => {
              const checked = value.boardIds.includes(b.id);
              return (
                <label
                  key={b.id}
                  className="hover:bg-bg-muted flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-xs"
                >
                  <input
                    type="checkbox"
                    className="accent-primary size-4"
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

        <FilterSelect
          icon={<User size={14} />}
          label="Colaborador"
          value={value.userId}
          onChange={(v) => onChange({ userId: v })}
        >
          <option value="">Todos os colaboradores</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </FilterSelect>

        {companies.length > 0 && (
          <FilterSelect
            icon={<Building2 size={14} />}
            label="Cliente"
            value={value.companyId}
            onChange={(v) => onChange({ companyId: v })}
            className="sm:max-w-[220px]"
          >
            <option value="">Todos os clientes</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </FilterSelect>
        )}

        {hasFilters && (
          <button
            type="button"
            onClick={() => onChange({ area: '', boardIds: [], userId: '', companyId: '' })}
            className="text-fg-muted hover:text-fg hover:bg-bg-muted inline-flex h-9 items-center justify-center gap-1 rounded-lg px-3 text-xs font-medium sm:ml-auto"
          >
            <X size={14} /> Limpar filtros
          </button>
        )}
      </div>
    </div>
  );
}
