'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, LogOut, Menu, Settings, User as UserIcon, Users, X } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { NotificationsBell } from '@/components/notifications-bell';
import { SearchTrigger } from '@/components/search-host';
import { UserAvatar } from '@/components/user-avatar';
import { TimerWidget } from '@/components/time-tracking/timer-widget';
import { approvalsQueries } from '@/lib/queries/approvals';
import { useAuthStore } from '@/stores/auth-store';
import { logout } from '@/lib/auth';

/**
 * Topbar — IA reorganizada (doc 41).
 *
 * Nav primário (operacional, uso diário): Início · Quadros · Aprovações · Indicadores
 * Nav secundário (CRM, uso semanal): dropdown "CRM" agrupando Clientes + Contatos
 *   - "Clientes" usa rota /empresas (label renomeado pra evitar ambiguidade
 *     com "Minha organização" — empresas-clientes vs a Kharis em si).
 * Avatar dropdown (admin, uso esporádico): Equipe (= /empresa) · Configurações ·
 *   Meu perfil · Sair.
 *
 * Mobile drawer espelha a mesma estrutura, com seções tituladas.
 */

interface NavItem {
  href: string;
  label: string;
}

const NAV_PRIMARY: NavItem[] = [
  { href: '/', label: 'Início' },
  { href: '/quadros', label: 'Quadros' },
  { href: '/aprovacoes', label: 'Aprovações' },
  { href: '/indicadores', label: 'Indicadores' },
];

const NAV_CRM: NavItem[] = [
  { href: '/empresas', label: 'Clientes' },
  { href: '/contatos', label: 'Contatos' },
];

const NAV_ACCOUNT: NavItem[] = [
  { href: '/empresa', label: 'Equipe' },
  { href: '/configuracoes', label: 'Configurações' },
];

export function Topbar() {
  const { user } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Contador de aprovacoes pendentes do user — refetch a cada 60s pra
  // ficar perto de tempo real sem usar socket. Polling leve: o endpoint
  // ja eh enxuto (so itens onde o user e reviewer + status PENDING).
  const pendingApprovalsQ = useQuery({
    ...approvalsQueries.myPending(),
    enabled: !!user,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
  const pendingCount = pendingApprovalsQ.data?.length ?? 0;

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

  const crmActive = NAV_CRM.some((it) => pathname.startsWith(it.href));

  return (
    <header className="bg-bg sticky top-0 z-30">
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
            {NAV_PRIMARY.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              const badge = item.href === '/aprovacoes' && pendingCount > 0 ? pendingCount : null;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group relative flex items-center gap-1.5 px-3 text-sm transition-colors ${
                    active ? 'text-primary' : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  {item.label}
                  {badge !== null && (
                    <span
                      aria-label={`${badge} pendente${badge === 1 ? '' : 's'}`}
                      className="bg-primary text-primary-fg inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none"
                    >
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                  <span
                    aria-hidden
                    className={`absolute inset-x-3 bottom-0 h-[2px] rounded-t transition-colors ${
                      active ? 'bg-primary' : 'group-hover:bg-border-strong bg-transparent'
                    }`}
                  />
                </Link>
              );
            })}
            <CrmDropdown items={NAV_CRM} active={crmActive} pathname={pathname} />
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
              {NAV_PRIMARY.map((item) => (
                <DrawerLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  badge={item.href === '/aprovacoes' && pendingCount > 0 ? pendingCount : undefined}
                />
              ))}
              <DrawerSection label="CRM" />
              {NAV_CRM.map((item) => (
                <DrawerLink key={item.href} item={item} pathname={pathname} indent />
              ))}
              <DrawerSection label="Conta" />
              {NAV_ACCOUNT.map((item) => (
                <DrawerLink key={item.href} item={item} pathname={pathname} indent />
              ))}
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

function DrawerSection({ label }: { label: string }) {
  return (
    <p className="text-fg-subtle mt-3 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider">
      {label}
    </p>
  );
}

function DrawerLink({
  item,
  pathname,
  indent,
  badge,
}: {
  item: NavItem;
  pathname: string;
  indent?: boolean;
  badge?: number;
}) {
  const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
  return (
    <Link
      href={item.href}
      className={`flex items-center justify-between gap-2 rounded-md py-2.5 text-sm transition-colors ${
        indent ? 'px-5' : 'px-3'
      } ${active ? 'bg-primary-subtle/40 text-primary font-medium' : 'text-fg hover:bg-bg-muted'}`}
    >
      <span>{item.label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          aria-label={`${badge} pendente${badge === 1 ? '' : 's'}`}
          className="bg-primary text-primary-fg inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold leading-none"
        >
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </Link>
  );
}

function CrmDropdown({
  items,
  active,
  pathname,
}: {
  items: NavItem[];
  active: boolean;
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div ref={ref} className="relative flex items-stretch">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`group relative flex items-center gap-1 px-3 text-sm transition-colors ${
          active ? 'text-primary' : 'text-fg-muted hover:text-fg'
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        CRM
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        <span
          aria-hidden
          className={`absolute inset-x-3 bottom-0 h-[2px] rounded-t transition-colors ${
            active ? 'bg-primary' : 'group-hover:bg-border-strong bg-transparent'
          }`}
        />
      </button>
      {open && (
        <div className="border-border bg-bg absolute left-0 top-full z-40 mt-0 flex w-44 flex-col overflow-hidden rounded-md border p-1 text-sm shadow-lg">
          {items.map((it) => {
            const itActive = pathname.startsWith(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpen(false)}
                className={`rounded-sm px-3 py-1.5 transition-colors ${
                  itActive
                    ? 'bg-primary-subtle/40 text-primary font-medium'
                    : 'text-fg hover:bg-bg-muted'
                }`}
              >
                {it.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UserMenu({ onLogout }: { onLogout: () => void }) {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (!user) return null;

  return (
    <div ref={ref} className="relative">
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
        <ChevronDown size={13} className="text-fg-muted hidden md:inline" />
      </button>
      {open && (
        <div className="border-border bg-bg absolute right-0 top-full z-40 mt-1.5 flex w-60 flex-col overflow-hidden rounded-md border p-1 text-sm shadow-lg">
          <div className="border-border/70 border-b px-3 py-2.5">
            <p className="text-fg truncate font-medium">{user.name}</p>
            <p className="text-fg-muted mt-0.5 truncate text-[11px]">{user.email}</p>
          </div>
          <UserMenuLink
            href="/empresa"
            icon={<Users size={14} />}
            label="Equipe"
            onClick={() => setOpen(false)}
          />
          <UserMenuLink
            href="/configuracoes"
            icon={<Settings size={14} />}
            label="Configurações"
            onClick={() => setOpen(false)}
          />
          <UserMenuLink
            href="/configuracoes/perfil"
            icon={<UserIcon size={14} />}
            label="Meu perfil"
            onClick={() => setOpen(false)}
          />
          <div className="border-border/70 my-1 border-t" />
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
      )}
    </div>
  );
}

function UserMenuLink({
  href,
  icon,
  label,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="text-fg hover:bg-bg-muted flex items-center gap-2 rounded-sm px-2 py-1.5"
    >
      {icon}
      {label}
    </Link>
  );
}
