/**
 * Doc 52 — periodos do relatorio de Desempenho calculados no fuso da
 * organizacao (nao do navegador), pra bater com o agrupamento por dia do
 * backend. Ex.: "Hoje" = 00:00–23:59:59.999 em America/Sao_Paulo.
 */

export type PeriodPreset = 'today' | 'yesterday' | '7d' | '15d' | '30d' | '90d' | 'custom';

export const PERIOD_PRESETS: Array<{ key: PeriodPreset; label: string }> = [
  { key: 'today', label: 'Hoje' },
  { key: 'yesterday', label: 'Ontem' },
  { key: '7d', label: '7 dias' },
  { key: '15d', label: '15 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
  { key: 'custom', label: 'Personalizado' },
];

/** YYYY-MM-DD do instante no fuso. */
export function zonedDayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
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

/** Instante UTC de 00:00 do dia `key` (YYYY-MM-DD) no fuso. */
export function startOfZonedDay(key: string, timeZone: string): Date {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  // 2 iteracoes resolvem a virada de horario de verao.
  let t = guess - tzOffsetMs(new Date(guess), timeZone);
  t = guess - tzOffsetMs(new Date(t), timeZone);
  return new Date(t);
}

/** Soma dias a uma chave YYYY-MM-DD (calendario puro, sem fuso). */
export function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function endOfZonedDay(key: string, timeZone: string): Date {
  return new Date(startOfZonedDay(addDaysKey(key, 1), timeZone).getTime() - 1);
}

export function periodRange(
  preset: PeriodPreset,
  timeZone: string,
  custom?: { from?: string; to?: string },
  now: Date = new Date(),
): { from: string; to: string; fromKey: string; toKey: string } {
  const today = zonedDayKey(now, timeZone);
  let fromKey = today;
  let toKey = today;
  switch (preset) {
    case 'today':
      break;
    case 'yesterday':
      fromKey = toKey = addDaysKey(today, -1);
      break;
    case '7d':
    case '15d':
    case '30d':
    case '90d':
      fromKey = addDaysKey(today, -(Number.parseInt(preset, 10) - 1));
      break;
    case 'custom': {
      const f = custom?.from && /^\d{4}-\d{2}-\d{2}$/.test(custom.from) ? custom.from : today;
      const t = custom?.to && /^\d{4}-\d{2}-\d{2}$/.test(custom.to) ? custom.to : f;
      fromKey = f <= t ? f : t;
      toKey = f <= t ? t : f;
      break;
    }
  }
  return {
    from: startOfZonedDay(fromKey, timeZone).toISOString(),
    to: endOfZonedDay(toKey, timeZone).toISOString(),
    fromKey,
    toKey,
  };
}
