'use client';

import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';

import { UserAvatar } from '@/components/user-avatar';
import { useAuthStore } from '@/stores/auth-store';
import { orgMembersQuery } from '@/lib/queries/cards';

/**
 * Mostra avatares dos users com o card-modal aberto AGORA (presence em
 * tempo real via `card.presence.update`).
 *
 * Filtra o proprio user (saber que voce mesmo esta vendo nao agrega
 * valor). Mostra ate 4 avatares + "+N" pra overflow. Tooltip nominal
 * em cada avatar resolve quem eh (busca em `orgMembersQuery`).
 *
 * `members` (fallback): users ja conhecidos do contexto do card. Se o
 * org members ainda nao carregou, ao menos members do card aparecem.
 */
export function CardViewers({
  viewerIds,
  members,
}: {
  viewerIds: string[];
  members: Array<{ id: string; name: string; avatarUrl: string | null }>;
}) {
  const me = useAuthStore((s) => s.user);
  // Org members cobre nomes/avatares de viewers que nao sao do card
  // (ex: gestor olhando, mas nao atribuido). Cacheado — sem custo extra.
  const orgQ = useQuery(orgMembersQuery);

  const others = viewerIds.filter((id) => id !== me?.id);
  if (others.length === 0) return null;

  function resolve(userId: string) {
    const fromMembers = members.find((m) => m.id === userId);
    if (fromMembers) return fromMembers;
    const fromOrg = orgQ.data?.find((m) => m.userId === userId);
    if (fromOrg)
      return { id: fromOrg.user.id, name: fromOrg.user.name, avatarUrl: fromOrg.user.avatarUrl };
    return { id: userId, name: 'Visualizador', avatarUrl: null };
  }

  const visible = others.slice(0, 4);
  const overflow = others.length - visible.length;
  const names = others.map((id) => resolve(id).name).join(', ');

  return (
    <div
      className="border-border bg-bg-subtle inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5"
      title={`Visualizando agora: ${names}`}
    >
      <Eye size={11} className="text-fg-muted" />
      <div className="flex -space-x-1.5">
        {visible.map((id) => {
          const u = resolve(id);
          return (
            <UserAvatar
              key={id}
              name={u.name}
              userId={u.id}
              avatarUrl={u.avatarUrl}
              size="sm"
              stacked
            />
          );
        })}
        {overflow > 0 && (
          <span className="bg-bg-muted text-fg-muted border-bg z-10 inline-flex size-6 items-center justify-center rounded-full border text-[10px] font-medium">
            +{overflow}
          </span>
        )}
      </div>
    </div>
  );
}
