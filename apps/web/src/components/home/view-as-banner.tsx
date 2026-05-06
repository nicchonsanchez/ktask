'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Eye, X } from 'lucide-react';

import { api } from '@/lib/api-client';
import { boardsQueries } from '@/lib/queries/boards';

interface OrgMember {
  id: string;
  user: { id: string; name: string; email: string; avatarUrl: string | null };
}

/**
 * Banner sticky no topo da home quando GESTOR+ está visualizando como
 * outro membro (?as=<userId>). Mostra:
 *   - Avatar + nome do membro alvo
 *   - Filtro por board (dropdown opcional)
 *   - "Sair do modo" volta pra home própria
 */
export function ViewAsBanner({
  userId,
  boardFilter,
  onChangeBoardFilter,
}: {
  userId: string;
  boardFilter: string | null;
  onChangeBoardFilter: (boardId: string | null) => void;
}) {
  const membersQuery = useQuery({
    queryKey: ['org', 'members'],
    queryFn: () => api.get<OrgMember[]>('/api/v1/organizations/members'),
  });
  const target = membersQuery.data?.find((m) => m.user.id === userId);
  const boardsQuery = useQuery(boardsQueries.all());
  const boards = boardsQuery.data ?? [];

  return (
    <div className="border-primary/30 bg-primary-subtle/30 mb-4 flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 sm:px-4">
      <Eye size={14} className="text-primary shrink-0" />
      <p className="text-fg min-w-0 truncate text-[13px]">
        Visualizando como{' '}
        <strong className="text-primary font-semibold">{target?.user.name ?? 'membro…'}</strong>
      </p>
      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        <select
          value={boardFilter ?? ''}
          onChange={(e) => onChangeBoardFilter(e.target.value || null)}
          className="border-border bg-bg text-fg rounded-md border px-2 py-1 text-[11px] focus:outline-none"
        >
          <option value="" className="bg-bg text-fg">
            Todos os fluxos
          </option>
          {boards.map((b) => (
            <option key={b.id} value={b.id} className="bg-bg text-fg">
              {b.name}
            </option>
          ))}
        </select>
        <Link
          href="/"
          className="text-fg-muted hover:text-fg hover:bg-bg inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors"
        >
          <X size={12} />
          Sair do modo
        </Link>
      </div>
    </div>
  );
}
