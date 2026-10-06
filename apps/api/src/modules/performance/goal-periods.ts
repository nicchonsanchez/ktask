import type { GoalPeriod } from '@ktask/contracts';

import { dayKey } from './performance-aggregate';

/**
 * Doc 52 (Fase 4) — periodos das metas no fuso da org (funcoes puras).
 * Semana = segunda a domingo. Chaves de dia no formato YYYY-MM-DD.
 */

export function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Offset (ms) do fuso no instante: horaLocal - horaUTC. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - (date.getTime() - date.getMilliseconds());
}

/** Instante UTC de 00:00 do dia `key` no fuso. */
export function startOfZonedDay(key: string, timeZone: string): Date {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - tzOffsetMs(new Date(guess), timeZone);
  t = guess - tzOffsetMs(new Date(t), timeZone);
  return new Date(t);
}

/** Inicio/fim (inclusive) do periodo que contem o dia `key`. */
export function periodBounds(period: GoalPeriod, key: string): { start: string; end: string } {
  if (period === 'DAY') return { start: key, end: key };
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  if (period === 'WEEK') {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
    const start = addDaysKey(key, -((dow + 6) % 7)); // volta ate segunda
    return { start, end: addDaysKey(start, 6) };
  }
  const start = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // ultimo dia do mes
  return { start, end };
}

/** Periodo atual + (n-1) anteriores, do mais recente pro mais antigo. */
export function recentPeriods(
  period: GoalPeriod,
  now: Date,
  timeZone: string,
  n: number,
): Array<{ start: string; end: string }> {
  const out: Array<{ start: string; end: string }> = [];
  let cursor = dayKey(now, timeZone);
  for (let i = 0; i < n; i++) {
    const b = periodBounds(period, cursor);
    out.push(b);
    cursor = addDaysKey(b.start, -1);
  }
  return out;
}

/** Intervalo UTC [from, to] cobrindo os dias start..end no fuso. */
export function periodRangeUtc(
  start: string,
  end: string,
  timeZone: string,
): { from: Date; to: Date } {
  return {
    from: startOfZonedDay(start, timeZone),
    to: new Date(startOfZonedDay(addDaysKey(end, 1), timeZone).getTime() - 1),
  };
}

/**
 * Alvo vigente num periodo: o de maior effectiveFrom <= fim do periodo
 * (mudanca no meio do periodo ja vale pra ele). Sem nenhum ate la, o mais
 * antigo (meta criada depois — mostra contra o alvo original).
 */
export function targetForPeriod(
  targets: ReadonlyArray<{ target: number; effectiveFrom: Date; createdAt?: Date }>,
  periodEnd: Date,
): number {
  if (targets.length === 0) return 0;
  const sorted = [...targets].sort(
    (a, b) =>
      a.effectiveFrom.getTime() - b.effectiveFrom.getTime() ||
      (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0),
  );
  let chosen = sorted[0]!;
  for (const t of sorted) if (t.effectiveFrom.getTime() <= periodEnd.getTime()) chosen = t;
  return chosen.target;
}
