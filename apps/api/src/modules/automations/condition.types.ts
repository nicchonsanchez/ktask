import type { Priority } from '@prisma/client';

export type AutomationCondition =
  | TagsCondition
  | PriorityCondition
  | LeadCondition
  | DueDateCondition;

export interface TagsCondition {
  field: 'tags';
  operator: 'containsAny' | 'notContainsAny' | 'containsAll' | 'notContainsAll';
  /** labelIds */
  value: string[];
}

export interface PriorityCondition {
  field: 'priority';
  operator: 'is' | 'isNot' | 'isAny' | 'isNotAny';
  /** sempre array (1+ elementos); pra `is`/`isNot` use array de 1 */
  value: Priority[];
}

export interface LeadCondition {
  field: 'lead';
  operator: 'is' | 'isNot' | 'isAny' | 'isSet' | 'isNotSet';
  /** userIds; ausente para isSet/isNotSet */
  value?: string[];
}

export interface DueDateCondition {
  field: 'dueDate';
  operator: 'overdue' | 'dueToday' | 'dueWithinDays' | 'dueAfterDays' | 'hasDueDate' | 'noDueDate';
  /** dias, só pra dueWithinDays e dueAfterDays */
  value?: number;
}

/**
 * Card carregado com os campos necessarios pra avaliacao das condicoes.
 * A engine inclui labels (relacao many-to-many via CardLabel) e os campos
 * priority/leadId/dueDate diretos do model Card.
 */
export interface CardForConditions {
  priority: Priority;
  leadId: string | null;
  dueDate: Date | null;
  labels: Array<{ labelId: string }>;
}

/**
 * Avalia condicoes em sequencia (AND entre todas). Lista vazia ou null
 * = automacao sempre passa.
 *
 * Comparacoes de data usam BRT (UTC-3) pra "vence hoje" etc baterem com
 * percepcao do usuario (Hetzner em UTC).
 */
export function evaluateConditions(
  card: CardForConditions,
  conditions: AutomationCondition[] | null | undefined,
): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((cond) => evaluateOne(card, cond));
}

function evaluateOne(card: CardForConditions, cond: AutomationCondition): boolean {
  switch (cond.field) {
    case 'tags':
      return evalTags(card, cond);
    case 'priority':
      return evalPriority(card, cond);
    case 'lead':
      return evalLead(card, cond);
    case 'dueDate':
      return evalDueDate(card, cond);
  }
}

function evalTags(card: CardForConditions, cond: TagsCondition): boolean {
  const cardLabels = new Set(card.labels.map((l) => l.labelId));
  const target = cond.value ?? [];
  if (target.length === 0) return true; // condicao vazia nao filtra
  switch (cond.operator) {
    case 'containsAny':
      return target.some((id) => cardLabels.has(id));
    case 'notContainsAny':
      return !target.some((id) => cardLabels.has(id));
    case 'containsAll':
      return target.every((id) => cardLabels.has(id));
    case 'notContainsAll':
      return !target.every((id) => cardLabels.has(id));
  }
}

function evalPriority(card: CardForConditions, cond: PriorityCondition): boolean {
  const target = cond.value ?? [];
  if (target.length === 0) return true;
  switch (cond.operator) {
    case 'is':
      return target.length === 1 && card.priority === target[0];
    case 'isNot':
      return target.length === 1 && card.priority !== target[0];
    case 'isAny':
      return target.includes(card.priority);
    case 'isNotAny':
      return !target.includes(card.priority);
  }
}

function evalLead(card: CardForConditions, cond: LeadCondition): boolean {
  switch (cond.operator) {
    case 'isSet':
      return card.leadId !== null;
    case 'isNotSet':
      return card.leadId === null;
    case 'is':
      return Boolean(cond.value && cond.value.length === 1 && card.leadId === cond.value[0]);
    case 'isNot':
      return Boolean(cond.value && cond.value.length === 1 && card.leadId !== cond.value[0]);
    case 'isAny':
      return Boolean(card.leadId && cond.value && cond.value.includes(card.leadId));
  }
}

function evalDueDate(card: CardForConditions, cond: DueDateCondition): boolean {
  if (cond.operator === 'noDueDate') return card.dueDate === null;
  if (cond.operator === 'hasDueDate') return card.dueDate !== null;
  if (!card.dueDate) return false;

  const now = new Date();
  // BRT = UTC-3
  const todayBRT = startOfDayBRT(now);
  const tomorrowBRT = new Date(todayBRT.getTime() + 24 * 60 * 60_000);

  switch (cond.operator) {
    case 'overdue':
      return card.dueDate.getTime() < todayBRT.getTime();
    case 'dueToday':
      return (
        card.dueDate.getTime() >= todayBRT.getTime() &&
        card.dueDate.getTime() < tomorrowBRT.getTime()
      );
    case 'dueWithinDays': {
      const days = cond.value ?? 0;
      const limit = new Date(todayBRT.getTime() + (days + 1) * 24 * 60 * 60_000);
      return (
        card.dueDate.getTime() >= todayBRT.getTime() && card.dueDate.getTime() < limit.getTime()
      );
    }
    case 'dueAfterDays': {
      const days = cond.value ?? 0;
      const after = new Date(todayBRT.getTime() + days * 24 * 60 * 60_000);
      return card.dueDate.getTime() >= after.getTime();
    }
  }
}

/** Retorna meia-noite BRT do dia que `now` representa (UTC). */
function startOfDayBRT(now: Date): Date {
  // Converte pra BRT (UTC-3), zera hora, volta pra UTC pra comparar com Dates do Prisma
  const brtMs = now.getTime() - 3 * 60 * 60_000;
  const brt = new Date(brtMs);
  brt.setUTCHours(0, 0, 0, 0);
  // Volta pra UTC: BRT 00:00 = UTC 03:00
  return new Date(brt.getTime() + 3 * 60 * 60_000);
}
