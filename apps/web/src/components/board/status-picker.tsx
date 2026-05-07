'use client';

// Doc 42: dropdown de status do card. Usado no canto superior direito
// do modal do card (espelha o picker do Ummense).

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { STATUS_LABEL, STATUS_ORDER, STATUS_VISUAL, type CardStatus } from './status-config';

export function StatusPicker({
  value,
  onChange,
  disabled,
  size = 'md',
}: {
  value: CardStatus;
  onChange: (next: CardStatus) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const visual = STATUS_VISUAL[value];
  const Icon = visual.icon;

  useEffect(() => {
    function click(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', click);
    return () => document.removeEventListener('mousedown', click);
  }, [open]);

  const padding = size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1';
  const text = size === 'sm' ? 'text-[11px]' : 'text-xs';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className={`focus-visible:ring-primary inline-flex items-center gap-1.5 rounded-md border ${padding} ${text} font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${visual.bgClass} ${visual.textClass} border-transparent hover:brightness-95`}
        title={visual.hint}
        aria-label={`Status: ${STATUS_LABEL[value]}`}
      >
        <Icon size={12} />
        <span>{STATUS_LABEL[value]}</span>
        <ChevronDown size={11} className="opacity-70" />
      </button>

      {open && (
        <div className="border-border bg-bg absolute right-0 top-full z-30 mt-1 flex w-52 flex-col overflow-hidden rounded-md border py-1 shadow-lg">
          <p className="text-fg-subtle px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide">
            Status do card
          </p>
          {STATUS_ORDER.map((s) => {
            const v = STATUS_VISUAL[s];
            const VIcon = v.icon;
            const active = s === value;
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
                className={`hover:bg-bg-muted flex items-center gap-2 px-3 py-1.5 text-left text-sm ${
                  active ? 'bg-bg-muted/50' : ''
                }`}
                title={v.hint}
              >
                <span
                  className={`inline-flex size-5 items-center justify-center rounded ${v.bgClass} ${v.textClass}`}
                >
                  <VIcon size={11} />
                </span>
                <span className="text-fg flex-1">{STATUS_LABEL[s]}</span>
                {active && <span className="text-fg-subtle text-[10px]">atual</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
