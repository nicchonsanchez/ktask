import { api } from '@/lib/api-client';

export interface Label {
  id: string;
  organizationId: string;
  boardId: string | null;
  name: string;
  color: string;
  createdAt: string;
}

export const labelsQueries = {
  byBoard: (boardId: string) => ({
    queryKey: ['labels', boardId] as const,
    queryFn: () => api.get<Label[]>(`/api/v1/boards/${boardId}/labels`),
  }),
};

export function createLabel(boardId: string, input: { name: string; color: string }) {
  return api.post<Label>(`/api/v1/boards/${boardId}/labels`, input);
}

export function updateLabel(labelId: string, input: { name?: string; color?: string }) {
  return api.patch<Label>(`/api/v1/labels/${labelId}`, input);
}

export function deleteLabel(labelId: string) {
  return api.delete(`/api/v1/labels/${labelId}`);
}
