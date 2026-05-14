import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Clock, Calendar } from 'lucide-react';
import {
  getAdjacentTutoriais,
  getCategoria,
  getTutorial,
  listAllTutoriais,
  listCategorias,
  listTutoriaisByCategoria,
} from '@/lib/ajuda/content';
import { HelpBreadcrumb } from '@/components/ajuda/help-breadcrumb';
import { HelpSidebar } from '@/components/ajuda/help-sidebar';
import { HelpMarkdown } from '@/components/ajuda/help-markdown';
import { HelpFeedback } from '@/components/ajuda/help-feedback';

interface PageProps {
  params: Promise<{ categoria: string; slug: string }>;
}

export async function generateStaticParams() {
  const tutoriais = await listAllTutoriais();
  return tutoriais.map((t) => ({ categoria: t.category, slug: t.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { categoria, slug } = await params;
  const tutorial = await getTutorial(categoria, slug);
  if (!tutorial) return { title: 'Tutorial não encontrado' };
  return {
    title: tutorial.title,
    description: tutorial.description,
    openGraph: {
      title: tutorial.title,
      description: tutorial.description,
      type: 'article',
      images: ['/opengraph-image'],
    },
    twitter: {
      card: 'summary_large_image',
      title: tutorial.title,
      description: tutorial.description,
      images: ['/opengraph-image'],
    },
  };
}

function formatUpdatedAt(value: string): string {
  if (!value) return '';
  const parts = value.split('-');
  if (parts.length !== 3) return value;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

export default async function TutorialPage({ params }: PageProps) {
  const { categoria, slug } = await params;
  const [tutorial, cat, categorias, irmaos, adjacent] = await Promise.all([
    getTutorial(categoria, slug),
    getCategoria(categoria),
    listCategorias(),
    listTutoriaisByCategoria(categoria),
    getAdjacentTutoriais(categoria, slug),
  ]);

  if (!tutorial || !cat) notFound();

  return (
    <div className="container py-8">
      <HelpBreadcrumb
        items={[
          { label: 'Ajuda', href: '/ajuda' },
          { label: cat.title, href: `/ajuda/${cat.slug}` },
          { label: tutorial.title },
        ]}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_minmax(0,1fr)_240px]">
        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <HelpSidebar categorias={categorias} currentCategoria={cat.slug} />
          </div>
        </aside>

        <div className="min-w-0">
          <header className="border-border mb-6 border-b pb-5">
            <h1 className="text-fg text-2xl font-bold tracking-tight sm:text-3xl">
              {tutorial.title}
            </h1>
            {tutorial.description && (
              <p className="text-fg-muted mt-2 text-sm sm:text-base">{tutorial.description}</p>
            )}
            <div className="text-fg-subtle mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1">
                <Clock size={12} aria-hidden />
                {tutorial.readingMinutes} min de leitura
              </span>
              {tutorial.updatedAt && (
                <span className="inline-flex items-center gap-1">
                  <Calendar size={12} aria-hidden />
                  Atualizado em {formatUpdatedAt(tutorial.updatedAt)}
                </span>
              )}
            </div>
          </header>

          <HelpMarkdown source={tutorial.body} />

          <div className="mt-10">
            <HelpFeedback />
          </div>

          <nav
            aria-label="Tutoriais relacionados"
            className="border-border mt-10 grid grid-cols-1 gap-3 border-t pt-6 sm:grid-cols-2"
          >
            {adjacent.prev ? (
              <Link
                href={`/ajuda/${adjacent.prev.category}/${adjacent.prev.slug}`}
                className="border-border hover:border-primary/40 hover:bg-bg-subtle group flex flex-col gap-1 rounded-lg border p-4 transition-colors"
              >
                <span className="text-fg-subtle inline-flex items-center gap-1 text-xs">
                  <ArrowLeft size={12} aria-hidden /> Anterior
                </span>
                <span className="text-fg group-hover:text-primary text-sm font-medium transition-colors">
                  {adjacent.prev.title}
                </span>
              </Link>
            ) : (
              <span />
            )}
            {adjacent.next ? (
              <Link
                href={`/ajuda/${adjacent.next.category}/${adjacent.next.slug}`}
                className="border-border hover:border-primary/40 hover:bg-bg-subtle group flex flex-col items-end gap-1 rounded-lg border p-4 text-right transition-colors"
              >
                <span className="text-fg-subtle inline-flex items-center gap-1 text-xs">
                  Próximo <ArrowRight size={12} aria-hidden />
                </span>
                <span className="text-fg group-hover:text-primary text-sm font-medium transition-colors">
                  {adjacent.next.title}
                </span>
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </div>

        <aside className="hidden xl:block">
          <div className="sticky top-20">
            <p className="text-fg-subtle mb-2 text-xs font-medium uppercase tracking-wide">
              Nesta categoria
            </p>
            <ul className="flex flex-col gap-1">
              {irmaos.map((t) => {
                const active = t.slug === slug;
                return (
                  <li key={t.slug}>
                    <Link
                      href={`/ajuda/${cat.slug}/${t.slug}`}
                      className={
                        active
                          ? 'text-primary block rounded-md px-3 py-1.5 text-sm font-medium'
                          : 'text-fg-muted hover:bg-bg-muted hover:text-fg block rounded-md px-3 py-1.5 text-sm transition-colors'
                      }
                    >
                      {t.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
