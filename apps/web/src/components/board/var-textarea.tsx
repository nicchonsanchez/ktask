'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';

export interface TemplateVar {
  /** Token a inserir, ex: '{{card.title}}' */
  token: string;
  /** Label humano que aparece no dropdown e nas pills, ex: 'Título do card' */
  label: string;
  /** Texto secundario opcional, ex: 'O nome do card' */
  hint?: string;
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  vars: TemplateVar[];
  rows?: number;
  placeholder?: string;
  className?: string;
  /** Quando true renderiza <input> em vez de <textarea> */
  singleLine?: boolean;
  maxLength?: number;
}

/**
 * Textarea (ou input) com autocomplete de variaveis Mustache via trigger '/'.
 *
 * Comportamento:
 * - User digita '/' → abre dropdown logo abaixo do campo
 * - Continua digitando → filtra por label/token (case-insensitive)
 * - ArrowUp/ArrowDown navega · Enter/Tab insere · Esc fecha
 * - Click num item insere
 * - Espaço ou Backspace passando do '/' fecha o dropdown
 *
 * Insere `{{var.path}}` na posicao do '/' (substitui o '/' + query digitada).
 * Foca de volta e posiciona cursor apos o token.
 */
export const VarTextarea = forwardRef<HTMLTextAreaElement | HTMLInputElement, Props>(
  function VarTextarea(props, fwdRef) {
    const {
      value,
      onChange,
      vars,
      rows = 4,
      placeholder,
      className,
      singleLine,
      maxLength,
    } = props;
    const innerRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
    useImperativeHandle(fwdRef, () => innerRef.current!, []);

    const [triggerPos, setTriggerPos] = useState<number | null>(null);
    const [query, setQuery] = useState('');
    const [activeIdx, setActiveIdx] = useState(0);

    const open = triggerPos !== null;

    const filtered = open
      ? vars.filter((v) => {
          if (!query) return true;
          const q = query.toLowerCase();
          return (
            v.label.toLowerCase().includes(q) ||
            v.token.toLowerCase().includes(q) ||
            (v.hint?.toLowerCase().includes(q) ?? false)
          );
        })
      : vars;

    // Reset activeIdx quando filtered shrinks
    useEffect(() => {
      if (activeIdx >= filtered.length) setActiveIdx(0);
    }, [filtered.length, activeIdx]);

    function handleChange(e: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) {
      const next = e.target.value;
      const cursor = e.target.selectionStart ?? next.length;
      onChange(next);

      // Detecta abertura: '/' acabou de ser digitado e está em inicio de string
      // ou após whitespace (evita disparar dentro de URL tipo http://)
      const justTyped = next.length > value.length;
      if (justTyped) {
        const lastChar = next[cursor - 1];
        if (lastChar === '/') {
          const before = next[cursor - 2];
          if (cursor === 1 || before === ' ' || before === '\n' || before === '\t') {
            setTriggerPos(cursor - 1);
            setQuery('');
            setActiveIdx(0);
            return;
          }
        }
      }

      // Atualiza query se dropdown está aberto
      if (open && triggerPos !== null) {
        // Cursor não pode ir antes do trigger
        if (cursor <= triggerPos) {
          close();
          return;
        }
        const newQuery = next.slice(triggerPos + 1, cursor);
        // Espaço ou newline fecha
        if (/\s/.test(newQuery)) {
          close();
          return;
        }
        setQuery(newQuery);
      }
    }

    function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) {
      if (!open) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % Math.max(filtered.length, 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + filtered.length) % Math.max(filtered.length, 1));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filtered.length > 0) {
          e.preventDefault();
          select(filtered[activeIdx] ?? filtered[0]!);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    }

    function close() {
      setTriggerPos(null);
      setQuery('');
      setActiveIdx(0);
    }

    function select(v: TemplateVar) {
      const el = innerRef.current;
      if (!el || triggerPos === null) {
        close();
        return;
      }
      const cursor = el.selectionStart ?? value.length;
      // Substitui '/' + query digitada pelo token
      const next = value.slice(0, triggerPos) + v.token + value.slice(cursor);
      onChange(next);
      close();
      requestAnimationFrame(() => {
        const el2 = innerRef.current;
        if (!el2) return;
        el2.focus();
        const pos = triggerPos + v.token.length;
        el2.setSelectionRange(pos, pos);
      });
    }

    const baseClass =
      className ??
      'border-border focus:border-primary w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none';

    return (
      <div className="relative">
        {singleLine ? (
          <input
            ref={innerRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(close, 100)}
            placeholder={placeholder}
            maxLength={maxLength}
            className={baseClass}
          />
        ) : (
          <textarea
            ref={innerRef as React.RefObject<HTMLTextAreaElement>}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(close, 100)}
            rows={rows}
            placeholder={placeholder}
            maxLength={maxLength}
            className={baseClass}
          />
        )}

        {open && (
          <div
            role="listbox"
            className="border-border bg-bg absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-md border shadow-lg"
          >
            <div className="border-border/60 text-fg-muted border-b px-2 py-1 text-[10px]">
              {filtered.length === 0 ? 'Nada encontrado' : `Variável · / para inserir, Esc cancela`}
            </div>
            {filtered.map((v, i) => (
              <button
                key={v.token}
                type="button"
                role="option"
                aria-selected={i === activeIdx}
                onMouseDown={(e) => e.preventDefault()} // evita blur disparar antes do click
                onClick={() => select(v)}
                onMouseEnter={() => setActiveIdx(i)}
                className={`flex w-full items-center justify-between gap-3 px-2 py-1.5 text-left text-[12px] transition-colors ${
                  i === activeIdx
                    ? 'bg-primary-subtle/50 text-fg'
                    : 'text-fg-muted hover:bg-bg-muted'
                }`}
              >
                <span className="flex flex-col">
                  <span className="font-medium">{v.label}</span>
                  {v.hint && <span className="text-fg-subtle text-[10px]">{v.hint}</span>}
                </span>
                <code className="text-fg-subtle font-mono text-[10px]">{v.token}</code>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  },
);
