import { api } from '@/lib/api-client';

export type MessageTemplateType = 'whatsapp' | 'comment';

export interface MessageTemplate {
  id: string;
  organizationId: string;
  name: string;
  body: string;
  type: MessageTemplateType;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string; avatarUrl: string | null };
}

export const messageTemplatesQueries = {
  list: (type?: MessageTemplateType) => ({
    queryKey: ['message-templates', type ?? 'all'] as const,
    queryFn: () => {
      const qs = type ? `?type=${type}` : '';
      return api.get<MessageTemplate[]>(`/api/v1/organizations/me/message-templates${qs}`);
    },
  }),
};

export function createMessageTemplate(input: {
  name: string;
  body: string;
  type: MessageTemplateType;
}) {
  return api.post<MessageTemplate>('/api/v1/organizations/me/message-templates', input);
}

export function updateMessageTemplate(id: string, input: { name?: string; body?: string }) {
  return api.patch<MessageTemplate>(`/api/v1/message-templates/${id}`, input);
}

export function deleteMessageTemplate(id: string) {
  return api.delete(`/api/v1/message-templates/${id}`);
}
