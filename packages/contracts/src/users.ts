import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().cuid(),
  email: z.string().email(),
  name: z.string(),
  avatarUrl: z.string().url().nullable(),
  /** E.164 sem '+' (10–15 dígitos). Null quando não informado. */
  phone: z.string().nullable(),
  /** Opt-in pra notificar aprovações via WhatsApp. */
  notifyApprovalsOnWhatsApp: z.boolean(),
  locale: z.string().default('pt-BR'),
  timezone: z.string().default('America/Sao_Paulo'),
  twoFactorEnabled: z.boolean().default(false),
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof UserSchema>;

/**
 * Normaliza phone removendo tudo que não é dígito (espaço, +, traço,
 * parênteses, pontos). Usado como Zod transform — aceita inputs colados
 * formatados ("+55 (31) 99988-7777") e garante só-dígitos no banco.
 */
const PhoneSchema = z
  .union([z.string(), z.literal('')])
  .nullable()
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === '') return null;
    return v.replace(/\D/g, '');
  })
  .refine((v) => v === null || /^\d{10,15}$/.test(v), {
    message: 'Telefone deve ter de 10 a 15 dígitos (DDI + DDD + número).',
  });

export const UpdateProfileRequestSchema = z.object({
  name: z.string().min(2).max(120).trim().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  phone: PhoneSchema,
  notifyApprovalsOnWhatsApp: z.boolean().optional(),
  locale: z.enum(['pt-BR', 'en', 'es']).optional(),
  timezone: z.string().optional(),
});
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;
