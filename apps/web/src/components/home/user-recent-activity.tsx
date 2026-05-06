'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Activity, ChevronDown, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { userViewQueries, type RecentActivityItem } from '@/lib/queries/user-view';

/**
 * Aba "Atividade recente" — só aparece no modo "ver como". Lista as
 * últimas N ações do membro (cards movidos, comentários, status).
 *
 * Texto resumido por tipo: a Activity já carrega payload, mas pra essa
 * primeira versão a gente exibe o tipo + título do card. Versão melhor
 * (mensagem renderizada igual à timeline) fica como follow-up.
 */
export function UserRecentActivity({ userId }: { userId: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const q = useQuery(userViewQueries.recentActivity(userId, 20));
  const data = q.data ?? [];

  return (
    <section className="border-border bg-bg overflow-hidden rounded-lg border">
      <div className="border-border/60 flex items-center justify-between gap-2 border-b px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="text-fg-muted hover:bg-bg-muted hover:text-fg rounded p-1"
            aria-label={collapsed ? 'Expandir atividade' : 'Recolher atividade'}
          >
            <ChevronDown
              size={14}
              className={`transition-transform ${collapsed ? '-rotate-90' : ''}`}
            />
          </button>
          <Activity size={14} className="text-fg-muted" />
          <h2 className="text-fg text-sm font-semibold">Atividade recente</h2>
        </div>
        <span className="text-fg-subtle text-[11px]">Últimas 20 ações</span>
      </div>

      {!collapsed && (
        <div className="flex flex-col">
          {q.isLoading && (
            <div className="text-fg-muted flex items-center justify-center gap-2 py-8 text-sm">
              <Loader2 size={14} className="animate-spin" />
              Carregando…
            </div>
          )}
          {!q.isLoading && data.length === 0 && (
            <p className="text-fg-muted py-8 text-center text-sm">
              Nenhuma atividade recente neste período.
            </p>
          )}
          {!q.isLoading && data.length > 0 && (
            <ul className="divide-border/60 divide-y">
              {data.map((it) => (
                <ActivityRow key={it.id} item={it} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function ActivityRow({ item }: { item: RecentActivityItem }) {
  const summary = describeActivity(item);
  return (
    <li className="hover:bg-bg-muted/40 flex items-center gap-3 px-3 py-2 sm:px-4">
      <span className="bg-primary-subtle/60 size-1.5 shrink-0 rounded-full" />
      <p className="text-fg min-w-0 flex-1 truncate text-[12px]">
        {item.card ? (
          <Link
            href={`/b/${item.card.board.id}?card=${item.card.id}`}
            className="hover:text-primary"
          >
            {summary}
          </Link>
        ) : (
          summary
        )}
      </p>
      <span className="text-fg-subtle shrink-0 text-[11px] tabular-nums">
        {timeAgo(item.createdAt)}
      </span>
    </li>
  );
}

function describeActivity(it: RecentActivityItem): string {
  const cardTitle = it.card?.title ?? 'card';
  const map: Record<string, string> = {
    CARD_CREATED: `criou "${cardTitle}"`,
    CARD_UPDATED: `editou "${cardTitle}"`,
    CARD_MOVED: `moveu "${cardTitle}"`,
    CARD_COMPLETED: `finalizou "${cardTitle}"`,
    CARD_REOPENED: `reabriu "${cardTitle}"`,
    CARD_ARCHIVED: `arquivou "${cardTitle}"`,
    CARD_RESTORED: `restaurou "${cardTitle}"`,
    COMMENT_CREATED: `comentou em "${cardTitle}"`,
    LABEL_ADDED: `adicionou etiqueta em "${cardTitle}"`,
    LABEL_REMOVED: `removeu etiqueta de "${cardTitle}"`,
    MEMBER_ADDED: `adicionou membro em "${cardTitle}"`,
    MEMBER_REMOVED: `removeu membro de "${cardTitle}"`,
    CHECKLIST_CREATED: `criou checklist em "${cardTitle}"`,
    CHECKLIST_ITEM_DONE: `concluiu item de checklist em "${cardTitle}"`,
    ATTACHMENT_ADDED: `anexou arquivo em "${cardTitle}"`,
    BOARD_CREATED: `criou um fluxo`,
  };
  return map[it.type] ?? `${it.type.toLowerCase().replace(/_/g, ' ')} em "${cardTitle}"`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
