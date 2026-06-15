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

export interface NotificationsPage {
  items: NotificationItem[];
  nextCursor: string | null;
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
  /**
   * Pagina do historico completo de notificacoes. Cursor-based — usado
   * em /notificacoes com "carregar mais" via useInfiniteQuery.
   */
  page: (cursor?: string) => ({
    queryKey: ['notifications', 'page', cursor ?? null] as const,
    queryFn: () => {
      const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      return api.get<NotificationsPage>(`/api/v1/notifications/page${qs}`);
    },
  }),
};

// ----- Preferencias granulares (Gerenciar notificacoes) -----

export type NotificationEventKey =
  | 'mention_comment'
  | 'task_assigned'
  | 'task_unassigned'
  | 'task_due_changed'
  | 'task_due_soon'
  | 'approval_pending'
  | 'approval_responded'
  | 'card_lead_assigned'
  | 'card_commented'
  | 'card_completed'
  | 'card_moved'
  | 'card_due_changed'
  | 'card_checklist_changed'
  | 'card_sla_breach';

export type NotificationScope = 'leader' | 'present';

export interface NotificationEventPref {
  app: boolean;
  whatsapp: boolean;
  scope?: NotificationScope;
}

export type NotificationPreferences = Record<NotificationEventKey, NotificationEventPref>;

export const notificationPrefsQuery = {
  queryKey: ['notifications', 'preferences'] as const,
  queryFn: () => api.get<NotificationPreferences>('/api/v1/users/me/notification-preferences'),
};

export function updateNotificationPreferences(patch: Partial<NotificationPreferences>) {
  return api.patch<NotificationPreferences>('/api/v1/users/me/notification-preferences', patch);
}

export function markNotificationRead(id: string) {
  return api.post(`/api/v1/notifications/${id}/read`);
}

export function markAllNotificationsRead() {
  return api.post<{ count: number }>('/api/v1/notifications/read-all');
}
