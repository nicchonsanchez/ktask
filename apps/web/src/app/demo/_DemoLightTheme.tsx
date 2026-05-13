'use client';

import { useEffect, type ReactNode } from 'react';

/**
 * Forca light mode no <html> enquanto qualquer pagina /demo estiver montada.
 *
 * O root layout usa next-themes que controla a classe do <html>. Como esse
 * Provider esta acima do nosso (e nao da pra trocar next-themes no root),
 * sobrescrevemos a classe imperativo via documentElement.classList.
 *
 * Aplicado no demo/layout.tsx para cobrir tambem a tela de indice (/demo)
 * que nao usa o DemoProvider.
 */
export function DemoLightTheme({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const previousClasses = root.className;
    const previousColorScheme = root.style.colorScheme;

    root.classList.remove('dark');
    root.classList.add('light');
    root.style.colorScheme = 'light';

    return () => {
      root.className = previousClasses;
      root.style.colorScheme = previousColorScheme;
    };
  }, []);

  return <>{children}</>;
}
