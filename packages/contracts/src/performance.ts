import { z } from 'zod';

import type { OrgRole } from './roles';

/**
 * Doc 52 — Desempenho da Equipe.
 *
 * Contratos compartilhados entre API e web pra configuracao gerencial dos
 * fluxos e classificacao das movimentacoes. A configuracao NAO altera o
 * board operacional (colunas, nomes, isFinalList) — so interpreta eventos.
 * Ver tarefas-md/52-desempenho-equipe.md.
 */

/** Papeis que veem o relatorio, configuram e gerenciam metas (D6). */
export const PERFORMANCE_REPORT_ROLES: readonly OrgRole[] = ['OWNER', 'ADMIN'];

export function canViewPerformanceReport(role: OrgRole | string | null | undefined): boolean {
  return !!role && (PERFORMANCE_REPORT_ROLES as readonly string[]).includes(role);
}

/** Categorias gerenciais de coluna (spec §5.2). String no banco, enum aqui. */
export const PerformanceColumnCategorySchema = z.enum([
  'ENTRADA',
  'EM_ANDAMENTO',
  'AGUARDANDO',
  'PAUSADO',
  'CONCLUSAO_POSITIVA',
  'CONCLUSAO_NEGATIVA',
  'FLUXO_PARALELO',
]);
export type PerformanceColumnCategory = z.infer<typeof PerformanceColumnCategorySchema>;

/** Rotulos pt-BR exatamente como na especificacao funcional (spec §5.2). */
export const PERFORMANCE_COLUMN_CATEGORY_LABELS: Record<PerformanceColumnCategory, string> = {
  ENTRADA: 'Entrada',
  EM_ANDAMENTO: 'Em andamento',
  AGUARDANDO: 'Aguardando cliente/terceiro',
  PAUSADO: 'Pausado',
  CONCLUSAO_POSITIVA: 'Conclusão positiva',
  CONCLUSAO_NEGATIVA: 'Conclusão negativa',
  FLUXO_PARALELO: 'Fluxo paralelo',
};

export const CONCLUSION_CATEGORIES: readonly PerformanceColumnCategory[] = [
  'CONCLUSAO_POSITIVA',
  'CONCLUSAO_NEGATIVA',
];

/** Classes de movimentacao (spec §5.4 + casos de "nao inferir" do §5.8). */
export const MovementClassSchema = z.enum([
  'AVANCO',
  'RETROCESSO',
  'TRANSFERENCIA',
  'CONCLUSAO',
  'NEUTRA',
  'NAO_CLASSIFICADA',
]);
export type MovementClass = z.infer<typeof MovementClassSchema>;

/** Classes que um admin pode forcar numa excecao de transicao. */
export const OverrideMovementClassSchema = z.enum([
  'AVANCO',
  'RETROCESSO',
  'TRANSFERENCIA',
  'CONCLUSAO',
  'NEUTRA',
]);

export const PERFORMANCE_AREAS = ['COMERCIAL', 'ATENDIMENTO', 'DESENVOLVIMENTO', 'OUTRA'] as const;
export const PerformanceAreaSchema = z.enum(PERFORMANCE_AREAS);
export type PerformanceArea = z.infer<typeof PerformanceAreaSchema>;

export const PERFORMANCE_AREA_LABELS: Record<PerformanceArea, string> = {
  COMERCIAL: 'Comercial',
  ATENDIMENTO: 'Atendimento',
  DESENVOLVIMENTO: 'Desenvolvimento',
  OUTRA: 'Outra',
};

/** Config de 1 coluna dentro de uma versao. */
export const PerformanceColumnConfigSchema = z.object({
  listId: z.string().min(1),
  category: PerformanceColumnCategorySchema.nullable(),
  progressOrder: z.number().int().min(0).max(1000).nullable(),
  counted: z.boolean(),
});
export type PerformanceColumnConfig = z.infer<typeof PerformanceColumnConfigSchema>;

export const TransitionOverrideSchema = z.object({
  fromListId: z.string().min(1),
  toListId: z.string().min(1),
  movementClass: OverrideMovementClassSchema,
});
export type TransitionOverride = z.infer<typeof TransitionOverrideSchema>;

/** Body do PUT de configuracao de um fluxo (cria uma versao nova). */
export const UpsertBoardPerformanceConfigSchema = z
  .object({
    area: PerformanceAreaSchema.nullable().optional(),
    contactLoggingEnabled: z.boolean().optional(),
    columns: z.array(PerformanceColumnConfigSchema).max(200),
    transitionOverrides: z.array(TransitionOverrideSchema).max(200).default([]),
    /** ISO. Ausente = agora. No passado = retroatividade explicita (D2). */
    effectiveFrom: z.string().datetime().optional(),
    note: z.string().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.columns.forEach((c, i) => {
      if (seen.has(c.listId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['columns', i, 'listId'],
          message: 'Coluna repetida na configuração.',
        });
      }
      seen.add(c.listId);
    });
    v.transitionOverrides.forEach((o, i) => {
      if (o.fromListId === o.toListId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['transitionOverrides', i],
          message: 'Exceção precisa de colunas de origem e destino diferentes.',
        });
      }
    });
  });
export type UpsertBoardPerformanceConfigRequest = z.infer<
  typeof UpsertBoardPerformanceConfigSchema
>;

/**
 * Tipos de Activity que contam como "acao valida" do colaborador (doc 52
 * §6.5). CARD_CREATED de vinculo de fluxo / importacao e filtrado pela
 * origem/payload no servico, nao aqui.
 */
export const PERFORMANCE_ACTION_TYPES = [
  'CARD_CREATED',
  'CARD_UPDATED',
  'CARD_MOVED',
  'CARD_COMPLETED',
  'CARD_UNCOMPLETED',
  'CARD_ASSIGNED',
  'CARD_UNASSIGNED',
  'CARD_LEAD_CHANGED',
  'LABEL_ADDED',
  'LABEL_REMOVED',
  'COMMENT_ADDED',
  'CHECKLIST_CREATED',
  'CHECKLIST_RENAMED',
  'CHECKLIST_ITEM_CREATED',
  'CHECKLIST_ITEM_RENAMED',
  'CHECKLIST_ITEM_DONE',
  'CHECKLIST_ITEM_UNDONE',
  'ATTACHMENT_ADDED',
  'CARD_CONTACT_LINKED',
  'TIME_ENTRY_STOPPED',
  'TIME_ENTRY_CREATED',
] as const;
