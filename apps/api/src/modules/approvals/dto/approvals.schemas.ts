import { z } from 'zod';

/**
 * Reviewer pode ser: (a) user interno (membro da Org), ou (b) phone-only
 * (externo, recebe link tokenizado por WhatsApp). XOR garantido pelo Zod
 * com refine — nunca os dois simultaneamente.
 *
 * Phone aceita input formatado ("+55 31 99988-7777") e normaliza pra
 * dígitos puros via transform.
 */
export const ReviewerInputSchema = z
  .object({
    userId: z.string().min(1).optional(),
    phone: z
      .string()
      .transform((v) => v.replace(/\D/g, ''))
      .refine((v) => /^\d{10,15}$/.test(v), {
        message: 'Telefone deve ter 10 a 15 dígitos (DDI + DDD + número).',
      })
      .optional(),
    externalName: z.string().min(1).max(120).optional(),
  })
  .refine((v) => !!v.userId !== (!!v.phone && !!v.externalName), {
    message: 'Informe userId OU (phone + externalName), nunca ambos.',
  });
export type ReviewerInput = z.infer<typeof ReviewerInputSchema>;

export const RequestApprovalSchema = z.object({
  reviewers: z.array(ReviewerInputSchema).min(1).max(10),
  /** Mensagem opcional pro reviewer (vai junto no WhatsApp/inbox). */
  message: z.string().max(2000).optional(),
  /** Lista pra mover o card automaticamente ao aprovar (fallback). */
  defaultOnApproveListId: z.string().min(1).optional(),
  /** Lista pra mover o card automaticamente ao reprovar (fallback). */
  defaultOnRejectListId: z.string().min(1).optional(),
  /** Quando true, dispara WhatsApp pros reviewers que tiverem phone configurado. */
  notifyOnWhatsApp: z.boolean().default(true),
});
export type RequestApprovalRequest = z.infer<typeof RequestApprovalSchema>;

export const DecideApprovalSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    note: z.string().max(2000).optional(),
  })
  .refine((v) => v.decision === 'APPROVE' || (v.note && v.note.trim().length >= 5), {
    message: 'Reprovação exige nota com pelo menos 5 caracteres.',
  });
export type DecideApprovalRequest = z.infer<typeof DecideApprovalSchema>;

export const PublicDecideSchema = DecideApprovalSchema;
export type PublicDecideRequest = z.infer<typeof PublicDecideSchema>;

export const UndoApprovalSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type UndoApprovalRequest = z.infer<typeof UndoApprovalSchema>;
