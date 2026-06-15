import type { ReactNode } from 'react';
import { VisaoGerencialSubNav } from './_components/sub-nav';

/**
 * Layout compartilhado das sub-telas de visao gerencial. A sub-nav fica
 * logo abaixo do topbar global pra dar contexto de "estou em qual visao".
 *
 * Pages-filho (/cards, /tarefas, /finalizados, /arquivados) continuam
 * gerenciando seus headers proprios — esse layout so adiciona a faixa
 * de navegacao entre Cards/Tarefas.
 */
export default function VisaoGerencialLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <VisaoGerencialSubNav />
      {children}
    </>
  );
}
