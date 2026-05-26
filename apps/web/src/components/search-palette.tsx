'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { CheckCircle2, FileText, Layout, Loader2, Search } from 'lucide-react';

import { searchGlobal, type SearchResult } from '@/lib/queries/search';
import { UserAvatar } from '@/components/user-avatar';

interface FlatItem {
  id: string;
  type: 'card' | 'board' | 'user';
  // o que renderiza
  title: string;
  subtitle?: string;
  href: string;
  // pra navegação
  data: unknown;
}

export function SearchPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  // Debounce do input → query servidor
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Reset ao reabrir
  useEffect(() => {
    if (open) {
      setQuery('');
      setDebouncedQuery('');
      setHighlight(0);
    }
  }, [open]);

  const searchQuery = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => searchGlobal(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  const flat = useMemo(() => buildFlat(searchQuery.data), [searchQuery.data]);

  // Mantém highlight dentro dos limites quando a lista muda
  useEffect(() => {
    if (highlight >= flat.length) setHighlight(0);
  }, [flat.length, highlight]);

  function go(item: FlatItem) {
    onOpenChange(false);
    setTimeout(() => router.push(item.href), 0);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flat.length > 0) setHighlight((i) => (i + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length > 0) setHighlight((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = flat[highlight];
      if (pick) go(pick);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-fade-in fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className="bg-bg border-border fixed left-1/2 top-[18%] z-50 flex w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-lg border shadow-xl"
          onKeyDown={handleKeyDown}
        >
          <DialogPrimitive.Title className="sr-only">Busca global</DialogPrimitive.Title>
          {/* Input */}
          <div className="border-border/70 flex items-center gap-3 border-b px-4 py-3">
            <Search size={16} className="text-fg-muted shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar cards, fluxos ou pessoas..."
              className="flex-1 bg-transparent text-sm focus:outline-none"
            />
            {searchQuery.isFetching && debouncedQuery.length >= 2 && (
              <Loader2 size={14} className="text-fg-muted animate-spin" />
            )}
            <kbd className="border-border bg-bg-muted text-fg-muted rounded border px-1.5 py-0.5 font-mono text-[10px]">
              ESC
            </kbd>
          </div>

          {/* Body */}
          <div className="max-h-[60vh] overflow-y-auto">
            {debouncedQuery.length < 2 ? (
              <div className="text-fg-muted flex flex-col items-center gap-2 py-12 text-center text-xs">
                <Search size={20} className="opacity-50" />
                <p>Digite ao menos 2 caracteres pra buscar.</p>
                <p className="text-fg-subtle text-[11px]">
                  Use{' '}
                  <kbd className="border-border bg-bg-muted rounded border px-1 py-0.5 font-mono text-[10px]">
                    ↑
                  </kbd>{' '}
                  <kbd className="border-border bg-bg-muted rounded border px-1 py-0.5 font-mono text-[10px]">
                    ↓
                  </kbd>{' '}
                  pra navegar e{' '}
                  <kbd className="border-border bg-bg-muted rounded border px-1 py-0.5 font-mono text-[10px]">
                    Enter
                  </kbd>{' '}
                  pra abrir.
                </p>
              </div>
            ) : flat.length === 0 && !searchQuery.isFetching ? (
              <div className="text-fg-muted py-10 text-center text-sm">
                Nenhum resultado pra "{debouncedQuery}".
              </div>
            ) : (
              <SearchSections
                result={searchQuery.data}
                flat={flat}
                highlight={highlight}
                onGo={go}
              />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function buildFlat(result: SearchResult | undefined): FlatItem[] {
  if (!result) return [];
  const items: FlatItem[] = [];
  for (const c of result.cards) {
    items.push({
      id: c.id,
      type: 'card',
      title: c.title,
      subtitle: `${c.boardName} · ${c.listName}`,
      href: `?card=${c.id}`,
      data: c,
    });
  }
  for (const b of result.boards) {
    items.push({
      id: b.id,
      type: 'board',
      title: b.name,
      href: `/b/${b.id}`,
      data: b,
    });
  }
  for (const u of result.users) {
    items.push({
      id: u.id,
      type: 'user',
      title: u.name,
      subtitle: u.email,
      href: `/configuracoes/membros`,
      data: u,
    });
  }
  return items;
}

function SearchSections({
  result,
  highlight,
  onGo,
}: {
  result: SearchResult | undefined;
  flat: FlatItem[];
  highlight: number;
  onGo: (i: FlatItem) => void;
}) {
  if (!result) return null;
  let cursor = 0;

  return (
    <div className="flex flex-col py-1">
      {result.cards.length > 0 && (
        <SectionGroup label="Cards" count={result.cards.length}>
          {result.cards.map((c, i) => {
            const idx = cursor + i;
            return (
              <Row
                key={c.id}
                active={idx === highlight}
                icon={
                  c.isCompleted ? (
                    <CheckCircle2 size={14} className="text-accent" />
                  ) : (
                    <FileText size={14} />
                  )
                }
                title={c.title}
                subtitle={`${c.boardName} · ${c.listName}`}
                onClick={() =>
                  onGo({
                    id: c.id,
                    type: 'card',
                    title: c.title,
                    href: `?card=${c.id}`,
                    data: c,
                  })
                }
              />
            );
          })}
        </SectionGroup>
      )}
      {(() => {
        cursor += result.cards.length;
        return null;
      })()}

      {result.boards.length > 0 && (
        <SectionGroup label="Quadros" count={result.boards.length}>
          {result.boards.map((b, i) => {
            const idx = cursor + i;
            return (
              <Row
                key={b.id}
                active={idx === highlight}
                icon={<Layout size={14} />}
                title={b.name}
                subtitle="Quadro"
                onClick={() =>
                  onGo({ id: b.id, type: 'board', title: b.name, href: `/b/${b.id}`, data: b })
                }
              />
            );
          })}
        </SectionGroup>
      )}
      {(() => {
        cursor += result.boards.length;
        return null;
      })()}

      {result.users.length > 0 && (
        <SectionGroup label="Membros" count={result.users.length}>
          {result.users.map((u, i) => {
            const idx = cursor + i;
            return (
              <Row
                key={u.id}
                active={idx === highlight}
                icon={<UserAvatar name={u.name} userId={u.id} avatarUrl={u.avatarUrl} size="xs" />}
                title={u.name}
                subtitle={u.email}
                onClick={() =>
                  onGo({
                    id: u.id,
                    type: 'user',
                    title: u.name,
                    href: `/configuracoes/membros`,
                    data: u,
                  })
                }
              />
            );
          })}
        </SectionGroup>
      )}
    </div>
  );
}

function SectionGroup({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div className="text-fg-muted flex items-center gap-2 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide">
        <span>{label}</span>
        <span>·</span>
        <span>{count}</span>
      </div>
      {children}
    </div>
  );
}

function Row({
  active,
  icon,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
        active ? 'bg-primary-subtle text-primary' : 'hover:bg-bg-muted'
      }`}
    >
      <span className="text-fg-muted shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {subtitle && <span className="text-fg-muted block truncate text-[11px]">{subtitle}</span>}
      </span>
    </button>
  );
}
