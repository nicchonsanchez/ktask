'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Bell, Search, ChevronDown, Sparkles } from 'lucide-react';
import { DEMO_VIEWER } from './_data';

/**
 * Replica visual estatica da topbar real do KTask, para uso nas telas de
 * /demo. Sem auth, sem queries, sem socket — apenas estrutura visual fiel.
 *
 * Props permitem customizar o item ativo e o badge de aprovacoes pendentes
 * (relevante pra prints da home — `pendingCount={2}` mostra o badge).
 */
export function DemoTopbar({
  active = 'inicio',
  pendingApprovals = 0,
  notificationsCount = 0,
}: {
  active?: 'inicio' | 'quadros' | 'aprovacoes' | 'indicadores';
  pendingApprovals?: number;
  notificationsCount?: number;
}) {
  const nav = [
    { key: 'inicio', label: 'Início', href: '/demo/home' },
    { key: 'quadros', label: 'Quadros', href: '#' },
    { key: 'aprovacoes', label: 'Aprovações', href: '#', badge: pendingApprovals },
    { key: 'indicadores', label: 'Indicadores', href: '#' },
  ] as const;

  return (
    <header className="bg-bg sticky top-0 z-30 border-b border-[var(--border)]">
      <div className="container mx-auto flex h-[52px] max-w-7xl items-center justify-between gap-4 px-4">
        <div className="flex min-w-0 items-center gap-5">
          {/* Logo */}
          <Link href="/demo" className="flex shrink-0 items-center hover:opacity-85">
            <Image
              src="/brand/lockup-wordmark-dark.png"
              alt="KTask"
              width={88}
              height={25}
              priority
              className="block dark:hidden"
            />
            <Image
              src="/brand/lockup-wordmark.png"
              alt=""
              width={88}
              height={25}
              priority
              aria-hidden
              className="hidden dark:block"
            />
          </Link>

          {/* Badge DEMO */}
          <Link
            href="/demo"
            className="hidden items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-400 hover:bg-violet-500/20 sm:inline-flex"
          >
            <Sparkles size={10} /> Demo
          </Link>

          {/* Nav primary */}
          <nav className="hidden items-center gap-1 sm:flex">
            {nav.map((item) => {
              const isActive = active === item.key;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`relative inline-flex h-[34px] items-center rounded-md px-3 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-violet-600/15 text-violet-600 dark:text-violet-300'
                      : 'text-fg-muted hover:bg-bg-muted hover:text-fg'
                  }`}
                >
                  {item.label}
                  {'badge' in item && item.badge && item.badge > 0 ? (
                    <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}

            {/* CRM dropdown — mostrado só visualmente */}
            <button
              type="button"
              className="text-fg-muted hover:bg-bg-muted hover:text-fg inline-flex h-[34px] items-center gap-1 rounded-md px-3 text-sm font-medium"
            >
              CRM <ChevronDown size={14} />
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-1">
          {/* Search */}
          <button
            type="button"
            aria-label="Buscar"
            className="text-fg-muted hover:bg-bg-muted hover:text-fg inline-flex size-9 items-center justify-center rounded-md"
          >
            <Search size={18} />
          </button>

          {/* Bell */}
          <button
            type="button"
            aria-label="Notificações"
            className="text-fg-muted hover:bg-bg-muted hover:text-fg relative inline-flex size-9 items-center justify-center rounded-md"
          >
            <Bell size={18} />
            {notificationsCount > 0 && (
              <span className="absolute right-1.5 top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {notificationsCount}
              </span>
            )}
          </button>

          {/* Avatar */}
          <button
            type="button"
            className="ml-1 inline-flex h-9 items-center gap-2 rounded-full bg-[var(--bg-muted)] py-0.5 pl-0.5 pr-3 hover:bg-[var(--bg-subtle)]"
          >
            <span
              className="flex size-8 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: DEMO_VIEWER.color }}
            >
              {DEMO_VIEWER.avatarInitials}
            </span>
            <span className="text-fg hidden text-sm font-medium md:inline">
              {DEMO_VIEWER.firstName}
            </span>
            <ChevronDown size={14} className="text-fg-muted hidden md:inline" />
          </button>
        </div>
      </div>
    </header>
  );
}
