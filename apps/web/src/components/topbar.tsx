'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Menu, User as UserIcon, X } from 'lucide-react';
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
  { href: '/aprovacoes', label: 'Aprovações' },
  { href: '/indicadores', label: 'Indicadores' },
  { href: '/contatos', label: 'Contatos' },
  { href: '/empresa', label: 'Empresa' },
  { href: '/configuracoes', label: 'Configurações' },
];

export function Topbar() {
  const { user } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await logout();
    router.replace('/entrar');
  }

  // Fecha drawer ao mudar de rota
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock scroll do body enquanto drawer aberto
  useEffect(() => {
    if (!mobileOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <header className="border-border bg-bg sticky top-0 z-30 border-b">
      <div className="container flex h-[52px] items-center justify-between gap-2 sm:gap-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-5">
          {/* Hamburger (so mobile) */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="text-fg-muted hover:bg-bg-muted hover:text-fg -ml-1 inline-flex size-9 items-center justify-center rounded-md sm:hidden"
            aria-label="Abrir menu"
          >
            <Menu size={20} />
          </button>

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

      {/* Drawer mobile (substitui nav horizontal antiga que estourava) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 sm:hidden" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          {/* Painel deslizante da esquerda */}
          <div className="bg-bg border-border absolute inset-y-0 left-0 flex w-[78%] max-w-[300px] flex-col border-r shadow-xl">
            <div className="border-border/60 flex items-center justify-between border-b px-4 py-3">
              <span className="text-fg text-sm font-semibold">Menu</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="text-fg-muted hover:bg-bg-muted hover:text-fg rounded p-1"
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
              {NAV.map((item) => {
                const active =
                  item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center rounded-md px-3 py-2.5 text-sm transition-colors ${
                      active
                        ? 'bg-primary-subtle/40 text-primary font-medium'
                        : 'text-fg hover:bg-bg-muted'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            {user && (
              <div className="border-border/60 flex items-center gap-3 border-t p-3">
                <UserAvatar
                  name={user.name}
                  userId={user.id}
                  avatarUrl={user.avatarUrl}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-fg truncate text-sm font-medium">{user.name}</p>
                  <p className="text-fg-muted truncate text-[11px]">{user.email}</p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-fg-muted hover:bg-bg-muted hover:text-danger rounded-md p-1.5"
                  aria-label="Sair"
                  title="Sair"
                >
                  <LogOut size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
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
