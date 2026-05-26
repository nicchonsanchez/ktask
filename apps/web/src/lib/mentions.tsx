/**
 * Render inline de menções `@handle` em texto plano.
 *
 * Backend salva o comment como texto puro com `@handle` (parte antes do `@`
 * do email). Pra exibir bonito a gente:
 *   - Resolve o handle pro nome do membro da Org
 *   - Renderiza `<span class="font-bold text-primary">Nicchon Sanchez</span>`
 *   - Mantém o resto do texto como está
 *
 * Se o handle não bater com nenhum membro (pessoa removida ou typo),
 * mostra o `@handle` literal sem destaque (fallback seguro).
 */
import { Fragment, type ReactNode } from 'react';

import type { OrgMember } from '@/lib/queries/cards';

const MENTION_RE = /(?:^|\s)@([a-z0-9][a-z0-9._-]{1,63})(?=\b)/gi;
// URLs http(s):// ate o proximo espaco. Pega a maioria dos casos de
// link colado em comentario. Trailing punctuation comum (.,;:!?) eh
// removido do fim pra nao incluir pontuacao da frase no href.
const URL_RE = /(https?:\/\/[^\s]+)/g;

/**
 * Quebra um trecho de texto puro em nodes, transformando URLs em <a>
 * clicaveis (target=_blank). Usado dentro do render de mencoes pra
 * linkar URLs sem perder o resto do texto.
 */
function linkifyText(text: string, keyPrefix: string): ReactNode[] {
  if (!text) return [];
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;

  while ((m = URL_RE.exec(text)) !== null) {
    let url = m[0];
    const start = m.index;
    // Remove pontuacao final que normalmente pertence a frase, nao ao link.
    let trailing = '';
    const trailMatch = url.match(/[.,;:!?)\]]+$/);
    if (trailMatch) {
      trailing = trailMatch[0];
      url = url.slice(0, url.length - trailing.length);
    }

    if (start > last) {
      out.push(<Fragment key={`${keyPrefix}-t-${last}`}>{text.slice(last, start)}</Fragment>);
    }
    out.push(
      <a
        key={`${keyPrefix}-l-${start}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary decoration-primary/40 hover:decoration-primary underline underline-offset-2"
      >
        {url}
      </a>,
    );
    if (trailing) {
      out.push(<Fragment key={`${keyPrefix}-tr-${start}`}>{trailing}</Fragment>);
    }
    last = start + m[0].length;
  }

  if (last < text.length) {
    out.push(<Fragment key={`${keyPrefix}-t-end`}>{text.slice(last)}</Fragment>);
  }
  return out;
}

export function renderInlineMentions(text: string, members: OrgMember[]): ReactNode[] {
  if (!text) return [];

  // Mapa handle (lowercase) -> nome
  const byHandle = new Map<string, string>();
  for (const m of members) {
    const handle = m.user.email.split('@')[0]?.toLowerCase();
    if (handle) byHandle.set(handle, m.user.name);
  }

  const out: ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  // Reset state pra cada chamada
  MENTION_RE.lastIndex = 0;

  while ((m = MENTION_RE.exec(text)) !== null) {
    const fullMatch = m[0]; // pode incluir espaço inicial
    const handle = m[1]!.toLowerCase();
    const atIndex = m.index + fullMatch.indexOf('@');

    // Push trecho antes do @ — linkificando URLs nele.
    if (atIndex > lastIndex) {
      out.push(...linkifyText(text.slice(lastIndex, atIndex), `pre-${lastIndex}`));
    }

    const name = byHandle.get(handle);
    if (name) {
      out.push(
        <span key={`m-${atIndex}`} className="text-primary font-semibold">
          {name}
        </span>,
      );
    } else {
      // Fallback: mostra @handle literal
      out.push(<Fragment key={`u-${atIndex}`}>@{handle}</Fragment>);
    }

    lastIndex = atIndex + 1 + handle.length; // após "@" + handle
  }

  if (lastIndex < text.length) {
    out.push(...linkifyText(text.slice(lastIndex), 'end'));
  }

  return out;
}
