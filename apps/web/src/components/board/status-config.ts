// Doc 42: configuracao compartilhada do status do card.
// Espelha o modelo do Ummense: 4 estados ortogonais a coluna.

import { Activity, Ban, Check, Pause } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type CardStatus = 'ACTIVE' | 'COMPLETED' | 'WAITING' | 'CANCELED';

export const STATUS_LABEL: Record<CardStatus, string> = {
  ACTIVE: 'Ativo',
  COMPLETED: 'Concluído',
  WAITING: 'Aguardando',
  CANCELED: 'Cancelado',
};

export const STATUS_ORDER: CardStatus[] = ['ACTIVE', 'COMPLETED', 'WAITING', 'CANCELED'];

interface StatusVisual {
  icon: LucideIcon;
  /** Classe Tailwind pra cor de texto/icone. */
  textClass: string;
  /** Classe Tailwind pra fundo do badge/pill. */
  bgClass: string;
  /** Tooltip explicativo. */
  hint: string;
}

// Cada status tem uma cor sutil propria pra distinguir visualmente.
// Tokens 'success' nao existem no design system — usamos Tailwind nativos
// (blue/emerald/zinc) onde nao tem token. warning/danger sao tokens.
export const STATUS_VISUAL: Record<CardStatus, StatusVisual> = {
  ACTIVE: {
    icon: Activity,
    textClass: 'text-blue-700 dark:text-blue-300',
    bgClass: 'bg-blue-100 dark:bg-blue-500/15',
    hint: 'Em fluxo normal de trabalho',
  },
  COMPLETED: {
    icon: Check,
    textClass: 'text-emerald-700 dark:text-emerald-300',
    bgClass: 'bg-emerald-100 dark:bg-emerald-500/15',
    hint: 'Concluído. Saiu do fluxo ativo.',
  },
  WAITING: {
    icon: Pause,
    textClass: 'text-warning',
    bgClass: 'bg-warning-subtle',
    hint: 'Aguardando algo externo (cliente, fornecedor, decisão).',
  },
  CANCELED: {
    icon: Ban,
    textClass: 'text-zinc-700 dark:text-zinc-300',
    bgClass: 'bg-zinc-200 dark:bg-zinc-500/20',
    hint: 'Cancelado. Não será feito.',
  },
};
