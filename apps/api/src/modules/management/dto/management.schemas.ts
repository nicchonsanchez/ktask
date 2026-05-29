import { z } from 'zod';

/**
 * Query string da Visao Gerencial. Todos os filtros sao opcionais e
 * aplicados em AND (intersecao). O cliente envia CUIDs separados por
 * virgula pra multiselect — backend faz split.
 */
export const ManagementListQuerySchema = z.object({
  /** Busca textual no titulo do card (case-insensitive, substring). */
  q: z.string().trim().max(200).optional(),
  /** IDs de Contact type=COMPANY vinculados ao card. */
  companyIds: z.string().optional(),
  /** IDs de User — match em `Card.leadId` OR `CardMember.userId`. */
  userIds: z.string().optional(),
  /** IDs de Label aplicadas ao card. */
  labelIds: z.string().optional(),
  /** IDs de Board (escopa visao gerencial a quadros especificos). */
  boardIds: z.string().optional(),
  /**
   * Status de prazo:
   * - `overdue` = dueDate < hoje (BRT) e status != COMPLETED
   * - `today` = dueDate dentro do dia de hoje (BRT)
   * - `next7` = dueDate nos proximos 7 dias (inclui hoje)
   * - `noDate` = sem dueDate
   */
  dueStatus: z.enum(['overdue', 'today', 'next7', 'noDate']).optional(),
  /**
   * Quando `true`, mostra apenas cards em colunas marcadas como
   * `isFinalList = true` (ex: "Finalizado"). Usado pela tela
   * `/visao-gerencial/finalizados`. Quando ausente ou `false`,
   * EXCLUI cards de colunas finais — gestor foca no que ainda demanda
   * atencao. Default `false`.
   */
  onlyFinalLists: z.coerce.boolean().optional().default(false),
  /** Pagina (offset-based). Default 1. */
  page: z.coerce.number().int().min(1).max(1000).default(1),
  /** Itens por pagina. Default 50, max 200. */
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ManagementListQuery = z.infer<typeof ManagementListQuerySchema>;

// ---- Kanban gerencial (colunas virtuais) ----

export const CreateColumnSchema = z.object({
  name: z.string().trim().min(1).max(60),
});
export type CreateColumnRequest = z.infer<typeof CreateColumnSchema>;

export const UpdateColumnSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    position: z.number().optional(),
  })
  .refine((v) => v.name !== undefined || v.position !== undefined, {
    message: 'Informe name e/ou position.',
  });
export type UpdateColumnRequest = z.infer<typeof UpdateColumnSchema>;

export const AddSourceSchema = z.object({
  boardId: z.string().cuid(),
  listId: z.string().cuid(),
});
export type AddSourceRequest = z.infer<typeof AddSourceSchema>;

// ---- Aprovacoes (visao gerencial) ----

export const ManagementApprovalDispatchesQuerySchema = z.object({
  /** Status do CardApproval (multiselect). Default: tudo. */
  status: z.string().optional(),
  /** ID do reviewer (User) pra filtrar. */
  reviewerId: z.string().cuid().optional(),
  /** ID do board pra filtrar. */
  boardId: z.string().cuid().optional(),
  /** Periodo de criacao do approval. */
  period: z.enum(['7d', '30d', '90d', 'all']).default('all'),
  /** Quando true, soh approvals com pelo menos 1 envio falho. */
  onlyFailures: z.coerce.boolean().optional().default(false),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ManagementApprovalDispatchesQuery = z.infer<
  typeof ManagementApprovalDispatchesQuerySchema
>;

export const ManagementApprovalsQuerySchema = z.object({
  /** ID de User reviewer pra filtrar (opcional). Approval onde algum
   * CardApprovalReviewer.userId == reviewerId. */
  reviewerId: z.string().cuid().optional(),
  /**
   * Filtro de idade da aprovacao (`requestedAt`):
   * - `over3d` = mais de 3 dias parada
   * - `over7d` = mais de 7 dias parada
   * - `all`    = sem filtro (default)
   */
  ageFilter: z.enum(['over3d', 'over7d', 'all']).default('all'),
});
export type ManagementApprovalsQuery = z.infer<typeof ManagementApprovalsQuerySchema>;

export const ManagementArchivedQuerySchema = ManagementListQuerySchema.extend({
  /**
   * Periodo de arquivamento. Filtra `archivedAt` quando setado.
   * Hoje o KTask nao guarda archivedAt explicito — usa `updatedAt` no
   * snapshot do isArchived. Implementacao usa updatedAt ate ganharmos
   * `archivedAt` proprio (follow-up).
   */
  archivedSince: z.enum(['7d', '30d', '90d', 'all']).default('all'),
});
export type ManagementArchivedQuery = z.infer<typeof ManagementArchivedQuerySchema>;
