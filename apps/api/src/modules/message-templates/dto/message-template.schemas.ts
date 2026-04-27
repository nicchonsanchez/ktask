import { z } from 'zod';

export const MessageTemplateTypeSchema = z.enum(['whatsapp', 'comment']);
export type MessageTemplateType = z.infer<typeof MessageTemplateTypeSchema>;

export const CreateMessageTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(2000),
  type: MessageTemplateTypeSchema,
});
export type CreateMessageTemplateRequest = z.infer<typeof CreateMessageTemplateSchema>;

export const UpdateMessageTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  body: z.string().trim().min(1).max(2000).optional(),
});
export type UpdateMessageTemplateRequest = z.infer<typeof UpdateMessageTemplateSchema>;

export const ListMessageTemplatesQuerySchema = z.object({
  type: MessageTemplateTypeSchema.optional(),
});
export type ListMessageTemplatesQuery = z.infer<typeof ListMessageTemplatesQuerySchema>;
