import { z } from 'zod';

export const CreateChecklistSchema = z.object({
  cardId: z.string().cuid(),
  title: z.string().min(1).max(200).trim().default('Tarefas'),
});
export type CreateChecklistRequest = z.infer<typeof CreateChecklistSchema>;

export const UpdateChecklistSchema = z.object({
  title: z.string().min(1).max(200).trim(),
});
export type UpdateChecklistRequest = z.infer<typeof UpdateChecklistSchema>;

export const CreateItemSchema = z.object({
  text: z.string().min(1).max(500).trim(),
  // assigneeId: undefined = caller (default), null = sem assignee, cuid = outro membro
  assigneeId: z.string().cuid().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});
export type CreateItemRequest = z.infer<typeof CreateItemSchema>;

export const UpdateItemSchema = z.object({
  text: z.string().min(1).max(500).trim().optional(),
  isDone: z.boolean().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  assigneeId: z.string().cuid().nullable().optional(),
});
export type UpdateItemRequest = z.infer<typeof UpdateItemSchema>;

export const MoveItemSchema = z.object({
  afterItemId: z.string().cuid().nullable(),
  /** Se o item está indo pra outra checklist do mesmo card */
  toChecklistId: z.string().cuid().optional(),
});
export type MoveItemRequest = z.infer<typeof MoveItemSchema>;
