'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { HelpSearchTrigger } from './help-search-trigger';
import { HelpSidebar } from './help-sidebar';
import type { Categoria } from '@/lib/ajuda/types';
import { cn } from '@/lib/cn';

interface HelpHeaderProps {
  categorias: Categoria[];
}

function extractCurrentCategoria(pathname: string | null): string | null {
  if (!pathname) return null;
  const match = pathname.match(/^\/ajuda\/([^/]+)/);
  if (!match) return null;
  const seg = match[1];
  if (!seg || seg === 'suporte') return null;
  return seg;
}

export function HelpHeader({ categorias }: HelpHeaderProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const currentCategoria = extractCurrentCategoria(pathname);

  return (
    <>
      <header className="border-border bg-bg/95 supports-[backdrop-filter]:bg-bg/80 sticky top-0 z-30 border-b backdrop-blur">
        <div className="container flex h-14 items-center gap-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir categorias"
            className="text-fg-muted hover:bg-bg-emphasis hover:text-fg flex size-9 items-center justify-center rounded-md md:hidden"
          >
            <Menu size={18} />
          </button>

          <Link
            href="/ajuda"
            className="text-fg flex items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <span className="bg-primary text-primary-fg flex size-7 items-center justify-center rounded-md text-xs font-bold">
              K
            </span>
            <span>
              KTask <span className="text-fg-muted font-normal">Ajuda</span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:block">
              <HelpSearchTrigger />
            </div>
            <ThemeToggle />
          </div>
        </div>

        <div className="container pb-3 sm:hidden">
          <HelpSearchTrigger />
        </div>
      </header>

      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 transition-opacity md:hidden',
          drawerOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setDrawerOpen(false)}
        aria-hidden
      />
      <aside
        className={cn(
          'bg-bg border-border fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] transform border-r transition-transform md:hidden',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Categorias da ajuda"
      >
        <div className="border-border flex h-14 items-center justify-between border-b px-4">
          <span className="text-fg text-sm font-semibold">Categorias</span>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Fechar"
            className="text-fg-muted hover:bg-bg-emphasis hover:text-fg flex size-8 items-center justify-center rounded-md"
          >
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto p-3" style={{ maxHeight: 'calc(100vh - 56px)' }}>
          <HelpSidebar
            categorias={categorias}
            currentCategoria={currentCategoria}
            onNavigate={() => setDrawerOpen(false)}
          />
        </div>
      </aside>
    </>
  );
}
