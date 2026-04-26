'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';

import { meQueries } from '@/lib/queries/me';

/**
 * Calendário compacto da home pessoal.
 *
 * Mostra:
 *   - Header "Mês YYYY" com setas ← / →
 *   - Grid de dias com pontos coloridos:
 *     - vermelho = dia tem atrasada (count.pending > 0 e dia < hoje)
 *     - azul     = dia tem tarefa pendente futura
 *     - cinza    = dia sem tarefas
 *   - Hoje destacado (círculo azul preenchido)
 *   - Atalhos "Próximos 7 dias" / "Sem data"
 */
export function MiniCalendar() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
  const { data } = useQuery({ ...meQueries.calendar(monthKey) });
  const todayKey = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }, []);

  const grid = useMemo(() => buildMonthGrid(cursor), [cursor]);

  const dayMap = new Map<string, { total: number; pending: number }>();
  for (const d of data?.days ?? []) dayMap.set(d.date, { total: d.total, pending: d.pending });

  return (
    <section className="border-border bg-bg flex flex-col gap-2 rounded-lg border p-3">
      <header className="flex items-center justify-between">
        <h3 className="text-fg flex items-center gap-1 text-base font-semibold">
          <ChevronUp size={14} className="text-fg-muted" />
          {capitalize(cursor.toLocaleDateString('pt-BR', { month: 'long' }))}{' '}
          <span className="text-fg-muted text-sm font-normal">
            {String(cursor.getFullYear()).slice(2)}
          </span>
        </h3>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="text-fg-muted hover:bg-bg-muted hover:text-fg rounded p-1"
            aria-label="Mês anterior"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="text-fg-muted hover:bg-bg-muted hover:text-fg rounded p-1"
            aria-label="Próximo mês"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
          <div key={i} className="text-fg-subtle text-[11px] font-medium">
            {d}
          </div>
        ))}
        {grid.map((cell) => {
          const key = cell.iso;
          const counts = dayMap.get(key);
          const isToday = key === todayKey;
          const isOtherMonth = !cell.inMonth;
          const dayDate = new Date(cell.year, cell.month, cell.day);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const isPast = dayDate.getTime() < today.getTime();
          const dotColor = counts
            ? counts.pending > 0
              ? isPast || isToday
                ? 'bg-danger'
                : 'bg-primary'
              : 'bg-bg-muted'
            : null;
          return (
            <button
              key={key}
              type="button"
              disabled={isOtherMonth}
              className={`relative mx-auto flex size-8 items-center justify-center rounded-full text-[12px] transition-colors ${
                isToday
                  ? 'bg-primary text-primary-fg font-semibold'
                  : isOtherMonth
                    ? 'text-fg-subtle/50 cursor-default'
                    : 'text-fg hover:bg-bg-muted'
              }`}
              title={
                counts
                  ? `${counts.pending} pendente${counts.pending === 1 ? '' : 's'} de ${counts.total}`
                  : undefined
              }
            >
              {cell.day}
              {dotColor && !isToday && (
                <span
                  aria-hidden
                  className={`absolute bottom-0.5 size-1 rounded-full ${dotColor}`}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          className="bg-primary-subtle text-primary inline-flex flex-1 justify-center rounded-md px-2 py-1 text-[11px] font-medium"
          disabled
          title="Em breve — filtra a lista de tarefas pelos próximos 7 dias"
        >
          Próximos 7 dias
        </button>
        <button
          type="button"
          className="bg-bg-muted text-fg-muted inline-flex flex-1 justify-center rounded-md px-2 py-1 text-[11px] font-medium"
          disabled
          title="Em breve — filtra tarefas sem data"
        >
          Sem data
        </button>
      </div>
    </section>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface DayCell {
  year: number;
  month: number;
  day: number;
  iso: string;
  inMonth: boolean;
}

/**
 * Grid de 6 semanas (42 dias) começando no domingo, cobrindo o mês inteiro
 * com dias dos meses adjacentes nas bordas.
 */
function buildMonthGrid(cursor: Date): DayCell[] {
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const firstDayOfMonth = new Date(y, m, 1);
  const startWeekday = firstDayOfMonth.getDay(); // 0=Dom
  const start = new Date(y, m, 1 - startWeekday);
  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const cy = d.getFullYear();
    const cm = d.getMonth();
    const cd = d.getDate();
    cells.push({
      year: cy,
      month: cm,
      day: cd,
      iso: `${cy}-${String(cm + 1).padStart(2, '0')}-${String(cd).padStart(2, '0')}`,
      inMonth: cy === y && cm === m,
    });
  }
  return cells;
}
