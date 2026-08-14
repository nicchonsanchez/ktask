'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';

/**
 * Picker do PRAZO de uma tarefa configurada em automacao.
 *
 * Diferente do picker de tarefa real do card (`ChecklistDueDatePicker`),
 * este componente lida com prazo DINAMICO — o backend calcula a data
 * de vencimento quando a automacao roda (card entra na coluna), nao no
 * momento em que voce cria o config. Casos como "sempre daqui 3 dias"
 * ou "casar com o prazo do card" ficam refletidos em tempo real.
 *
 * O picker de tarefa real do card NAO USA este componente — la o prazo
 * eh sempre uma data absoluta. Manter os dois separados evita confundir
 * a semantica ("dinamico" so faz sentido em automacao).
 *
 * Modos suportados:
 * - `NONE`                : sem prazo
 * - `OFFSET_FROM_NOW`     : hoje + N dias (0=hoje, 1=amanha, 7=+7 dias...)
 * - `OFFSET_FROM_CARD_DUE`: prazo do card + N dias (0 = igual ao card)
 * - `FIXED_DATE`          : data fixa via calendario (comportamento antigo)
 */

export type AutomationDueMode = 'NONE' | 'OFFSET_FROM_NOW' | 'OFFSET_FROM_CARD_DUE' | 'FIXED_DATE';

export interface AutomationDueValue {
  dueMode: AutomationDueMode;
  /** Numero de dias (offset). So relevante em OFFSET_FROM_*. */
  dueOffsetDays: number;
  /** ISO datetime. So relevante em FIXED_DATE. */
  dueDate: string;
}

interface Props {
  value: AutomationDueValue;
  onChange: (next: AutomationDueValue) => void;
}

/** Rotulo compacto do botao — descreve o modo escolhido em uma linha. */
function labelFor(v: AutomationDueValue): string {
  if (v.dueMode === 'NONE') return '';
  if (v.dueMode === 'OFFSET_FROM_NOW') {
    if (v.dueOffsetDays === 0) return 'Hoje';
    if (v.dueOffsetDays === 1) return 'Amanhã';
    if (v.dueOffsetDays === -1) return 'Ontem';
    if (v.dueOffsetDays > 1) return `Daqui ${v.dueOffsetDays} dias`;
    return `Há ${Math.abs(v.dueOffsetDays)} dias`;
  }
  if (v.dueMode === 'OFFSET_FROM_CARD_DUE') {
    if (v.dueOffsetDays === 0) return '= prazo do card';
    if (v.dueOffsetDays > 0) return `Card + ${v.dueOffsetDays}d`;
    return `Card - ${Math.abs(v.dueOffsetDays)}d`;
  }
  // FIXED_DATE
  if (!v.dueDate) return 'Data fixa…';
  const d = new Date(v.dueDate);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** Converte 'YYYY-MM-DD' local em ISO UTC no meio-dia local (evita drift de fuso). */
function localDateToIso(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  // Fixa 12:00 local pra sobreviver a qualquer fuso horario sem cair no dia anterior/proximo.
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
  return dt.toISOString();
}
function isoToLocalDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function AutomationDueModePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [customOffset, setCustomOffset] = useState(3);
  const [cardOffset, setCardOffset] = useState(0);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  // Ao abrir, hidrata os inputs custom com os valores atuais pra continuar a edicao.
  useEffect(() => {
    if (!open) return;
    if (value.dueMode === 'OFFSET_FROM_NOW' && value.dueOffsetDays > 1) {
      setCustomOffset(value.dueOffsetDays);
    }
    if (value.dueMode === 'OFFSET_FROM_CARD_DUE') {
      setCardOffset(value.dueOffsetDays);
    }
  }, [open, value]);

  const label = labelFor(value);
  const active = value.dueMode !== 'NONE';

  function commit(next: AutomationDueValue) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={active ? `Prazo: ${label}` : 'Definir prazo'}
        className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] transition-opacity ${
          active
            ? 'text-fg font-medium'
            : 'text-fg-muted hover:text-fg opacity-0 group-hover/item:opacity-100'
        }`}
        aria-label="Definir prazo"
      >
        {active ? <span>{label}</span> : <CalendarDays size={13} />}
      </button>

      {open && (
        <div className="border-border bg-bg absolute right-0 top-full z-40 mt-1 w-[280px] rounded-md border p-2 text-xs shadow-lg">
          <p className="text-fg-muted mb-1.5 px-1 text-[10px] font-semibold uppercase">
            Prazo da tarefa
          </p>

          {/* Sem prazo */}
          <Option
            checked={value.dueMode === 'NONE'}
            onClick={() => commit({ dueMode: 'NONE', dueOffsetDays: 0, dueDate: '' })}
            label="Sem prazo"
          />

          {/* Atalhos dinamicos */}
          <Option
            checked={value.dueMode === 'OFFSET_FROM_NOW' && value.dueOffsetDays === 0}
            onClick={() => commit({ dueMode: 'OFFSET_FROM_NOW', dueOffsetDays: 0, dueDate: '' })}
            label="Hoje (dinâmico)"
            hint="Data em que o card entrar na coluna"
          />
          <Option
            checked={value.dueMode === 'OFFSET_FROM_NOW' && value.dueOffsetDays === 1}
            onClick={() => commit({ dueMode: 'OFFSET_FROM_NOW', dueOffsetDays: 1, dueDate: '' })}
            label="Amanhã (dinâmico)"
            hint="1 dia após a entrada do card"
          />

          {/* Daqui N dias — input inline */}
          <div
            className={`hover:bg-bg-muted flex items-center gap-2 rounded px-1.5 py-1 ${
              value.dueMode === 'OFFSET_FROM_NOW' && value.dueOffsetDays > 1 ? 'bg-bg-muted' : ''
            }`}
          >
            <input
              type="radio"
              name="due-mode"
              checked={value.dueMode === 'OFFSET_FROM_NOW' && value.dueOffsetDays > 1}
              onChange={() =>
                commit({
                  dueMode: 'OFFSET_FROM_NOW',
                  dueOffsetDays: Math.max(2, customOffset),
                  dueDate: '',
                })
              }
              className="accent-primary"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1">
                <span>Daqui</span>
                <input
                  type="number"
                  min={2}
                  max={365}
                  value={customOffset}
                  onChange={(e) => {
                    const n = Math.max(2, Math.min(365, Number(e.target.value) || 2));
                    setCustomOffset(n);
                    if (value.dueMode === 'OFFSET_FROM_NOW' && value.dueOffsetDays > 1) {
                      onChange({ dueMode: 'OFFSET_FROM_NOW', dueOffsetDays: n, dueDate: '' });
                    }
                  }}
                  className="border-border bg-bg-subtle w-14 rounded border px-1 py-0.5 text-xs"
                />
                <span>dias</span>
              </div>
              <p className="text-fg-subtle text-[10px]">Após a entrada do card</p>
            </div>
          </div>

          {/* Casar com prazo do card + N */}
          <div
            className={`hover:bg-bg-muted flex items-center gap-2 rounded px-1.5 py-1 ${
              value.dueMode === 'OFFSET_FROM_CARD_DUE' ? 'bg-bg-muted' : ''
            }`}
          >
            <input
              type="radio"
              name="due-mode"
              checked={value.dueMode === 'OFFSET_FROM_CARD_DUE'}
              onChange={() =>
                commit({
                  dueMode: 'OFFSET_FROM_CARD_DUE',
                  dueOffsetDays: cardOffset,
                  dueDate: '',
                })
              }
              className="accent-primary"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1">
                <span>Prazo do card</span>
                <span className="text-fg-muted">±</span>
                <input
                  type="number"
                  min={-365}
                  max={365}
                  value={cardOffset}
                  onChange={(e) => {
                    const n = Math.max(-365, Math.min(365, Number(e.target.value) || 0));
                    setCardOffset(n);
                    if (value.dueMode === 'OFFSET_FROM_CARD_DUE') {
                      onChange({ dueMode: 'OFFSET_FROM_CARD_DUE', dueOffsetDays: n, dueDate: '' });
                    }
                  }}
                  className="border-border bg-bg-subtle w-14 rounded border px-1 py-0.5 text-xs"
                />
                <span>dias</span>
              </div>
              <p className="text-fg-subtle text-[10px]">
                Requer prazo no card. Se não tiver, sem prazo.
              </p>
            </div>
          </div>

          {/* Data fixa — inline date input */}
          <div
            className={`hover:bg-bg-muted flex items-center gap-2 rounded px-1.5 py-1 ${
              value.dueMode === 'FIXED_DATE' ? 'bg-bg-muted' : ''
            }`}
          >
            <input
              type="radio"
              name="due-mode"
              checked={value.dueMode === 'FIXED_DATE'}
              onChange={() => {
                // Se ainda nao tem data, usa hoje como default.
                const iso =
                  value.dueDate || localDateToIso(isoToLocalDate(new Date().toISOString()));
                commit({ dueMode: 'FIXED_DATE', dueOffsetDays: 0, dueDate: iso });
              }}
              className="accent-primary"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1">
                <span>Data fixa:</span>
                <input
                  type="date"
                  value={isoToLocalDate(value.dueDate)}
                  onChange={(e) =>
                    onChange({
                      dueMode: 'FIXED_DATE',
                      dueOffsetDays: 0,
                      dueDate: localDateToIso(e.target.value),
                    })
                  }
                  className="border-border bg-bg-subtle rounded border px-1 py-0.5 text-xs"
                />
              </div>
              <p className="text-fg-subtle text-[10px]">Data absoluta, não muda com o tempo.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Option({
  checked,
  onClick,
  label,
  hint,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`hover:bg-bg-muted flex w-full items-center gap-2 rounded px-1.5 py-1 text-left ${
        checked ? 'bg-bg-muted' : ''
      }`}
    >
      <input
        type="radio"
        name="due-mode"
        checked={checked}
        onChange={onClick}
        className="accent-primary"
      />
      <div className="flex-1">
        <div>{label}</div>
        {hint && <p className="text-fg-subtle text-[10px]">{hint}</p>}
      </div>
    </button>
  );
}
