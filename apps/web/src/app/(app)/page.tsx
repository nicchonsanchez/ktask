'use client';

import { useState } from 'react';

import { useAuthStore } from '@/stores/auth-store';
import { TarefasPanel } from '@/components/home/tarefas-panel';
import { CardsRecentesCarousel } from '@/components/home/cards-recentes-carousel';
import { MiniCalendar } from '@/components/home/mini-calendar';
import { EventosPanel } from '@/components/home/eventos-panel';

/**
 * Home pessoal (visão de tarefas + cards recentes + calendário do dia).
 *
 * Inspirada no Ummense. Layout:
 *   - lg+: 2 colunas (esquerda 1fr — Tarefas + Cards recentes;
 *          direita 320px — MiniCalendar + Eventos)
 *   - <lg: tudo numa coluna; calendário aparece DEPOIS dos cards
 *
 * A view antiga (Org + papel + membros) virou rota `/empresa`.
 *
 * Interação: clicar num dia do MiniCalendar filtra `TarefasPanel` pra
 * mostrar só as tarefas daquele dia (estado `selectedDay` em formato
 * ISO yyyy-mm-dd, BRT). Click no mesmo dia desativa o filtro.
 */
export default function HomePage() {
  const { user } = useAuthStore();
  const firstName = user?.name.split(' ')[0] ?? 'você';
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  function toggleDay(day: string) {
    setSelectedDay((prev) => (prev === day ? null : day));
  }

  return (
    <div className="container py-6 sm:py-8">
      <header className="mb-5 sm:mb-6">
        <h1 className="text-fg text-xl font-semibold tracking-tight sm:text-2xl">
          Olá, <span className="text-primary">{firstName}</span>.
        </h1>
        <p className="text-fg-muted mt-1 text-sm">Suas tarefas, cards recentes e calendário.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
        {/* Coluna principal */}
        <div className="flex min-w-0 flex-col gap-4">
          <TarefasPanel selectedDay={selectedDay} onClearFilter={() => setSelectedDay(null)} />
          <CardsRecentesCarousel />
        </div>

        {/* Sidebar */}
        <aside className="flex flex-col gap-4">
          <MiniCalendar selectedDay={selectedDay} onSelectDay={toggleDay} />
          <EventosPanel />
        </aside>
      </div>
    </div>
  );
}
