import {
  CONCLUSION_CATEGORIES,
  type MovementClass,
  type PerformanceColumnCategory,
  type PerformanceColumnConfig,
  type TransitionOverride,
} from '@ktask/contracts';

/**
 * Doc 52 — classificador de movimentacoes (funcao pura, sem I/O).
 *
 * Fatos (de qual coluna pra qual coluna) vem da Activity CARD_MOVED; a
 * interpretacao vem da versao de configuracao do fluxo vigente NA DATA do
 * evento. Assim editar a configuracao nao reclassifica o passado (spec §18),
 * salvo retroatividade explicita (versao com effectiveFrom no passado).
 *
 * Ver tarefas-md/52-desempenho-equipe.md §6.3.
 */

export interface PerformanceConfigVersionLike {
  effectiveFrom: Date;
  /** Desempate entre versoes com a mesma vigencia: a salva por ultimo vale. */
  createdAt?: Date;
  columns: PerformanceColumnConfig[];
  transitionOverrides: TransitionOverride[];
}

export interface MovementClassification {
  movementClass: MovementClass;
  /** Preenchido quando movementClass = CONCLUSAO. */
  conclusion: 'POSITIVA' | 'NEGATIVA' | null;
  /** Saiu de coluna de conclusao pra uma nao-conclusao (conta como retrocesso). */
  isReopen: boolean;
}

const isConclusion = (c: PerformanceColumnCategory | null | undefined): boolean =>
  !!c && CONCLUSION_CATEGORIES.includes(c);

function result(
  movementClass: MovementClass,
  extra: Partial<Omit<MovementClassification, 'movementClass'>> = {},
): MovementClassification {
  return { movementClass, conclusion: null, isReopen: false, ...extra };
}

/**
 * Escolhe a versao vigente num instante: maior effectiveFrom <= at; em
 * empate de vigencia, a salva por ultimo (createdAt) — ex.: salvar o nivel
 * basico "desde maio" e depois o completo tambem "desde maio".
 * Aceita a lista em qualquer ordem. Null = fluxo nao configurado na data.
 */
export function pickVersionAt<T extends { effectiveFrom: Date; createdAt?: Date }>(
  versions: readonly T[],
  at: Date,
): T | null {
  let best: T | null = null;
  for (const v of versions) {
    if (v.effectiveFrom.getTime() > at.getTime()) continue;
    if (!best) {
      best = v;
      continue;
    }
    const dv = v.effectiveFrom.getTime() - best.effectiveFrom.getTime();
    const dc = (v.createdAt?.getTime() ?? 0) - (best.createdAt?.getTime() ?? 0);
    if (dv > 0 || (dv === 0 && dc > 0)) best = v;
  }
  return best;
}

export function classifyMovement(
  fromListId: string,
  toListId: string,
  version: PerformanceConfigVersionLike | null,
): MovementClassification {
  // 1. Fluxo sem configuracao vigente na data: nao inferir (spec §5.8).
  if (!version) return result('NAO_CLASSIFICADA');

  // 2. Excecao explicita da transicao vence tudo (spec §5.3).
  const override = version.transitionOverrides.find(
    (o) => o.fromListId === fromListId && o.toListId === toListId,
  );
  if (override) {
    return result(override.movementClass, {
      conclusion: override.movementClass === 'CONCLUSAO' ? 'POSITIVA' : null,
    });
  }

  const byId = new Map(version.columns.map((c) => [c.listId, c]));
  const from = byId.get(fromListId);
  const to = byId.get(toListId);

  // 3. Coluna marcada pra nao contabilizar: fora do progresso.
  if (from?.counted === false || to?.counted === false) return result('NEUTRA');

  const fromCat = from?.category ?? null;
  const toCat = to?.category ?? null;

  // 4. Entrou numa coluna de conclusao vindo de fora dela.
  if (isConclusion(toCat) && !isConclusion(fromCat)) {
    return result('CONCLUSAO', {
      conclusion: toCat === 'CONCLUSAO_NEGATIVA' ? 'NEGATIVA' : 'POSITIVA',
    });
  }

  // 5. Envolve fluxo paralelo: transferencia (ex.: Finalizado -> Marketing).
  //    Checado antes da reabertura de proposito (exemplo da spec §5.4).
  if (toCat === 'FLUXO_PARALELO' || fromCat === 'FLUXO_PARALELO') {
    return result('TRANSFERENCIA');
  }

  // 6. Saiu de conclusao pra coluna comum CONFIGURADA: reabertura, conta
  //    como retrocesso. Destino nao configurado (ex.: nivel basico, ou
  //    "Marketing" ainda sem categoria) cai na regra 8: nao inferir.
  if (isConclusion(fromCat) && to && !isConclusion(toCat)) {
    return result('RETROCESSO', { isReopen: true });
  }

  // 7. Ordem de progresso nas duas pontas.
  const fo = from?.progressOrder ?? null;
  const tOrder = to?.progressOrder ?? null;
  if (fo !== null && tOrder !== null) {
    if (tOrder > fo) return result('AVANCO');
    if (tOrder < fo) return result('RETROCESSO');
    return result('NEUTRA');
  }

  // 8. Sem base pra julgar progresso: coluna nao configurada nesta versao,
  //    ou versao so com o nivel basico (nenhuma ordem definida).
  const hasAnyOrder = version.columns.some((c) => c.progressOrder !== null);
  if (!from || !to || !hasAnyOrder) return result('NAO_CLASSIFICADA');

  // 9. Configurada, mas sem ordem (ex.: Aguardando/Pausado): neutra.
  return result('NEUTRA');
}
