'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Search, UserRoundPlus, X } from 'lucide-react';

import { cardsQueries, orgMembersQuery, updateCard, type CardDetail } from '@/lib/queries/cards';
import { UserAvatar } from '@/components/user-avatar';
import { ApiError } from '@/lib/api-client';

/**
 * Picker de líder do card. Mostra o avatar do líder atual; clicar abre
 * dropdown com membros da Org. Trocar líder também garante que ele vire
 * membro do card (o backend faz upsert).
 */
export function LeadPicker({ card, boardId }: { card: CardDetail; boardId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const membersQuery = useQuery({ ...orgMembersQuery, enabled: open });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: cardsQueries.detail(card.id).queryKey });
    queryClient.invalidateQueries({ queryKey: ['boards', boardId] });
  }

  const mut = useMutation({
    mutationFn: (leadId: string | null) => updateCard(card.id, { leadId }),
    onSuccess: () => {
      setError(null);
      setOpen(false);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Erro ao trocar líder.'),
  });

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const members = membersQuery.data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) => m.user.name.toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q),
    );
  }, [membersQuery.data, query]);

  return (
    <div className="relative flex items-center gap-1.5" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setQuery('');
        }}
        className={`flex items-center rounded-full transition-all ${
          card.lead
            ? 'ring-primary ring-offset-bg ring-2 ring-offset-2 hover:opacity-80'
            : 'hover:ring-primary/40 hover:ring-2'
        }`}
        title={card.lead ? `Líder: ${card.lead.name} (clique para trocar)` : 'Definir líder'}
        aria-label={card.lead ? `Líder: ${card.lead.name}` : 'Definir líder do card'}
      >
        {card.lead ? (
          <UserAvatar
            name={card.lead.name}
            userId={card.lead.id}
            avatarUrl={card.lead.avatarUrl}
            size="sm"
          />
        ) : (
          <span className="bg-bg-muted text-fg-muted hover:bg-bg-emphasis hover:text-fg flex size-6 items-center justify-center rounded-full transition-colors">
            <UserRoundPlus size={13} />
          </span>
        )}
      </button>
      {open && (
        <div className="border-border bg-bg absolute left-0 top-full z-30 mt-1 flex w-[min(18rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-md border shadow-lg">
          <div className="border-border/70 flex items-start justify-between gap-2 border-b px-3 py-2.5">
            <div className="flex items-start gap-2">
              <span className="bg-bg-muted text-fg-muted flex size-6 shrink-0 items-center justify-center rounded-full">
                <UserRoundPlus size={13} />
              </span>
              <div>
                <p className="text-sm font-semibold leading-tight">Líder do card</p>
                <p className="text-fg-muted text-[11px] leading-tight">
                  Adicione, remova ou alterne entre usuários.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-fg-muted hover:bg-bg-muted hover:text-fg shrink-0 rounded p-0.5"
              aria-label="Fechar"
            >
              <X size={13} />
            </button>
          </div>
          <div className="border-border/70 flex items-center gap-2 border-b px-2 py-1.5">
            <Search size={12} className="text-fg-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar membro..."
              className="w-full bg-transparent text-xs focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {membersQuery.isLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={14} className="text-fg-muted animate-spin" />
              </div>
            )}
            {!membersQuery.isLoading && filtered.length === 0 && (
              <p className="text-fg-muted px-2 py-3 text-center text-xs">
                {query ? 'Nenhum resultado.' : 'Sem membros disponíveis.'}
              </p>
            )}
            {filtered.map((m) => {
              const isLead = card.leadId === m.userId;
              return (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => mut.mutate(m.userId)}
                  disabled={mut.isPending || isLead}
                  className="hover:bg-bg-muted flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs disabled:cursor-default"
                >
                  <UserAvatar
                    name={m.user.name}
                    userId={m.user.id}
                    avatarUrl={m.user.avatarUrl}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.user.name}</p>
                    <p className="text-fg-muted truncate text-[10px]">{m.user.email}</p>
                  </div>
                  {isLead && <Check size={13} className="text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
          {card.lead && (
            <button
              type="button"
              onClick={() => mut.mutate(null)}
              disabled={mut.isPending}
              className="border-border/70 text-fg-muted hover:text-danger flex items-center gap-1.5 border-t px-2 py-1.5 text-left text-xs"
            >
              <X size={12} />
              Remover líder
            </button>
          )}
        </div>
      )}
      {error && <span className="text-danger ml-2 text-[10px]">{error}</span>}
    </div>
  );
}
