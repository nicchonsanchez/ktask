'use client';

import { useEffect, useRef, useState } from 'react';
import { Repeat } from 'lucide-react';

import type { TaskRecurrence } from '@/lib/queries/cards';

/**
 * Picker compacto pra configurar recorrencia em ChecklistItem / Task.
 *
 * Trigger: pequeno botao com icone Repeat. Mostra outlined se vazio;
 * preenchido roxo quando tem regra. Click abre popover com:
 *   - Sem recorrencia
 *   - Diaria (a cada N dias)
 *   - Semanal (a cada N semanas, dias da semana opcionais)
 *   - Mensal (a cada N meses)
 *   - Anual (a cada N anos)
 */
const DOW_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']; // dom-sab
const FREQ_LABELS: Record<TaskRecurrence['freq'], string> = {
  DAILY: 'dia(s)',
  WEEKLY: 'semana(s)',
  MONTHLY: 'mês(es)',
  YEARLY: 'ano(s)',
};

export function RecurrencePicker({
  value,
  onChange,
}: {
  value: TaskRecurrence | null;
  onChange: (next: TaskRecurrence | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Estado local pro editor; commita ao clicar "Aplicar"
  const [draft, setDraft] = useState<TaskRecurrence | null>(value);
  useEffect(() => setDraft(value), [value, open]);

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

  const isActive = Boolean(value);

  function setFreq(freq: TaskRecurrence['freq']) {
    setDraft({ freq, interval: draft?.interval ?? 1, weekdays: draft?.weekdays });
  }
  function toggleWeekday(d: number) {
    if (!draft) return;
    const cur = draft.weekdays ?? [];
    const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort();
    setDraft({ ...draft, weekdays: next.length > 0 ? next : undefined });
  }

  function apply() {
    if (!draft) {
      onChange(null);
    } else {
      onChange({
        ...draft,
        interval: Math.max(1, draft.interval || 1),
      });
    }
    setOpen(false);
  }

  function clear() {
    setDraft(null);
    onChange(null);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={isActive ? `Recorrência: ${describeRecurrence(value!)}` : 'Definir recorrência'}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
          isActive
            ? 'bg-primary-subtle text-primary'
            : 'text-fg-muted hover:bg-bg-muted hover:text-fg'
        }`}
      >
        <Repeat size={13} />
        <span className="hidden md:inline">{isActive ? describeShort(value!) : 'Repetir'}</span>
      </button>
      {open && (
        <div className="border-border bg-bg absolute right-0 top-full z-30 mt-1 flex w-72 flex-col gap-2 rounded-md border p-3 shadow-xl">
          <p className="text-fg-muted text-[11px] font-medium">Recorrência</p>

          <button
            type="button"
            onClick={() => setDraft(null)}
            className={`hover:bg-bg-muted flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${
              !draft ? 'bg-primary-subtle/30 text-fg font-medium' : 'text-fg-muted'
            }`}
          >
            <span
              className={`inline-block size-2 rounded-full ${!draft ? 'bg-primary' : 'bg-border'}`}
            />
            Sem recorrência
          </button>

          {(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const).map((freq) => {
            const active = draft?.freq === freq;
            const label = {
              DAILY: 'Diária',
              WEEKLY: 'Semanal',
              MONTHLY: 'Mensal',
              YEARLY: 'Anual',
            }[freq];
            return (
              <button
                key={freq}
                type="button"
                onClick={() => setFreq(freq)}
                className={`hover:bg-bg-muted flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${
                  active ? 'bg-primary-subtle/30 text-fg font-medium' : 'text-fg-muted'
                }`}
              >
                <span
                  className={`inline-block size-2 rounded-full ${active ? 'bg-primary' : 'bg-border'}`}
                />
                {label}
              </button>
            );
          })}

          {draft && (
            <>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-fg-muted text-[11px]">A cada</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={draft.interval}
                  onChange={(e) => setDraft({ ...draft, interval: Number(e.target.value) || 1 })}
                  className="border-border focus:border-primary w-16 rounded border px-2 py-1 text-sm focus:outline-none"
                />
                <span className="text-fg-muted text-[11px]">{FREQ_LABELS[draft.freq]}</span>
              </div>

              {draft.freq === 'WEEKLY' && (
                <div>
                  <p className="text-fg-muted mb-1 text-[10px]">
                    Dias da semana (opcional — vazio = mesmo dia da próxima)
                  </p>
                  <div className="flex gap-1">
                    {DOW_LABELS.map((lbl, idx) => {
                      const on = (draft.weekdays ?? []).includes(idx);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => toggleWeekday(idx)}
                          className={`size-7 rounded text-xs font-medium ${
                            on
                              ? 'bg-primary text-primary-fg'
                              : 'bg-bg-muted text-fg-muted hover:bg-border'
                          }`}
                        >
                          {lbl}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="border-border/40 mt-1 flex items-center justify-between border-t pt-2">
            <button type="button" onClick={clear} className="text-fg-muted hover:text-fg text-xs">
              Remover
            </button>
            <button
              type="button"
              onClick={apply}
              className="bg-primary text-primary-fg hover:bg-primary-hover rounded px-3 py-1 text-xs font-medium"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Resumo curto pra trigger (ex: "1d", "2w", "3m") */
function describeShort(r: TaskRecurrence): string {
  const map = { DAILY: 'd', WEEKLY: 'sem', MONTHLY: 'm', YEARLY: 'a' };
  return `${r.interval}${map[r.freq]}`;
}

/** Resumo completo pra title attribute */
function describeRecurrence(r: TaskRecurrence): string {
  const each = r.interval === 1 ? '' : `a cada ${r.interval} `;
  const noun = { DAILY: 'dia', WEEKLY: 'semana', MONTHLY: 'mês', YEARLY: 'ano' }[r.freq];
  const plural = r.interval > 1 ? 's' : '';
  return `${each}${noun}${plural}`;
}
