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
  /** Pagina (offset-based). Default 1. */
  page: z.coerce.number().int().min(1).max(1000).default(1),
  /** Itens por pagina. Default 50, max 200. */
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ManagementListQuery = z.infer<typeof ManagementListQuerySchema>;

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
