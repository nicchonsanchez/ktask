'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useQuery } from '@tanstack/react-query';

import { orgMembersQuery } from '@/lib/queries/cards';
import { UserAvatar } from '@/components/user-avatar';

export interface MentionTextareaRef {
  focus: () => void;
}

export interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
}

/**
 * Textarea com autocomplete de menções via `@`.
 *
 * Uso: o usuário digita "@" e uma palavra parcial. Abre um dropdown com
 * os membros da Org filtrados por nome/email/handle. Ao selecionar (Enter,
 * Tab ou clique), substitui o trecho "@palavra" por "@localpart-do-email ".
 * O backend parseia o texto no `resolveMentions` e resolve pros userIds.
 *
 * `@<handle>` precisa bater com a parte antes do `@` do email do usuário
 * (ex: Fernanda Biazatti, email fernanda@agenciakharis.com.br → @fernanda).
 */
export const MentionTextarea = forwardRef<MentionTextareaRef, MentionTextareaProps>(
  function MentionTextarea(props, ref) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => ({ focus: () => textareaRef.current?.focus() }), []);

    const [query, setQuery] = useState<string | null>(null); // null = não está em menção
    const [anchorStart, setAnchorStart] = useState(0); // posição do "@" no texto
    const [cursor, setCursor] = useState(0); // posição atual do cursor
    const [highlight, setHighlight] = useState(0);

    const membersQuery = useQuery({ ...orgMembersQuery, enabled: query !== null });

    const suggestions = useMemo(() => {
      if (query === null) return [];
      const q = query.trim().toLowerCase();
      const members = membersQuery.data ?? [];
      if (!q) return members.slice(0, 8);
      return members
        .filter((m) => {
          const handle = m.user.email.split('@')[0]?.toLowerCase() ?? '';
          return (
            m.user.name.toLowerCase().includes(q) ||
            handle.includes(q) ||
            m.user.email.toLowerCase().includes(q)
          );
        })
        .slice(0, 8);
    }, [query, membersQuery.data]);

    // Re-calcula a menção em curso toda vez que texto/cursor muda
    function syncMention(value: string, caret: number) {
      // Procura o "@" mais à esquerda dentro do trecho antes do cursor que
      // não esteja precedido por caractere de palavra (inicio ou espaço)
      const before = value.slice(0, caret);
      const match = /(?:^|\s)@([a-z0-9._-]*)$/i.exec(before);
      if (match && match[1] !== undefined) {
        const atPos = before.length - match[0].length + match[0].indexOf('@');
        setAnchorStart(atPos);
        setQuery(match[1]);
        setHighlight(0);
      } else {
        setQuery(null);
      }
    }

    function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
      const v = e.target.value;
      props.onChange(v);
      const caret = e.target.selectionStart ?? v.length;
      setCursor(caret);
      syncMention(v, caret);
    }

    function handleSelect(e: React.SyntheticEvent<HTMLTextAreaElement>) {
      const caret = e.currentTarget.selectionStart ?? 0;
      setCursor(caret);
      syncMention(props.value, caret);
    }

    function insertMention(handle: string) {
      if (query === null) return;
      const before = props.value.slice(0, anchorStart); // até antes do "@"
      const after = props.value.slice(cursor);
      const inserted = `@${handle} `;
      const next = `${before}${inserted}${after}`;
      props.onChange(next);
      setQuery(null);
      // posiciona cursor após o espaço inserido
      const newCaret = before.length + inserted.length;
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(newCaret, newCaret);
          setCursor(newCaret);
        }
      });
    }

    function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
      // Navegação do dropdown
      if (query !== null && suggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHighlight((i) => (i + 1) % suggestions.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHighlight((i) => (i - 1 + suggestions.length) % suggestions.length);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const pick = suggestions[highlight];
          if (pick) {
            const handle = pick.user.email.split('@')[0] ?? '';
            insertMention(handle);
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setQuery(null);
          return;
        }
      }

      // Atomic Backspace: se o cursor está logo após uma mention "@handle"
      // (ou "@handle " com espaço), apaga a mention inteira de uma vez
      // em vez de char por char.
      if (e.key === 'Backspace' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const el = textareaRef.current;
        if (el && el.selectionStart === el.selectionEnd) {
          const caret = el.selectionStart;
          // Só atua quando NÃO está no meio do autocomplete (query === null).
          // Durante autocomplete o usuário tá editando o handle parcial; backspace
          // normal continua funcionando pra encurtar a query.
          if (query === null) {
            const before = props.value.slice(0, caret);
            // Casos suportados:
            //   "Olá @joao| ..."   → cursor logo após handle
            //   "Olá @joao |..."   → cursor após espaço inserido pela autocompletação
            const trailingSpaceRe = /(?:^|\s)@([a-z0-9][a-z0-9._-]{1,63}) $/i;
            const noSpaceRe = /(?:^|\s)@([a-z0-9][a-z0-9._-]{1,63})$/i;
            const match = trailingSpaceRe.exec(before) ?? noSpaceRe.exec(before);
            if (match) {
              e.preventDefault();
              const fullMatch = match[0];
              // Preserva o caractere que precede o @ (espaço ou início de linha)
              const startsWithSpace = fullMatch.startsWith(' ') || fullMatch.startsWith('\n');
              const removeStart =
                before.length - (startsWithSpace ? fullMatch.length - 1 : fullMatch.length);
              const next = props.value.slice(0, removeStart) + props.value.slice(caret);
              props.onChange(next);
              requestAnimationFrame(() => {
                const e2 = textareaRef.current;
                if (e2) {
                  e2.focus();
                  e2.setSelectionRange(removeStart, removeStart);
                  setCursor(removeStart);
                }
              });
              return;
            }
          }
        }
      }

      // Submit via Ctrl/Cmd+Enter
      if (props.onSubmit && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        props.onSubmit();
      }
    }

    // Fecha dropdown quando o textarea perde foco (mas com delay pra permitir clique no item)
    useEffect(() => {
      function onClick(e: MouseEvent) {
        if (!textareaRef.current?.contains(e.target as Node)) {
          // Não fecha se clicou num item do dropdown (tem data-mention-item)
          const el = e.target as HTMLElement;
          if (!el.closest('[data-mention-dropdown]')) {
            setQuery(null);
          }
        }
      }
      document.addEventListener('mousedown', onClick);
      return () => document.removeEventListener('mousedown', onClick);
    }, []);

    return (
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={props.value}
          rows={props.rows ?? 3}
          maxLength={props.maxLength}
          placeholder={props.placeholder}
          disabled={props.disabled}
          autoFocus={props.autoFocus}
          onChange={handleChange}
          onSelect={handleSelect}
          onKeyDown={handleKeyDown}
          className={
            props.className ??
            'bg-bg border-border focus-visible:ring-primary w-full resize-none rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2'
          }
        />
        {query !== null && suggestions.length > 0 && (
          <div
            data-mention-dropdown
            className="border-border bg-bg absolute left-0 top-full z-30 mt-1 flex max-h-60 w-64 flex-col overflow-hidden rounded-md border shadow-lg"
          >
            {suggestions.map((m, i) => {
              const handle = m.user.email.split('@')[0] ?? '';
              return (
                <button
                  key={m.userId}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault(); // evita blur do textarea
                    insertMention(handle);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs ${
                    i === highlight ? 'bg-primary-subtle text-primary' : 'hover:bg-bg-muted'
                  }`}
                >
                  <UserAvatar
                    name={m.user.name}
                    userId={m.user.id}
                    avatarUrl={m.user.avatarUrl}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.user.name}</p>
                    <p className="text-fg-muted truncate text-[10px]">@{handle}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  },
);
