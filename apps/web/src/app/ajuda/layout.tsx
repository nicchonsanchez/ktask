import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { listCategorias } from '@/lib/ajuda/content';
import { HelpHeader } from '@/components/ajuda/help-header';
import { HelpFooter } from '@/components/ajuda/help-footer';
import { HelpLoggedBanner } from '@/components/ajuda/help-logged-banner';

export const metadata: Metadata = {
  title: {
    default: 'Central de Ajuda · KTask',
    template: '%s · Ajuda KTask',
  },
  description:
    'Tutoriais, guias e respostas para usar o KTask — para operadores internos e clientes externos.',
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export default async function AjudaLayout({ children }: { children: ReactNode }) {
  const categorias = await listCategorias();

  return (
    <div className="bg-bg text-fg flex min-h-screen flex-col">
      <HelpLoggedBanner />
      <HelpHeader categorias={categorias} />
      <main className="flex-1">{children}</main>
      <HelpFooter />
    </div>
  );
}
