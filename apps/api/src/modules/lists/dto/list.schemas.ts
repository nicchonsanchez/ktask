import { z } from 'zod';

export const CreateListSchema = z.object({
  boardId: z.string().cuid(),
  name: z.string().min(1).max(120).trim(),
  position: z.number().optional(),
});
export type CreateListRequest = z.infer<typeof CreateListSchema>;

export const UpdateListSchema = z.object({
  name: z.string().min(1).max(120).trim().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  icon: z.string().max(40).nullable().optional(),
  wipLimit: z.number().int().positive().nullable().optional(),
  slaMinutes: z.number().int().positive().nullable().optional(),
});
export type UpdateListRequest = z.infer<typeof UpdateListSchema>;

export const MoveListSchema = z.object({
  afterListId: z.string().cuid().nullable(),
});
export type MoveListRequest = z.infer<typeof MoveListSchema>;

export const ArchiveListSchema = z.object({
  /**
   * O que fazer com os cards da coluna ao arquivar:
   *   - 'archive': arquiva todos junto (some da listagem do board)
   *   - 'move': move pra outra coluna (`targetListId` obrigatório)
   * Coluna sem cards pode mandar omitido.
   */
  cardsAction: z.enum(['archive', 'move']).optional(),
  targetListId: z.string().cuid().optional(),
});
export type ArchiveListRequest = z.infer<typeof ArchiveListSchema>;
