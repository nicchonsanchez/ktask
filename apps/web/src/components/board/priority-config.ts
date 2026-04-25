/**
 * Configuração de prioridade compartilhada entre card-item (lista) e
 * card-modal (seletor). Centralizar evita drift visual entre as duas
 * superfícies.
 *
 * Cores escolhidas pra dar uma escala perceptual de urgência crescente:
 *   NONE   → sem cor (não renderiza barra)
 *   LOW    → cyan   (#06B6D4)  baixa atenção, ainda informativo
 *   MEDIUM → amber  (#F59E0B)  atenção média, calor neutro
 *   HIGH   → orange (#F97316)  alerta visível
 *   URGENT → red    (#EF4444)  máxima urgência
 *
 * Cyan-amber-orange-red é uma paleta clássica de heat map; funciona em
 * dark mode e tem distância visual suficiente entre níveis adjacentes.
 */

export type Priority = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export const PRIORITY_LABEL: Record<Priority, string> = {
  NONE: 'Sem prioridade',
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

/** Cor sólida da barra de prioridade no topo do card. */
export const PRIORITY_COLOR: Record<Priority, string | null> = {
  NONE: null,
  LOW: '#06B6D4',
  MEDIUM: '#F59E0B',
  HIGH: '#F97316',
  URGENT: '#EF4444',
};

/** Ordem de exibição (do "menos" pro "mais" urgente, com NONE no início). */
export const PRIORITY_ORDER: Priority[] = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'];
