import { z } from 'zod';

/** ChecklistItem.priority continua usando esse enum. Card.priority foi
 *  removido (substituido por cardColor decorativo). */
export const PrioritySchema = z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']);

/** 8 cores decorativas livres do card (substituiram priority do card). */
export const CardColorSchema = z.enum([
  'slate',
  'rose',
  'orange',
  'amber',
  'emerald',
  'sky',
  'violet',
  'pink',
]);
export type CardColor = z.infer<typeof CardColorSchema>;

export const CreateCardSchema = z.object({
  listId: z.string().cuid(),
  title: z.string().min(1).max(500).trim(),
  description: z.any().optional().nullable(),
  cardColor: CardColorSchema.nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});
export type CreateCardRequest = z.infer<typeof CreateCardSchema>;

/** Doc 25: niveis de privacidade. PUBLIC = todos do board veem;
 *  TEAM_ONLY = so lider + CardMember (mais bypass de OWNER/ADMIN/GESTOR). */
export const CardPrivacySchema = z.enum(['PUBLIC', 'TEAM_ONLY']);
export type CardPrivacyValue = z.infer<typeof CardPrivacySchema>;

/** Doc 42: 4 estados de card, ortogonal a coluna. ACTIVE default. */
export const CardStatusSchema = z.enum(['ACTIVE', 'COMPLETED', 'WAITING', 'CANCELED']);
export type CardStatusValue = z.infer<typeof CardStatusSchema>;

export const UpdateCardSchema = z.object({
  title: z.string().min(1).max(500).trim().optional(),
  description: z.any().optional().nullable(),
  cardColor: CardColorSchema.nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  estimateMinutes: z.number().int().nonnegative().nullable().optional(),
  leadId: z.string().cuid().nullable().optional(),
  /** Capa do card: ID de um Attachment do próprio card. Null remove. */
  coverAttachmentId: z.string().cuid().nullable().optional(),
  /** Doc 25: privacidade do card. */
  privacy: CardPrivacySchema.optional(),
  /** Doc 42: status do card (ACTIVE/COMPLETED/WAITING/CANCELED). Mudar
   *  pra COMPLETED auto-set completedAt; mudar pra outro auto-clear. */
  status: CardStatusSchema.optional(),
  /**
   * Optimistic concurrency: version do card no momento em que o cliente
   * comecou a editar. Backend retorna 409 se outro user atualizou
   * enquanto isso. Omitido = comportamento legado (sobrescreve).
   */
  ifVersion: z.number().int().nonnegative().optional(),
});
export type UpdateCardRequest = z.infer<typeof UpdateCardSchema>;

export const MoveCardSchema = z.object({
  toListId: z.string().cuid(),
  afterCardId: z.string().cuid().nullable(),
});
export type MoveCardRequest = z.infer<typeof MoveCardSchema>;

export const MemberIdSchema = z.object({ userId: z.string().cuid() });
export const LabelIdSchema = z.object({ labelId: z.string().cuid() });

export const CreateChildCardSchema = z.object({
  title: z.string().min(1).max(500).trim(),
  description: z.any().optional().nullable(),
  copyDescription: z.boolean().optional(),
  copyLead: z.boolean().optional(),
  copyTeam: z.boolean().optional(),
  copyTags: z.boolean().optional(),
  copyDueDate: z.boolean().optional(),
  copyAttachments: z.boolean().optional(),
  targetBoardId: z.string().cuid().nullable().optional(),
  targetListId: z.string().cuid().nullable().optional(),
});
export type CreateChildCardRequest = z.infer<typeof CreateChildCardSchema>;

export const SetParentSchema = z.object({
  parentCardId: z.string().cuid().nullable(),
});
export type SetParentRequest = z.infer<typeof SetParentSchema>;

export const DuplicateCardSchema = z
  .object({
    copyDescription: z.boolean().optional(),
    copyLead: z.boolean().optional(),
    copyTeam: z.boolean().optional(),
    copyTags: z.boolean().optional(),
    copyDueDate: z.boolean().optional(),
    copyChecklists: z.boolean().optional(),
    copyAttachments: z.boolean().optional(),
    copyParent: z.boolean().optional(),
    count: z.number().int().min(1).max(10).optional(),
    /** Se omitido, duplica no mesmo board e lista do card original */
    targetBoardId: z.string().cuid().nullable().optional(),
    targetListId: z.string().cuid().nullable().optional(),
  })
  .default({})
  .refine((v) => (!v.targetBoardId && !v.targetListId) || (!!v.targetBoardId && !!v.targetListId), {
    message: 'Informe quadro e coluna de destino juntos.',
    path: ['targetListId'],
  });
export type DuplicateCardRequest = z.infer<typeof DuplicateCardSchema>;

export const LinkFlowSchema = z.object({
  boardId: z.string().cuid(),
  listId: z.string().cuid().optional(),
});
export type LinkFlowRequest = z.infer<typeof LinkFlowSchema>;

export const MoveInFlowSchema = z.object({
  toListId: z.string().cuid(),
  afterCardId: z.string().cuid().nullable().optional(),
  beforeCardId: z.string().cuid().nullable().optional(),
});
export type MoveInFlowRequest = z.infer<typeof MoveInFlowSchema>;
