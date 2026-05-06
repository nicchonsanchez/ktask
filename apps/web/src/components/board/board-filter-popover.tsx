'use client';

import { useId, useMemo } from 'react';
import { Building2, Filter, X } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@ktask/ui';
import type { BoardDetail, CardListItem } from '@/lib/queries/boards';
import { UserAvatar } from '@/components/user-avatar';

export type Priority = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type DueFilter = 'all' | 'today' | 'week' | 'overdue' | 'none';

export interface BoardFilters {
  onlyMine: boolean;
  priorities: Priority[];
  labelIds: string[];
  /** Cards onde alguma destas pessoas e lider OU esta na equipe. */
  userIds: string[];
  /** Doc 38: cards vinculados a alguma destas empresas (Contact COMPANY). */
  companyIds: string[];
  due: DueFilter;
}

export const EMPTY_FILTERS: BoardFilters = {
  onlyMine: false,
  priorities: [],
  labelIds: [],
  userIds: [],
  companyIds: [],
  due: 'all',
};

export function activeFilterCount(f: BoardFilters): number {
  let n = 0;
  if (f.onlyMine) n++;
  if (f.priorities.length > 0) n++;
  if (f.labelIds.length > 0) n++;
  if (f.userIds.length > 0) n++;
  if (f.companyIds.length > 0) n++;
  if (f.due !== 'all') n++;
  return n;
}

const PRIORITIES: Array<{ value: Priority; label: string; color: string }> = [
  { value: 'URGENT', label: 'Urgente', color: 'bg-red-500' },
  { value: 'HIGH', label: 'Alta', color: 'bg-orange-500' },
  { value: 'MEDIUM', label: 'Média', color: 'bg-amber-400' },
  { value: 'LOW', label: 'Baixa', color: 'bg-blue-400' },
  { value: 'NONE', label: 'Sem prioridade', color: 'bg-fg-muted/50' },
];

const DUE_OPTIONS: Array<{ value: DueFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'today', label: 'Hoje' },
  { value: 'week', label: 'Esta semana' },
  { value: 'overdue', label: 'Atrasados' },
  { value: 'none', label: 'Sem prazo' },
];

export function BoardFilterPopover({
  board,
  filters,
  onFiltersChange,
}: {
  board: BoardDetail;
  filters: BoardFilters;
  onFiltersChange: (next: BoardFilters) => void;
}) {
  const count = activeFilterCount(filters);
  const id = useId();

  function togglePriority(p: Priority) {
    const next = filters.priorities.includes(p)
      ? filters.priorities.filter((x) => x !== p)
      : [...filters.priorities, p];
    onFiltersChange({ ...filters, priorities: next });
  }

  function toggleLabel(labelId: string) {
    const next = filters.labelIds.includes(labelId)
      ? filters.labelIds.filter((x) => x !== labelId)
      : [...filters.labelIds, labelId];
    onFiltersChange({ ...filters, labelIds: next });
  }

  function toggleUser(userId: string) {
    const next = filters.userIds.includes(userId)
      ? filters.userIds.filter((x) => x !== userId)
      : [...filters.userIds, userId];
    onFiltersChange({ ...filters, userIds: next });
  }

  function toggleCompany(companyId: string) {
    const next = filters.companyIds.includes(companyId)
      ? filters.companyIds.filter((x) => x !== companyId)
      : [...filters.companyIds, companyId];
    onFiltersChange({ ...filters, companyIds: next });
  }

  // Membros do board ordenados alfabeticamente. Usa board.members ja
  // carregado no detalhe — sem query extra.
  const sortedMembers = [...board.members].sort((a, b) =>
    a.user.name.localeCompare(b.user.name, 'pt-BR'),
  );

  // Doc 38: empresas que aparecem em pelo menos 1 card desse board.
  // Deduplica varrendo cards.contacts onde type=COMPANY. Ordena por
  // nome. Se nenhum card tem empresa vinculada, a secao some.
  const companies = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const list of board.lists) {
      for (const card of list.cards) {
        for (const cc of card.contacts) {
          if (cc.contact.type === 'COMPANY' && !map.has(cc.contact.id)) {
            map.set(cc.contact.id, { id: cc.contact.id, name: cc.contact.name });
          }
        }
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [board.lists]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={count > 0 ? `${count} filtro(s) ativo(s)` : 'Filtrar cards'}
          className={`hidden h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors md:inline-flex ${
            count > 0
              ? 'border-primary text-primary bg-primary-subtle/40'
              : 'border-border/70 text-fg-muted hover:border-border-strong'
          }`}
        >
          <Filter size={13} />
          Filtrar
          {count > 0 && (
            <span className="bg-primary text-primary-fg ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
              {count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="border-border/60 flex items-center justify-between border-b px-3 py-2">
          <p className="text-fg text-sm font-semibold">Filtros</p>
          {count > 0 && (
            <button
              type="button"
              onClick={() => onFiltersChange(EMPTY_FILTERS)}
              className="text-fg-muted hover:text-fg inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]"
            >
              <X size={11} />
              Limpar
            </button>
          )}
        </div>
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto p-3">
          <label className="hover:bg-bg-muted flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5">
            <span className="text-fg text-[12px]">Apenas meus cards</span>
            <input
              type="checkbox"
              checked={filters.onlyMine}
              onChange={(e) => onFiltersChange({ ...filters, onlyMine: e.target.checked })}
              className="accent-primary"
            />
          </label>

          <section>
            <p className="text-fg-muted mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide">
              Prioridade
            </p>
            <div className="flex flex-col gap-0.5">
              {PRIORITIES.map((p) => {
                const checked = filters.priorities.includes(p.value);
                return (
                  <label
                    key={p.value}
                    className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 ${
                      checked ? 'bg-primary-subtle/30' : 'hover:bg-bg-muted'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePriority(p.value)}
                      className="accent-primary"
                    />
                    <span aria-hidden className={`size-2.5 rounded-full ${p.color}`} />
                    <span className="text-fg text-[12px]">{p.label}</span>
                  </label>
                );
              })}
            </div>
          </section>

          {sortedMembers.length > 0 && (
            <section>
              <p className="text-fg-muted mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide">
                Pessoas (líder ou equipe)
              </p>
              <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
                {sortedMembers.map((m) => {
                  const checked = filters.userIds.includes(m.user.id);
                  return (
                    <label
                      key={m.user.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 ${
                        checked ? 'bg-primary-subtle/30' : 'hover:bg-bg-muted'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleUser(m.user.id)}
                        className="accent-primary"
                      />
                      <UserAvatar
                        name={m.user.name}
                        userId={m.user.id}
                        avatarUrl={m.user.avatarUrl}
                        size="sm"
                      />
                      <span className="text-fg truncate text-[12px]">{m.user.name}</span>
                    </label>
                  );
                })}
              </div>
            </section>
          )}

          {companies.length > 0 && (
            <section>
              <p className="text-fg-muted mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide">
                Empresa
              </p>
              <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
                {companies.map((co) => {
                  const checked = filters.companyIds.includes(co.id);
                  return (
                    <label
                      key={co.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 ${
                        checked ? 'bg-primary-subtle/30' : 'hover:bg-bg-muted'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCompany(co.id)}
                        className="accent-primary"
                      />
                      <Building2 size={12} className="text-fg-muted shrink-0" />
                      <span className="text-fg truncate text-[12px]">{co.name}</span>
                    </label>
                  );
                })}
              </div>
            </section>
          )}

          {board.labels.length > 0 && (
            <section>
              <p className="text-fg-muted mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide">
                Etiquetas
              </p>
              <div className="flex flex-col gap-0.5">
                {board.labels.map((l) => {
                  const checked = filters.labelIds.includes(l.id);
                  return (
                    <label
                      key={l.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 ${
                        checked ? 'bg-primary-subtle/30' : 'hover:bg-bg-muted'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleLabel(l.id)}
                        className="accent-primary"
                      />
                      <span
                        aria-hidden
                        className="inline-block size-3 rounded-sm"
                        style={{ backgroundColor: l.color }}
                      />
                      <span className="text-fg truncate text-[12px]">{l.name}</span>
                    </label>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <p className="text-fg-muted mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide">
              Prazo
            </p>
            <div className="flex flex-col gap-0.5">
              {DUE_OPTIONS.map((d) => (
                <label
                  key={d.value}
                  className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 ${
                    filters.due === d.value ? 'bg-primary-subtle/30' : 'hover:bg-bg-muted'
                  }`}
                >
                  <input
                    type="radio"
                    name={`${id}-due`}
                    checked={filters.due === d.value}
                    onChange={() => onFiltersChange({ ...filters, due: d.value })}
                    className="accent-primary"
                  />
                  <span className="text-fg text-[12px]">{d.label}</span>
                </label>
              ))}
            </div>
          </section>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Aplica os filtros a uma lista de cards. Retorna apenas os cards que casam
 * com TODOS os critérios ativos. Filtros vazios passam tudo.
 *
 * Cálculos de data usam o início do dia local — `today`/`week`/`overdue`
 * comparam por calendário, não por instante exato.
 */
export function applyBoardFilters(
  cards: CardListItem[],
  filters: BoardFilters,
  currentUserId: string | null,
): CardListItem[] {
  if (activeFilterCount(filters) === 0) return cards;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today.getTime() + 7 * 24 * 60 * 60_000);

  return cards.filter((c) => {
    if (filters.onlyMine && currentUserId) {
      const isMember = c.members.some((m) => m.user.id === currentUserId);
      const isLead = c.leadId === currentUserId;
      if (!isMember && !isLead) return false;
    }

    if (filters.priorities.length > 0 && !filters.priorities.includes(c.priority)) {
      return false;
    }

    if (filters.labelIds.length > 0) {
      const cardLabels = c.labels.map((l) => l.label.id);
      const hasAny = filters.labelIds.some((id) => cardLabels.includes(id));
      if (!hasAny) return false;
    }

    // Pessoas: card precisa ter pelo menos uma das selecionadas como
    // lider OU em members (OR entre as escolhidas).
    if (filters.userIds.length > 0) {
      const cardUserIds = new Set<string>();
      if (c.leadId) cardUserIds.add(c.leadId);
      for (const m of c.members) cardUserIds.add(m.user.id);
      const hasAny = filters.userIds.some((id) => cardUserIds.has(id));
      if (!hasAny) return false;
    }

    // Doc 38: Empresa — card precisa ter pelo menos um CardContact
    // type=COMPANY que casa com a selecao.
    if (filters.companyIds.length > 0) {
      const cardCompanyIds = new Set(
        c.contacts.filter((cc) => cc.contact.type === 'COMPANY').map((cc) => cc.contact.id),
      );
      const hasAny = filters.companyIds.some((id) => cardCompanyIds.has(id));
      if (!hasAny) return false;
    }

    if (filters.due !== 'all') {
      if (filters.due === 'none') {
        if (c.dueDate) return false;
      } else {
        if (!c.dueDate) return false;
        const due = new Date(c.dueDate);
        due.setHours(0, 0, 0, 0);
        if (filters.due === 'today') {
          if (due.getTime() !== today.getTime()) return false;
        } else if (filters.due === 'overdue') {
          if (due.getTime() >= today.getTime()) return false;
        } else if (filters.due === 'week') {
          if (due.getTime() < today.getTime() || due.getTime() >= weekEnd.getTime()) return false;
        }
      }
    }

    return true;
  });
}
