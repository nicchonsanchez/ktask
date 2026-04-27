/**
 * Configuração de prioridade compartilhada entre card-item (lista) e
 * card-modal (seletor). Centralizar evita drift visual entre as duas
 * superfícies.
 *
 * Escala visual escolhida (Proposta B do redesign 2026-04-26):
 *   NONE   → sem cor, sem stripe
 *   LOW    → slate     (cinza azulado, baixa atenção)
 *   MEDIUM → yellow    (amarelo, atenção média)
 *   HIGH   → red       (vermelho, alerta forte)
 *   URGENT → red + losango (forma diferente além da cor — robusto a
 *            daltonismo, monitor low-contrast e telas pequenas)
 *
 * URGENT NÃO renderiza stripe no card-mini: ganha um BADGE em formato de
 * losango no canto superior direito do card. A forma é o sinalizador,
 * não só a cor — diferencia visualmente de HIGH (que tem stripe vermelha).
 */

export type Priority = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export const PRIORITY_LABEL: Record<Priority, string> = {
  NONE: 'Sem prioridade',
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

/** Cor sólida da barra/badge de prioridade. */
export const PRIORITY_COLOR: Record<Priority, string | null> = {
  NONE: null,
  LOW: '#94A3B8', // slate-400
  MEDIUM: '#EAB308', // yellow-500
  HIGH: '#EF4444', // red-500
  URGENT: '#EF4444', // red-500 (mas renderizado como losango, não stripe)
};

/**
 * Forma do indicador no card-mini:
 *  - 'stripe': barra horizontal de 1.5px no topo do card (LOW/MEDIUM/HIGH)
 *  - 'diamond': losango no canto sup-direito (URGENT)
 *  - 'none': não renderiza (NONE)
 */
export const PRIORITY_SHAPE: Record<Priority, 'stripe' | 'diamond' | 'none'> = {
  NONE: 'none',
  LOW: 'stripe',
  MEDIUM: 'stripe',
  HIGH: 'stripe',
  URGENT: 'diamond',
};

/** Ordem de exibição (do "menos" pro "mais" urgente, com NONE no início). */
export const PRIORITY_ORDER: Priority[] = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'];
