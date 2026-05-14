import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, MessageCircle } from 'lucide-react';
import { listCategoriasWithTutoriais } from '@/lib/ajuda/content';
import { HelpCategoriaCard } from '@/components/ajuda/help-categoria-card';
import { HelpSearchTrigger } from '@/components/ajuda/help-search-trigger';

export const metadata: Metadata = {
  title: 'Central de Ajuda',
  description:
    'Encontre tutoriais, guias e respostas para tirar o máximo do KTask — para operadores e clientes.',
};

export default async function AjudaHubPage() {
  const categorias = await listCategoriasWithTutoriais();

  return (
    <div className="container py-8 sm:py-12">
      <section className="mx-auto max-w-3xl text-center">
        <h1 className="text-fg text-2xl font-bold tracking-tight sm:text-3xl">
          Como podemos ajudar?
        </h1>
        <p className="text-fg-muted mt-3 text-sm sm:text-base">
          Tutoriais e guias para operar o KTask no dia a dia. Busque por uma palavra-chave ou
          navegue pelas categorias abaixo.
        </p>
        <div className="mx-auto mt-6 max-w-xl">
          <HelpSearchTrigger />
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-fg mb-4 text-base font-semibold tracking-tight sm:text-lg">
          Categorias
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {categorias.map((cat) => (
            <HelpCategoriaCard key={cat.slug} categoria={cat} count={cat.tutoriais.length} />
          ))}
        </div>
      </section>

      <section className="border-border bg-bg-subtle mt-12 rounded-xl border p-6 sm:p-8">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="bg-primary-subtle text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
              <MessageCircle size={18} aria-hidden />
            </div>
            <div>
              <h2 className="text-fg text-base font-semibold sm:text-lg">
                Não encontrou o que procura?
              </h2>
              <p className="text-fg-muted mt-1 text-sm">
                Fale com a equipe — respondemos em horário comercial.
              </p>
            </div>
          </div>
          <Link
            href="/ajuda/suporte"
            className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors"
          >
            Falar com o suporte
            <ArrowRight size={15} aria-hidden />
          </Link>
        </div>
      </section>
    </div>
  );
}
