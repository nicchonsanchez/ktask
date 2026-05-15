'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth-store';
import { boardsQueries } from '@/lib/queries/boards';

/** Estado da conexão Socket.IO pra UI mostrar feedback. */
export type ConnectionState = 'connected' | 'reconnecting' | 'offline';

/**
 * Mantém o board sincronizado com os eventos do servidor via Socket.IO.
 *
 *   - Entra no room `board:{boardId}` após conectar.
 *   - Invalida a query do board em eventos card.* ou list.*
 *   - Invalida query do card específico em card.updated
 *   - Sai do room ao desmontar.
 *
 * **Re-sync na reconexão (iter 2):** quando a conexão cai e volta (laptop
 * dorme, troca de wifi, túnel, etc), eventos disparados durante o gap
 * são perdidos. Pra evitar estado obsoleto, na reconexão invalidamos
 * todas as queries relevantes (board detail, completed, cards abertos,
 * notificações). Force fetch resolve qualquer drift.
 */
export function useRealtimeBoard(params: { boardId: string; organizationId: string | null }): {
  onlineUserIds: string[];
  connectionState: ConnectionState;
} {
  const { boardId, organizationId } = params;
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.accessToken);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connected');

  // Track if we've ever disconnected — initial connect doesn't trigger re-sync.
  const wasDisconnectedRef = useRef(false);

  useEffect(() => {
    if (!boardId || !organizationId || !user || !token) return;

    const socket = getSocket();

    function resyncOnReconnect() {
      // Force refetch — descartar tudo do cache do board atual e recarregar.
      queryClient.invalidateQueries({
        queryKey: boardsQueries.detail(boardId).queryKey,
      });
      queryClient.invalidateQueries({
        queryKey: ['boards', boardId, 'completed'],
      });
      // Cards individuais abertos no modal
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      // Notificações
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      // Time tracking (ativo + listas)
      queryClient.invalidateQueries({ queryKey: ['time-tracking'] });
    }

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
      'comment.reaction.updated': (payload: { cardId: string }) => {
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

    function onConnect() {
      setConnectionState('connected');
      join();
      // Se era reconexão (não initial connect), faz re-sync forçado
      if (wasDisconnectedRef.current) {
        resyncOnReconnect();
        wasDisconnectedRef.current = false;
      }
    }

    function onDisconnect() {
      wasDisconnectedRef.current = true;
      setConnectionState('reconnecting');
    }

    function onConnectError() {
      wasDisconnectedRef.current = true;
      setConnectionState('reconnecting');
    }

    function onOnline() {
      // Browser detectou rede de volta. Socket.IO reconecta sozinho mas
      // alguns navegadores demoram — força a tentativa.
      if (!socket.connected) socket.connect();
    }

    function onOffline() {
      wasDisconnectedRef.current = true;
      setConnectionState('offline');
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    if (socket.connected) {
      // Initial mount, already connected — só faz join sem re-sync (cache já fresco)
      join();
    }

    // Listen browser network status
    if (typeof window !== 'undefined') {
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
    }

    for (const [event, fn] of Object.entries(handlers)) {
      socket.on(event, fn);
    }

    return () => {
      socket.emit('board.leave', { boardId });
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      }
      for (const [event, fn] of Object.entries(handlers)) {
        socket.off(event, fn);
      }
      setOnlineUserIds([]);
    };
  }, [boardId, organizationId, queryClient, user, token]);

  return { onlineUserIds, connectionState };
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
