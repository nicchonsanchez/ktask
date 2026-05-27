import { z } from 'zod';

export const StartTimerSchema = z
  .object({
    note: z.string().max(500).optional().nullable(),
  })
  .partial();
export type StartTimerRequest = z.infer<typeof StartTimerSchema>;

export const ManualEntrySchema = z
  .object({
    cardId: z.string().cuid().optional(),
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime(),
    note: z.string().max(500).optional().nullable(),
    userId: z.string().cuid().optional().nullable(), // só admin/owner pode lançar pra outro
  })
  .refine((v) => new Date(v.endedAt) > new Date(v.startedAt), {
    message: 'endedAt precisa ser maior que startedAt',
    path: ['endedAt'],
  });
export type ManualEntryRequest = z.infer<typeof ManualEntrySchema>;

export const UpdateTimeEntrySchema = z
  .object({
    // cardId: trocar o card vinculado. null = desvincular (timer livre).
    // undefined = nao mexe.
    cardId: z.string().cuid().nullable().optional(),
    startedAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .refine(
    (v) => {
      if (v.startedAt && v.endedAt) return new Date(v.endedAt) > new Date(v.startedAt);
      return true;
    },
    { message: 'endedAt precisa ser maior que startedAt', path: ['endedAt'] },
  );
export type UpdateTimeEntryRequest = z.infer<typeof UpdateTimeEntrySchema>;

/**
 * Express parseia ?userIds=A como string e ?userIds=A&userIds=B como array.
 * Pra aceitar ambos, normalizamos pra array sempre.
 */
const cuidArrayFromQuery = z
  .union([z.string().cuid(), z.array(z.string().cuid())])
  .optional()
  .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]));

export const TimesheetFilterSchema = z.object({
  userIds: cuidArrayFromQuery,
  cardId: z.string().cuid().optional(),
  boardId: z.string().cuid().optional(),
  source: z.enum(['TIMER', 'MANUAL']).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().cuid().optional(),
});
export type TimesheetFilterRequest = z.infer<typeof TimesheetFilterSchema>;
