import { z } from 'zod';

/**
 * Doc 55 — transferir responsabilidades pendentes de um membro para outro
 * (ex.: pessoa saiu e outra assume). So o que esta PENDENTE muda de dono;
 * historico (comentarios, horas, concluidos, desempenho) fica com quem fez.
 */

export const RESPONSIBILITY_CATEGORIES = [
  'cardsLead',
  'cardsMember',
  'checklistItems',
  'tasks',
  'approvalsToReview',
  'approvalsRequested',
  'boards',
  'automations',
] as const;
export type ResponsibilityCategory = (typeof RESPONSIBILITY_CATEGORIES)[number];

export const RESPONSIBILITY_CATEGORY_LABELS: Record<ResponsibilityCategory, string> = {
  cardsLead: 'Cards em que é responsável',
  cardsMember: 'Cards em que é membro',
  checklistItems: 'Tarefas dos cards',
  tasks: 'Tarefas avulsas',
  approvalsToReview: 'Aprovações pendentes para aprovar',
  approvalsRequested: 'Aprovações pendentes que pediu',
  boards: 'Acesso aos fluxos',
  automations: 'Automações que citam a pessoa',
};

export const RESPONSIBILITY_CATEGORY_HINTS: Record<ResponsibilityCategory, string> = {
  cardsLead: 'Só cards em aberto. Quem assume também entra como membro do card.',
  cardsMember: 'Só cards em aberto. Quem assume entra no lugar.',
  checklistItems: 'Só tarefas não concluídas, incluindo recorrentes e follow-ups.',
  tasks: 'Só tarefas não concluídas.',
  approvalsToReview: 'O link de aprovação antigo deixa de funcionar; quem assume recebe o pedido.',
  approvalsRequested: 'Quem assume passa a receber o resultado da aprovação.',
  boards: 'Quem assume entra nos mesmos fluxos, com o mesmo papel.',
  automations: 'Automações que definem responsável, equipe ou tarefas para a pessoa.',
};

export const TransferResponsibilitiesSchema = z.object({
  toUserId: z.string().min(1),
  categories: z
    .array(z.enum(RESPONSIBILITY_CATEGORIES))
    .min(1, 'Escolha ao menos um item para transferir.'),
});
export type TransferResponsibilitiesInput = z.infer<typeof TransferResponsibilitiesSchema>;

export interface ResponsibilitySample {
  id: string;
  label: string;
  /** Contexto curto (fluxo, card). */
  context: string | null;
}

export interface ResponsibilityPreviewDto {
  user: { id: string; name: string };
  categories: Array<{
    key: ResponsibilityCategory;
    count: number;
    samples: ResponsibilitySample[];
  }>;
  /** Metas individuais: nao sao transferidas, so informadas. */
  personalGoals: Array<{ id: string; name: string }>;
}

export interface ResponsibilityTransferResultDto {
  from: { id: string; name: string };
  to: { id: string; name: string };
  counts: Record<ResponsibilityCategory, number>;
}
