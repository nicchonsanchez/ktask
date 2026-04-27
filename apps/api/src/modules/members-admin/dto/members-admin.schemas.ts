import { z } from 'zod';

export const UpdateMemberSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  /**
   * Mudanca de email NAO e direta — sistema gera token e envia link de
   * confirmacao pro NOVO email. Anti-sequestro: admin nao pode forcar
   * email sem o user confirmar.
   */
  email: z.string().email().toLowerCase().trim().optional(),
  phone: z
    .string()
    .regex(/^\d{10,15}$/, 'Telefone deve ter 10 a 15 dígitos (E.164 sem o "+")')
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
});
export type UpdateMemberRequest = z.infer<typeof UpdateMemberSchema>;

export const SuspendMemberSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type SuspendMemberRequest = z.infer<typeof SuspendMemberSchema>;
