'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Loader2,
  Minus,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@ktask/ui';
import type { PerformanceEventItem, PerformanceMetric } from '@ktask/contracts';

import { activityParts } from '@/lib/activity-format';
import { performanceQueries, type PerformanceParams } from '@/lib/queries/performance';

export const METRIC_LABELS: Record<PerformanceMetric, string> = {
  ACTIONS: 'Ações registradas',
  CARDS: 'Cards trabalhados',
  MOVES: 'Movimentações',
  AVANCO: 'Avanços',
  RETROCESSO: 'Retrocessos',
  TRANSFERENCIA: 'Transferências',
  FINALIZACOES: 'Finalizações',
  REABERTURAS: 'Reaberturas',
  COMMENTS: 'Comentários',
  NAO_CLASSIFICADA: 'Movimentações não classificadas',
  CONTACTS: 'Registros de contato',
  CONTACTS_DONE: 'Contatos realizados',
};

const timeFmt = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

/** Selo do resultado de uma movimentacao (Lucide, sem emoji). */
export function ResultBadge({ e }: { e: PerformanceEventItem }) {
  const base = 'inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium';
  if (e.isCompletion && e.conclusion === 'NEGATIVA')
    return (
      <span className={`${base} text-red-500`}>
        <XCircle size={12} /> Conclusão negativa
      </span>
    );
  if (e.isCompletion)
    return (
      <span className={`${base} text-emerald-600`}>
        <CheckCircle2 size={12} /> Finalização
      </span>
    );
  if (e.isReopen)
    return (
      <span className={`${base} text-amber-600`}>
        <RotateCcw size={12} /> Reabertura
      </span>
    );
  switch (e.movementClass) {
    case 'AVANCO':
      return (
        <span className={`${base} text-emerald-600`}>
          <ArrowUpRight size={12} /> Avanço
        </span>
      );
    case 'RETROCESSO':
      return (
        <span className={`${base} text-red-500`}>
          <ArrowDownLeft size={12} /> Retrocesso
        </span>
      );
    case 'TRANSFERENCIA':
      return (
        <span className={`${base} text-sky-600`}>
          <ArrowRightLeft size={12} /> Transferência
        </span>
      );
    case 'NEUTRA':
      return (
        <span className={`${base} text-fg-muted`}>
          <Minus size={12} /> Neutra
        </span>
      );
    case 'NAO_CLASSIFICADA':
      return (
        <span
          className={`${base} text-fg-subtle`}
          title="Fluxo/coluna sem classificação configurada"
        >
          <HelpCircle size={12} /> Não classificada
        </span>
      );
    default:
      return null;
  }
}

/** Linha de evento: movimentacao mostra De -> Para; demais usam o texto da timeline. */
export function EventRow({
  e,
  timeZone,
  showActor,
  onCardClick,
}: {
  e: PerformanceEventItem;
  timeZone: string;
  showActor?: boolean;
  onCardClick?: () => void;
}) {
  const parts = e.movementClass
    ? null
    : activityParts({
        id: e.id,
        type: e.type,
        payload: e.payload,
        createdAt: e.createdAt,
        actor: e.actor,
      });
  return (
    <li className="flex flex-col gap-1 px-3 py-2 text-xs sm:flex-row sm:items-center sm:gap-3">
      <span className="text-fg-muted w-24 shrink-0 tabular-nums">
        {timeFmt(e.createdAt, timeZone)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          {e.board && (
            <span
              aria-hidden
              className="inline-block size-2 shrink-0 rounded-full"
              style={{ backgroundColor: e.board.color ?? '#888' }}
            />
          )}
          {e.card ? (
            <Link
              href={`?card=${e.card.id}`}
              scroll={false}
              onClick={onCardClick}
              className="hover:text-primary truncate font-medium"
              title={e.card.title}
            >
              {e.card.title}
            </Link>
          ) : (
            <span className="text-fg-muted">(card removido)</span>
          )}
          <span className="text-fg-subtle shrink-0">· {e.board?.name ?? '—'}</span>
        </span>
        <span className="text-fg-muted flex min-w-0 flex-wrap items-center gap-1">
          {showActor && e.actor && <span className="text-fg">{e.actor.name}</span>}
          {e.movementClass ? (
            <>
              <span className="truncate">{e.fromListName ?? '—'}</span>
              <ArrowRight size={11} className="shrink-0" />
              <span className="truncate">{e.toListName ?? '—'}</span>
            </>
          ) : (
            <span className="truncate">
              {parts?.map((p, i) =>
                typeof p === 'string' ? (
                  <span key={i}>{p}</span>
                ) : (
                  <strong key={i}>{p.bold}</strong>
                ),
              )}
            </span>
          )}
        </span>
      </span>
      <span className="shrink-0">
        <ResultBadge e={e} />
      </span>
    </li>
  );
}

export function EventsList({
  params,
  metric,
  timeZone,
  onCardClick,
  showActor = true,
}: {
  params: PerformanceParams;
  metric: PerformanceMetric;
  timeZone: string;
  onCardClick?: () => void;
  showActor?: boolean;
}) {
  const [page, setPage] = useState(1);
  const q = useQuery(performanceQueries.events(params, metric, page));
  if (q.isLoading)
    return (
      <div className="flex justify-center py-10">
        <Loader2 size={18} className="text-fg-muted animate-spin" />
      </div>
    );
  if (q.isError || !q.data)
    return <p className="text-fg-muted text-xs">Não foi possível carregar os registros.</p>;
  const { items, total, pageSize } = q.data;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <p className="text-fg-muted text-xs">{total} registro(s)</p>
      {items.length === 0 ? (
        <p className="text-fg-muted py-6 text-center text-xs">Nenhum registro no período.</p>
      ) : (
        <ul className="border-border/60 divide-border/40 max-h-[60vh] divide-y overflow-y-auto rounded border">
          {items.map((e) => (
            <EventRow
              key={e.id}
              e={e}
              timeZone={timeZone}
              showActor={showActor}
              onCardClick={onCardClick}
            />
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="text-fg-muted hover:text-fg disabled:opacity-40"
            aria-label="Página anterior"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="tabular-nums">
            {page} / {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
            className="text-fg-muted hover:text-fg disabled:opacity-40"
            aria-label="Próxima página"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function CardsList({
  params,
  timeZone,
  onCardClick,
}: {
  params: PerformanceParams;
  timeZone: string;
  onCardClick: () => void;
}) {
  const q = useQuery(performanceQueries.cards(params));
  if (q.isLoading)
    return (
      <div className="flex justify-center py-10">
        <Loader2 size={18} className="text-fg-muted animate-spin" />
      </div>
    );
  if (q.isError || !q.data)
    return <p className="text-fg-muted text-xs">Não foi possível carregar os cards.</p>;
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <p className="text-fg-muted text-xs">{q.data.total} card(s)</p>
      <ul className="border-border/60 divide-border/40 max-h-[60vh] divide-y overflow-y-auto rounded border">
        {q.data.items.map((c) => (
          <li key={c.card.id} className="flex items-center gap-2 px-3 py-2 text-xs">
            {c.board && (
              <span
                aria-hidden
                className="inline-block size-2 shrink-0 rounded-full"
                style={{ backgroundColor: c.board.color ?? '#888' }}
              />
            )}
            <Link
              href={`?card=${c.card.id}`}
              scroll={false}
              onClick={onCardClick}
              className="hover:text-primary min-w-0 flex-1 truncate"
              title={c.card.title}
            >
              {c.card.title}
            </Link>
            <span className="text-fg-subtle hidden shrink-0 sm:inline">{c.board?.name ?? '—'}</span>
            <span className="text-fg-muted shrink-0 tabular-nums">{c.actions} ação(ões)</span>
            <span className="text-fg-muted w-24 shrink-0 text-right tabular-nums">
              {timeFmt(c.lastActionAt, timeZone)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Doc 52 — drill-down de qualquer indicador (spec §5.6, §11, §18). */
export function PerformanceDrilldown({
  open,
  onOpenChange,
  params,
  metric,
  subtitle,
  timeZone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  params: PerformanceParams;
  metric: PerformanceMetric;
  subtitle?: string;
  timeZone: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <div className="flex flex-col gap-0.5 pr-8">
          <DialogTitle className="text-base font-semibold">{METRIC_LABELS[metric]}</DialogTitle>
          {subtitle && <p className="text-fg-muted text-xs">{subtitle}</p>}
        </div>
        {open &&
          (metric === 'CARDS' ? (
            <CardsList
              params={params}
              timeZone={timeZone}
              onCardClick={() => onOpenChange(false)}
            />
          ) : (
            <EventsList
              params={params}
              metric={metric}
              timeZone={timeZone}
              onCardClick={() => onOpenChange(false)}
            />
          ))}
      </DialogContent>
    </Dialog>
  );
}
