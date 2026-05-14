import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

interface Crumb {
  label: string;
  href?: string;
}

export function HelpBreadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Trilha de navegação" className="text-fg-muted mb-4 flex items-center text-xs">
      {items.map((item, idx) => {
        const last = idx === items.length - 1;
        return (
          <span key={`${item.label}-${idx}`} className="flex items-center">
            {item.href && !last ? (
              <Link href={item.href} className="hover:text-fg transition-colors">
                {item.label}
              </Link>
            ) : (
              <span className={last ? 'text-fg font-medium' : undefined}>{item.label}</span>
            )}
            {!last && <ChevronRight size={12} className="text-fg-subtle mx-1.5" aria-hidden />}
          </span>
        );
      })}
    </nav>
  );
}
