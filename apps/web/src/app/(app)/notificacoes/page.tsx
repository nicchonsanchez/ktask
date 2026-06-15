'use client';

import { useState, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Loader2, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  markAllNotificationsRead,
  markNotificationRead,
  notificationsQueries,
  type NotificationItem,
  type NotificationsPage,
} from '@/lib/queries/notifications';
import { formatRelativeTime } from '@/lib/prose';

/**
 * Historico completo de notificacoes do user. Paginacao cursor-based
 * (carrega 50 por vez via "Carregar mais"). Sino fica como atalho rapido
 * pras ultimas; aqui o user navega tudo, marca como lida e abre cards.
 */
export default function NotificacoesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showOnlyUnread, setShowOnlyUnread] = useState(false);

  const q = useInfiniteQuery({
    queryKey: ['notifications', 'page', 'all'] as const,
    queryFn: ({ pageParam }) =>
      notificationsQueries.page(pageParam as string | undefined).queryFn(),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: NotificationsPage) => lastPage.nextCursor ?? undefined,
  });

  const allItems = useMemo(() => (q.data?.pages ?? []).flatMap((p) => p.items), [q.data?.pages]);
  const items = showOnlyUnread ? allItems.filter((n) => !n.isRead) : allItems;

  const readMut = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const readAllMut = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  function open(n: NotificationItem) {
    if (!n.isRead) readMut.mutate(n.id);
    router.push(n.url);
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bell size={20} className="text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Notificações</h1>
            <p className="text-fg-muted text-xs">Histórico completo. Use filtros pra navegar.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowOnlyUnread((v) => !v)}
            className={`rounded-md border px-3 py-1.5 text-xs ${
              showOnlyUnread
                ? 'border-primary bg-primary-subtle text-primary'
                : 'border-border text-fg-muted hover:bg-bg-muted'
            }`}
          >
            Só não lidas
          </button>
          <button
            type="button"
            onClick={() => readAllMut.mutate()}
            disabled={readAllMut.isPending}
            className="border-border text-fg-muted hover:bg-bg-muted rounded-md border px-3 py-1.5 text-xs disabled:opacity-60"
          >
            Marcar todas como lidas
          </button>
          <Link
            href="/configuracoes/notificacoes"
            className="border-border text-fg-muted hover:bg-bg-muted inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs"
          >
            <Settings2 size={12} /> Gerenciar
          </Link>
        </div>
      </header>

      {q.isLoading ? (
        <div className="text-fg-muted flex items-center justify-center gap-2 py-12 text-sm">
          <Loader2 size={14} className="animate-spin" /> Carregando…
        </div>
      ) : items.length === 0 ? (
        <p className="text-fg-muted py-12 text-center text-sm">
          {showOnlyUnread ? 'Nenhuma notificação não lida.' : 'Nenhuma notificação ainda.'}
        </p>
      ) : (
        <>
          <ul className="border-border bg-bg divide-border/60 flex flex-col divide-y rounded-md border">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => open(n)}
                  className={`hover:bg-bg-muted/50 flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                    n.isRead ? '' : 'bg-primary-subtle/20'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${n.isRead ? 'text-fg-muted' : 'text-fg font-medium'}`}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-fg-subtle mt-0.5 line-clamp-2 text-xs">{n.body}</p>
                    )}
                    <p className="text-fg-subtle mt-1 text-[11px]">
                      {formatRelativeTime(n.createdAt)}
                    </p>
                  </div>
                  {!n.isRead && (
                    <span className="bg-primary mt-1.5 size-2 shrink-0 rounded-full" aria-hidden />
                  )}
                </button>
              </li>
            ))}
          </ul>

          {q.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => q.fetchNextPage()}
                disabled={q.isFetchingNextPage}
                className="border-border text-fg-muted hover:bg-bg-muted inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-xs disabled:opacity-60"
              >
                {q.isFetchingNextPage ? (
                  <>
                    <Loader2 size={12} className="animate-spin" /> Carregando…
                  </>
                ) : (
                  'Carregar mais'
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
