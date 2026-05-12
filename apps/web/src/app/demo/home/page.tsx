'use client';

import Link from 'next/link';
import { CheckCircle2, ChevronRight, Clock, Plus } from 'lucide-react';
import { DemoTopbar } from '../_DemoTopbar';
import { DEMO_TAREFAS_MARINA, DEMO_CARDS, DEMO_VIEWER } from '../_data';

/**
 * Replica visual estatica da home (Início) para um usuario MEMBER (Marina,
 * cliente). Cobre os prints #04 (topbar + estrutura geral) e #05 (tarefa
 * pendente com nome do card destacado).
 */
export default function DemoHomePage() {
  return (
    <>
      <DemoTopbar active="inicio" pendingApprovals={2} notificationsCount={3} />

      <div className="container mx-auto max-w-7xl px-4 py-6 sm:py-8">
        {/* Saudação */}
        <div className="mb-6">
          <h1 className="text-fg text-2xl font-bold sm:text-3xl">
            Olá, {DEMO_VIEWER.firstName} 👋
          </h1>
          <p className="text-fg-muted mt-1 text-sm">
            Você tem <strong className="text-fg">{DEMO_TAREFAS_MARINA.length} tarefas</strong> pra
            resolver hoje.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          {/* Coluna esquerda: Tarefas + Cards recentes */}
          <div className="flex flex-col gap-6">
            <PainelTarefas />
            <PainelCardsRecentes />
          </div>

          {/* Coluna direita: Mini calendar + Eventos */}
          <aside className="flex flex-col gap-6">
            <MiniCalendar />
            <PainelEventos />
          </aside>
        </div>
      </div>
    </>
  );
}

// ─── Painel de Tarefas ─────────────────────────────────────────────────

function PainelTarefas() {
  return (
    <section className="bg-bg-subtle border-border rounded-xl border p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-fg text-base font-semibold">Tarefas</h2>
        <button className="text-fg-muted hover:bg-bg-muted hover:text-fg inline-flex size-7 items-center justify-center rounded-md">
          <Plus size={14} />
        </button>
      </div>

      <ul className="divide-y divide-[var(--border)]">
        {DEMO_TAREFAS_MARINA.map((tarefa) => (
          <li key={tarefa.id} className="group flex items-center gap-3 py-3">
            {/* Checkbox custom (a "bolinha com check" do KTask) */}
            <button
              aria-label="Marcar tarefa concluida"
              className="text-fg-muted flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-[var(--border)] transition-colors hover:border-emerald-500 hover:text-emerald-500"
            >
              <CheckCircle2 size={11} className="opacity-0 group-hover:opacity-100" />
            </button>

            {/* Titulo da tarefa */}
            <span className="text-fg shrink-0 text-sm font-medium">{tarefa.title}</span>

            {/* Separador + nome do card (destaque) */}
            <Link
              href={tarefa.id === 't-1' ? '#' : '#'}
              className="ml-2 inline-flex items-center gap-1.5 truncate rounded-md bg-violet-500/10 px-2 py-1 text-xs font-medium text-violet-600 hover:bg-violet-500/15 dark:text-violet-300"
            >
              <span className="text-fg-muted">📁</span>
              <span className="truncate">{tarefa.cardTitle}</span>
            </Link>

            {/* Spacer */}
            <span className="flex-1" />

            {/* Prazo */}
            <span
              className={`hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium sm:inline-flex ${
                tarefa.dueColor === 'rose'
                  ? 'bg-rose-500/15 text-rose-500'
                  : tarefa.dueColor === 'amber'
                    ? 'bg-amber-500/15 text-amber-600'
                    : 'bg-[var(--bg-muted)] text-[var(--fg-muted)]'
              }`}
            >
              <Clock size={11} /> {tarefa.due}
            </span>

            <ChevronRight size={16} className="text-fg-muted shrink-0" />
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Cards recentes (mini-cards horizontal) ───────────────────────────

function PainelCardsRecentes() {
  const recentes = DEMO_CARDS.slice(0, 4);

  return (
    <section className="bg-bg-subtle border-border rounded-xl border p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-fg text-base font-semibold">Cards recentes</h2>
        <button className="text-fg-muted hover:bg-bg-muted hover:text-fg inline-flex size-7 items-center justify-center rounded-md">
          <Plus size={14} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {recentes.map((card) => (
          <Link
            key={card.code}
            href="#"
            className="bg-bg border-border block rounded-lg border p-3 transition-colors hover:border-violet-500/40"
          >
            <div className="text-fg-muted mb-1 flex items-center gap-1.5 text-[11px] font-medium">
              <span className="rounded bg-[var(--bg-muted)] px-1.5 py-0.5">{card.code}</span>
              <span>·</span>
              <span className="truncate">{card.boardName}</span>
            </div>
            <p className="text-fg line-clamp-2 text-sm font-medium leading-snug">{card.title}</p>
            <div className="mt-2 flex items-center justify-between">
              <ColumnBadge column={card.column} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ColumnBadge({ column }: { column: string }) {
  const color =
    column === 'Aprovação do cliente'
      ? 'bg-amber-500/15 text-amber-600'
      : column === 'Em produção'
        ? 'bg-blue-500/15 text-blue-500'
        : column === 'Aprovado'
          ? 'bg-emerald-500/15 text-emerald-600'
          : column === 'Briefing'
            ? 'bg-[var(--bg-muted)] text-[var(--fg-muted)]'
            : 'bg-violet-500/15 text-violet-500';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${color}`}>{column}</span>
  );
}

// ─── Mini calendar ────────────────────────────────────────────────────

function MiniCalendar() {
  // Mock: maio/2026, dia 12 destacado como "hoje"
  const dias = Array.from({ length: 31 }, (_, i) => i + 1);
  const hoje = 12;
  const comTarefa = [12, 14, 15, 18, 22];
  const inicioOffset = 5; // 1 de maio = sexta (offset 5)

  return (
    <section className="bg-bg-subtle border-border rounded-xl border p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-fg text-sm font-semibold">Maio · 2026</h2>
        <div className="flex items-center gap-1">
          <button className="text-fg-muted hover:bg-bg-muted hover:text-fg inline-flex size-6 items-center justify-center rounded">
            ‹
          </button>
          <button className="text-fg-muted hover:bg-bg-muted hover:text-fg inline-flex size-6 items-center justify-center rounded">
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
          <div key={i} className="text-fg-muted py-1 font-semibold">
            {d}
          </div>
        ))}
        {Array.from({ length: inicioOffset }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {dias.map((d) => {
          const isHoje = d === hoje;
          const temTarefa = comTarefa.includes(d);
          return (
            <button
              key={d}
              className={`relative h-7 rounded text-xs font-medium transition-colors ${
                isHoje ? 'bg-violet-600 text-white' : 'text-fg hover:bg-[var(--bg-muted)]'
              }`}
            >
              {d}
              {temTarefa && !isHoje && (
                <span className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-violet-500" />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ─── Eventos do dia ───────────────────────────────────────────────────

function PainelEventos() {
  return (
    <section className="bg-bg-subtle border-border rounded-xl border p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-fg text-sm font-semibold">Eventos · hoje</h2>
        <button className="text-fg-muted hover:bg-bg-muted hover:text-fg inline-flex size-6 items-center justify-center rounded text-xs">
          <Plus size={12} />
        </button>
      </div>

      <div className="text-fg-muted text-xs italic">Sem eventos marcados pra hoje.</div>
    </section>
  );
}
