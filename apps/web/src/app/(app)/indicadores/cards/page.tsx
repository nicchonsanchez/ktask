import { BarChart3 } from 'lucide-react';

export default function IndicadoresCardsPage() {
  return (
    <div className="container py-10">
      <div className="border-border/70 bg-bg-subtle/40 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
        <span className="bg-primary-subtle text-primary inline-flex size-12 items-center justify-center rounded-full">
          <BarChart3 size={22} />
        </span>
        <p className="text-fg text-sm font-semibold">Indicadores de cards</p>
        <p className="text-fg-muted max-w-sm text-[12px] leading-relaxed">
          Em breve — gráficos de throughput, lead time, distribuição por etiqueta e SLA por fluxo.
        </p>
      </div>
    </div>
  );
}
