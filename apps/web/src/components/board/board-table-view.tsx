'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, ArrowUpDown, Lock, Unlock } from 'lucide-react';

import type { BoardDetail, CardListItem, CardStatus } from '@/lib/queries/boards';
import { UserAvatar } from '@/components/user-avatar';
import { STATUS_LABEL } from './status-config';

type SortKey = 'status' | 'title' | 'lead' | 'list' | 'dueDate' | 'updatedAt';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 50;

// Status sao 4 valores fixos do card — independente da coluna em que ele
// esteja. NAO confundir com a coluna 'Finalizado' (isFinalList=true), que
// e uma localizacao no board, nao um status. Labels vem do STATUS_LABEL
// centralizado em status-config.ts (single source of truth).
const STATUS_CLASS: Record<CardStatus, string> = {
  ACTIVE: 'bg-bg-muted text-fg-muted',
  COMPLETED: 'bg-success-subtle text-success',
  WAITING: 'bg-warning-subtle text-warning',
  CANCELED: 'bg-danger-subtle text-danger',
};

interface RowItem {
  card: CardListItem;
  list: { id: string; name: string };
}

/**
 * Visualizacao tabela do board (alternativa ao Kanban). Reaproveita 100%
 * dos dados ja carregados em board.lists[].cards — sem nova request.
 *
 * Sort por coluna, paginacao client-side, click na linha abre o
 * card-modal padrao (via ?card=<id>).
 */
export function BoardTableView({ board, search }: { board: BoardDetail; search: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: 'updatedAt',
    dir: 'desc',
  });
  const [page, setPage] = useState(0);

  const memberMap = useMemo(() => {
    const m = new Map<string, { id: string; name: string; avatarUrl: string | null }>();
    for (const member of board.members) m.set(member.user.id, member.user);
    return m;
  }, [board.members]);

  const rows: RowItem[] = useMemo(() => {
    const flat: RowItem[] = [];
    for (const list of board.lists) {
      for (const card of list.cards) {
        flat.push({ card, list: { id: list.id, name: list.name } });
      }
    }
    return flat;
  }, [board.lists]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.card.title.toLowerCase().includes(q) ||
        (r.card.shortCode?.toLowerCase().includes(q) ?? false),
    );
  }, [rows, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sort.dir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      switch (sort.key) {
        case 'status':
          return a.card.status.localeCompare(b.card.status) * dir;
        case 'title':
          return a.card.title.localeCompare(b.card.title) * dir;
        case 'list':
          return a.list.name.localeCompare(b.list.name) * dir;
        case 'dueDate': {
          const da = a.card.dueDate ? new Date(a.card.dueDate).getTime() : Infinity;
          const db = b.card.dueDate ? new Date(b.card.dueDate).getTime() : Infinity;
          return (da - db) * dir;
        }
        case 'lead': {
          const la = a.card.leadId ? (memberMap.get(a.card.leadId)?.name ?? '') : '';
          const lb = b.card.leadId ? (memberMap.get(b.card.leadId)?.name ?? '') : '';
          return la.localeCompare(lb) * dir;
        }
        case 'updatedAt':
        default:
          return (
            (new Date(a.card.updatedAt).getTime() - new Date(b.card.updatedAt).getTime()) * dir
          );
      }
    });
    return arr;
  }, [filtered, sort, memberMap]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    );
    setPage(0);
  }

  function openCard(cardId: string) {
    const next = new URLSearchParams(params.toString());
    next.set('card', cardId);
    router.push(`?${next.toString()}`);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-bg-subtle text-fg-muted sticky top-0 z-10 text-[11px] font-semibold uppercase tracking-wide">
            <tr>
              <SortHeader
                label="Status"
                sortKey="status"
                current={sort}
                onClick={toggleSort}
                width="w-28"
              />
              <SortHeader label="Nome" sortKey="title" current={sort} onClick={toggleSort} />
              <th className="px-3 py-2 text-left">Tags</th>
              <SortHeader
                label="Líder"
                sortKey="lead"
                current={sort}
                onClick={toggleSort}
                width="w-32"
              />
              <th className="px-3 py-2 text-left">Equipe</th>
              <th className="w-20 px-3 py-2 text-left">Privacidade</th>
              <SortHeader
                label="Coluna atual"
                sortKey="list"
                current={sort}
                onClick={toggleSort}
                width="w-44"
              />
              <SortHeader
                label="Prazo"
                sortKey="dueDate"
                current={sort}
                onClick={toggleSort}
                width="w-28"
              />
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={8} className="text-fg-muted px-4 py-10 text-center text-sm">
                  Nenhum card encontrado.
                </td>
              </tr>
            )}
            {pageRows.map(({ card, list }) => (
              <Row
                key={card.id}
                card={card}
                list={list}
                lead={card.leadId ? (memberMap.get(card.leadId) ?? null) : null}
                onClick={() => openCard(card.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-border/60 bg-bg flex shrink-0 items-center justify-between gap-2 border-t px-4 py-2 text-[12px]">
        <span className="text-fg-muted tabular-nums">
          {sorted.length === 0
            ? 'Nenhum card'
            : `${safePage * PAGE_SIZE + 1}-${Math.min((safePage + 1) * PAGE_SIZE, sorted.length)} de ${sorted.length}`}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="hover:bg-bg-muted text-fg-muted inline-flex items-center rounded px-2 py-1 disabled:opacity-40"
          >
            ‹
          </button>
          <span className="text-fg-muted tabular-nums">
            {safePage + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1}
            className="hover:bg-bg-muted text-fg-muted inline-flex items-center rounded px-2 py-1 disabled:opacity-40"
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  current,
  onClick,
  width,
}: {
  label: string;
  sortKey: SortKey;
  current: { key: SortKey; dir: SortDir };
  onClick: (k: SortKey) => void;
  width?: string;
}) {
  const active = current.key === sortKey;
  return (
    <th className={`${width ?? ''} px-3 py-2 text-left`}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className="hover:text-fg inline-flex items-center gap-1 transition-colors"
      >
        {label}
        {!active && <ArrowUpDown size={11} className="opacity-50" />}
        {active && current.dir === 'asc' && <ArrowUp size={11} />}
        {active && current.dir === 'desc' && <ArrowDown size={11} />}
      </button>
    </th>
  );
}

function Row({
  card,
  list,
  lead,
  onClick,
}: {
  card: CardListItem;
  list: { id: string; name: string };
  lead: { id: string; name: string; avatarUrl: string | null } | null;
  onClick: () => void;
}) {
  const statusLabel = STATUS_LABEL[card.status];
  const statusClass = STATUS_CLASS[card.status];
  const visibleMembers = card.members.slice(0, 4);
  const overflow = Math.max(0, card.members.length - 4);
  const dueLabel = card.dueDate
    ? new Date(card.dueDate).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      })
    : '—';
  const dueOverdue =
    card.dueDate && new Date(card.dueDate).getTime() < Date.now() && !card.completedAt;

  return (
    <tr
      onClick={onClick}
      className="hover:bg-bg-subtle/60 border-border/40 cursor-pointer border-b transition-colors"
    >
      <td className="px-3 py-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass}`}
        >
          {statusLabel}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col">
          <span className="text-fg line-clamp-1 font-medium">{card.title}</span>
          {card.shortCode && (
            <span className="text-fg-subtle text-[10px] tabular-nums">#{card.shortCode}</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {card.labels.slice(0, 3).map((l) => (
            <span
              key={l.label.id}
              className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white"
              style={{ backgroundColor: l.label.color }}
            >
              {l.label.name}
            </span>
          ))}
          {card.labels.length > 3 && (
            <span className="text-fg-subtle text-[10px]">+{card.labels.length - 3}</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        {lead ? (
          <div className="flex items-center gap-1.5">
            <UserAvatar name={lead.name} userId={lead.id} avatarUrl={lead.avatarUrl} size="sm" />
            <span className="text-fg truncate text-[12px]">{lead.name.split(' ')[0]}</span>
          </div>
        ) : (
          <span className="text-fg-subtle text-[11px]">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex -space-x-1.5">
          {visibleMembers.map((m) => (
            <UserAvatar
              key={m.user.id}
              name={m.user.name}
              userId={m.user.id}
              avatarUrl={m.user.avatarUrl}
              size="sm"
              stacked
            />
          ))}
          {overflow > 0 && (
            <span className="border-bg bg-bg-muted text-fg-muted inline-flex size-6 items-center justify-center rounded-full border-2 text-[9px] font-semibold">
              +{overflow}
            </span>
          )}
          {card.members.length === 0 && <span className="text-fg-subtle text-[11px]">—</span>}
        </div>
      </td>
      <td className="px-3 py-2">
        {card.privacy === 'TEAM_ONLY' ? (
          <Lock size={13} className="text-fg" />
        ) : (
          <Unlock size={13} className="text-fg-subtle" />
        )}
      </td>
      <td className="px-3 py-2">
        <span className="text-fg-muted truncate text-[12px]">{list.name}</span>
      </td>
      <td className="px-3 py-2">
        <span
          className={`text-[12px] tabular-nums ${dueOverdue ? 'text-danger font-medium' : 'text-fg-muted'}`}
        >
          {dueLabel}
        </span>
      </td>
    </tr>
  );
}
