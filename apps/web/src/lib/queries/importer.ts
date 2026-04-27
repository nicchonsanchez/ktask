import { api } from '@/lib/api-client';

export interface ImportReport {
  totalRows: number;
  created: number;
  skipped: number;
  errors: Array<{ row: number; cardName: string; reason: string }>;
  createdContacts: number;
  createdLabels: number;
  createdLists: number;
  warnings: string[];
  dryRun: boolean;
}

export function importUmmenseFlow(input: { csv: string; boardName?: string; dryRun: boolean }) {
  return api.post<ImportReport>('/api/v1/admin/import/ummense-flow', input);
}
