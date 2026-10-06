'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { canViewPerformanceReport } from '@ktask/contracts';

import { api } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

const TABS = [
  { href: '/indicadores/timesheet', label: 'Timesheet da organização' },
  { href: '/indicadores/cards', label: 'Indicadores de cards' },
  { href: '/indicadores/tarefas', label: 'Indicadores de tarefas' },
  { href: '/indicadores/empresas', label: 'Por empresa' },
];

/** Doc 52: aba visivel so pra Dono/Admin (backend tambem bloqueia). */
const PERFORMANCE_TAB = { href: '/indicadores/desempenho', label: 'Desempenho da equipe' };

export default function IndicadoresLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuthStore();
  // Mesma query/queryKey do topbar — reaproveita o cache.
  const orgQ = useQuery({
    queryKey: ['org', 'current'],
    queryFn: () => api.get<{ myRole: string }>('/api/v1/organizations/current'),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
  const tabs = canViewPerformanceReport(orgQ.data?.myRole) ? [...TABS, PERFORMANCE_TAB] : TABS;
  // No celular as abas rolam na horizontal: garante que a ativa fique visivel.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pathname, tabs.length]);

  return (
    <div className="flex flex-col">
      <header className="border-border/60 bg-bg sticky top-[52px] z-20 border-b">
        <div className="container flex flex-col gap-1 pb-0 pt-4">
          <h1 className="text-fg text-lg font-semibold">Indicadores da organização</h1>
          <nav
            ref={navRef}
            role="tablist"
            className="-mb-px mt-2 flex items-stretch gap-1 overflow-x-auto"
          >
            {tabs.map((tab) => {
              const active = pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  role="tab"
                  aria-selected={active}
                  className={`group relative flex shrink-0 items-center whitespace-nowrap px-2 py-2.5 text-[11px] font-medium uppercase tracking-normal transition-colors sm:px-3 sm:text-[13px] sm:tracking-wide ${
                    active ? 'text-primary' : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  {tab.label}
                  <span
                    aria-hidden
                    className={`absolute inset-x-3 bottom-0 h-[2px] rounded-t transition-colors ${
                      active ? 'bg-primary' : 'group-hover:bg-border-strong bg-transparent'
                    }`}
                  />
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
