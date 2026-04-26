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

    // Push trecho antes do @
    if (atIndex > lastIndex) {
      out.push(<Fragment key={`t-${lastIndex}`}>{text.slice(lastIndex, atIndex)}</Fragment>);
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
    out.push(<Fragment key={`t-end`}>{text.slice(lastIndex)}</Fragment>);
  }

  return out;
}
