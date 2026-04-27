'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, MessageSquare, AtSign, Calendar, AlertTriangle } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@ktask/ui';
import {
  markAllNotificationsRead,
  markNotificationRead,
  notificationsQueries,
  type NotificationItem,
} from '@/lib/queries/notifications';
import { formatRelativeTime } from '@/lib/prose';
import { useRealtimeNotifications } from '@/hooks/use-realtime-board';

const ICONS: Record<
  NotificationItem['type'],
  React.ComponentType<{ size?: number; className?: string }>
> = {
  MENTION: AtSign,
  ASSIGNED: Check,
  DUE_SOON: Calendar,
  COMMENT: MessageSquare,
  SLA_BREACH: AlertTriangle,
  AUTOMATION: Bell,
  CUSTOM: Bell,
};

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();

  useRealtimeNotifications();

  const unreadQuery = useQuery(notificationsQueries.unreadCount());
  const listQuery = useQuery({
    ...notificationsQueries.list(),
    enabled: open,
  });

  const readMut = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const readAllMut = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const unread = unreadQuery.data?.count ?? 0;
  const items = listQuery.data ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `${unread} notificações não lidas` : 'Notificações'}
          className="text-fg-muted hover:bg-bg-emphasis hover:text-fg relative flex size-9 items-center justify-center rounded-md transition-colors"
        >
          <Bell size={16} />
          {unread > 0 && (
            <span className="bg-danger text-primary-fg absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full text-[9px] font-bold">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="border-border flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notificações</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => readAllMut.mutate()}
              disabled={readAllMut.isPending}
              className="text-primary text-xs hover:underline"
            >
              Marcar todas como lidas
            </button>
          )}
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          {listQuery.isLoading && <p className="text-fg-muted p-4 text-sm">Carregando...</p>}
          {!listQuery.isLoading && items.length === 0 && (
            <p className="text-fg-muted p-6 text-center text-sm">Sem notificações.</p>
          )}
          {items.length > 0 && (
            <ul className="divide-border divide-y">
              {items.map((n) => {
                const Icon = ICONS[n.type] ?? Bell;
                return (
                  <li key={n.id} className={n.isRead ? '' : 'bg-primary-subtle/40'}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!n.isRead) readMut.mutate(n.id);
                        if (n.url) router.push(n.url);
                        setOpen(false);
                      }}
                      className="hover:bg-bg-muted flex w-full gap-3 px-3 py-2.5 text-left transition-colors"
                    >
                      <div className="bg-bg-muted text-fg-muted flex size-7 shrink-0 items-center justify-center rounded-full">
                        <Icon size={13} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-tight">{n.title}</p>
                        {n.body && (
                          <p className="text-fg-muted mt-0.5 line-clamp-2 text-xs">{n.body}</p>
                        )}
                        <p className="text-fg-subtle mt-1 text-xs">
                          {formatRelativeTime(n.createdAt)}
                        </p>
                      </div>
                      {!n.isRead && (
                        <span
                          className="bg-primary mt-1.5 size-2 shrink-0 rounded-full"
                          aria-hidden
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
