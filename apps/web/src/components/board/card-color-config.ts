/**
 * Cor decorativa do card. Substituiu o sistema de Priority do card.
 * Sao 8 cores livres + null (sem cor). A escolha eh livre — nao tem
 * semantica embutida. O usuario usa pra agrupar visualmente.
 *
 * Render:
 *  - card-item (mini no quadro): bg subtle da cor (tinge o card inteiro).
 *  - card-modal: picker com swatches solidos.
 */

export type CardColor =
  | 'slate'
  | 'rose'
  | 'orange'
  | 'amber'
  | 'emerald'
  | 'sky'
  | 'violet'
  | 'pink';

export const CARD_COLOR_ORDER: CardColor[] = [
  'slate',
  'rose',
  'orange',
  'amber',
  'emerald',
  'sky',
  'violet',
  'pink',
];

export const CARD_COLOR_LABEL: Record<CardColor, string> = {
  slate: 'Cinza',
  rose: 'Rosa',
  orange: 'Laranja',
  amber: 'Ambar',
  emerald: 'Verde',
  sky: 'Azul',
  violet: 'Violeta',
  pink: 'Pink',
};

/** Cor solida (hex) — usada nos swatches do picker. */
export const CARD_COLOR_SWATCH: Record<CardColor, string> = {
  slate: '#64748B',
  rose: '#F43F5E',
  orange: '#F97316',
  amber: '#F59E0B',
  emerald: '#10B981',
  sky: '#0EA5E9',
  violet: '#8B5CF6',
  pink: '#EC4899',
};

/**
 * Background subtle pro card-mini. Tom claro no light, ~10% alpha no
 * dark — nao compete com o titulo, mas categoriza visualmente.
 */
export const CARD_COLOR_BG: Record<CardColor, string> = {
  slate: 'bg-slate-100 dark:bg-slate-500/15',
  rose: 'bg-rose-50 dark:bg-rose-500/15',
  orange: 'bg-orange-50 dark:bg-orange-500/15',
  amber: 'bg-amber-50 dark:bg-amber-500/15',
  emerald: 'bg-emerald-50 dark:bg-emerald-500/15',
  sky: 'bg-sky-50 dark:bg-sky-500/15',
  violet: 'bg-violet-50 dark:bg-violet-500/15',
  pink: 'bg-pink-50 dark:bg-pink-500/15',
};

/** Type guard: garante que o valor (string|null) é uma cor válida. */
export function isCardColor(v: unknown): v is CardColor {
  return typeof v === 'string' && v in CARD_COLOR_SWATCH;
}
