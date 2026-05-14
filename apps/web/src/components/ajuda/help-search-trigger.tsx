'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { HelpSearchDialog } from './help-search-dialog';

export function HelpSearchTrigger() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (target?.isContentEditable ?? false);
      if (event.key === '/' && !isEditable) {
        event.preventDefault();
        setOpen(true);
      }
      if ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-border bg-bg-subtle text-fg-muted hover:bg-bg-muted hover:text-fg group flex h-9 w-full items-center gap-2 rounded-md border px-3 text-sm transition-colors sm:w-72"
        aria-label="Buscar na ajuda"
      >
        <Search size={15} className="shrink-0" aria-hidden />
        <span className="flex-1 text-left">Buscar tutoriais…</span>
        <kbd className="border-border text-fg-subtle hidden rounded border px-1.5 py-0.5 text-[10px] font-medium sm:inline-block">
          /
        </kbd>
      </button>
      <HelpSearchDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
