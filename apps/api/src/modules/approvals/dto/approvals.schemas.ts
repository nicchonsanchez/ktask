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

/** Acoes automaticas a executar quando o reviewer decidir. Permite
 *  configurar a aprovacao pra adicionar/remover tags alem de mover o
 *  card (que ja existia via defaultOn*ListId). */
const DefaultActionsSchema = z
  .object({
    addTagIds: z.array(z.string().cuid()).max(20).optional(),
    removeTagIds: z.array(z.string().cuid()).max(20).optional(),
  })
  .strict();
export type DefaultApprovalActions = z.infer<typeof DefaultActionsSchema>;

/** Destino "mover pra X no board Y" — usado em cards multi-fluxo. */
export const ApprovalTargetSchema = z.object({
  boardId: z.string().cuid(),
  listId: z.string().cuid(),
});
export type ApprovalTarget = z.infer<typeof ApprovalTargetSchema>;

export const RequestApprovalSchema = z.object({
  reviewers: z.array(ReviewerInputSchema).min(1).max(10),
  /** Mensagem opcional pro reviewer (vai junto no WhatsApp/inbox). */
  message: z.string().max(2000).optional(),
  /**
   * Destinos por board pra mover o card ao APROVAR. Cada entry
   * `{boardId, listId}` significa "ao aprovar, mover o card pra esta
   * lista neste board". Boards não listados não recebem movimentação.
   * Substitui `defaultOnApproveListId` (mantido como fallback abaixo).
   */
  defaultOnApproveTargets: z.array(ApprovalTargetSchema).max(20).optional(),
  /** Idem pra REPROVAR. */
  defaultOnRejectTargets: z.array(ApprovalTargetSchema).max(20).optional(),
  /** @deprecated — use defaultOnApproveTargets. Aceito pra compat. */
  defaultOnApproveListId: z.string().min(1).optional(),
  /** @deprecated — use defaultOnRejectTargets. */
  defaultOnRejectListId: z.string().min(1).optional(),
  /** Tags a adicionar/remover ao aprovar. */
  onApproveActions: DefaultActionsSchema.optional(),
  /** Tags a adicionar/remover ao reprovar. */
  onRejectActions: DefaultActionsSchema.optional(),
  /** Quando true, dispara WhatsApp pros reviewers que tiverem phone configurado. */
  notifyOnWhatsApp: z.boolean().default(true),
  /**
   * Override per-approval do lembrete automatico. Quando true, NENHUM
   * lembrete automatico sera enviado pra essa approval (mesmo que a org
   * tenha `approvalReminderEnabled = true`). Util pra aprovacoes urgentes
   * que o requester vai cobrar manualmente, ou silenciosas (low priority).
   */
  reminderDisabled: z.boolean().optional(),
  /**
   * Override per-approval do intervalo (em horas). Null/undefined = usa
   * setting da org. Aceita decimal: 0.5 = 30min, 1 = 1h, 1.5 = 1h30, etc.
   * Min 0.5 porque o cron roda a cada 30min.
   */
  reminderIntervalHoursOverride: z.number().min(0.5).max(72).optional(),
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

export const CancelApprovalSchema = z.object({
  /** Motivo opcional do cancelamento (aparece na timeline + WhatsApp pros revisores). */
  reason: z.string().max(500).trim().optional(),
});
export type CancelApprovalRequest = z.infer<typeof CancelApprovalSchema>;

export const ResendApprovalSchema = z.object({
  /**
   * ID do reviewer especifico pra reenviar. Se omitido ou null, reenvia
   * pra TODOS os reviewers do pedido. Modo "todos" e o default da UI
   * quando o pedido tem 2+ revisores.
   */
  reviewerId: z.string().cuid().nullable().optional(),
});
export type ResendApprovalRequest = z.infer<typeof ResendApprovalSchema>;
