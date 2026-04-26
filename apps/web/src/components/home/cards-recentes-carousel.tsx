'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Lock } from 'lucide-react';

import { meQueries, type RecentCardItem } from '@/lib/queries/me';
import { UserAvatar } from '@/components/user-avatar';

/**
 * Carrossel "Cards recentes" — cards visitados pelo user nos últimos N dias.
 *
 * Comportamento (decisão do operador):
 *   - Setas ← (volta) e → (avança)
 *   - Só mostra ← quando há cards anteriores fora da janela visível
 *   - Mantém → enquanto houver cards à frente
 *   - Scroll horizontal nativo (swipe no mobile, setas no desktop)
 */
export function CardsRecentesCarousel() {
  const [collapsed, setCollapsed] = useState(false);
  const recentQuery = useQuery({ ...meQueries.recentCards() });
  const data = recentQuery.data ?? [];
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    function update() {
      if (!el) return;
      setCanScrollLeft(el.scrollLeft > 8);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
    }
    update();
    el.addEventListener('scroll', update, { passive: true });
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      obs.disconnect();
    };
  }, [data.length]);

  function scrollBy(dir: 'left' | 'right') {
    const el = scrollerRef.current;
    if (!el) return;
    const delta = el.clientWidth * 0.8 * (dir === 'left' ? -1 : 1);
    el.scrollBy({ left: delta, behavior: 'smooth' });
  }

  return (
    <section className="border-border bg-bg overflow-hidden rounded-lg border">
      {/* Cabeçalho */}
      <div className="border-border/60 flex items-center justify-between gap-2 border-b px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="text-fg-muted hover:bg-bg-muted hover:text-fg rounded p-1"
            aria-label={collapsed ? 'Expandir' : 'Recolher'}
          >
            <ChevronDown
              size={14}
              className={`transition-transform ${collapsed ? '' : 'rotate-180'}`}
            />
          </button>
          <h2 className="text-fg text-sm font-semibold">Cards recentes</h2>
        </div>
      </div>

      {!collapsed && (
        <div className="relative">
          {recentQuery.isLoading && (
            <div className="text-fg-muted flex items-center justify-center gap-2 py-8 text-sm">
              <Loader2 size={14} className="animate-spin" />
              Carregando…
            </div>
          )}
          {!recentQuery.isLoading && data.length === 0 && (
            <p className="text-fg-muted px-4 py-6 text-center text-sm">
              Abra cards do board e eles aparecerão aqui pra acesso rápido.
            </p>
          )}
          {data.length > 0 && (
            <>
              <div
                ref={scrollerRef}
                className="scrollbar-none flex gap-3 overflow-x-auto scroll-smooth p-3 sm:p-4"
              >
                {data.map((item) => (
                  <RecentCardItemCard key={item.card.id} item={item} />
                ))}
              </div>
              {canScrollLeft && (
                <button
                  type="button"
                  onClick={() => scrollBy('left')}
                  className="bg-bg/95 border-border text-fg-muted hover:text-fg absolute left-2 top-1/2 z-10 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full border shadow-md backdrop-blur"
                  aria-label="Voltar"
                >
                  <ChevronLeft size={16} />
                </button>
              )}
              {canScrollRight && (
                <button
                  type="button"
                  onClick={() => scrollBy('right')}
                  className="bg-bg/95 border-border text-fg-muted hover:text-fg absolute right-2 top-1/2 z-10 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full border shadow-md backdrop-blur"
                  aria-label="Avançar"
                >
                  <ChevronRight size={16} />
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

const PRIORITY_COLOR: Record<RecentCardItem['card']['priority'], string | null> = {
  NONE: null,
  LOW: '#06B6D4',
  MEDIUM: '#F59E0B',
  HIGH: '#F97316',
  URGENT: '#EF4444',
};

function RecentCardItemCard({ item }: { item: RecentCardItem }) {
  const { card } = item;
  const href = `/b/${card.board.id}?card=${card.id}`;
  const priorityColor = PRIORITY_COLOR[card.priority];
  return (
    <Link
      href={href}
      className="border-border/60 bg-bg-subtle hover:border-border-strong hover:bg-bg-muted/50 group/card relative flex w-[220px] shrink-0 flex-col gap-2 overflow-hidden rounded-md border p-3 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex shrink-0 -space-x-1.5">
          {card.members.slice(0, 3).map((m) => (
            <UserAvatar
              key={m.user.id}
              name={m.user.name}
              userId={m.user.id}
              avatarUrl={m.user.avatarUrl}
              size="sm"
              stacked
            />
          ))}
          {card.board.visibility === 'PRIVATE' && (
            <span
              title="Quadro privado"
              className="bg-bg-muted text-fg-muted ml-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full"
            >
              <Lock size={11} />
            </span>
          )}
        </div>
      </div>

      <p className="text-fg line-clamp-2 text-[13px] font-medium leading-snug">{card.title}</p>

      <p className="text-fg-muted text-[11px]">{card.board.name}</p>

      {/* Faixa de prioridade na borda inferior */}
      {priorityColor && (
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1.5"
          style={{ backgroundColor: priorityColor }}
        />
      )}
    </Link>
  );
}
