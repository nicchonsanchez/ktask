'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { pushQueries, subscribePush, unsubscribePush } from '@/lib/queries/push';
import { ApiError } from '@/lib/api-client';

export type PushPermission = 'default' | 'granted' | 'denied';

export type PushStatus =
  | 'unsupported' // browser não suporta service worker / push
  | 'idle' // SW pronto mas user nunca decidiu
  | 'subscribed' // user aceitou e está inscrito neste device
  | 'denied' // user negou permissão (precisa habilitar nas configs do browser)
  | 'loading';

interface UsePushNotificationsResult {
  status: PushStatus;
  permission: PushPermission;
  /** Pede permissão e cria subscription. Retorna true se ficou inscrito. */
  enable: () => Promise<boolean>;
  /** Remove a subscription deste device. */
  disable: () => Promise<void>;
  /** Loading: durante enable/disable. */
  busy: boolean;
  /** Última mensagem de erro de subscribe/unsubscribe. */
  error: string | null;
}

/**
 * Converte VAPID public key (base64url string) pra Uint8Array — exigido
 * pelo PushManager.subscribe().
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const buf = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) buf[i] = rawData.charCodeAt(i);
  return buf;
}

function getKeyAsBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Hook React pra gerenciar push notifications neste device.
 *
 * Fluxo:
 *   1. Verifica se o browser suporta SW + push
 *   2. Lê estado atual (permission + subscription existente)
 *   3. Expõe `enable` que pede permissão, faz subscribe via PushManager,
 *      converte chaves p256dh/auth pra base64url e POST no backend
 *   4. Expõe `disable` que faz unsubscribe local + DELETE no backend
 */
export function usePushNotifications(): UsePushNotificationsResult {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<PushStatus>('loading');
  const [permission, setPermission] = useState<PushPermission>('default');
  const [error, setError] = useState<string | null>(null);

  // Mantido como prefetch passivo (cache 1h) — não usado diretamente, mas garante
  // que ensureQueryData abaixo seja barato.
  useQuery({ ...pushQueries.vapidKey(), enabled: false });

  // Verifica suporte e estado inicial
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (typeof window === 'undefined') return;
      const supported =
        'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      if (!supported) {
        if (!cancelled) setStatus('unsupported');
        return;
      }
      const perm = Notification.permission as PushPermission;
      if (!cancelled) setPermission(perm);

      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (cancelled) return;
        if (sub) {
          setStatus('subscribed');
        } else if (perm === 'denied') {
          setStatus('denied');
        } else {
          setStatus('idle');
        }
      } catch {
        if (!cancelled) setStatus('idle');
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  const enableMut = useMutation({
    mutationFn: async () => {
      setError(null);
      // 1. Pega VAPID public key (cacheada por 1h via TanStack Query)
      const vapid = await queryClient.ensureQueryData(pushQueries.vapidKey());
      if (!vapid?.publicKey) throw new Error('VAPID public key não disponível.');

      // 2. Pede permissão
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);
      if (perm !== 'granted') {
        throw new Error(
          perm === 'denied'
            ? 'Você bloqueou notificações. Habilite nas configurações do navegador.'
            : 'Permissão não concedida.',
        );
      }

      // 3. Subscribe no PushManager
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // cast pra BufferSource — tipos do TS marcam Uint8Array como
        // ArrayBufferLike, mas a API aceita Uint8Array no runtime.
        applicationServerKey: urlBase64ToUint8Array(vapid.publicKey) as unknown as BufferSource,
      });

      // 4. Manda pro backend
      const json = sub.toJSON();
      await subscribePush({
        endpoint: json.endpoint!,
        keys: {
          p256dh: json.keys?.p256dh ?? getKeyAsBase64(sub.getKey('p256dh')),
          auth: json.keys?.auth ?? getKeyAsBase64(sub.getKey('auth')),
        },
        userAgent: navigator.userAgent,
      });
      return true;
    },
    onSuccess: () => {
      setStatus('subscribed');
      queryClient.invalidateQueries({ queryKey: ['push', 'subscriptions'] });
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : (err as Error).message;
      setError(msg);
      // Atualiza status baseado em permission
      if (Notification.permission === 'denied') setStatus('denied');
    },
  });

  const disableMut = useMutation({
    mutationFn: async () => {
      setError(null);
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await unsubscribePush(sub.endpoint).catch(() => undefined);
      }
    },
    onSuccess: () => {
      setStatus('idle');
      queryClient.invalidateQueries({ queryKey: ['push', 'subscriptions'] });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    },
  });

  const enable = useCallback(async () => {
    try {
      await enableMut.mutateAsync();
      return true;
    } catch {
      return false;
    }
  }, [enableMut.mutateAsync]);

  const disable = useCallback(async () => {
    await disableMut.mutateAsync();
  }, [disableMut.mutateAsync]);

  return {
    status,
    permission,
    enable,
    disable,
    busy: enableMut.isPending || disableMut.isPending,
    error,
  };
}
