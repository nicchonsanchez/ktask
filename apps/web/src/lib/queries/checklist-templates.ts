import { api } from '@/lib/api-client';

export interface ChecklistTemplate {
  id: string;
  organizationId: string;
  title: string;
  items: string[];
  createdById: string;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string; avatarUrl: string | null };
}

export const checklistTemplatesQueries = {
  list: () => ({
    queryKey: ['checklist-templates'] as const,
    queryFn: () => api.get<ChecklistTemplate[]>('/api/v1/checklist-templates'),
  }),
};

export function createChecklistTemplate(input: { title: string; items: string[] }) {
  return api.post<ChecklistTemplate>('/api/v1/checklist-templates', input);
}

export function saveChecklistAsTemplate(input: { checklistId: string; title?: string }) {
  return api.post<ChecklistTemplate>('/api/v1/checklist-templates/from-checklist', input);
}

export function deleteChecklistTemplate(id: string) {
  return api.delete(`/api/v1/checklist-templates/${id}`);
}

export function applyChecklistTemplate(input: { templateId: string; cardId: string }) {
  return api.post('/api/v1/checklist-templates/apply', input);
}
