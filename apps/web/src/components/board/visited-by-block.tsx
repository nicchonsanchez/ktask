'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { UserAvatar } from '@/components/user-avatar';
import { cardVisitsQuery, type CardVisitNode } from '@/lib/queries/management';
import { formatRelativeTime } from '@/lib/prose';

/**
 * Bloco "Visualizado por" no card-modal — auditoria minimalista.
 *
 * Lista users que abriram o card pelo menos 1 vez, com timestamp da
 * ultima visita. Sem contagem de vezes, sem ranking, sem notificacao —
 * o objetivo eh "alguem ja olhou isso?", nao "quem espionou".
 *
 * Avatares com borda colorida indicam papel: lider (azul), membro
 * (verde), outro (cinza). Tooltip detalha nome + "abriu ha X tempo".
 */
export function VisitedByBlock({ cardId }: { cardId: string }) {
  const [showAll, setShowAll] = useState(false);
  const q = useQuery({ ...cardVisitsQuery(cardId) });

  if (q.isLoading) {
    return <p className="text-fg-subtle text-xs italic">Carregando…</p>;
  }

  const visits = q.data ?? [];

  if (visits.length === 0) {
    return <p className="text-fg-subtle text-xs italic">Ninguém abriu este card ainda.</p>;
  }

  const visible = showAll ? visits : visits.slice(0, 8);
  const remaining = visits.length - visible.length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {visible.map((v) => (
          <VisitAvatar key={v.userId} visit={v} />
        ))}
        {remaining > 0 && !showAll && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="text-fg-muted hover:text-fg border-border bg-bg-muted/60 rounded-full border px-2 py-0.5 text-[10px]"
          >
            +{remaining}
          </button>
        )}
      </div>
      <p className="text-fg-subtle text-[10px]">
        {visits.length} pessoa{visits.length === 1 ? '' : 's'} já abr
        {visits.length === 1 ? 'iu' : 'iram'} este card.
      </p>
    </div>
  );
}

function VisitAvatar({ visit }: { visit: CardVisitNode }) {
  // Cor de borda discreta indicando papel — ajuda gestor a distinguir
  // "quem precisava ver" de "quem passou por curiosidade".
  const ringClass =
    visit.role === 'LEAD'
      ? 'ring-2 ring-blue-500/60'
      : visit.role === 'MEMBER'
        ? 'ring-2 ring-emerald-500/60'
        : 'ring-1 ring-border';

  const roleLabel = visit.role === 'LEAD' ? 'líder' : visit.role === 'MEMBER' ? 'membro' : 'outro';

  return (
    <span
      className={`relative inline-flex rounded-full ${ringClass}`}
      title={`${visit.user.name} (${roleLabel}) · abriu ${formatRelativeTime(visit.visitedAt)}`}
    >
      <UserAvatar
        name={visit.user.name}
        userId={visit.user.id}
        avatarUrl={visit.user.avatarUrl}
        size="sm"
      />
    </span>
  );
}
