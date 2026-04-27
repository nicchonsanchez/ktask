import { z } from 'zod';

/**
 * Body do POST /v1/admin/import/ummense-flow.
 *
 * `csv` e o conteudo bruto do CSV (arquivo lido no client e enviado
 * como string). Limite de 5MB no body request — suficiente pra fluxos
 * grandes (CSV de 1k cards com timeline cheia fica em ~2MB).
 *
 * `boardName` opcional: se nao informado, o importer usa o nome do
 * fluxo da coluna 3 do CSV (todos os cards de um CSV vem do mesmo fluxo).
 *
 * `dryRun` true: faz preview sem persistir nada — devolve relatorio do
 * que VAI criar pra admin confirmar antes de rodar de verdade.
 */
export const ImportUmmenseSchema = z.object({
  csv: z.string().min(10).max(5_000_000),
  boardName: z.string().trim().min(1).max(120).optional(),
  dryRun: z.boolean().default(false),
});
export type ImportUmmenseRequest = z.infer<typeof ImportUmmenseSchema>;
