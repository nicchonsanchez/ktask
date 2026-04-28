import { z } from 'zod';

export const CardOrderingSchema = z.enum([
  'MANUAL',
  'TIME_IN_LIST',
  'TIME_INTERACTION',
  'ALPHABETICAL',
  'COMPLETION_DATE',
  'CREATION_DATE',
]);
export type CardOrdering = z.infer<typeof CardOrderingSchema>;

export const CreateBoardSchema = z.object({
  name: z.string().min(2).max(120).trim(),
  description: z.string().max(1000).optional().nullable(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Cor deve ser hex #RRGGBB.')
    .optional()
    .nullable(),
  icon: z.string().max(40).optional().nullable(),
  visibility: z.enum(['PRIVATE', 'ORGANIZATION']).optional(),
});
export type CreateBoardRequest = z.infer<typeof CreateBoardSchema>;

export const UpdateBoardSchema = CreateBoardSchema.partial().extend({
  cardOrdering: CardOrderingSchema.optional(),
  inheritTeamOnNewCards: z.boolean().optional(),
});
export type UpdateBoardRequest = z.infer<typeof UpdateBoardSchema>;

export const AddBoardMemberSchema = z.object({
  userId: z.string().cuid(),
  role: z.enum(['ADMIN', 'EDITOR', 'COMMENTER', 'VIEWER']).optional(),
});
export type AddBoardMemberRequest = z.infer<typeof AddBoardMemberSchema>;

/**
 * Estrategias de exclusao de fluxo (doc 29).
 *   archive-cascade: arquiva o board E os cards exclusivos dele. Reversivel
 *                    via /restore. Default seguro.
 *   delete-all:      hard delete via cascade do Postgres. Apaga board, cards
 *                    (mesmo multi-fluxo), listas, presencas, activities. Exige
 *                    confirmacao por digitar o nome do board no payload.
 *   move/unlink/delete-orphans: previstas no doc mas nao implementadas em V1
 *                    (envolvem reassignment de Card.boardId NOT NULL).
 */
export const DeleteBoardStrategySchema = z.discriminatedUnion('strategy', [
  z.object({ strategy: z.literal('archive-cascade') }),
  z.object({
    strategy: z.literal('delete-all'),
    /** Nome exato do board, pra prevenir delete acidental. */
    confirmName: z.string().min(1).max(120),
  }),
]);
export type DeleteBoardStrategyRequest = z.infer<typeof DeleteBoardStrategySchema>;
