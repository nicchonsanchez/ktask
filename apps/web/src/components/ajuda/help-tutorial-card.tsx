import Link from 'next/link';
import { Clock, ArrowRight } from 'lucide-react';
import type { TutorialSummary } from '@/lib/ajuda/types';

interface HelpTutorialCardProps {
  tutorial: TutorialSummary;
  href: string;
}

export function HelpTutorialCard({ tutorial, href }: HelpTutorialCardProps) {
  return (
    <Link
      href={href}
      className="border-border bg-bg hover:border-primary/40 hover:bg-bg-subtle group flex flex-col gap-2 rounded-lg border p-4 transition-all"
    >
      <h3 className="text-fg group-hover:text-primary text-sm font-semibold transition-colors">
        {tutorial.title}
      </h3>
      {tutorial.description && (
        <p className="text-fg-muted line-clamp-2 text-sm">{tutorial.description}</p>
      )}
      <div className="text-fg-subtle mt-1 flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1">
          <Clock size={12} aria-hidden />
          {tutorial.readingMinutes} min de leitura
        </span>
        <ArrowRight
          size={14}
          className="text-fg-subtle group-hover:text-primary transition-colors"
          aria-hidden
        />
      </div>
    </Link>
  );
}
