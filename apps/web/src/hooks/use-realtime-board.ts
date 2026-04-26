'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth-store';
import { boardsQueries } from '@/lib/queries/boards';

/**
 * Mantém o board sincronizado com os eventos do servidor via Socket.IO.
 *
 *   - Entra no room `board:{boardId}` após conectar.
 *   - Invalida a query do board em eventos card.* ou list.*
 *   - Invalida query do card específico em card.updated
 *   - Sai do room ao desmontar.
 */
export function useRealtimeBoard(params: { boardId: string; organizationId: string | null }): {
  onlineUserIds: string[];
} {
  const { boardId, organizationId } = params;
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.accessToken);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);

  useEffect(() => {
    if (!boardId || !organizationId || !user || !token) return;

    const socket = getSocket();

    const handlers = {
      'card.created': () => {
        queryClient.invalidateQueries({ queryKey: boardsQueries.detail(boardId).queryKey });
      },
      'card.moved': () => {
        queryClient.invalidateQueries({ queryKey: boardsQueries.detail(boardId).queryKey });
      },
      'card.updated': (payload: { cardId: string }) => {
        queryClient.invalidateQueries({ queryKey: boardsQueries.detail(boardId).queryKey });
        queryClient.invalidateQueries({ queryKey: ['cards', payload.cardId] });
      },
      'card.archived': () => {
        queryClient.invalidateQueries({ queryKey: boardsQueries.detail(boardId).queryKey });
      },
      'card.completed': () => {
        queryClient.invalidateQueries({ queryKey: boardsQueries.detail(boardId).queryKey });
        queryClient.invalidateQueries({ queryKey: ['boards', boardId, 'completed'] });
      },
      'card.uncompleted': () => {
        queryClient.invalidateQueries({ queryKey: boardsQueries.detail(boardId).queryKey });
        queryClient.invalidateQueries({ queryKey: ['boards', boardId, 'completed'] });
      },
      'list.created': () => {
        queryClient.invalidateQueries({ queryKey: boardsQueries.detail(boardId).queryKey });
      },
      'list.updated': () => {
        queryClient.invalidateQueries({ queryKey: boardsQueries.detail(boardId).queryKey });
      },
      'comment.added': (payload: { cardId: string }) => {
        queryClient.invalidateQueries({ queryKey: ['cards', payload.cardId] });
      },
      'presence.update': (payload: { boardId: string; userIds: string[] }) => {
        if (payload.boardId !== boardId) return;
        setOnlineUserIds(payload.userIds);
      },
    };

    function join() {
      socket.emit(
        'board.join',
        { boardId, organizationId },
        (ack: { ok: boolean; online?: string[] }) => {
          if (ack?.ok && Array.isArray(ack.online)) setOnlineUserIds(ack.online);
        },
      );
    }

    socket.on('connect', join);
    if (socket.connected) join();

    for (const [event, fn] of Object.entries(handlers)) {
      socket.on(event, fn);
    }

    return () => {
      socket.emit('board.leave', { boardId });
      socket.off('connect', join);
      for (const [event, fn] of Object.entries(handlers)) {
        socket.off(event, fn);
      }
      setOnlineUserIds([]);
    };
  }, [boardId, organizationId, queryClient, user, token]);

  return { onlineUserIds };
}

/**
 * Escuta notificações pessoais. Invalida query de unread count + list.
 */
export function useRealtimeNotifications() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!user || !token) return;

    const socket = getSocket();

    function handle() {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }

    socket.on('notification.created', handle);
    return () => {
      socket.off('notification.created', handle);
    };
  }, [queryClient, user, token]);
}
