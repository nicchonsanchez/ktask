import Link from 'next/link';
import type { Categoria } from '@/lib/ajuda/types';
import { cn } from '@/lib/cn';
import { IconFromName } from './icon-from-name';

interface HelpSidebarProps {
  categorias: Categoria[];
  currentCategoria?: string | null;
  onNavigate?: () => void;
}

export function HelpSidebar({ categorias, currentCategoria, onNavigate }: HelpSidebarProps) {
  return (
    <nav aria-label="Categorias da ajuda" className="flex flex-col gap-1">
      <Link
        href="/ajuda"
        onClick={onNavigate}
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
          !currentCategoria
            ? 'bg-primary-subtle text-primary font-medium'
            : 'text-fg-muted hover:bg-bg-muted hover:text-fg',
        )}
      >
        Início da Ajuda
      </Link>
      <div className="border-border my-2 border-t" />
      {categorias.map((cat) => {
        const active = currentCategoria === cat.slug;
        return (
          <Link
            key={cat.slug}
            href={`/ajuda/${cat.slug}`}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-primary-subtle text-primary font-medium'
                : 'text-fg-muted hover:bg-bg-muted hover:text-fg',
            )}
          >
            <IconFromName name={cat.icon} className="size-4" />
            <span>{cat.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}
