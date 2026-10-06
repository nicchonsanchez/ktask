import {
  interactionOutcome,
  INTERACTION_TYPES,
  type InteractionType,
  type MovementClass,
  type PerformanceCounters,
  type PerformanceMetric,
} from '@ktask/contracts';

import {
  classifyMovement,
  pickVersionAt,
  type PerformanceConfigVersionLike,
} from './movement-classifier';

/**
 * Doc 52 — agregacao do relatorio de Desempenho (funcoes puras, sem I/O).
 *
 * Entrada: Activities ja filtradas por org/periodo/origin=USER/tipos validos.
 * Aqui so se deriva o significado de cada evento e se soma.
 */

export interface RawPerformanceEvent {
  id: string;
  type: string;
  payload: unknown;
  boardId: string | null;
  cardId: string | null;
  actorId: string | null;
  createdAt: Date;
}

export interface DerivedPerformanceEvent extends RawPerformanceEvent {
  isMove: boolean;
  fromListId: string | null;
  toListId: string | null;
  movementClass: MovementClass | null;
  conclusion: 'POSITIVA' | 'NEGATIVA' | null;
  isCompletion: boolean;
  isReopen: boolean;
  isComment: boolean;
  /** Fase 3: registro de contato (Activity COMMERCIAL_ACTIVITY_LOGGED). */
  isContact: boolean;
  contactDone: boolean;
  isMeetingHeld: boolean;
  isProposalSent: boolean;
  /** Fase 4: entrou em coluna marcada como "reunião agendada". */
  isMeetingScheduled: boolean;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

function payloadOf(e: RawPerformanceEvent): Record<string, unknown> {
  return e.payload && typeof e.payload === 'object' ? (e.payload as Record<string, unknown>) : {};
}

/**
 * CARD_CREATED tambem e usado pra "vinculou o card a outro fluxo"
 * (payload.linkedFromBoardId). Nao e criacao de trabalho — fica de fora.
 */
export function isValidAction(e: RawPerformanceEvent): boolean {
  if (e.type === 'CARD_CREATED' && str(payloadOf(e).linkedFromBoardId)) return false;
  return true;
}

export function deriveEvent(
  e: RawPerformanceEvent,
  versionsByBoard: ReadonlyMap<string, readonly PerformanceConfigVersionLike[]>,
): DerivedPerformanceEvent {
  const p = payloadOf(e);
  const base: DerivedPerformanceEvent = {
    ...e,
    isMove: false,
    fromListId: null,
    toListId: null,
    movementClass: null,
    conclusion: null,
    isCompletion: false,
    isReopen: false,
    isComment: e.type === 'COMMENT_ADDED',
    isContact: false,
    contactDone: false,
    isMeetingHeld: false,
    isProposalSent: false,
    isMeetingScheduled: false,
  };

  if (e.type === 'COMMERCIAL_ACTIVITY_LOGGED') {
    const type = str(p.type);
    const outcome = str(p.outcome);
    if (type && outcome && (INTERACTION_TYPES as readonly string[]).includes(type)) {
      const t = type as InteractionType;
      base.isContact = true;
      base.contactDone = interactionOutcome(t, outcome)?.done ?? false;
      base.isMeetingHeld = t === 'MEETING' && outcome === 'HELD';
      base.isProposalSent = t === 'PROPOSAL' && outcome === 'SENT';
    }
    return base;
  }

  if (e.type === 'CARD_MOVED') {
    const fromListId = str(p.fromListId);
    const toListId = str(p.toListId);
    base.isMove = true;
    base.fromListId = fromListId;
    base.toListId = toListId;
    if (fromListId && toListId && e.boardId) {
      const version = pickVersionAt(versionsByBoard.get(e.boardId) ?? [], e.createdAt);
      const c = classifyMovement(fromListId, toListId, version);
      base.movementClass = c.movementClass;
      base.conclusion = c.conclusion;
      base.isCompletion = c.movementClass === 'CONCLUSAO';
      base.isReopen = c.isReopen;
      if (version) {
        const meeting = (id: string) =>
          version.columns.some((col) => col.listId === id && col.meetingScheduled === true);
        base.isMeetingScheduled = meeting(toListId) && !meeting(fromListId);
      }
    } else {
      base.movementClass = 'NAO_CLASSIFICADA';
    }
    return base;
  }

  // Conclusao/reabertura por status (independem da configuracao do fluxo).
  if (e.type === 'CARD_COMPLETED') base.isCompletion = true;
  if (e.type === 'CARD_UNCOMPLETED') base.isReopen = true;
  if (e.type === 'CARD_UPDATED' && p.kind === 'status_changed') {
    if (p.to === 'COMPLETED' && p.from !== 'COMPLETED') base.isCompletion = true;
    if (p.from === 'COMPLETED' && p.to !== 'COMPLETED') base.isReopen = true;
  }
  return base;
}

export function emptyCounters(): PerformanceCounters {
  return {
    cardsWorked: 0,
    actions: 0,
    moves: 0,
    advances: 0,
    retreats: 0,
    transfers: 0,
    completions: 0,
    reopens: 0,
    comments: 0,
    unclassifiedMoves: 0,
    contacts: 0,
    contactsDone: 0,
    meetingsHeld: 0,
    proposalsSent: 0,
    meetingsScheduled: 0,
    completionsPositive: 0,
  };
}

/**
 * Soma um conjunto de eventos. "Cards trabalhados" e "Finalizacoes" contam
 * cards DISTINTOS (spec §8; decisao 13.1) — o drill-down mostra os eventos.
 */
export function aggregate(events: readonly DerivedPerformanceEvent[]): PerformanceCounters {
  const c = emptyCounters();
  const cards = new Set<string>();
  const completedCards = new Set<string>();
  const positiveCards = new Set<string>();
  for (const e of events) {
    c.actions++;
    if (e.cardId) cards.add(e.cardId);
    if (e.isComment) c.comments++;
    if (e.isContact) {
      c.contacts++;
      if (e.contactDone) c.contactsDone++;
      if (e.isMeetingHeld) c.meetingsHeld++;
      if (e.isProposalSent) c.proposalsSent++;
    }
    if (e.isMove) {
      c.moves++;
      if (e.movementClass === 'AVANCO') c.advances++;
      else if (e.movementClass === 'RETROCESSO') c.retreats++;
      else if (e.movementClass === 'TRANSFERENCIA') c.transfers++;
      else if (e.movementClass === 'NAO_CLASSIFICADA') c.unclassifiedMoves++;
    }
    if (e.isCompletion && e.cardId) {
      completedCards.add(e.cardId);
      if (e.conclusion !== 'NEGATIVA') positiveCards.add(e.cardId);
    }
    if (e.isMeetingScheduled) c.meetingsScheduled++;
    if (e.isReopen) c.reopens++;
  }
  c.cardsWorked = cards.size;
  c.completions = completedCards.size;
  c.completionsPositive = positiveCards.size;
  return c;
}

export function matchesMetric(e: DerivedPerformanceEvent, metric: PerformanceMetric): boolean {
  switch (metric) {
    case 'ACTIONS':
    case 'CARDS':
      return true;
    case 'MOVES':
      return e.isMove;
    case 'AVANCO':
    case 'RETROCESSO':
    case 'TRANSFERENCIA':
    case 'NAO_CLASSIFICADA':
      return e.isMove && e.movementClass === metric;
    case 'FINALIZACOES':
      return e.isCompletion;
    case 'REABERTURAS':
      return e.isReopen;
    case 'COMMENTS':
      return e.isComment;
    case 'CONTACTS':
      return e.isContact;
    case 'CONTACTS_DONE':
      return e.isContact && e.contactDone;
    case 'MEETINGS_SCHEDULED':
      return e.isMeetingScheduled;
  }
}

/** YYYY-MM-DD no fuso informado (ex.: America/Sao_Paulo). */
export function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Todos os dias (YYYY-MM-DD, no fuso) entre from e to, inclusive. */
export function daysBetween(from: Date, to: Date, timeZone: string): string[] {
  const out: string[] = [];
  const last = dayKey(to, timeZone);
  // Passo de 12h garante que nenhum dia e pulado em mudancas de fuso.
  let t = from.getTime();
  let prev = '';
  while (t <= to.getTime() + 12 * 3600_000) {
    const k = dayKey(new Date(t), timeZone);
    if (k !== prev) {
      out.push(k);
      prev = k;
    }
    if (k === last) break;
    t += 12 * 3600_000;
  }
  return out;
}
