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

export const STATUS_VISUAL: Record<CardStatus, StatusVisual> = {
  ACTIVE: {
    icon: Activity,
    textClass: 'text-fg-muted',
    bgClass: 'bg-bg-muted',
    hint: 'Em fluxo normal de trabalho',
  },
  COMPLETED: {
    icon: Check,
    textClass: 'text-success',
    bgClass: 'bg-success-subtle',
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
    textClass: 'text-danger',
    bgClass: 'bg-danger-subtle',
    hint: 'Cancelado. Não será feito.',
  },
};
