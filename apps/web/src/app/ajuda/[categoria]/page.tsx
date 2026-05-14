import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCategoria, listCategorias, listTutoriaisByCategoria } from '@/lib/ajuda/content';
import { HelpBreadcrumb } from '@/components/ajuda/help-breadcrumb';
import { HelpSidebar } from '@/components/ajuda/help-sidebar';
import { HelpTutorialCard } from '@/components/ajuda/help-tutorial-card';
import { IconFromName } from '@/components/ajuda/icon-from-name';

interface PageProps {
  params: Promise<{ categoria: string }>;
}

export async function generateStaticParams() {
  const cats = await listCategorias();
  return cats.map((c) => ({ categoria: c.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { categoria: slug } = await params;
  const cat = await getCategoria(slug);
  if (!cat) return { title: 'Categoria não encontrada' };
  const branded = `${cat.title} · Ajuda KTask`;
  return {
    title: cat.title,
    description: cat.description,
    openGraph: {
      title: branded,
      description: cat.description,
      type: 'website',
      images: ['/opengraph-image'],
    },
    twitter: {
      card: 'summary_large_image',
      title: branded,
      description: cat.description,
      images: ['/opengraph-image'],
    },
  };
}

export default async function CategoriaPage({ params }: PageProps) {
  const { categoria: slug } = await params;
  const [cat, tutoriais, categorias] = await Promise.all([
    getCategoria(slug),
    listTutoriaisByCategoria(slug),
    listCategorias(),
  ]);

  if (!cat) notFound();

  return (
    <div className="container py-8">
      <HelpBreadcrumb items={[{ label: 'Ajuda', href: '/ajuda' }, { label: cat.title }]} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <HelpSidebar categorias={categorias} currentCategoria={slug} />
          </div>
        </aside>

        <div>
          <header className="mb-6 flex items-start gap-3">
            <div className="bg-primary-subtle text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
              <IconFromName name={cat.icon} className="size-5" />
            </div>
            <div>
              <h1 className="text-fg text-2xl font-bold tracking-tight">{cat.title}</h1>
              <p className="text-fg-muted mt-1 text-sm">{cat.description}</p>
            </div>
          </header>

          {tutoriais.length === 0 ? (
            <p className="text-fg-muted border-border bg-bg-subtle rounded-lg border p-6 text-sm">
              Nenhum tutorial publicado nesta categoria ainda.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {tutoriais.map((tut) => (
                <HelpTutorialCard
                  key={tut.slug}
                  tutorial={tut}
                  href={`/ajuda/${cat.slug}/${tut.slug}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
