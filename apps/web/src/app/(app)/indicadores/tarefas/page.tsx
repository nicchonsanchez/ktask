import { ListChecks } from 'lucide-react';

export default function IndicadoresTarefasPage() {
  return (
    <div className="container py-10">
      <div className="border-border/70 bg-bg-subtle/40 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
        <span className="bg-primary-subtle text-primary inline-flex size-12 items-center justify-center rounded-full">
          <ListChecks size={22} />
        </span>
        <p className="text-fg text-sm font-semibold">Indicadores de tarefas</p>
        <p className="text-fg-muted max-w-sm text-[12px] leading-relaxed">
          Em breve — checklist completion rate, tarefas atrasadas, distribuição por responsável.
        </p>
      </div>
    </div>
  );
}
