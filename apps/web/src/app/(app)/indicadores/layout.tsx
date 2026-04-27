'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/indicadores/timesheet', label: 'Timesheet da organização' },
  { href: '/indicadores/cards', label: 'Indicadores de cards' },
  { href: '/indicadores/tarefas', label: 'Indicadores de tarefas' },
];

export default function IndicadoresLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col">
      <header className="border-border/60 bg-bg sticky top-[52px] z-20 border-b">
        <div className="container flex flex-col gap-1 pb-0 pt-4">
          <h1 className="text-fg text-lg font-semibold">Indicadores da organização</h1>
          <nav role="tablist" className="-mb-px mt-2 flex items-stretch gap-1">
            {TABS.map((tab) => {
              const active = pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  role="tab"
                  aria-selected={active}
                  className={`group relative flex items-center px-2 py-2.5 text-[11px] font-medium uppercase tracking-normal transition-colors sm:px-3 sm:text-[13px] sm:tracking-wide ${
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
