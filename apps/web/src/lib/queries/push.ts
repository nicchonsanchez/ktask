import { api } from '@/lib/api-client';

export interface PushSubscriptionDevice {
  id: string;
  endpoint: string;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
}

export const pushQueries = {
  vapidKey: () => ({
    queryKey: ['push', 'vapid-key'] as const,
    queryFn: () => api.get<{ publicKey: string }>('/api/v1/push/vapid-public-key'),
    staleTime: 1000 * 60 * 60, // 1h — não muda
  }),
  subscriptions: () => ({
    queryKey: ['push', 'subscriptions'] as const,
    queryFn: () => api.get<PushSubscriptionDevice[]>('/api/v1/push/subscriptions'),
  }),
};

export function subscribePush(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}) {
  return api.post('/api/v1/push/subscriptions', input);
}

export function unsubscribePush(endpoint: string) {
  return api.delete('/api/v1/push/subscriptions', { endpoint });
}

export function unsubscribePushById(id: string) {
  return api.delete(`/api/v1/push/subscriptions/${id}`);
}
