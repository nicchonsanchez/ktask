'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Check,
  Loader2,
  Mail,
  Phone,
  Plus,
  Trash2,
  User as UserIcon,
} from 'lucide-react';

import { ApiError } from '@/lib/api-client';
import {
  contactsQueries,
  linkContactToCard,
  unlinkContactFromCard,
  type ContactRow,
  type ContactType,
} from '@/lib/queries/contacts';

/**
 * Bloco "Contatos" do card-modal. Lista contatos vinculados, permite
 * adicionar (busca na agenda + opcao "Criar contato 'X'") e remover.
 *
 * userMatch: se Contact bate por email/phone com User da Org, mostra
 * indicacao discreta "membro" ao lado do nome.
 */
export function ContactsBlock({ cardId }: { cardId: string }) {
  const queryClient = useQueryClient();
  const linkedQ = useQuery({ ...contactsQueries.forCard(cardId) });

  const unlinkMut = useMutation({
    mutationFn: (contactId: string) => unlinkContactFromCard(cardId, contactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards', cardId, 'contacts'] });
    },
  });

  const linked = linkedQ.data ?? [];

  return (
    <div className="flex flex-col gap-2">
      {linked.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {linked.map((c) => (
            <ContactPill key={c.id} contact={c} onRemove={() => unlinkMut.mutate(c.id)} />
          ))}
        </ul>
      )}
      <ContactPicker cardId={cardId} alreadyLinkedIds={linked.map((c) => c.id)} />
    </div>
  );
}

function ContactPill({ contact, onRemove }: { contact: ContactRow; onRemove: () => void }) {
  const Icon = contact.type === 'COMPANY' ? Building2 : UserIcon;
  return (
    <li className="border-border/60 bg-bg-muted/30 group flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
      <span className="bg-bg-muted text-fg-muted inline-flex size-7 shrink-0 items-center justify-center rounded-full">
        <Icon size={13} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-fg truncate font-medium">{contact.name}</span>
          {contact.parent && (
            <span className="text-fg-subtle truncate text-[11px]">· {contact.parent.name}</span>
          )}
          {contact.userMatch && (
            <span
              className="bg-primary-subtle/60 text-primary inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              title={`Tambem cadastrado como membro: ${contact.userMatch.name}`}
            >
              <Check size={9} />
              membro
            </span>
          )}
        </div>
        {(contact.email || contact.phone) && (
          <div className="text-fg-muted flex items-center gap-2 text-[11px]">
            {contact.email && (
              <span className="inline-flex items-center gap-1">
                <Mail size={10} />
                {contact.email}
              </span>
            )}
            {contact.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone size={10} />
                {contact.phone}
              </span>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="text-fg-muted hover:text-danger rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Desvincular contato"
      >
        <Trash2 size={13} />
      </button>
    </li>
  );
}

function ContactPicker({
  cardId,
  alreadyLinkedIds,
}: {
  cardId: string;
  alreadyLinkedIds: string[];
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const allQ = useQuery({ ...contactsQueries.list(), enabled: open });
  const all = allQ.data ?? [];

  useEffect(() => {
    function click(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
        setError(null);
      }
    }
    if (open) document.addEventListener('mousedown', click);
    return () => document.removeEventListener('mousedown', click);
  }, [open]);

  const filtered = useMemo(() => {
    const linkedSet = new Set(alreadyLinkedIds);
    const q = query.trim().toLowerCase();
    return all.filter((c) => {
      if (linkedSet.has(c.id)) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(q)
      );
    });
  }, [all, alreadyLinkedIds, query]);

  const linkMut = useMutation({
    mutationFn: (input: { contactId: string } | { name: string; type: ContactType }) =>
      linkContactToCard(cardId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards', cardId, 'contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setOpen(false);
      setQuery('');
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Erro ao vincular contato.');
    },
  });

  const trimmedQuery = query.trim();
  const showCreate =
    trimmedQuery.length >= 2 &&
    !filtered.some((c) => c.name.toLowerCase() === trimmedQuery.toLowerCase());

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="border-border hover:bg-bg-muted text-fg-muted hover:text-fg inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-1 text-[12px]"
      >
        <Plus size={12} />
        Adicionar contato
      </button>
      {open && (
        <div className="border-border bg-bg absolute left-0 top-full z-30 mt-1 flex w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-md border shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar contato ou digitar novo nome…"
            className="border-border/70 bg-bg border-b px-3 py-2 text-sm focus:outline-none"
          />
          <div className="max-h-72 overflow-y-auto py-1">
            {allQ.isLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={14} className="text-fg-muted animate-spin" />
              </div>
            )}
            {!allQ.isLoading && filtered.length === 0 && !showCreate && (
              <p className="text-fg-muted px-3 py-3 text-center text-xs">
                {trimmedQuery ? 'Nenhum contato encontrado.' : 'Sem contatos cadastrados.'}
              </p>
            )}
            {filtered.map((c) => {
              const Icon = c.type === 'COMPANY' ? Building2 : UserIcon;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => linkMut.mutate({ contactId: c.id })}
                  disabled={linkMut.isPending}
                  className="hover:bg-bg-muted flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm disabled:opacity-50"
                >
                  <Icon size={13} className="text-fg-muted shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{c.name}</span>
                    {(c.email || c.phone) && (
                      <span className="text-fg-muted ml-1.5 text-[11px]">
                        · {c.email ?? c.phone}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            {showCreate && (
              <div className="border-border/60 mt-1 border-t pt-1">
                <button
                  type="button"
                  onClick={() => linkMut.mutate({ name: trimmedQuery, type: 'PERSON' })}
                  disabled={linkMut.isPending}
                  className="hover:bg-bg-muted flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm disabled:opacity-50"
                >
                  <Plus size={13} className="text-primary shrink-0" />
                  <span>
                    Criar pessoa “<span className="font-medium">{trimmedQuery}</span>”
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => linkMut.mutate({ name: trimmedQuery, type: 'COMPANY' })}
                  disabled={linkMut.isPending}
                  className="hover:bg-bg-muted flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm disabled:opacity-50"
                >
                  <Building2 size={13} className="text-primary shrink-0" />
                  <span>
                    Criar empresa “<span className="font-medium">{trimmedQuery}</span>”
                  </span>
                </button>
              </div>
            )}
          </div>
          {error && (
            <p className="bg-danger-subtle text-danger border-border/60 border-t px-3 py-1.5 text-[11px]">
              {error}
            </p>
          )}
          {linkMut.isPending && (
            <div className="border-border/60 text-fg-muted flex items-center gap-1 border-t px-3 py-1.5 text-[11px]">
              <Loader2 size={11} className="animate-spin" />
              Vinculando…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
