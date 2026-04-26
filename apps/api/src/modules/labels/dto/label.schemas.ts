import { z } from 'zod';

const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve ser hex no formato #RRGGBB.');

export const CreateLabelSchema = z.object({
  name: z.string().min(1).max(40).trim(),
  color: HexColor,
});
export type CreateLabelRequest = z.infer<typeof CreateLabelSchema>;

export const UpdateLabelSchema = z.object({
  name: z.string().min(1).max(40).trim().optional(),
  color: HexColor.optional(),
});
export type UpdateLabelRequest = z.infer<typeof UpdateLabelSchema>;
