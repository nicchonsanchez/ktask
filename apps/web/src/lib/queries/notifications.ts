import { api } from '@/lib/api-client';

export interface NotificationItem {
  id: string;
  type: 'MENTION' | 'ASSIGNED' | 'DUE_SOON' | 'COMMENT' | 'SLA_BREACH' | 'AUTOMATION' | 'CUSTOM';
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
  // URL pre-resolvida pelo backend (ex: /b/{boardId}?card={cardId}&n={notifId})
  url: string;
}

export const notificationsQueries = {
  list: () => ({
    queryKey: ['notifications'] as const,
    queryFn: () => api.get<NotificationItem[]>('/api/v1/notifications'),
  }),
  unreadCount: () => ({
    queryKey: ['notifications', 'unread-count'] as const,
    queryFn: () => api.get<{ count: number }>('/api/v1/notifications/unread-count'),
    refetchInterval: 30_000,
  }),
};

export function markNotificationRead(id: string) {
  return api.post(`/api/v1/notifications/${id}/read`);
}

export function markAllNotificationsRead() {
  return api.post<{ count: number }>('/api/v1/notifications/read-all');
}
