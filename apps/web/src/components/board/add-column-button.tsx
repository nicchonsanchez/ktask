'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, X } from 'lucide-react';

import { Button } from '@ktask/ui';
import { boardsQueries, createList } from '@/lib/queries/boards';
import { ApiError } from '@/lib/api-client';

export function AddColumnButton({ boardId }: { boardId: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (name: string) => createList({ boardId, name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: boardsQueries.detail(boardId).queryKey });
      setDraft('');
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Erro ao criar coluna.');
    },
  });

  if (draft === null) {
    return (
      <button
        type="button"
        onClick={() => setDraft('')}
        className="group/addcol text-fg-muted hover:bg-bg hover:text-primary flex h-fit w-[280px] shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
      >
        <Plus size={16} className="transition-transform group-hover/addcol:rotate-90" />
        Adicionar coluna
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const name = draft.trim();
        if (!name) return;
        mut.mutate(name);
      }}
      className="bg-bg border-border/60 flex w-[280px] shrink-0 flex-col gap-2 rounded-lg border p-2 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <span className="text-fg-muted text-[11px] font-semibold uppercase tracking-wide">
          Nova coluna
        </span>
        <button
          type="button"
          onClick={() => {
            setDraft(null);
            setError(null);
          }}
          className="text-fg-muted hover:text-fg"
          aria-label="Cancelar"
        >
          <X size={14} />
        </button>
      </div>
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(null);
            setError(null);
          }
        }}
        placeholder="Nome da coluna"
        maxLength={120}
        className="bg-bg border-border focus-visible:ring-primary rounded-md border px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2"
      />
      {error && <p className="text-danger text-xs">{error}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={mut.isPending || draft.trim().length === 0}>
          {mut.isPending && <Loader2 size={12} className="animate-spin" />}
          Adicionar
        </Button>
      </div>
    </form>
  );
}
