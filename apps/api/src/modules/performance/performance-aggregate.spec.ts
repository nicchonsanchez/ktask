import {
  aggregate,
  dayKey,
  daysBetween,
  deriveEvent,
  isValidAction,
  matchesMetric,
  type RawPerformanceEvent,
} from './performance-aggregate';
import type { PerformanceConfigVersionLike } from './movement-classifier';

const V: PerformanceConfigVersionLike = {
  effectiveFrom: new Date('2026-05-01T00:00:00Z'),
  columns: [
    { listId: 'ligando', category: 'EM_ANDAMENTO', progressOrder: 2, counted: true },
    { listId: 'interatividade', category: 'EM_ANDAMENTO', progressOrder: 3, counted: true },
    { listId: 'negociacao', category: 'EM_ANDAMENTO', progressOrder: 5, counted: true },
    { listId: 'finalizado', category: 'CONCLUSAO_POSITIVA', progressOrder: 6, counted: true },
    { listId: 'marketing', category: 'FLUXO_PARALELO', progressOrder: null, counted: true },
  ],
  transitionOverrides: [],
};
const versions = new Map([['b1', [V]]]);

let n = 0;
const ev = (
  type: string,
  payload: Record<string, unknown> = {},
  over: Partial<RawPerformanceEvent> = {},
): RawPerformanceEvent => ({
  id: `e${++n}`,
  type,
  payload,
  boardId: 'b1',
  cardId: 'c1',
  actorId: 'u1',
  createdAt: new Date('2026-09-10T15:00:00Z'),
  ...over,
});
const move = (from: string, to: string, over: Partial<RawPerformanceEvent> = {}) =>
  ev('CARD_MOVED', { fromListId: from, toListId: to }, over);

describe('deriveEvent', () => {
  it('classifica movimentacao pela versao vigente', () => {
    expect(deriveEvent(move('ligando', 'interatividade'), versions).movementClass).toBe('AVANCO');
    const done = deriveEvent(move('negociacao', 'finalizado'), versions);
    expect(done).toMatchObject({ movementClass: 'CONCLUSAO', isCompletion: true });
  });

  it('fluxo sem configuracao: movimentacao nao classificada', () => {
    const e = deriveEvent(move('a', 'b', { boardId: 'b2' }), versions);
    expect(e).toMatchObject({
      isMove: true,
      movementClass: 'NAO_CLASSIFICADA',
      isCompletion: false,
    });
  });

  it('evento anterior a vigencia da config: nao classificado', () => {
    const e = deriveEvent(
      move('ligando', 'interatividade', { createdAt: new Date('2026-04-01T12:00:00Z') }),
      versions,
    );
    expect(e.movementClass).toBe('NAO_CLASSIFICADA');
  });

  it('conclusao e reabertura por status (badge do modal)', () => {
    expect(
      deriveEvent(
        ev('CARD_UPDATED', { kind: 'status_changed', from: 'ACTIVE', to: 'COMPLETED' }),
        versions,
      ).isCompletion,
    ).toBe(true);
    expect(
      deriveEvent(
        ev('CARD_UPDATED', { kind: 'status_changed', from: 'COMPLETED', to: 'ACTIVE' }),
        versions,
      ).isReopen,
    ).toBe(true);
    expect(deriveEvent(ev('CARD_COMPLETED'), versions).isCompletion).toBe(true);
    expect(deriveEvent(ev('CARD_UNCOMPLETED'), versions).isReopen).toBe(true);
    // status que nao envolve COMPLETED: nem conclusao nem reabertura
    const w = deriveEvent(
      ev('CARD_UPDATED', { kind: 'status_changed', from: 'ACTIVE', to: 'WAITING' }),
      versions,
    );
    expect(w).toMatchObject({ isCompletion: false, isReopen: false });
  });

  it('comentario e marcado', () => {
    expect(deriveEvent(ev('COMMENT_ADDED'), versions).isComment).toBe(true);
  });
});

describe('isValidAction', () => {
  it('vincular card a outro fluxo nao conta como criacao', () => {
    expect(isValidAction(ev('CARD_CREATED', { linkedFromBoardId: 'b9' }))).toBe(false);
    expect(isValidAction(ev('CARD_CREATED', { title: 'x' }))).toBe(true);
  });
});

describe('aggregate', () => {
  it('soma metricas; cards trabalhados e finalizacoes sao distintos', () => {
    const events = [
      move('ligando', 'interatividade'),
      move('interatividade', 'ligando'),
      move('negociacao', 'finalizado'),
      // mesmo card concluido de novo por status -> continua 1 finalizacao
      ev('CARD_UPDATED', { kind: 'status_changed', from: 'ACTIVE', to: 'COMPLETED' }),
      move('finalizado', 'marketing'),
      ev('COMMENT_ADDED', {}, { cardId: 'c2' }),
      move('x', 'y', { boardId: 'b2', cardId: 'c3' }),
    ].map((e) => deriveEvent(e, versions));
    expect(aggregate(events)).toEqual({
      cardsWorked: 3,
      actions: 7,
      moves: 5,
      advances: 1,
      retreats: 1,
      transfers: 1,
      completions: 1,
      reopens: 0,
      comments: 1,
      unclassifiedMoves: 1,
    });
  });

  it('lista vazia zera tudo', () => {
    expect(aggregate([]).actions).toBe(0);
  });
});

describe('matchesMetric', () => {
  it('drill-down seleciona exatamente os eventos do numero', () => {
    const events = [
      move('ligando', 'interatividade'),
      move('negociacao', 'finalizado'),
      ev('COMMENT_ADDED'),
    ].map((e) => deriveEvent(e, versions));
    expect(events.filter((e) => matchesMetric(e, 'AVANCO'))).toHaveLength(1);
    expect(events.filter((e) => matchesMetric(e, 'MOVES'))).toHaveLength(2);
    expect(events.filter((e) => matchesMetric(e, 'FINALIZACOES'))).toHaveLength(1);
    expect(events.filter((e) => matchesMetric(e, 'COMMENTS'))).toHaveLength(1);
    expect(events.filter((e) => matchesMetric(e, 'ACTIONS'))).toHaveLength(3);
  });
});

describe('dayKey / daysBetween (fuso da org)', () => {
  const tz = 'America/Sao_Paulo';

  it('22h BRT continua no mesmo dia (nao vira o dia seguinte como em UTC)', () => {
    // 2026-09-10 22:30 BRT = 2026-09-11 01:30 UTC
    expect(dayKey(new Date('2026-09-11T01:30:00Z'), tz)).toBe('2026-09-10');
  });

  it('lista todos os dias do periodo, inclusive', () => {
    const days = daysBetween(
      new Date('2026-09-07T03:00:00Z'), // 07/09 00:00 BRT
      new Date('2026-09-13T02:59:59Z'), // 12/09 23:59 BRT
      tz,
    );
    expect(days).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
    ]);
  });

  it('periodo de 1 dia', () => {
    expect(
      daysBetween(new Date('2026-09-10T03:00:00Z'), new Date('2026-09-11T02:59:59Z'), tz),
    ).toEqual(['2026-09-10']);
  });
});
