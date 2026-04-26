'use client';

import { useState } from 'react';
import { Calendar, ChevronDown, Loader2, Users, Layers, Tag } from 'lucide-react';

import { UserAvatar } from '@/components/user-avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@ktask/ui';
import type { TimeEntrySource } from '@/lib/queries/time-tracking';
import type { BoardListItem } from '@/lib/queries/boards';

interface UiFilters {
  source: TimeEntrySource | 'ALL';
  dateFrom: string;
  dateTo: string;
  userIds: string[];
  boardId: string | null;
}

interface OrgMember {
  userId: string;
  user: { id: string; name: string; email: string; avatarUrl: string | null };
}

const SOURCE_OPTIONS: Array<{ value: TimeEntrySource | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'Manual e cronômetro' },
  { value: 'TIMER', label: 'Apenas cronômetro' },
  { value: 'MANUAL', label: 'Apenas manual' },
];

export function TimesheetFiltersBar({
  filters,
  onChange,
  members,
  boards,
  membersLoading,
}: {
  filters: UiFilters;
  onChange: (next: UiFilters) => void;
  members: OrgMember[];
  boards: BoardListItem[];
  membersLoading: boolean;
}) {
  const sourceLabel =
    SOURCE_OPTIONS.find((o) => o.value === filters.source)?.label ?? 'Tipo de registro';

  const userLabel =
    filters.userIds.length === 0
      ? 'Todos'
      : filters.userIds.length === 1
        ? (members.find((m) => m.userId === filters.userIds[0])?.user.name ?? '1 usuário')
        : `${filters.userIds.length} usuários`;

  const boardLabel = filters.boardId
    ? (boards.find((b) => b.id === filters.boardId)?.name ?? 'Fluxo')
    : 'Todos os fluxos';

  return (
    <div className="border-border/60 bg-bg-subtle/40 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2.5 text-[12px]">
      <span className="text-fg-muted shrink-0 text-[11px] font-semibold uppercase tracking-wide">
        Filtrar por
      </span>

      <FilterChip
        icon={<Tag size={12} />}
        label={`Tipo: ${sourceLabel.toLowerCase()}`}
        content={
          <div className="flex flex-col p-1">
            {SOURCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ ...filters, source: opt.value })}
                className={`hover:bg-bg-muted flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] ${
                  filters.source === opt.value ? 'text-primary font-medium' : 'text-fg'
                }`}
              >
                <span className="flex-1">{opt.label}</span>
                {filters.source === opt.value && (
                  <span className="text-primary text-[10px]">●</span>
                )}
              </button>
            ))}
          </div>
        }
      />

      <FilterChip
        icon={<Calendar size={12} />}
        label={`${formatBR(filters.dateFrom)} até ${formatBR(filters.dateTo)}`}
        content={
          <div className="flex flex-col gap-2 p-3">
            <RangePresets
              onPick={(from, to) => onChange({ ...filters, dateFrom: from, dateTo: to })}
            />
            <div className="border-border/60 flex flex-col gap-1 border-t pt-2">
              <DateField
                label="Data inicial"
                value={filters.dateFrom}
                onChange={(v) => onChange({ ...filters, dateFrom: v })}
              />
              <DateField
                label="Data final"
                value={filters.dateTo}
                onChange={(v) => onChange({ ...filters, dateTo: v })}
              />
            </div>
          </div>
        }
      />

      <FilterChip
        icon={<Users size={12} />}
        label={`Usuários: ${userLabel.toLowerCase()}`}
        content={
          <div className="flex max-h-72 flex-col">
            <div className="border-border/60 flex items-center justify-between border-b px-3 py-2 text-[11px]">
              <span className="text-fg-muted">{filters.userIds.length} selecionados</span>
              <button
                type="button"
                onClick={() => onChange({ ...filters, userIds: [] })}
                className="text-primary hover:underline"
              >
                Limpar
              </button>
            </div>
            <div className="overflow-y-auto p-1">
              {membersLoading ? (
                <div className="flex justify-center p-4">
                  <Loader2 size={14} className="text-fg-muted animate-spin" />
                </div>
              ) : (
                members.map((m) => {
                  const checked = filters.userIds.includes(m.userId);
                  return (
                    <button
                      key={m.userId}
                      type="button"
                      onClick={() =>
                        onChange({
                          ...filters,
                          userIds: checked
                            ? filters.userIds.filter((id) => id !== m.userId)
                            : [...filters.userIds, m.userId],
                        })
                      }
                      className={`hover:bg-bg-muted flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] ${
                        checked ? 'bg-primary-subtle/30' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        readOnly
                        className="accent-primary"
                      />
                      <UserAvatar
                        name={m.user.name}
                        userId={m.user.id}
                        avatarUrl={m.user.avatarUrl}
                        size="sm"
                      />
                      <span className="flex-1 truncate">{m.user.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        }
      />

      <FilterChip
        icon={<Layers size={12} />}
        label={`Fluxo: ${boardLabel.toLowerCase()}`}
        content={
          <div className="flex max-h-72 flex-col p-1">
            <button
              type="button"
              onClick={() => onChange({ ...filters, boardId: null })}
              className={`hover:bg-bg-muted flex items-center justify-between rounded-sm px-2 py-1.5 text-[12px] ${
                filters.boardId === null ? 'text-primary font-medium' : 'text-fg'
              }`}
            >
              <span>Todos os fluxos</span>
              {filters.boardId === null && <span className="text-primary text-[10px]">●</span>}
            </button>
            <div className="border-border/60 my-1 border-t" />
            <div className="overflow-y-auto">
              {boards.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onChange({ ...filters, boardId: b.id })}
                  className={`hover:bg-bg-muted flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] ${
                    filters.boardId === b.id ? 'text-primary font-medium' : 'text-fg'
                  }`}
                >
                  <span className="truncate">{b.name}</span>
                  {filters.boardId === b.id && <span className="text-primary text-[10px]">●</span>}
                </button>
              ))}
            </div>
          </div>
        }
      />
    </div>
  );
}

function FilterChip({
  icon,
  label,
  content,
}: {
  icon: React.ReactNode;
  label: string;
  content: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="border-border/70 hover:bg-bg-muted text-fg flex items-center gap-1.5 rounded-md border bg-transparent px-2.5 py-1 text-[12px] transition-colors"
        >
          <span className="text-fg-muted">{icon}</span>
          <span className="max-w-[180px] truncate">{label}</span>
          <ChevronDown size={11} className="text-fg-muted" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        {content}
      </PopoverContent>
    </Popover>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5 text-[11px]">
      <span className="text-fg-muted">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-border focus:border-primary rounded-md border px-2 py-1 text-[12px] focus:outline-none"
      />
    </label>
  );
}

function RangePresets({ onPick }: { onPick: (from: string, to: string) => void }) {
  function preset(days: number) {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - days);
    onPick(from.toISOString().slice(0, 10), now.toISOString().slice(0, 10));
  }
  return (
    <div className="flex flex-wrap gap-1">
      <PresetBtn label="7 dias" onClick={() => preset(7)} />
      <PresetBtn label="30 dias" onClick={() => preset(30)} />
      <PresetBtn label="90 dias" onClick={() => preset(90)} />
    </div>
  );
}

function PresetBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-border/70 hover:bg-bg-muted rounded-full border px-2 py-0.5 text-[11px]"
    >
      {label}
    </button>
  );
}

function formatBR(iso: string): string {
  if (!iso) return '—';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts as [string, string, string];
  return `${d}/${m}/${y.slice(2)}`;
}
