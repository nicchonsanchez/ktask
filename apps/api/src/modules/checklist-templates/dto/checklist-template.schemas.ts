import { z } from 'zod';

export const CreateChecklistTemplateSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  items: z.array(z.string().min(1).max(500).trim()).min(1).max(100),
});
export type CreateChecklistTemplateRequest = z.infer<typeof CreateChecklistTemplateSchema>;

export const UpdateChecklistTemplateSchema = CreateChecklistTemplateSchema.partial();
export type UpdateChecklistTemplateRequest = z.infer<typeof UpdateChecklistTemplateSchema>;

export const SaveFromChecklistSchema = z.object({
  checklistId: z.string().cuid(),
  /** Título do template — default ao título da checklist origem. */
  title: z.string().min(1).max(200).trim().optional(),
});
export type SaveFromChecklistRequest = z.infer<typeof SaveFromChecklistSchema>;

export const ApplyTemplateSchema = z.object({
  templateId: z.string().cuid(),
  cardId: z.string().cuid(),
});
export type ApplyTemplateRequest = z.infer<typeof ApplyTemplateSchema>;
