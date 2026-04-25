'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, User as UserIcon } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { NotificationsBell } from '@/components/notifications-bell';
import { SearchTrigger } from '@/components/search-host';
import { UserAvatar } from '@/components/user-avatar';
import { TimerWidget } from '@/components/time-tracking/timer-widget';
import { useAuthStore } from '@/stores/auth-store';
import { logout } from '@/lib/auth';

const NAV = [
  { href: '/', label: 'Início' },
  { href: '/quadros', label: 'Quadros' },
  { href: '/empresa', label: 'Empresa' },
  { href: '/configuracoes/membros', label: 'Membros' },
];

export function Topbar() {
  const { user } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    await logout();
    router.replace('/entrar');
  }

  return (
    <header className="border-border bg-bg sticky top-0 z-30 border-b">
      <div className="container flex h-[52px] items-center justify-between gap-2 sm:gap-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-5">
          <Link
            href="/"
            className="group flex shrink-0 items-center transition-opacity hover:opacity-85"
            aria-label="Ir para o início"
          >
            <Image
              src="/brand/lockup-wordmark-dark.png"
              alt="KTask"
              width={88}
              height={25}
              priority
              className="block shrink-0 dark:hidden"
            />
            <Image
              src="/brand/lockup-wordmark.png"
              alt=""
              width={88}
              height={25}
              priority
              aria-hidden
              className="hidden shrink-0 dark:block"
            />
          </Link>
          <div className="bg-border/70 hidden h-5 w-px shrink-0 sm:block" aria-hidden />
          <nav className="hidden h-[52px] items-stretch sm:flex">
            {NAV.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group relative flex items-center px-3 text-sm transition-colors ${
                    active ? 'text-primary' : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  {item.label}
                  {/* Indicador inferior compartilhado: ativo = roxo; hover = cinza */}
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

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <SearchTrigger />
          {user && <TimerWidget />}
          <NotificationsBell />
          <ThemeToggle />
          <div className="bg-border/70 mx-0.5 hidden h-5 w-px sm:mx-1 sm:block" aria-hidden />
          {user && <UserMenu onLogout={handleLogout} />}
        </div>
      </div>
      {/* Nav mobile (abaixo do header) */}
      <nav className="border-border/60 -mb-px flex items-stretch border-t sm:hidden">
        {NAV.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex flex-1 items-center justify-center py-2 text-xs transition-colors ${
                active ? 'text-primary' : 'text-fg-muted hover:text-fg'
              }`}
            >
              {item.label}
              <span
                aria-hidden
                className={`absolute inset-x-3 bottom-0 h-[2px] rounded-t transition-colors ${
                  active ? 'bg-primary' : 'bg-transparent'
                }`}
              />
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

function UserMenu({ onLogout }: { onLogout: () => void }) {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  if (!user) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-bg-muted flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <UserAvatar name={user.name} userId={user.id} avatarUrl={user.avatarUrl} size="md" />
        <span className="text-fg hidden max-w-[160px] truncate text-sm font-medium md:inline">
          {user.name}
        </span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="border-border bg-bg absolute right-0 top-full z-40 mt-1.5 flex w-56 flex-col overflow-hidden rounded-md border p-1 text-sm shadow-lg">
            <div className="border-border/70 border-b px-3 py-2.5">
              <p className="text-fg truncate font-medium">{user.name}</p>
              <p className="text-fg-muted mt-0.5 truncate text-[11px]">{user.email}</p>
            </div>
            <Link
              href="/configuracoes/perfil"
              onClick={() => setOpen(false)}
              className="text-fg hover:bg-bg-muted flex items-center gap-2 rounded-sm px-2 py-1.5"
            >
              <UserIcon size={14} />
              Meu perfil
            </Link>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="text-danger hover:bg-danger-subtle flex items-center gap-2 rounded-sm px-2 py-1.5 text-left"
            >
              <LogOut size={14} />
              Sair
            </button>
          </div>
        </>
      )}
    </div>
  );
}
