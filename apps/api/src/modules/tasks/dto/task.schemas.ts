import { z } from 'zod';

export const CreateTaskSchema = z.object({
  text: z.string().min(1).max(500).trim(),
  dueDate: z.string().datetime().nullable().optional(),
  assigneeId: z.string().cuid().nullable().optional(), // null = sem assignee, undefined = caller default (a si)
});
export type CreateTaskRequest = z.infer<typeof CreateTaskSchema>;

export const UpdateTaskSchema = z
  .object({
    text: z.string().min(1).max(500).trim().optional(),
    dueDate: z.string().datetime().nullable().optional(),
    assigneeId: z.string().cuid().nullable().optional(),
    isDone: z.boolean().optional(),
  })
  .strict();
export type UpdateTaskRequest = z.infer<typeof UpdateTaskSchema>;
