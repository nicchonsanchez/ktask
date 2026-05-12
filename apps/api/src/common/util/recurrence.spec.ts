import { computeNextDueDate, parseRecurrence } from './recurrence';

function d(iso: string): Date {
  return new Date(iso);
}

describe('parseRecurrence', () => {
  it('retorna null pra inputs invalidos', () => {
    expect(parseRecurrence(null)).toBeNull();
    expect(parseRecurrence(undefined)).toBeNull();
    expect(parseRecurrence({})).toBeNull();
    expect(parseRecurrence({ freq: 'XPTO' })).toBeNull();
    expect(parseRecurrence('weekly')).toBeNull();
  });

  it('aceita shape minimo', () => {
    expect(parseRecurrence({ freq: 'DAILY' })).toEqual({ freq: 'DAILY', interval: 1 });
  });

  it('interval invalido vira 1', () => {
    expect(parseRecurrence({ freq: 'WEEKLY', interval: 0 })).toEqual({
      freq: 'WEEKLY',
      interval: 1,
    });
    expect(parseRecurrence({ freq: 'WEEKLY', interval: -5 })).toEqual({
      freq: 'WEEKLY',
      interval: 1,
    });
  });

  it('weekdays filtra valores invalidos', () => {
    expect(parseRecurrence({ freq: 'WEEKLY', interval: 1, weekdays: [1, 3, 99, 'x'] })).toEqual({
      freq: 'WEEKLY',
      interval: 1,
      weekdays: [1, 3],
    });
  });
});

describe('computeNextDueDate', () => {
  describe('DAILY', () => {
    it('soma N dias', () => {
      expect(computeNextDueDate(d('2026-05-12T00:00:00'), { freq: 'DAILY', interval: 1 })).toEqual(
        d('2026-05-13T00:00:00'),
      );
      expect(computeNextDueDate(d('2026-05-12T00:00:00'), { freq: 'DAILY', interval: 3 })).toEqual(
        d('2026-05-15T00:00:00'),
      );
    });
  });

  describe('WEEKLY sem weekdays', () => {
    it('soma N semanas no mesmo dia da semana', () => {
      expect(computeNextDueDate(d('2026-05-12T00:00:00'), { freq: 'WEEKLY', interval: 1 })).toEqual(
        d('2026-05-19T00:00:00'),
      );
      expect(computeNextDueDate(d('2026-05-12T00:00:00'), { freq: 'WEEKLY', interval: 2 })).toEqual(
        d('2026-05-26T00:00:00'),
      );
    });
  });

  describe('WEEKLY com weekdays', () => {
    it('proximo dia da mesma semana se existir', () => {
      // 2026-05-12 e terca (dow=2). Weekdays = [2, 4] (terca, quinta).
      // Proximo apos terca → quinta = +2 dias = 2026-05-14
      const next = computeNextDueDate(d('2026-05-12T00:00:00'), {
        freq: 'WEEKLY',
        interval: 1,
        weekdays: [2, 4],
      });
      expect(next).toEqual(d('2026-05-14T00:00:00'));
    });

    it('pula pra proxima semana se ja passou todos da semana', () => {
      // 2026-05-15 e sexta (dow=5). Weekdays = [1, 3] (seg, qua).
      // Nao tem dia > 5 em [1,3] → vai pra proxima semana, dia=1 (seg)
      // Domingo da semana base = 2026-05-10. + 7 dias = 2026-05-17 (dom).
      // + 1 (segunda) = 2026-05-18
      const next = computeNextDueDate(d('2026-05-15T00:00:00'), {
        freq: 'WEEKLY',
        interval: 1,
        weekdays: [1, 3],
      });
      expect(next).toEqual(d('2026-05-18T00:00:00'));
    });
  });

  describe('MONTHLY', () => {
    it('soma N meses mantendo o dia', () => {
      expect(
        computeNextDueDate(d('2026-05-12T00:00:00'), { freq: 'MONTHLY', interval: 1 }),
      ).toEqual(d('2026-06-12T00:00:00'));
    });

    it('respeita ultimo dia do mes destino (31-jan + 1m = 28-fev)', () => {
      expect(
        computeNextDueDate(d('2026-01-31T00:00:00'), { freq: 'MONTHLY', interval: 1 }),
      ).toEqual(d('2026-02-28T00:00:00'));
    });
  });

  describe('YEARLY', () => {
    it('soma N anos', () => {
      expect(computeNextDueDate(d('2026-05-12T00:00:00'), { freq: 'YEARLY', interval: 1 })).toEqual(
        d('2027-05-12T00:00:00'),
      );
    });

    it('29-fev em ano bissexto vira 28-fev no nao-bissexto', () => {
      expect(computeNextDueDate(d('2024-02-29T00:00:00'), { freq: 'YEARLY', interval: 1 })).toEqual(
        d('2025-02-28T00:00:00'),
      );
    });
  });

  describe('endsAt', () => {
    it('retorna null se proxima data > endsAt', () => {
      const r = computeNextDueDate(d('2026-05-12T00:00:00'), {
        freq: 'WEEKLY',
        interval: 1,
        endsAt: '2026-05-15',
      });
      expect(r).toBeNull();
    });

    it('retorna data se proxima ainda dentro do range', () => {
      const r = computeNextDueDate(d('2026-05-12T00:00:00'), {
        freq: 'DAILY',
        interval: 1,
        endsAt: '2026-12-31',
      });
      expect(r).toEqual(d('2026-05-13T00:00:00'));
    });
  });
});
