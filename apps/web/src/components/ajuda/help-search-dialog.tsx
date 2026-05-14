'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogOverlay, DialogPortal, DialogTitle } from '@ktask/ui';
import { cn } from '@/lib/cn';
import { createSearchIndex, runSearch, type SearchResult } from '@/lib/ajuda/search';
import type { SearchEntry } from '@/lib/ajuda/types';

interface HelpSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export function HelpSearchDialog({ open, onOpenChange }: HelpSearchDialogProps) {
  const router = useRouter();
  const [entries, setEntries] = useState<SearchEntry[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (loadState === 'ready' || loadState === 'loading') return;
    setLoadState('loading');
    fetch('/ajuda/search-index.json')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('falha ao carregar índice'))))
      .then((data: SearchEntry[]) => {
        setEntries(data);
        setLoadState('ready');
      })
      .catch(() => setLoadState('error'));
  }, [open, loadState]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 180);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    } else {
      setQuery('');
      setDebounced('');
    }
  }, [open]);

  const fuse = useMemo(() => (entries.length ? createSearchIndex(entries) : null), [entries]);

  const results: SearchResult[] = useMemo(() => {
    if (!fuse) return [];
    return runSearch(fuse, debounced, 10);
  }, [fuse, debounced]);

  useEffect(() => {
    if (activeIndex >= results.length) setActiveIndex(0);
  }, [results, activeIndex]);

  const navigateTo = (result: SearchResult) => {
    router.push(`/ajuda/${result.category}/${result.slug}`);
    onOpenChange(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = results[activeIndex];
      if (hit) navigateTo(hit);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="data-[state=open]:animate-fade-in fixed inset-0 z-50 bg-black/50" />
        <DialogContent
          aria-describedby={undefined}
          className="border-border bg-bg data-[state=open]:animate-fade-in fixed left-1/2 top-[10vh] z-50 w-[92vw] max-w-2xl -translate-x-1/2 overflow-hidden rounded-xl border shadow-lg focus:outline-none"
        >
          <DialogTitle className="sr-only">Buscar na Central de Ajuda</DialogTitle>
          <div className="border-border flex items-center gap-2 border-b px-4">
            <Search size={16} className="text-fg-muted shrink-0" aria-hidden />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Buscar tutoriais, ações, dúvidas…"
              className="text-fg placeholder:text-fg-subtle h-12 flex-1 bg-transparent text-sm outline-none"
              aria-label="Termo de busca"
            />
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Fechar"
              className="text-fg-muted hover:bg-bg-emphasis hover:text-fg flex size-8 items-center justify-center rounded-md"
            >
              <X size={15} />
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-2">
            {loadState === 'loading' && (
              <p className="text-fg-muted px-3 py-6 text-center text-sm">Carregando índice…</p>
            )}
            {loadState === 'error' && (
              <p className="text-danger px-3 py-6 text-center text-sm">
                Não foi possível carregar a busca. Recarregue a página.
              </p>
            )}
            {loadState === 'ready' && debounced.length < 2 && (
              <p className="text-fg-muted px-3 py-6 text-center text-sm">
                Digite pelo menos 2 caracteres para buscar.
              </p>
            )}
            {loadState === 'ready' && debounced.length >= 2 && results.length === 0 && (
              <p className="text-fg-muted px-3 py-6 text-center text-sm">
                Nenhum tutorial encontrado para “{debounced}”.
              </p>
            )}
            {results.length > 0 && (
              <ul role="listbox" className="flex flex-col gap-1">
                {results.map((hit, i) => {
                  const active = i === activeIndex;
                  return (
                    <li key={`${hit.category}-${hit.slug}`}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onMouseEnter={() => setActiveIndex(i)}
                        onClick={() => navigateTo(hit)}
                        className={cn(
                          'flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors',
                          active ? 'bg-primary-subtle' : 'hover:bg-bg-muted',
                        )}
                      >
                        <FileText
                          size={16}
                          className={cn(
                            'mt-0.5 shrink-0',
                            active ? 'text-primary' : 'text-fg-muted',
                          )}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'truncate text-sm font-medium',
                                active ? 'text-primary' : 'text-fg',
                              )}
                            >
                              {hit.title}
                            </span>
                            <span className="text-fg-subtle shrink-0 text-xs">
                              · {hit.categoryTitle}
                            </span>
                          </div>
                          <p className="text-fg-muted mt-0.5 line-clamp-2 text-xs">{hit.snippet}</p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-border bg-bg-subtle text-fg-subtle flex items-center justify-between gap-3 border-t px-4 py-2 text-xs">
            <span className="hidden sm:inline">
              <kbd className="border-border bg-bg rounded border px-1.5 py-0.5">↑↓</kbd> navegar{' '}
              <kbd className="border-border bg-bg ml-2 rounded border px-1.5 py-0.5">Enter</kbd>{' '}
              abrir
            </span>
            <span>
              <kbd className="border-border bg-bg rounded border px-1.5 py-0.5">Esc</kbd> fechar
            </span>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
