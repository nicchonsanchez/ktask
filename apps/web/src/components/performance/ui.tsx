'use client';

import { cn } from '@/lib/cn';

/**
 * Doc 53 — primitivos visuais do Desempenho da Equipe (relatorio, metas e
 * configuracao). So apresentacao: nenhuma regra de negocio aqui.
 */

export type Tone = 'primary' | 'positive' | 'negative' | 'info' | 'warning' | 'neutral';

export const TONE_CHIP: Record<Tone, string> = {
  primary: 'bg-primary/10 text-primary',
  positive: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  negative: 'bg-red-500/10 text-red-600 dark:text-red-400',
  info: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  neutral: 'bg-bg-muted text-fg-muted',
};

export const TONE_BAR: Record<Tone, string> = {
  primary: 'bg-primary',
  positive: 'bg-emerald-500',
  negative: 'bg-red-500',
  info: 'bg-sky-500',
  warning: 'bg-amber-500',
  neutral: 'bg-fg-subtle',
};

export const TONE_TEXT: Record<Tone, string> = {
  primary: 'text-primary',
  positive: 'text-emerald-600 dark:text-emerald-400',
  negative: 'text-red-600 dark:text-red-400',
  info: 'text-sky-600 dark:text-sky-400',
  warning: 'text-amber-600 dark:text-amber-400',
  neutral: 'text-fg-muted',
};

/** Campo de formulario padrao das telas de Desempenho (selects, inputs). */
export const fieldCls =
  'border-border bg-bg text-fg h-9 rounded-lg border px-3 text-sm transition-colors hover:border-border-strong focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

export function IconChip({
  tone = 'primary',
  size = 'md',
  children,
}: {
  tone?: Tone;
  size?: 'sm' | 'md';
  children: React.ReactNode;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-lg',
        size === 'sm' ? 'size-7' : 'size-9',
        TONE_CHIP[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Bloco/cartao com cabecalho opcional (titulo, descricao, icone, acoes). */
export function Panel({
  title,
  description,
  icon,
  tone = 'primary',
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('border-border/70 bg-bg rounded-xl border shadow-sm', className)}>
      {title && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <IconChip tone={tone} size="sm">
                {icon}
              </IconChip>
            )}
            <div className="min-w-0">
              <h2 className="text-fg text-[15px] font-semibold leading-7">{title}</h2>
              {description && <p className="text-fg-muted text-xs">{description}</p>}
            </div>
          </div>
          {actions}
        </header>
      )}
      <div className={cn('p-4 sm:p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

/** Rotulo de secao (fora de cartao). */
export function SectionHeading({
  children,
  description,
  actions,
}: {
  children: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-fg text-[15px] font-semibold">{children}</h2>
        {description && <p className="text-fg-muted text-xs">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

/**
 * Indicador numerico. Com onClick vira botao (drill-down); sem, e estatico.
 */
export function StatTile({
  icon,
  label,
  value,
  tone = 'primary',
  sub,
  hint,
  onClick,
  className,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
  tone?: Tone;
  sub?: React.ReactNode;
  hint?: string;
  onClick?: () => void;
  className?: string;
}) {
  const body = (
    <>
      <span className="flex items-center gap-2">
        {icon && (
          <IconChip tone={tone} size="sm">
            {icon}
          </IconChip>
        )}
        <span className="text-fg-muted text-xs font-medium leading-tight">{label}</span>
      </span>
      <span className="text-fg mt-3 block text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </span>
      {sub && <span className="text-fg-muted mt-0.5 block text-[11px]">{sub}</span>}
    </>
  );
  const base = cn(
    'border-border/70 bg-bg flex flex-col rounded-xl border p-4 text-left',
    className,
  );
  if (!onClick)
    return (
      <div className={base} title={hint}>
        {body}
      </div>
    );
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint ?? `Ver os registros de ${label.toLowerCase()}`}
      className={cn(
        base,
        'hover:border-primary/40 focus-visible:ring-primary/30 group transition-all hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2',
      )}
    >
      {body}
    </button>
  );
}

/** Controle segmentado (periodo, metrica do grafico, visao). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  ariaLabel,
}: {
  value: T;
  options: Array<{ key: T; label: React.ReactNode }>;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="bg-bg-muted/70 inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg p-1"
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-md font-medium transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
              active ? 'bg-bg text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Spinner() {
  return (
    <span
      aria-label="Carregando"
      className="border-border border-t-primary inline-block size-5 animate-spin rounded-full border-2"
    />
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      {icon && <IconChip tone="neutral">{icon}</IconChip>}
      <p className="text-fg text-sm font-medium">{title}</p>
      {children && <div className="text-fg-muted max-w-md text-xs">{children}</div>}
    </div>
  );
}
