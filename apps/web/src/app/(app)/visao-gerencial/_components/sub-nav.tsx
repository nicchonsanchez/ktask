'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CheckSquare, Layers } from 'lucide-react';

/**
 * Tabs no topo de /visao-gerencial/{cards,tarefas}. Em rotas-irmas (cards e
 * tarefas), nao em abas dentro de uma mesma page, pra permitir deeplink
 * direto pra cada visao.
 */
const TABS = [
  { href: '/visao-gerencial/cards', label: 'Cards', icon: Layers },
  { href: '/visao-gerencial/tarefas', label: 'Tarefas', icon: CheckSquare },
];

export function VisaoGerencialSubNav() {
  const pathname = usePathname();
  return (
    <nav className="border-border/60 flex items-center gap-1 border-b px-4 sm:px-6">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname?.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors ${
              active
                ? 'border-primary text-primary'
                : 'text-fg-muted hover:text-fg border-transparent'
            }`}
          >
            <Icon size={14} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
