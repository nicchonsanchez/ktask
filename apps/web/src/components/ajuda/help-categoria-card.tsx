import Link from 'next/link';
import type { Categoria } from '@/lib/ajuda/types';
import { IconFromName } from './icon-from-name';

interface HelpCategoriaCardProps {
  categoria: Categoria;
  count: number;
}

export function HelpCategoriaCard({ categoria, count }: HelpCategoriaCardProps) {
  return (
    <Link
      href={`/ajuda/${categoria.slug}`}
      className="border-border bg-bg hover:border-primary/40 hover:bg-bg-subtle group flex h-full flex-col gap-3 rounded-xl border p-5 transition-all hover:shadow-md"
    >
      <div className="bg-primary-subtle text-primary flex size-10 items-center justify-center rounded-lg">
        <IconFromName name={categoria.icon} className="size-5" />
      </div>
      <div className="flex-1">
        <h3 className="text-fg group-hover:text-primary text-base font-semibold transition-colors">
          {categoria.title}
        </h3>
        <p className="text-fg-muted mt-1 text-sm">{categoria.description}</p>
      </div>
      <span className="text-fg-subtle text-xs">
        {count} {count === 1 ? 'tutorial' : 'tutoriais'}
      </span>
    </Link>
  );
}
