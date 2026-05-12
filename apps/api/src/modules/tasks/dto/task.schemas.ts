import { z } from 'zod';

/** Doc 49: regra de recorrencia. null/undefined = sem recorrencia. */
const RecurrenceSchema = z
  .object({
    freq: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']),
    interval: z.number().int().min(1).max(365).default(1),
    weekdays: z.array(z.number().int().min(0).max(6)).optional(),
    endsAt: z.string().date().optional(),
  })
  .nullable();

export const CreateTaskSchema = z.object({
  text: z.string().min(1).max(500).trim(),
  dueDate: z.string().datetime().nullable().optional(),
  assigneeId: z.string().cuid().nullable().optional(), // null = sem assignee, undefined = caller default (a si)
  recurrence: RecurrenceSchema.optional(),
});
export type CreateTaskRequest = z.infer<typeof CreateTaskSchema>;

export const UpdateTaskSchema = z
  .object({
    text: z.string().min(1).max(500).trim().optional(),
    dueDate: z.string().datetime().nullable().optional(),
    assigneeId: z.string().cuid().nullable().optional(),
    isDone: z.boolean().optional(),
    recurrence: RecurrenceSchema.optional(),
  })
  .strict();
export type UpdateTaskRequest = z.infer<typeof UpdateTaskSchema>;
