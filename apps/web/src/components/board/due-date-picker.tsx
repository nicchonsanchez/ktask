'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Picker de prazo no estilo Ummense:
 *   - Botão trigger mostra a data (e ficará vermelho se vencida)
 *   - Popover com atalhos (Hoje / Amanhã / Sem data)
 *   - View calendário mensal com navegação por setas
 *   - Clicar no nome do mês abre grade de meses (12 botões)
 *   - Clicar no ano abre grade de anos (scrollable)
 *   - Rodapé: "Remover data" + "Definir"
 *
 * Armazenamos internamente só a DATA (ano-mês-dia) — sem horário, alinhado
 * com a UX do Ummense. A API aceita ISO completo, então gravamos meia-noite
 * local na data escolhida.
 */

type View = 'days' | 'months' | 'years';

const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_FULL = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export function DueDatePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentDate = value ? new Date(value) : null;
  const isOverdue = !!currentDate && currentDate.getTime() < Date.now() - 86400000;

  useEffect(() => {
    if (!open) return;
    function click(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', click);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  function trigger() {
    if (!value) {
      return (
        <>
          <CalendarDays size={14} />
          <span className="hidden md:inline">Prazo</span>
        </>
      );
    }
    const d = new Date(value);
    const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    return (
      <>
        <CalendarDays size={14} />
        {/* Em telas estreitas, mostra só o ícone (cor já indica urgência);
            o texto da data aparece em md+ pra economizar espaço no header */}
        <span className="hidden md:inline">{label}</span>
      </>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
          isOverdue
            ? 'bg-danger-subtle text-danger'
            : value
              ? 'bg-primary-subtle text-primary'
              : 'text-fg-muted hover:bg-bg-muted hover:text-fg'
        }`}
        title="Prazo"
      >
        {trigger()}
      </button>
      {open && (
        <DatePickerPopover
          value={value}
          onCommit={(iso) => {
            onChange(iso);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

export function DatePickerPopover({
  value,
  onCommit,
  onClose,
}: {
  value: string | null;
  onCommit: (iso: string | null) => void;
  onClose: () => void;
}) {
  const initial = value ? new Date(value) : new Date();
  const [draft, setDraft] = useState<Date | null>(value ? new Date(value) : null);
  const [view, setView] = useState<View>('days');
  const [cursor, setCursor] = useState<Date>(
    new Date(initial.getFullYear(), initial.getMonth(), 1),
  );

  function apply() {
    if (!draft) {
      onCommit(null);
      return;
    }
    // Salva meia-noite local na data escolhida → ISO
    const d = new Date(draft.getFullYear(), draft.getMonth(), draft.getDate(), 0, 0, 0, 0);
    onCommit(d.toISOString());
  }

  function setToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setDraft(d);
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
  }
  function setTomorrow() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    setDraft(d);
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
  }
  function clearDate() {
    setDraft(null);
  }

  return (
    <div
      // Mobile: fixed na viewport pra evitar corte quando trigger fica longe
      // do canto. Desktop (sm+): ancorado ao trigger.
      className="border-border bg-bg fixed inset-x-2 top-[4.5rem] z-40 flex flex-col rounded-md border p-3 shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-1.5 sm:w-[min(18rem,calc(100vw-1rem))]"
    >
      <p className="text-fg-muted mb-2 text-[11px] font-semibold">Data simples</p>

      {/* Atalhos */}
      <div className="mb-3 grid grid-cols-3 gap-1">
        <QuickButton onClick={setToday}>Hoje</QuickButton>
        <QuickButton onClick={setTomorrow}>Amanhã</QuickButton>
        <QuickButton onClick={clearDate}>Sem data</QuickButton>
      </div>

      {view === 'days' && (
        <DaysView
          cursor={cursor}
          draft={draft}
          onPrev={() => setCursor(addMonths(cursor, -1))}
          onNext={() => setCursor(addMonths(cursor, 1))}
          onSelectDay={(d) => setDraft(d)}
          onOpenMonths={() => setView('months')}
          onOpenYears={() => setView('years')}
        />
      )}
      {view === 'months' && (
        <MonthsView
          year={cursor.getFullYear()}
          currentMonth={cursor.getMonth()}
          onSelect={(m) => {
            setCursor(new Date(cursor.getFullYear(), m, 1));
            setView('days');
          }}
          onBack={() => setView('days')}
        />
      )}
      {view === 'years' && (
        <YearsView
          year={cursor.getFullYear()}
          onSelect={(y) => {
            setCursor(new Date(y, cursor.getMonth(), 1));
            setView('months');
          }}
          onBack={() => setView('days')}
        />
      )}

      {/* Rodapé */}
      <div className="border-border/70 mt-3 flex items-center justify-between border-t pt-2">
        <button
          type="button"
          onClick={() => {
            onCommit(null);
            onClose();
          }}
          className="text-fg-muted hover:text-danger text-[11px]"
        >
          Remover data
        </button>
        <button
          type="button"
          onClick={apply}
          className="bg-primary text-primary-fg hover:bg-primary-hover rounded-md px-3 py-1 text-[11px] font-medium"
        >
          Definir
        </button>
      </div>
    </div>
  );
}

function QuickButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-border/60 text-fg hover:bg-bg-muted hover:border-border-strong rounded-md border px-2 py-1 text-[11px] font-medium transition-colors"
    >
      {children}
    </button>
  );
}

function DaysView({
  cursor,
  draft,
  onPrev,
  onNext,
  onSelectDay,
  onOpenMonths,
  onOpenYears,
}: {
  cursor: Date;
  draft: Date | null;
  onPrev: () => void;
  onNext: () => void;
  onSelectDay: (d: Date) => void;
  onOpenMonths: () => void;
  onOpenYears: () => void;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onPrev}
          className="text-fg-muted hover:text-fg rounded p-1"
          aria-label="Mês anterior"
        >
          <ChevronLeft size={14} />
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenMonths}
            className="hover:bg-bg-muted rounded px-1.5 py-0.5 text-xs font-semibold"
          >
            {MESES[month]}.
          </button>
          <button
            type="button"
            onClick={onOpenYears}
            className="hover:bg-bg-muted rounded px-1.5 py-0.5 text-xs font-semibold"
          >
            {year}
          </button>
        </div>
        <button
          type="button"
          onClick={onNext}
          className="text-fg-muted hover:text-fg rounded p-1"
          aria-label="Próximo mês"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {DIAS.map((d, i) => (
          <div key={i} className="text-fg-muted text-[10px] font-semibold">
            {d}
          </div>
        ))}
        {grid.map((d, i) => {
          const inMonth = d.getMonth() === month;
          const isToday = sameDay(d, today);
          const isDraft = draft && sameDay(d, draft);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelectDay(d)}
              className={`rounded text-xs transition-colors ${
                isDraft
                  ? 'bg-primary text-primary-fg font-semibold'
                  : isToday
                    ? 'text-primary font-semibold'
                    : inMonth
                      ? 'text-fg hover:bg-bg-muted'
                      : 'text-fg-subtle hover:bg-bg-muted'
              } aspect-square`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </>
  );
}

function MonthsView({
  year,
  currentMonth,
  onSelect,
  onBack,
}: {
  year: number;
  currentMonth: number;
  onSelect: (m: number) => void;
  onBack: () => void;
}) {
  return (
    <>
      <div className="mb-2 flex items-center justify-center">
        <button
          type="button"
          onClick={onBack}
          className="hover:bg-bg-muted rounded px-2 py-0.5 text-xs font-semibold"
        >
          {year}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {MESES.map((m, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            className={`rounded-md px-2 py-2 text-xs transition-colors ${
              i === currentMonth
                ? 'bg-primary text-primary-fg font-semibold'
                : 'text-fg hover:bg-bg-muted'
            }`}
            title={MESES_FULL[i]}
          >
            {m}.
          </button>
        ))}
      </div>
    </>
  );
}

function YearsView({
  year,
  onSelect,
  onBack,
}: {
  year: number;
  onSelect: (y: number) => void;
  onBack: () => void;
}) {
  // Mostra ~21 anos centrados em year
  const start = year - 10;
  const years = Array.from({ length: 21 }, (_, i) => start + i);
  return (
    <>
      <div className="mb-2 flex items-center justify-center">
        <button
          type="button"
          onClick={onBack}
          className="hover:bg-bg-muted rounded px-2 py-0.5 text-xs font-semibold"
        >
          {start} — {start + 20}
        </button>
      </div>
      <div className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto">
        {years.map((y) => (
          <button
            key={y}
            type="button"
            onClick={() => onSelect(y)}
            className={`rounded-md px-2 py-2 text-xs transition-colors ${
              y === year ? 'bg-primary text-primary-fg font-semibold' : 'text-fg hover:bg-bg-muted'
            }`}
          >
            {y}
          </button>
        ))}
      </div>
    </>
  );
}

/* -------------------- helpers -------------------- */

function buildMonthGrid(year: number, month: number): Date[] {
  // começa no 1º dia do mês; descobre quantos dias do mês anterior precisam preencher
  const first = new Date(year, month, 1);
  const startOffset = first.getDay(); // 0 = domingo
  const days: Date[] = [];
  for (let i = startOffset - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }
  const lastDay = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= lastDay; d++) {
    days.push(new Date(year, month, d));
  }
  // preenche até 42 dias (6 semanas)
  while (days.length < 42) {
    const last = days[days.length - 1]!;
    days.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
  }
  return days;
}

function addMonths(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
