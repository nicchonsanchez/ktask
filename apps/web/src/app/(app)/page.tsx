'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';

import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api-client';
import { TarefasPanel } from '@/components/home/tarefas-panel';
import { CardsRecentesCarousel } from '@/components/home/cards-recentes-carousel';
import { MiniCalendar } from '@/components/home/mini-calendar';
import { EventosPanel } from '@/components/home/eventos-panel';
import { ViewAsBanner } from '@/components/home/view-as-banner';
import { UserRecentActivity } from '@/components/home/user-recent-activity';
import type { OrgRole } from '@ktask/contracts';

interface CurrentOrg {
  id: string;
  myRole: OrgRole;
}

const PRIVILEGED_ROLES: OrgRole[] = ['OWNER', 'ADMIN', 'GESTOR'];

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
 * Modo "ver como" (?as=<userId>): GESTOR+ pode visualizar a home de
 * outro membro pra monitorar o trabalho. Renderização é read-only,
 * com banner sticky no topo. Componentes recebem `viewAsUserId` e
 * `boardFilter` como props e trocam as queries pra `userViewQueries`.
 *
 * Interação: clicar num dia do MiniCalendar filtra `TarefasPanel` pra
 * mostrar só as tarefas daquele dia (estado `selectedDay` em formato
 * ISO yyyy-mm-dd, BRT). Click no mesmo dia desativa o filtro.
 */
export default function HomePage() {
  const { user } = useAuthStore();
  const searchParams = useSearchParams();
  const rawAsParam = searchParams.get('as');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [boardFilter, setBoardFilter] = useState<string | null>(null);

  // Permissão pra usar ?as=: precisa ser GESTOR+. Se MEMBER tentar
  // truqueando a URL, ignoramos e renderizamos a home própria.
  const orgQuery = useQuery({
    queryKey: ['org', 'current'],
    queryFn: () => api.get<CurrentOrg>('/api/v1/organizations/current'),
    enabled: !!user,
  });
  const isPrivileged = orgQuery.data ? PRIVILEGED_ROLES.includes(orgQuery.data.myRole) : false;
  const viewAsUserId =
    rawAsParam && isPrivileged && rawAsParam !== user?.id ? rawAsParam : undefined;

  const firstName = user?.name.split(' ')[0] ?? 'você';

  function toggleDay(day: string) {
    setSelectedDay((prev) => (prev === day ? null : day));
  }

  function handleChangeBoardFilter(boardId: string | null) {
    setBoardFilter(boardId);
  }

  return (
    <div className="container py-6 sm:py-8">
      {viewAsUserId && (
        <ViewAsBanner
          userId={viewAsUserId}
          boardFilter={boardFilter}
          onChangeBoardFilter={handleChangeBoardFilter}
        />
      )}

      {!viewAsUserId && (
        <header className="mb-5 sm:mb-6">
          <h1 className="text-fg text-xl font-semibold tracking-tight sm:text-2xl">
            Olá, <span className="text-primary">{firstName}</span>.
          </h1>
          <p className="text-fg-muted mt-1 text-sm">Suas tarefas, cards recentes e calendário.</p>
        </header>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
        {/* Coluna principal. No mobile vai pra ordem 2 (depois do calendario)
            pra que MiniCalendar fique visivel sem precisar scrollar. */}
        <div className="order-2 flex min-w-0 flex-col gap-4 lg:order-1">
          <TarefasPanel
            selectedDay={selectedDay}
            onClearFilter={() => setSelectedDay(null)}
            viewAsUserId={viewAsUserId}
            boardFilter={boardFilter}
          />
          <CardsRecentesCarousel viewAsUserId={viewAsUserId} boardFilter={boardFilter} />
          {viewAsUserId && <UserRecentActivity userId={viewAsUserId} />}
        </div>

        {/* Sidebar — calendario + eventos. No mobile vai pra ordem 1 (topo). */}
        <aside className="order-1 flex flex-col gap-4 lg:order-2">
          <MiniCalendar
            selectedDay={selectedDay}
            onSelectDay={toggleDay}
            viewAsUserId={viewAsUserId}
          />
          {!viewAsUserId && <EventosPanel />}
        </aside>
      </div>
    </div>
  );
}
