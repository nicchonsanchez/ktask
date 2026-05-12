/**
 * Doc 49: helpers de recorrencia.
 *
 * Recurrence guarda a regra; dueDate da tarefa atual e a base pro calculo.
 * Quando user marca isDone, backend chama computeNextDueDate; se voltar
 * Date, cria nova instancia com essa dueDate. Senao (regra terminou ou
 * input invalido), nao cria.
 */

export type RecurrenceFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface Recurrence {
  freq: RecurrenceFreq;
  /** A cada N (default 1). Ex: a cada 2 semanas → freq=WEEKLY interval=2. */
  interval: number;
  /** Dias da semana (0=Dom..6=Sab). So usado quando freq=WEEKLY. Sem isso,
   *  WEEKLY repete no mesmo dia da semana do dueDate atual. */
  weekdays?: number[];
  /** ISO date opcional. Se passou, recorrencia termina (retorna null). */
  endsAt?: string;
}

/**
 * Valida que o input ja parseado de JSON respeita o shape de Recurrence.
 * Defensivo — actionConfig/recurrence JSON pode vir corrompido de
 * import historico ou alteracao direta no DB.
 */
export function parseRecurrence(raw: unknown): Recurrence | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const freq = r.freq;
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') return null;
  const interval = typeof r.interval === 'number' && r.interval > 0 ? Math.floor(r.interval) : 1;
  const out: Recurrence = { freq, interval };
  if (Array.isArray(r.weekdays)) {
    const days = r.weekdays.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6);
    if (days.length > 0) out.weekdays = Array.from(new Set(days)).sort();
  }
  if (typeof r.endsAt === 'string') out.endsAt = r.endsAt;
  return out;
}

/**
 * Calcula a proxima dueDate a partir de uma data base + regra. Retorna
 * null se a regra ja terminou (endsAt no passado) ou input invalido.
 *
 * - DAILY:   addDays(base, interval)
 * - WEEKLY sem weekdays: addDays(base, interval * 7)
 * - WEEKLY com weekdays: proximo dia em weekdays apos base; se nao tiver
 *   nessa semana, pula (interval-1) semanas e pega o primeiro dia.
 * - MONTHLY: addMonths(base, interval). Se dia nao existir (ex: 31 em fev),
 *   usa o ultimo dia do mes destino.
 * - YEARLY:  addYears(base, interval). Mesmo cuidado pra 29-fev.
 */
export function computeNextDueDate(base: Date, rec: Recurrence): Date | null {
  const interval = rec.interval > 0 ? rec.interval : 1;
  let next: Date;
  switch (rec.freq) {
    case 'DAILY':
      next = addDays(base, interval);
      break;
    case 'WEEKLY':
      next = nextWeekly(base, interval, rec.weekdays);
      break;
    case 'MONTHLY':
      next = addMonths(base, interval);
      break;
    case 'YEARLY':
      next = addYears(base, interval);
      break;
    default:
      return null;
  }
  if (rec.endsAt) {
    const end = new Date(rec.endsAt);
    if (!Number.isNaN(end.getTime()) && next.getTime() > end.getTime()) return null;
  }
  return next;
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function nextWeekly(base: Date, interval: number, weekdays: number[] | undefined): Date {
  if (!weekdays || weekdays.length === 0) return addDays(base, interval * 7);
  const baseDow = base.getDay();
  // Tenta achar um dia em weekdays > baseDow dentro da mesma semana
  const sorted = [...weekdays].sort((a, b) => a - b);
  const nextThisWeek = sorted.find((d) => d > baseDow);
  if (nextThisWeek !== undefined && interval === 1) {
    return addDays(base, nextThisWeek - baseDow);
  }
  // Senao, vai pra (interval-1) semanas a frente e pega o primeiro weekday
  const weeksAhead = interval > 0 ? interval : 1;
  // Calcula offset pra primeiro dia da semana ALVO:
  // Domingo da semana base + (weeksAhead * 7) + sorted[0]
  const sundayBase = addDays(base, -baseDow); // domingo da semana atual
  const sundayTarget = addDays(sundayBase, weeksAhead * 7);
  return addDays(sundayTarget, sorted[0]!);
}

/**
 * addMonths que respeita ultimo dia do mes destino. Ex: 2026-01-31 + 1m
 * → 2026-02-28 (nao 2026-03-03 que JS Date faz por overflow).
 */
function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  const day = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + months);
  const lastDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, lastDay));
  return r;
}

function addYears(d: Date, years: number): Date {
  return addMonths(d, years * 12);
}
