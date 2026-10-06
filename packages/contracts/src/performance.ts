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
  'COMMERCIAL_ACTIVITY_LOGGED',
] as const;

// ---------------------------------------------------------------------------
// Relatorio (Fase 2)
// ---------------------------------------------------------------------------

/** Periodo maximo de uma consulta do relatorio (dias). */
export const PERFORMANCE_MAX_RANGE_DAYS = 366;

/** Metricas com drill-down (cada numero do relatorio abre os eventos). */
export const PerformanceMetricSchema = z.enum([
  'ACTIONS',
  'CARDS',
  'MOVES',
  'AVANCO',
  'RETROCESSO',
  'TRANSFERENCIA',
  'FINALIZACOES',
  'REABERTURAS',
  'COMMENTS',
  'NAO_CLASSIFICADA',
  'CONTACTS',
  'CONTACTS_DONE',
]);
export type PerformanceMetric = z.infer<typeof PerformanceMetricSchema>;

/** Filtros comuns (query string). Listas como CSV. */
export const PerformanceFiltersSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  boardIds: z.string().optional(),
  userIds: z.string().optional(),
  area: PerformanceAreaSchema.optional(),
  companyId: z.string().optional(),
});
export type PerformanceFiltersQuery = z.infer<typeof PerformanceFiltersSchema>;

export const PerformanceEventsQuerySchema = PerformanceFiltersSchema.extend({
  metric: PerformanceMetricSchema,
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type PerformanceEventsQuery = z.infer<typeof PerformanceEventsQuerySchema>;

export interface PerformanceCounters {
  /** Cards distintos com ao menos 1 acao valida. */
  cardsWorked: number;
  actions: number;
  moves: number;
  advances: number;
  retreats: number;
  transfers: number;
  /** Cards distintos levados a conclusao (D: cards distintos, drill-down mostra eventos). */
  completions: number;
  reopens: number;
  comments: number;
  /** Movimentacoes em fluxo/coluna sem configuracao vigente (nao inferidas). */
  unclassifiedMoves: number;
  /** Fase 3: registros de contato (qualquer resultado). */
  contacts: number;
  /** Registros com resultado que conta como contato realizado. */
  contactsDone: number;
  meetingsHeld: number;
  proposalsSent: number;
}

export interface PerformanceUserRef {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface PerformanceSummaryResponse {
  period: { from: string; to: string; timezone: string };
  totals: PerformanceCounters;
  byUser: Array<{ user: PerformanceUserRef; counters: PerformanceCounters }>;
  /** Um item por dia do periodo (fuso da org), inclusive dias zerados. */
  daily: Array<{ day: string; counters: PerformanceCounters }>;
  /** Fluxos com movimentacoes no periodo sem classificacao vigente. */
  unconfiguredBoards: Array<{ id: string; name: string; unclassifiedMoves: number }>;
  /** Follow-ups (tarefas criadas por registro de contato) em aberto agora. */
  followUps: { pending: number; overdue: number };
}

export interface PerformanceEventItem {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  actor: { id: string; name: string; email: string; avatarUrl: string | null } | null;
  card: { id: string; title: string; shortCode: string } | null;
  board: { id: string; name: string; color: string | null } | null;
  fromListName: string | null;
  toListName: string | null;
  movementClass: MovementClass | null;
  conclusion: 'POSITIVA' | 'NEGATIVA' | null;
  isCompletion: boolean;
  isReopen: boolean;
}

export interface PerformanceEventsResponse {
  total: number;
  page: number;
  pageSize: number;
  items: PerformanceEventItem[];
}

export interface PerformanceCardsResponse {
  total: number;
  items: Array<{
    card: { id: string; title: string; shortCode: string };
    board: { id: string; name: string; color: string | null } | null;
    actions: number;
    lastActionAt: string;
  }>;
}

// ---------------------------------------------------------------------------
// Configuracao (tela central, D8)
// ---------------------------------------------------------------------------

export type PerformanceConfigLevel = 'NONE' | 'BASIC' | 'FULL';

export interface PerformanceConfigVersionDto {
  id: string;
  effectiveFrom: string;
  columns: PerformanceColumnConfig[];
  transitionOverrides: TransitionOverride[];
  note: string | null;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
}

export interface PerformanceBoardSummaryDto {
  board: { id: string; name: string; color: string | null };
  area: PerformanceArea | null;
  contactLoggingEnabled: boolean;
  level: PerformanceConfigLevel;
  conclusionLists: Array<{ id: string; name: string; category: PerformanceColumnCategory }>;
  currentVersion: { id: string; effectiveFrom: string } | null;
}

export interface PerformanceBoardConfigDto {
  board: { id: string; name: string; color: string | null };
  area: PerformanceArea | null;
  contactLoggingEnabled: boolean;
  /** Colunas atuais (ordem do board) + antigas que aparecem no historico. */
  lists: Array<{
    id: string;
    name: string;
    position: number | null;
    isFinalList: boolean;
    isBacklog: boolean;
    status: 'ACTIVE' | 'ARCHIVED' | 'TRASHED' | 'HISTORY_ONLY';
    movesInHistory: number;
  }>;
  currentVersion: PerformanceConfigVersionDto | null;
  versions: PerformanceConfigVersionDto[];
  /** Data da 1a movimentacao do fluxo (sugestao pra retroatividade). */
  historyStartsAt: string | null;
}

export function performanceConfigLevel(
  columns: readonly PerformanceColumnConfig[] | null | undefined,
): PerformanceConfigLevel {
  if (!columns || columns.length === 0) return 'NONE';
  if (columns.some((c) => c.progressOrder !== null)) return 'FULL';
  if (columns.some((c) => c.category && CONCLUSION_CATEGORIES.includes(c.category))) return 'BASIC';
  return 'NONE';
}

// ---------------------------------------------------------------------------
// Registro de contato (Fase 3, D9) — spec §9, rotulos exatos
// ---------------------------------------------------------------------------

export const INTERACTION_TYPES = [
  'CALL',
  'WHATSAPP',
  'EMAIL',
  'MEETING',
  'FOLLOW_UP',
  'PROPOSAL',
  'OTHER',
] as const;
export const InteractionTypeSchema = z.enum(INTERACTION_TYPES);
export type InteractionType = z.infer<typeof InteractionTypeSchema>;

export const INTERACTION_TYPE_LABELS: Record<InteractionType, string> = {
  CALL: 'Ligação',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'E-mail',
  MEETING: 'Reunião',
  FOLLOW_UP: 'Follow-up',
  PROPOSAL: 'Proposta',
  OTHER: 'Outro',
};

/**
 * Resultados possiveis por tipo (spec §9). `done` = conta como "contato
 * realizado" nos indicadores. OTHER aceita qualquer um da lista generica.
 */
export const INTERACTION_OUTCOMES: Record<
  InteractionType,
  ReadonlyArray<{ key: string; label: string; done: boolean }>
> = {
  CALL: [
    { key: 'DONE', label: 'Realizado', done: true },
    { key: 'NO_ANSWER', label: 'Não respondeu', done: false },
    { key: 'CALL_BACK', label: 'Retornar depois', done: false },
  ],
  WHATSAPP: [
    { key: 'DONE', label: 'Realizado', done: true },
    { key: 'NO_ANSWER', label: 'Não respondeu', done: false },
    { key: 'INTERESTED', label: 'Interessado', done: true },
    { key: 'NOT_INTERESTED', label: 'Sem interesse', done: true },
  ],
  EMAIL: [
    { key: 'SENT', label: 'Enviado', done: true },
    { key: 'REPLY_RECEIVED', label: 'Retorno recebido', done: true },
  ],
  MEETING: [
    { key: 'HELD', label: 'Realizada', done: true },
    { key: 'NOT_HELD', label: 'Não realizada', done: false },
  ],
  FOLLOW_UP: [
    { key: 'DONE', label: 'Realizado', done: true },
    { key: 'PENDING', label: 'Pendente', done: false },
  ],
  PROPOSAL: [
    { key: 'SENT', label: 'Enviada', done: true },
    { key: 'REVISED', label: 'Revisada', done: true },
  ],
  OTHER: [
    { key: 'DONE', label: 'Realizado', done: true },
    { key: 'NOT_DONE', label: 'Não realizado', done: false },
  ],
};

export function interactionOutcome(type: InteractionType, outcome: string) {
  return INTERACTION_OUTCOMES[type].find((o) => o.key === outcome) ?? null;
}

/** Registro enviado junto com o comentario (campo opcional `interaction`). */
export const InteractionInputSchema = z
  .object({
    type: InteractionTypeSchema,
    outcome: z.string().min(1).max(40),
    /** Rotulo livre quando type = OTHER. */
    customLabel: z.string().trim().max(60).optional(),
    contactId: z.string().cuid().optional(),
    /** YYYY-MM-DD: cria tarefa de follow-up pra quem registrou. */
    followUpDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    /** Fluxo pelo qual o card foi aberto (regra multi-fluxo, D9). */
    boardId: z.string().cuid().optional(),
  })
  .superRefine((v, ctx) => {
    if (!interactionOutcome(v.type, v.outcome)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outcome'],
        message: 'Resultado inválido para este tipo de registro.',
      });
    }
    if (v.type === 'OTHER' && !v.customLabel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['customLabel'],
        message: 'Informe o tipo do registro.',
      });
    }
  });
export type InteractionInput = z.infer<typeof InteractionInputSchema>;

export interface CardInteractionDto {
  id: string;
  commentId: string | null;
  boardId: string;
  type: InteractionType;
  outcome: string;
  customLabel: string | null;
  occurredAt: string;
  user: { id: string; name: string } | null;
  followUpItemId: string | null;
}

/** GET /cards/:cardId/interactions — habilita os botoes + selos. */
export interface CardInteractionsResponse {
  /** true = mostrar os botoes de registro na caixa de comentario deste card. */
  enabled: boolean;
  /** Fluxo onde o registro sera gravado (null quando desabilitado). */
  boardId: string | null;
  items: CardInteractionDto[];
}
