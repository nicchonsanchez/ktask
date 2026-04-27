import { z } from 'zod';

import { PhoneNullableSchema } from '@/common/util/phone-schema';

export const UpdateMemberSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  /**
   * Mudanca de email NAO e direta — sistema gera token e envia link de
   * confirmacao pro NOVO email. Anti-sequestro: admin nao pode forcar
   * email sem o user confirmar.
   */
  email: z.string().email().toLowerCase().trim().optional(),
  /** Aceita formatado ("+55 31 99988-7777") e normaliza pra digitos. */
  phone: PhoneNullableSchema,
});
export type UpdateMemberRequest = z.infer<typeof UpdateMemberSchema>;

export const SuspendMemberSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type SuspendMemberRequest = z.infer<typeof SuspendMemberSchema>;
