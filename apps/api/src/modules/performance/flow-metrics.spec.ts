import type { PerformanceColumnConfig } from '@ktask/contracts';

import { computeFlowCounters, type FlowMove } from './flow-metrics';
import type { PerformanceConfigVersionLike } from './movement-classifier';

/** Quadro de Atendimento ficticio: Demandas -> Fazendo -> Aguardando -> Finalizado. */
const col = (
  listId: string,
  category: PerformanceColumnConfig['category'],
  progressOrder: number | null,
): PerformanceColumnConfig => ({ listId, category, progressOrder, counted: true });

const V: PerformanceConfigVersionLike = {
  effectiveFrom: new Date('2026-01-01T00:00:00Z'),
  columns: [
    col('demandas', 'ENTRADA', 1),
    col('fazendo', 'EM_ANDAMENTO', 2),
    col('aguardando', 'AGUARDANDO', null),
    col('finalizado', 'CONCLUSAO_POSITIVA', 3),
  ],
  transitionOverrides: [],
};

const h = (n: number) => new Date(Date.UTC(2026, 9, 5, 12) + n * 3_600_000); // 05/10 12h UTC + n horas
const mv = (cardId: string, from: string, to: string, at: Date): FlowMove => ({
  cardId,
  fromListId: from,
  toListId: to,
  at,
});
const period = { from: h(0), to: h(100) };

describe('computeFlowCounters', () => {
  it('jornada completa: recebido, iniciado, aguardando, devolvido, concluido + tempos', () => {
    const r = computeFlowCounters({
      ...period,
      versions: [V],
      starts: [{ cardId: 'c1', at: h(0) }],
      moves: [
        mv('c1', 'demandas', 'fazendo', h(4)), // 1o atendimento: 4h
        mv('c1', 'fazendo', 'aguardando', h(10)), // 6h em fazendo
        mv('c1', 'aguardando', 'fazendo', h(30)), // 20h aguardando
        mv('c1', 'fazendo', 'finalizado', h(32)), // 2h em fazendo; ciclo 32h
      ],
    });
    expect(r).toMatchObject({
      received: 1,
      started: 1,
      waitingEntries: 1,
      completed: 1,
      reopened: 0,
      avgFirstResponseHours: 4,
      avgCycleHours: 32,
    });
    expect(r.stageHours.get('demandas')).toEqual({ total: 4, samples: 1 });
    expect(r.stageHours.get('fazendo')).toEqual({ total: 8, samples: 2 });
    expect(r.stageHours.get('aguardando')).toEqual({ total: 20, samples: 1 });
  });

  it('devolucao (retrocesso) e reabertura', () => {
    const r = computeFlowCounters({
      ...period,
      versions: [V],
      starts: [{ cardId: 'c1', at: h(0) }],
      moves: [
        mv('c1', 'demandas', 'fazendo', h(1)),
        mv('c1', 'fazendo', 'demandas', h(2)), // devolvido
        mv('c1', 'demandas', 'fazendo', h(3)),
        mv('c1', 'fazendo', 'finalizado', h(4)),
        mv('c1', 'finalizado', 'fazendo', h(5)), // reaberto (tambem retrocesso)
      ],
    });
    expect(r.started).toBe(1); // so a 1a saida da entrada
    expect(r.returned).toBe(2);
    expect(r.reopened).toBe(1);
  });

  it('eventos fora do periodo nao contam, mas o historico define o tempo na coluna', () => {
    const r = computeFlowCounters({
      from: h(50),
      to: h(100),
      versions: [V],
      starts: [{ cardId: 'c1', at: h(0) }],
      moves: [
        mv('c1', 'demandas', 'fazendo', h(10)), // fora do periodo
        mv('c1', 'fazendo', 'finalizado', h(60)), // dentro: 50h em fazendo
      ],
    });
    expect(r.received).toBe(0);
    expect(r.started).toBe(0);
    expect(r.completed).toBe(1);
    expect(r.stageHours.get('fazendo')).toEqual({ total: 50, samples: 1 });
    expect(r.stageHours.has('demandas')).toBe(false);
    expect(r.avgCycleHours).toBe(60);
  });

  it('sem configuracao: so fatos (recebidos e tempo por etapa)', () => {
    const r = computeFlowCounters({
      ...period,
      versions: [],
      starts: [{ cardId: 'c1', at: h(0) }],
      moves: [mv('c1', 'a', 'b', h(5)), mv('c1', 'b', 'c', h(8))],
    });
    expect(r).toMatchObject({
      received: 1,
      started: 0,
      completed: 0,
      returned: 0,
      waitingEntries: 0,
    });
    expect(r.stageHours.get('a')).toEqual({ total: 5, samples: 1 });
    expect(r.stageHours.get('b')).toEqual({ total: 3, samples: 1 });
  });

  it('card sem entrada conhecida: nao inventa tempo da 1a coluna', () => {
    const r = computeFlowCounters({
      ...period,
      versions: [V],
      starts: [],
      moves: [mv('c9', 'demandas', 'fazendo', h(5)), mv('c9', 'fazendo', 'finalizado', h(9))],
    });
    expect(r.stageHours.has('demandas')).toBe(false);
    expect(r.stageHours.get('fazendo')).toEqual({ total: 4, samples: 1 });
    expect(r.avgFirstResponseHours).toBeNull();
    expect(r.avgCycleHours).toBeNull();
  });
});
