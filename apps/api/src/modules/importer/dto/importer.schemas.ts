import { z } from 'zod';

/**
 * Body do POST /v1/admin/import/ummense-flow (LEGADO — usa auto-resolve
 * por nome). Continua funcionando pra fluxo simples ou uso programatico.
 * Pra fluxo manual interativo (pagina /configuracoes/importar), usar
 * /preview + /execute (V2 wizard).
 */
export const ImportUmmenseSchema = z.object({
  csv: z.string().min(10).max(5_000_000),
  boardName: z.string().trim().min(1).max(120).optional(),
  dryRun: z.boolean().default(false),
});
export type ImportUmmenseRequest = z.infer<typeof ImportUmmenseSchema>;

/**
 * Body do POST /admin/import/ummense-flow/preview
 * Recebe o CSV e (opcionalmente) o board destino. Devolve as entidades
 * unicas detectadas (membros + colunas) com sugestoes de match e
 * mapeamentos previamente salvos da Org.
 */
export const ImportPreviewSchema = z.object({
  csv: z.string().min(10).max(5_000_000),
  /** Board destino (existente). Null/undefined = vai criar um novo. */
  boardId: z.string().min(1).optional(),
});
export type ImportPreviewRequest = z.infer<typeof ImportPreviewSchema>;

/**
 * Mapping de uma lista/coluna do CSV pra entidade do KTask.
 *   { type: 'existing', listId } -> usa lista existente do board
 *   { type: 'create',   name }   -> cria nova lista com esse nome
 *   { type: 'complete' }         -> marca cards como Finalizado
 *                                   (completedAt setado; aparecem na
 *                                   coluna virtual "Finalizados" e
 *                                   ficam fisicamente na ultima lista
 *                                   do board)
 *   { type: 'ignore' }           -> cards nesta coluna sao pulados
 */
export const ListMappingTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('existing'), listId: z.string().min(1) }),
  z.object({ type: z.literal('create'), name: z.string().min(1).max(120) }),
  z.object({ type: z.literal('complete') }),
  z.object({ type: z.literal('ignore') }),
]);
export type ListMappingTarget = z.infer<typeof ListMappingTargetSchema>;

/**
 * Body do POST /admin/import/ummense-flow/execute
 *   members: { 'Thiago': 'user_id_xxx' | null (ignore) }
 *   lists:   { 'A fazer': { type: 'existing', listId: '...' } | ... }
 */
export const ImportExecuteSchema = z.object({
  csv: z.string().min(10).max(5_000_000),
  /** Existente OR null+createBoardName pra criar novo board. */
  boardId: z.string().min(1).optional(),
  /** Nome do board novo a criar quando boardId nao informado. */
  createBoardName: z.string().trim().min(1).max(120).optional(),
  /** sourceName -> targetUserId (null = ignorar este nome) */
  members: z.record(z.string(), z.string().nullable()).default({}),
  /** sourceName -> { type, listId|name } */
  lists: z.record(z.string(), ListMappingTargetSchema).default({}),
});
export type ImportExecuteRequest = z.infer<typeof ImportExecuteSchema>;
