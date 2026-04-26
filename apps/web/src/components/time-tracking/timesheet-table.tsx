'use client';

import Link from 'next/link';
import { Loader2, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { UserAvatar } from '@/components/user-avatar';
import { deleteTimeEntry, formatDuration, type TimesheetItem } from '@/lib/queries/time-tracking';
import { useConfirm, useNotify } from '@/components/ui/dialogs';

export function TimesheetTable({ items }: { items: TimesheetItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead className="border-border/60 text-fg-muted border-b text-left text-[10px] font-semibold uppercase tracking-wider">
          <tr>
            <Th>Usuário</Th>
            <Th>Card</Th>
            <Th>Etiquetas</Th>
            <Th>Equipe</Th>
            <Th>Fluxo</Th>
            <Th>Início</Th>
            <Th>Fim</Th>
            <Th align="right">Duração</Th>
            <Th align="right">{''}</Th>
          </tr>
        </thead>
        <tbody className="divide-border/40 divide-y">
          {items.map((item) => (
            <Row key={item.id} item={item} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ item }: { item: TimesheetItem }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const notify = useNotify();

  const deleteMut = useMutation({
    mutationFn: () => deleteTimeEntry(item.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-tracking'] });
      notify.success('Entrada removida.');
    },
    onError: () => notify.error('Falha ao remover entrada.'),
  });

  async function handleDelete() {
    const ok = await confirm({
      title: 'Remover esta entrada de tempo?',
      description: `${item.card.title} · ${formatDuration(item.durationSec ?? 0)}`,
      confirmLabel: 'Remover',
      danger: true,
    });
    if (ok) deleteMut.mutate();
  }

  const isRunning = item.endedAt === null;

  return (
    <tr className="hover:bg-bg-subtle/40">
      <Td>
        <div className="flex items-center gap-2">
          <UserAvatar
            name={item.user.name}
            userId={item.user.id}
            avatarUrl={item.user.avatarUrl}
            size="sm"
          />
          <span className="text-fg max-w-[140px] truncate">{item.user.name}</span>
        </div>
      </Td>
      <Td>
        <Link
          href={`/b/${item.card.boardId}?card=${item.cardId}`}
          className="text-fg hover:text-primary inline-flex max-w-[260px] items-center gap-1 truncate font-medium"
          title={item.card.title}
        >
          {item.card.title}
        </Link>
      </Td>
      <Td>
        <div className="flex max-w-[160px] flex-wrap gap-1">
          {item.card.labels.length === 0 ? (
            <span className="text-fg-subtle">—</span>
          ) : (
            item.card.labels.map((l) => (
              <span
                key={l.label.id}
                className="inline-flex max-w-[100px] truncate rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: l.label.color, color: '#fff' }}
              >
                {l.label.name}
              </span>
            ))
          )}
        </div>
      </Td>
      <Td>
        {item.card.members.length === 0 ? (
          <span className="text-fg-subtle">—</span>
        ) : (
          <div className="flex -space-x-1.5">
            {item.card.members.slice(0, 3).map((m) => (
              <UserAvatar
                key={m.user.id}
                name={m.user.name}
                userId={m.user.id}
                avatarUrl={m.user.avatarUrl}
                size="sm"
                stacked
              />
            ))}
            {item.card.members.length > 3 && (
              <span className="border-bg bg-bg-muted text-fg-muted inline-flex size-6 items-center justify-center rounded-full border-2 text-[10px] font-semibold">
                +{item.card.members.length - 3}
              </span>
            )}
          </div>
        )}
      </Td>
      <Td>
        <span className="text-fg-muted truncate">{item.card.board.name}</span>
      </Td>
      <Td>
        <span className="font-mono tabular-nums">{formatDateTime(item.startedAt)}</span>
      </Td>
      <Td>
        {isRunning ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            rodando
          </span>
        ) : (
          <span className="font-mono tabular-nums">
            {item.endedAt ? formatDateTime(item.endedAt) : '—'}
          </span>
        )}
      </Td>
      <Td align="right">
        <span
          className={`font-mono font-semibold tabular-nums ${isRunning ? 'text-emerald-600 dark:text-emerald-400' : 'text-fg'}`}
        >
          {formatDuration(item.durationSec ?? 0)}
        </span>
      </Td>
      <Td align="right">
        {!isRunning && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteMut.isPending}
            className="text-fg-muted hover:text-danger rounded p-1"
            aria-label="Remover entrada"
            title="Remover"
          >
            {deleteMut.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Trash2 size={12} />
            )}
          </button>
        )}
      </Td>
    </tr>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return <th className={`px-3 py-2.5 ${align === 'right' ? 'text-right' : ''}`}>{children}</th>;
}

function Td({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <td className={`px-3 py-2.5 align-middle ${align === 'right' ? 'text-right' : ''}`}>
      {children}
    </td>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}
