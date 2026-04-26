'use client';

import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="size-9" aria-hidden />;
  }

  const cycle = (event: React.MouseEvent<HTMLButtonElement>) => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';

    // Posiciona o circulo de revelacao no ponto do clique. Quando vier
    // de teclado (Enter/Space), event.clientX/Y == 0 — ai a gente cai pro
    // centro da viewport.
    const root = document.documentElement;
    const x = event.clientX || window.innerWidth / 2;
    const y = event.clientY || window.innerHeight / 2;
    root.style.setProperty('--vt-x', `${x}px`);
    root.style.setProperty('--vt-y', `${y}px`);

    // Fallback: navegador sem View Transitions API (Firefox atual) ou
    // user com prefers-reduced-motion — troca direta sem efeito.
    const startVT = (
      document as Document & {
        startViewTransition?: (cb: () => void) => { finished: Promise<void> };
      }
    ).startViewTransition;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!startVT || reduced) {
      setTheme(next);
      return;
    }

    startVT.call(document, () => setTheme(next));
  };

  const icon =
    theme === 'dark' ? (
      <Moon size={16} />
    ) : theme === 'light' ? (
      <Sun size={16} />
    ) : (
      <Monitor size={16} />
    );

  const label =
    theme === 'dark' ? 'Tema escuro' : theme === 'light' ? 'Tema claro' : 'Usar tema do sistema';

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Tema atual: ${label}. Clique para alternar.`}
      title={label}
      className={cn(
        'flex size-9 items-center justify-center rounded-md',
        'text-fg-muted hover:bg-bg-emphasis hover:text-fg transition-colors',
      )}
    >
      {icon}
    </button>
  );
}
