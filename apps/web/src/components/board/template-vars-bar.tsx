'use client';

import type { RefObject } from 'react';

interface TemplateVar {
  /** Token a inserir no texto, ex: "{{card.title}}" */
  token: string;
  /** Label visivel no botao. Default: igual ao token */
  label?: string;
}

/**
 * Barra de variaveis clicaveis pra textarea/input de template (Mustache).
 * Click insere o token na posicao do cursor — ou substitui a selecao se
 * o user tinha algo selecionado. Foca a textarea de volta e posiciona
 * o cursor logo depois do token inserido.
 *
 * Uso:
 *   const ref = useRef<HTMLTextAreaElement>(null);
 *   <textarea ref={ref} value={v} onChange={...} />
 *   <TemplateVarsBar inputRef={ref} value={v} onChange={setV} vars={VARS} />
 *
 * Mobile: click funciona normal. Drag-and-drop nao foi implementado de
 * proposito (DnD nao tem suporte mobile nativo decente; click cobre tudo).
 */
export function TemplateVarsBar({
  inputRef,
  value,
  onChange,
  vars,
  label = 'Variáveis',
}: {
  inputRef: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  value: string;
  onChange: (next: string) => void;
  vars: TemplateVar[];
  label?: string;
}) {
  function insert(token: string) {
    const el = inputRef.current;
    if (!el) {
      onChange(value + token);
      return;
    }

    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    onChange(next);

    // Espera o React aplicar o novo value no DOM antes de mexer no cursor
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-fg-subtle text-[10px] font-medium">{label}:</span>
      {vars.map((v) => {
        const hasLabel = Boolean(v.label);
        return (
          <button
            key={v.token}
            type="button"
            onClick={() => insert(v.token)}
            className={`border-border/70 bg-bg-subtle/50 text-fg-muted hover:border-primary/50 hover:bg-primary-subtle/40 hover:text-primary inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] transition-colors ${
              hasLabel ? '' : 'font-mono'
            }`}
            title={`Inserir ${v.token} no cursor`}
          >
            {v.label ?? v.token}
          </button>
        );
      })}
    </div>
  );
}
