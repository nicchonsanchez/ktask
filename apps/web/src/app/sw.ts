/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker';
import { Serwist } from 'serwist';

/**
 * Service Worker do KTask (PWA).
 *
 * Serwist cuida de: precaching dos assets do Next, runtime caching de
 * imagens/fonts/etc, fallback de navegação. Em cima disso, hooks próprios
 * processam push notifications (`push` event) e clique nelas
 * (`notificationclick` event).
 *
 * O SW só é gerado em build de produção (configuração em next.config.ts).
 * Em dev fica desativado pra evitar cache de builds parciais.
 */

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (string | { url: string; revision: string | null })[] | undefined;
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();

interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  notificationId?: string;
}

/**
 * Recebe push do servidor (formato JSON do PushService.sendToUser) e
 * mostra notificação nativa. Se o payload vier vazio (alguns push
 * services testam com push sem body), mostra placeholder genérico.
 */
self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = { title: 'KTask' };
  if (event.data) {
    try {
      payload = event.data.json() as PushPayload;
    } catch {
      payload = { title: 'KTask', body: event.data.text() };
    }
  }

  const promise = self.registration.showNotification(payload.title, {
    body: payload.body ?? '',
    icon: '/brand/app-icon-192.png',
    badge: '/brand/app-icon-192.png',
    tag: payload.tag,
    data: { url: payload.url ?? '/', notificationId: payload.notificationId },
    // Algumas plataformas (Windows / Android) usam `vibrate`
    // Nao incluido por padrao pra evitar comportamento intrusivo.
  });
  event.waitUntil(promise);
});

/**
 * Click na notificação — abre/foca a aba do KTask na URL passada no payload.
 * Se já tem aba aberta no domínio, reutiliza e navega; senão abre nova.
 */
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const data = event.notification.data as { url?: string } | undefined;
  const url = data?.url ?? '/';

  const promise = (async () => {
    const allClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    // Se já existir uma aba aberta no app, foca e navega
    for (const c of allClients) {
      if ('focus' in c && 'navigate' in c) {
        await c.focus();
        try {
          await (c as WindowClient).navigate(url);
        } catch {
          // navigate pode falhar em cross-origin — só foca
        }
        return;
      }
    }
    // Senão, abre nova janela
    if (self.clients.openWindow) {
      await self.clients.openWindow(url);
    }
  })();

  event.waitUntil(promise);
});
