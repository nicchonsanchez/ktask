import { api } from '@/lib/api-client';

export interface ImportReport {
  totalRows: number;
  created: number;
  skipped: number;
  /** Doc 31: cards ja existentes que ganharam CardPresence neste board (multi-fluxo). */
  linkedToFlow: number;
  errors: Array<{ row: number; cardName: string; reason: string }>;
  createdContacts: number;
  createdLabels: number;
  createdLists: number;
  /** Doc 39: anotacoes da timeline (col 17) importadas como comentario. */
  importedAnnotations: number;
  /** Doc 39: respostas de formulario (col 19) importadas como comentario. */
  importedFormResponses: number;
  warnings: string[];
  dryRun: boolean;
}

export interface MatchSuggestion {
  sourceName: string;
  candidate: { id: string; name: string } | null;
  score: number;
  /** Mapping previamente salvo na Org. Quando definido, force esse target. */
  savedTargetId?: string | null;
  /** True se mapping salvo era "Marcar como Finalizado" (sentinel). */
  savedAsComplete?: boolean;
}

export interface ImportPreviewResult {
  detectedBoardName: string;
  members: MatchSuggestion[];
  lists: MatchSuggestion[];
  totalRows: number;
  warnings: string[];
}

export type ListMappingTarget =
  | { type: 'existing'; listId: string }
  | { type: 'create'; name: string }
  | { type: 'complete' }
  | { type: 'ignore' };

export interface ImportExecuteInput {
  csv: string;
  boardId?: string;
  createBoardName?: string;
  members: Record<string, string | null>;
  lists: Record<string, ListMappingTarget>;
}

/** Legado (auto-resolve). Mantido pra compatibilidade. */
export function importUmmenseFlow(input: { csv: string; boardName?: string; dryRun: boolean }) {
  return api.post<ImportReport>('/api/v1/admin/import/ummense-flow', input);
}

/** V2 wizard step 1->2: extrai entidades + sugere matches. */
export function previewImport(input: { csv: string; boardId?: string }) {
  return api.post<ImportPreviewResult>('/api/v1/admin/import/ummense-flow/preview', input);
}

/** V2 wizard step 3: executa com mapping explicito. */
export function executeImport(input: ImportExecuteInput) {
  return api.post<ImportReport>('/api/v1/admin/import/ummense-flow/execute', input);
}
