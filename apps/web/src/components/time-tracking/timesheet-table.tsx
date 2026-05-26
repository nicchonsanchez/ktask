'use client';

import Link from 'next/link';
import { Loader2, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { UserAvatar } from '@/components/user-avatar';
import { deleteTimeEntry, formatDuration, type TimesheetItem } from '@/lib/queries/time-tracking';
import { useConfirm, useNotify } from '@/components/ui/dialogs';

export function TimesheetTable({ items }: { items: TimesheetItem[] }) {
  return (
    <>
      {/* Mobile: lista de cards verticais (<sm). */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {items.map((item) => (
          <MobileCard key={item.id} item={item} />
        ))}
      </ul>

      {/* Tablet+: tabela densa (sm+). */}
      <div className="hidden overflow-x-auto sm:block">
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
    </>
  );
}

function useDeleteEntry(item: TimesheetItem) {
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
      description: `${item.card?.title ?? 'Timer livre'} · ${formatDuration(item.durationSec ?? 0)}`,
      confirmLabel: 'Remover',
      danger: true,
    });
    if (ok) deleteMut.mutate();
  }

  return { deleteMut, handleDelete };
}

function MobileCard({ item }: { item: TimesheetItem }) {
  const { deleteMut, handleDelete } = useDeleteEntry(item);
  const isRunning = item.endedAt === null;

  return (
    <li className="border-border bg-bg flex flex-col gap-2.5 rounded-lg border p-3 shadow-sm">
      {/* Linha 1: card + duração */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {item.card ? (
            <Link
              href={`?card=${item.cardId}`}
              className="text-fg hover:text-primary block truncate text-sm font-medium"
              title={item.card.title}
            >
              {item.card.title}
            </Link>
          ) : (
            <span className="text-fg-subtle text-sm italic">Timer livre</span>
          )}
          {item.card && (
            <p className="text-fg-muted mt-0.5 truncate text-[11px]">{item.card.board.name}</p>
          )}
        </div>
        <span
          className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${
            isRunning ? 'text-emerald-600 dark:text-emerald-400' : 'text-fg'
          }`}
        >
          {formatDuration(item.durationSec ?? 0)}
        </span>
      </div>

      {/* Linha 2: user + status */}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <div className="flex min-w-0 items-center gap-1.5">
          <UserAvatar
            name={item.user.name}
            userId={item.user.id}
            avatarUrl={item.user.avatarUrl}
            size="xs"
          />
          <span className="text-fg-muted truncate">{item.user.name}</span>
        </div>
        {isRunning ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            rodando
          </span>
        ) : null}
      </div>

      {/* Linha 3: período */}
      <div className="text-fg-muted flex items-center justify-between gap-2 font-mono text-[11px] tabular-nums">
        <span>{formatDateTime(item.startedAt)}</span>
        <span>→</span>
        <span>{item.endedAt ? formatDateTime(item.endedAt) : '—'}</span>
      </div>

      {/* Linha 4: etiquetas + ação (se houver) */}
      {(item.card?.labels?.length || !isRunning) && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap gap-1">
            {item.card?.labels?.slice(0, 3).map((l) => (
              <span
                key={l.label.id}
                className="inline-flex max-w-[120px] truncate rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: l.label.color, color: '#fff' }}
              >
                {l.label.name}
              </span>
            ))}
            {item.card && item.card.labels.length > 3 && (
              <span className="text-fg-muted text-[10px]">+{item.card.labels.length - 3}</span>
            )}
          </div>
          {!isRunning && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteMut.isPending}
              className="text-fg-muted hover:text-danger hover:bg-danger-subtle shrink-0 rounded p-1.5"
              aria-label="Remover entrada"
              title="Remover"
            >
              {deleteMut.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function Row({ item }: { item: TimesheetItem }) {
  const { deleteMut, handleDelete } = useDeleteEntry(item);
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
        {item.card ? (
          <Link
            href={`?card=${item.cardId}`}
            className="text-fg hover:text-primary inline-flex max-w-[260px] items-center gap-1 truncate font-medium"
            title={item.card.title}
          >
            {item.card.title}
          </Link>
        ) : (
          <span className="text-fg-subtle italic">Sem card vinculado</span>
        )}
      </Td>
      <Td>
        <div className="flex max-w-[160px] flex-wrap gap-1">
          {!item.card || item.card.labels.length === 0 ? (
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
        {!item.card || item.card.members.length === 0 ? (
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
        {item.card ? (
          <span className="text-fg-muted truncate">{item.card.board.name}</span>
        ) : (
          <span className="text-fg-subtle">—</span>
        )}
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
