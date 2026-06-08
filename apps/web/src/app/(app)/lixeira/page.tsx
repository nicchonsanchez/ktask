'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  Loader2,
  RotateCcw,
  Search,
  Trash2,
  Columns3,
  FileText,
  Trash,
} from 'lucide-react';
import type { OrgRole } from '@ktask/contracts';

import { api } from '@/lib/api-client';
import { boardsQueries } from '@/lib/queries/boards';
import {
  trashCardsQuery,
  trashCountsQuery,
  trashListsQuery,
  type TrashCardRow,
  type TrashListRow,
} from '@/lib/queries/trash';
import { restoreCardFromTrash, deleteCardPermanent } from '@/lib/queries/cards';
import { restoreListFromTrash, deleteListPermanent } from '@/lib/queries/boards';
import { useConfirm, useNotify } from '@/components/ui/dialogs';

interface CurrentOrg {
  myRole: OrgRole;
}

type Tab = 'cards' | 'lists';

export default function LixeiraPage() {
  const [tab, setTab] = useState<Tab>('cards');
  const [search, setSearch] = useState('');
  const [boardId, setBoardId] = useState<string>('');

  const qc = useQueryClient();
  const confirm = useConfirm();
  const notify = useNotify();

  const orgQuery = useQuery({
    queryKey: ['org', 'current'],
    queryFn: () => api.get<CurrentOrg>('/api/v1/organizations/current'),
  });
  const canPurge = orgQuery.data?.myRole === 'OWNER' || orgQuery.data?.myRole === 'ADMIN';

  const countsQ = useQuery(trashCountsQuery());
  const boardsQ = useQuery(boardsQueries.all());

  const params = useMemo(
    () => ({ search: search.trim() || undefined, boardId: boardId || undefined }),
    [search, boardId],
  );
  const cardsQ = useQuery({ ...trashCardsQuery(params), enabled: tab === 'cards' });
  const listsQ = useQuery({ ...trashListsQuery(params), enabled: tab === 'lists' });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['trash'] });
    qc.invalidateQueries({ queryKey: ['boards'] });
  };

  const restoreCard = useMutation({
    mutationFn: (id: string) => restoreCardFromTrash(id),
    onSuccess: () => {
      invalidate();
      notify.success('Card restaurado.');
    },
    onError: (e: Error) => notify.error(e?.message ?? 'Falha ao restaurar.'),
  });

  const purgeCard = useMutation({
    mutationFn: (id: string) => deleteCardPermanent(id),
    onSuccess: () => {
      invalidate();
      notify.success('Card excluído permanentemente.');
    },
    onError: (e: Error) => notify.error(e?.message ?? 'Falha ao excluir.'),
  });

  const restoreListMut = useMutation({
    mutationFn: (id: string) => restoreListFromTrash(id),
    onSuccess: () => {
      invalidate();
      notify.success('Coluna restaurada. Cards continuam na lixeira — restaure individualmente.');
    },
    onError: (e: Error) => notify.error(e?.message ?? 'Falha ao restaurar.'),
  });

  const purgeListMut = useMutation({
    mutationFn: (id: string) => deleteListPermanent(id),
    onSuccess: () => {
      invalidate();
      notify.success('Coluna excluída permanentemente.');
    },
    onError: (e: Error) => notify.error(e?.message ?? 'Falha ao excluir.'),
  });

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-fg-muted hover:text-fg inline-flex items-center gap-1 text-sm"
          >
            <ChevronLeft size={14} />
            Início
          </Link>
          <span className="text-fg-subtle">/</span>
          <div className="flex items-center gap-2">
            <Trash size={18} className="text-fg-muted" />
            <h1 className="text-lg font-semibold">Lixeira</h1>
          </div>
          <span className="text-fg-muted text-[11px]">
            {countsQ.data?.total ?? 0} item(ns) — itens são apagados automaticamente após 90 dias
          </span>
        </div>
      </header>

      <div className="border-border mb-4 flex gap-1 border-b">
        <TabButton
          active={tab === 'cards'}
          onClick={() => setTab('cards')}
          icon={<FileText size={13} />}
          label="Cards"
          count={countsQ.data?.cards ?? 0}
        />
        <TabButton
          active={tab === 'lists'}
          onClick={() => setTab('lists')}
          icon={<Columns3 size={13} />}
          label="Colunas"
          count={countsQ.data?.lists ?? 0}
        />
      </div>

      <section className="border-border bg-bg-subtle/40 mb-4 flex flex-wrap items-center gap-2 rounded-md border p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={13}
            className="text-fg-muted pointer-events-none absolute left-2 top-1/2 -translate-y-1/2"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === 'cards' ? 'Buscar por título…' : 'Buscar por nome…'}
            className="border-border bg-bg focus-visible:ring-primary w-full rounded-md border py-1.5 pl-7 pr-2 text-xs focus-visible:outline-none focus-visible:ring-2"
          />
        </div>
        <select
          value={boardId}
          onChange={(e) => setBoardId(e.target.value)}
          className="border-border bg-bg focus-visible:ring-primary rounded-md border px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2"
        >
          <option value="">Todos os quadros</option>
          {(boardsQ.data ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </section>

      {tab === 'cards' ? (
        <CardsList
          isLoading={cardsQ.isLoading}
          items={cardsQ.data?.items ?? []}
          canPurge={canPurge}
          onRestore={(id) => restoreCard.mutate(id)}
          onPurge={async (row) => {
            const ok = await confirm({
              title: 'Excluir card permanentemente?',
              description: `"${row.title}" será apagado para sempre, junto com comentários, anexos e atividades. Esta ação não pode ser desfeita.`,
              confirmLabel: 'Excluir permanentemente',
              danger: true,
            });
            if (ok) purgeCard.mutate(row.id);
          }}
        />
      ) : (
        <ListsList
          isLoading={listsQ.isLoading}
          items={listsQ.data?.items ?? []}
          canPurge={canPurge}
          onRestore={(id) => restoreListMut.mutate(id)}
          onPurge={async (row) => {
            if (row._count.cards > 0) {
              notify.error(
                `Esta coluna tem ${row._count.cards} card(s) vivos. Mande-os pra lixeira antes de excluir a coluna.`,
              );
              return;
            }
            const ok = await confirm({
              title: 'Excluir coluna permanentemente?',
              description: `"${row.name}" será apagada para sempre. Esta ação não pode ser desfeita.`,
              confirmLabel: 'Excluir permanentemente',
              danger: true,
            });
            if (ok) purgeListMut.mutate(row.id);
          }}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ' +
        (active ? 'border-primary text-fg' : 'text-fg-muted hover:text-fg border-transparent')
      }
    >
      {icon}
      {label}
      <span
        className={
          'inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] ' +
          (active ? 'bg-primary/10 text-primary' : 'bg-bg-subtle text-fg-muted')
        }
      >
        {count}
      </span>
    </button>
  );
}

function CardsList({
  isLoading,
  items,
  canPurge,
  onRestore,
  onPurge,
}: {
  isLoading: boolean;
  items: TrashCardRow[];
  canPurge: boolean;
  onRestore: (id: string) => void;
  onPurge: (row: TrashCardRow) => void;
}) {
  if (isLoading) {
    return (
      <div className="text-fg-muted flex items-center gap-2 py-12 text-sm">
        <Loader2 size={14} className="animate-spin" />
        Carregando…
      </div>
    );
  }
  if (items.length === 0) {
    return <div className="text-fg-muted py-12 text-center text-sm">Nenhum card na lixeira.</div>;
  }
  return (
    <div className="border-border overflow-hidden rounded-md border">
      <table className="w-full text-xs">
        <thead className="bg-bg-subtle/50 text-fg-muted">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Título</th>
            <th className="px-3 py-2 text-left font-medium">Quadro</th>
            <th className="px-3 py-2 text-left font-medium">Coluna</th>
            <th className="px-3 py-2 text-left font-medium">Excluído por</th>
            <th className="px-3 py-2 text-left font-medium">Em</th>
            <th className="px-3 py-2 text-left font-medium">Some em</th>
            <th className="px-3 py-2 text-right font-medium">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {items.map((c) => (
            <tr key={c.id} className="hover:bg-bg-subtle/40">
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  {c.shortCode && <span className="text-fg-muted text-[10px]">#{c.shortCode}</span>}
                  <span className="font-medium">{c.title}</span>
                </div>
              </td>
              <td className="text-fg-muted px-3 py-2">{c.board?.name ?? '—'}</td>
              <td className="text-fg-muted px-3 py-2">
                {c.list?.name ?? '—'}
                {c.list?.deletedAt && (
                  <span className="ml-1 text-[10px] text-amber-600">(também na lixeira)</span>
                )}
              </td>
              <td className="text-fg-muted px-3 py-2">{c.deletedBy?.name ?? '—'}</td>
              <td className="text-fg-muted px-3 py-2">{formatDate(c.deletedAt)}</td>
              <td className="text-fg-muted px-3 py-2">{formatPurge(c.purgeAt)}</td>
              <td className="px-3 py-2 text-right">
                <RowActions
                  canPurge={canPurge}
                  onRestore={() => onRestore(c.id)}
                  onPurge={() => onPurge(c)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListsList({
  isLoading,
  items,
  canPurge,
  onRestore,
  onPurge,
}: {
  isLoading: boolean;
  items: TrashListRow[];
  canPurge: boolean;
  onRestore: (id: string) => void;
  onPurge: (row: TrashListRow) => void;
}) {
  if (isLoading) {
    return (
      <div className="text-fg-muted flex items-center gap-2 py-12 text-sm">
        <Loader2 size={14} className="animate-spin" />
        Carregando…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="text-fg-muted py-12 text-center text-sm">Nenhuma coluna na lixeira.</div>
    );
  }
  return (
    <div className="border-border overflow-hidden rounded-md border">
      <table className="w-full text-xs">
        <thead className="bg-bg-subtle/50 text-fg-muted">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Nome</th>
            <th className="px-3 py-2 text-left font-medium">Quadro</th>
            <th className="px-3 py-2 text-left font-medium">Cards vivos</th>
            <th className="px-3 py-2 text-left font-medium">Excluída por</th>
            <th className="px-3 py-2 text-left font-medium">Em</th>
            <th className="px-3 py-2 text-left font-medium">Some em</th>
            <th className="px-3 py-2 text-right font-medium">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {items.map((l) => (
            <tr key={l.id} className="hover:bg-bg-subtle/40">
              <td className="px-3 py-2 font-medium">{l.name}</td>
              <td className="text-fg-muted px-3 py-2">{l.board?.name ?? '—'}</td>
              <td className="text-fg-muted px-3 py-2">{l._count.cards}</td>
              <td className="text-fg-muted px-3 py-2">{l.deletedBy?.name ?? '—'}</td>
              <td className="text-fg-muted px-3 py-2">{formatDate(l.deletedAt)}</td>
              <td className="text-fg-muted px-3 py-2">{formatPurge(l.purgeAt)}</td>
              <td className="px-3 py-2 text-right">
                <RowActions
                  canPurge={canPurge}
                  onRestore={() => onRestore(l.id)}
                  onPurge={() => onPurge(l)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowActions({
  canPurge,
  onRestore,
  onPurge,
}: {
  canPurge: boolean;
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={onRestore}
        className="text-fg-muted hover:text-fg hover:bg-bg-subtle inline-flex items-center gap-1 rounded px-2 py-1 text-[11px]"
        title="Restaurar"
      >
        <RotateCcw size={12} />
        Restaurar
      </button>
      <button
        type="button"
        onClick={onPurge}
        disabled={!canPurge}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300 disabled:hover:bg-transparent dark:hover:bg-red-950/30"
        title={canPurge ? 'Excluir permanentemente' : 'Apenas OWNER/ADMIN pode excluir permanente'}
      >
        <Trash2 size={12} />
        Excluir
      </button>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPurge(iso: string | null): string {
  if (!iso) return '—';
  const diffMs = new Date(iso).getTime() - Date.now();
  const days = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  if (days === 0) return 'hoje';
  if (days === 1) return 'amanhã';
  return `${days} dias`;
}
