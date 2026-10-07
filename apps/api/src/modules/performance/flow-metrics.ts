import { CONCLUSION_CATEGORIES } from '@ktask/contracts';

import {
  classifyMovement,
  pickVersionAt,
  type PerformanceConfigVersionLike,
} from './movement-classifier';

/**
 * Doc 52 (Fase 5) — indicadores do FLUXO de um quadro (funcao pura).
 *
 * Entrada: presencas do card no quadro (quando entrou) + todos os
 * CARD_MOVED do quadro desde antes do periodo (lookback), de qualquer
 * origem exceto importacao. Contadores so contam eventos DENTRO do periodo;
 * o historico anterior serve so pra saber desde quando o card estava na
 * coluna (tempo por etapa) e quando entrou no fluxo.
 */

export interface FlowMove {
  cardId: string;
  fromListId: string;
  toListId: string;
  at: Date;
}

export interface FlowStart {
  cardId: string;
  /** Quando o card entrou no fluxo (criado ou vinculado). */
  at: Date;
}

export interface FlowCounters {
  received: number;
  started: number;
  waitingEntries: number;
  returned: number;
  completed: number;
  reopened: number;
  avgFirstResponseHours: number | null;
  avgCycleHours: number | null;
  /** listId -> { totalHours, samples } (saidas da coluna no periodo). */
  stageHours: Map<string, { total: number; samples: number }>;
}

const HOUR = 3_600_000;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function computeFlowCounters(params: {
  starts: readonly FlowStart[];
  moves: readonly FlowMove[];
  versions: readonly PerformanceConfigVersionLike[];
  from: Date;
  to: Date;
}): FlowCounters {
  const { starts, versions, from, to } = params;
  const inPeriod = (d: Date) => d.getTime() >= from.getTime() && d.getTime() <= to.getTime();
  const startByCard = new Map(starts.map((s) => [s.cardId, s.at]));

  const out: FlowCounters = {
    received: starts.filter((s) => inPeriod(s.at)).length,
    started: 0,
    waitingEntries: 0,
    returned: 0,
    completed: 0,
    reopened: 0,
    avgFirstResponseHours: null,
    avgCycleHours: null,
    stageHours: new Map(),
  };

  const firstResponse: number[] = [];
  const cycle: number[] = [];

  // Agrupa movimentos por card, em ordem cronologica.
  const byCard = new Map<string, FlowMove[]>();
  for (const m of params.moves) {
    const arr = byCard.get(m.cardId) ?? [];
    arr.push(m);
    byCard.set(m.cardId, arr);
  }

  for (const [cardId, list] of byCard) {
    list.sort((a, b) => a.at.getTime() - b.at.getTime());
    const startAt = startByCard.get(cardId) ?? null;
    // Desde quando o card esta na coluna atual. Antes do 1o move, desde a
    // entrada no fluxo (se conhecida).
    let enteredAt: Date | null = startAt;
    let startedOnce = false;
    let completedOnce = false;

    for (const m of list) {
      const version = pickVersionAt(versions, m.at);
      const cat = (listId: string) =>
        version?.columns.find((c) => c.listId === listId)?.category ?? null;
      const fromCat = cat(m.fromListId);
      const toCat = cat(m.toListId);
      const counts = inPeriod(m.at);

      // Tempo na coluna de origem (so saidas dentro do periodo).
      if (counts && enteredAt && enteredAt.getTime() <= m.at.getTime()) {
        const h = (m.at.getTime() - enteredAt.getTime()) / HOUR;
        const cur = out.stageHours.get(m.fromListId) ?? { total: 0, samples: 0 };
        cur.total += h;
        cur.samples++;
        out.stageHours.set(m.fromListId, cur);
      }
      enteredAt = m.at;

      // Iniciado: 1a saida de "Entrada" pra coluna que nao e entrada.
      if (!startedOnce && fromCat === 'ENTRADA' && toCat && toCat !== 'ENTRADA') {
        startedOnce = true;
        if (counts) {
          out.started++;
          if (startAt) firstResponse.push((m.at.getTime() - startAt.getTime()) / HOUR);
        }
      }

      if (counts && toCat === 'AGUARDANDO' && fromCat !== 'AGUARDANDO') out.waitingEntries++;

      if (counts) {
        const c = classifyMovement(m.fromListId, m.toListId, version);
        if (c.movementClass === 'RETROCESSO') out.returned++;
        if (c.isReopen) out.reopened++;
        if (c.movementClass === 'CONCLUSAO') {
          out.completed++;
          if (!completedOnce && startAt) cycle.push((m.at.getTime() - startAt.getTime()) / HOUR);
        }
      }
      if (toCat && CONCLUSION_CATEGORIES.includes(toCat)) completedOnce = true;
    }
  }

  out.avgFirstResponseHours = avg(firstResponse);
  out.avgCycleHours = avg(cycle);
  return out;
}
