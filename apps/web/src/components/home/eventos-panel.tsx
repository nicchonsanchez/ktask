'use client';

import { ChevronDown, Plus } from 'lucide-react';

/**
 * Painel "Eventos" — placeholder visual da feature de agenda. Implementação
 * real entra na Fase 2 junto com automações + Evolution API. Mantém a tag
 * "PRO" pra alinhar com o pattern do Ummense (ainda que aqui seja "em breve").
 */
export function EventosPanel() {
  return (
    <section className="border-border bg-bg overflow-hidden rounded-lg border opacity-90">
      <div className="border-border/60 flex items-center justify-between gap-2 border-b px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <ChevronDown size={14} className="text-fg-muted" />
          <h2 className="text-fg text-sm font-semibold">Eventos</h2>
          <span className="bg-success-subtle text-success rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
            Em breve
          </span>
        </div>
        <button
          type="button"
          disabled
          aria-label="Adicionar evento (em breve)"
          className="text-fg-subtle inline-flex size-6 cursor-not-allowed items-center justify-center rounded"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="px-4 py-4">
        <p className="text-fg-muted text-[12px] italic">Adicionar evento</p>
        <p className="text-fg-subtle mt-1 text-[11px]">
          Agenda integrada chega na Fase 2 junto com as automações.
        </p>
      </div>
    </section>
  );
}
