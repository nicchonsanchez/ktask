import { periodBounds, periodRangeUtc, recentPeriods, targetForPeriod } from './goal-periods';

const tz = 'America/Sao_Paulo';

describe('periodBounds', () => {
  it('dia', () => {
    expect(periodBounds('DAY', '2026-10-06')).toEqual({ start: '2026-10-06', end: '2026-10-06' });
  });

  it('semana de segunda a domingo (06/10/2026 e terca)', () => {
    expect(periodBounds('WEEK', '2026-10-06')).toEqual({ start: '2026-10-05', end: '2026-10-11' });
  });

  it('domingo pertence a semana que comecou na segunda anterior', () => {
    expect(periodBounds('WEEK', '2026-10-11')).toEqual({ start: '2026-10-05', end: '2026-10-11' });
  });

  it('mes, inclusive fevereiro', () => {
    expect(periodBounds('MONTH', '2026-10-06')).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(periodBounds('MONTH', '2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });
});

describe('recentPeriods', () => {
  it('semana atual + 3 anteriores', () => {
    const now = new Date('2026-10-06T15:00:00Z');
    expect(recentPeriods('WEEK', now, tz, 4).map((p) => p.start)).toEqual([
      '2026-10-05',
      '2026-09-28',
      '2026-09-21',
      '2026-09-14',
    ]);
  });

  it('usa o dia no fuso da org (22h30 de domingo ainda e a semana anterior)', () => {
    // domingo 11/10 22:30 BRT = segunda 12/10 01:30 UTC
    const now = new Date('2026-10-12T01:30:00Z');
    expect(recentPeriods('WEEK', now, tz, 1)[0]).toEqual({
      start: '2026-10-05',
      end: '2026-10-11',
    });
  });

  it('meses anteriores atravessam o ano', () => {
    const now = new Date('2026-01-15T15:00:00Z');
    expect(recentPeriods('MONTH', now, tz, 3).map((p) => p.start)).toEqual([
      '2026-01-01',
      '2025-12-01',
      '2025-11-01',
    ]);
  });
});

describe('periodRangeUtc', () => {
  it('cobre o dia inteiro no fuso', () => {
    const r = periodRangeUtc('2026-10-05', '2026-10-11', tz);
    expect(r.from.toISOString()).toBe('2026-10-05T03:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-10-12T02:59:59.999Z');
  });
});

describe('targetForPeriod (alvo versionado)', () => {
  const t1 = { target: 40, effectiveFrom: new Date('2026-09-01T03:00:00Z') };
  const t2 = { target: 50, effectiveFrom: new Date('2026-10-05T03:00:00Z') };

  it('periodo passado usa o alvo da epoca', () => {
    expect(targetForPeriod([t1, t2], new Date('2026-09-28T02:59:59Z'))).toBe(40);
  });

  it('periodo atual usa o alvo novo', () => {
    expect(targetForPeriod([t2, t1], new Date('2026-10-12T02:59:59Z'))).toBe(50);
  });

  it('periodo anterior a criacao da meta usa o alvo original', () => {
    expect(targetForPeriod([t1, t2], new Date('2026-08-01T00:00:00Z'))).toBe(40);
  });
});
