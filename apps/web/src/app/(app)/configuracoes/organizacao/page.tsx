'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, CheckCircle2, ChevronLeft, Loader2 } from 'lucide-react';
import type { OrgRole } from '@ktask/contracts';

import { api, ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

interface CurrentOrg {
  id: string;
  name: string;
  myRole: OrgRole;
  autoCompleteCardWhenAllFinal: boolean;
}

const ADMIN_ROLES: OrgRole[] = ['OWNER', 'ADMIN'];

/**
 * Configurações da Organização (admin-only). Por enquanto só o toggle
 * de auto-status (Card.status sincronizado com presences em colunas
 * finais). Estrutura preparada pra ganhar mais flags Org-level depois.
 */
export default function ConfiguracoesOrganizacaoPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const orgQ = useQuery({
    queryKey: ['org', 'current'],
    queryFn: () => api.get<CurrentOrg>('/api/v1/organizations/current'),
    enabled: !!user,
  });

  const isAdmin = orgQ.data ? ADMIN_ROLES.includes(orgQ.data.myRole) : false;

  const toggleMut = useMutation({
    mutationFn: (next: boolean) =>
      api.patch<CurrentOrg>('/api/v1/organizations/current', {
        autoCompleteCardWhenAllFinal: next,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org', 'current'] });
      setError(null);
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.message : 'Erro ao atualizar configuração.');
    },
  });

  if (orgQ.isLoading || !orgQ.data) {
    return (
      <div className="text-fg-muted flex items-center gap-2 p-6 text-sm">
        <Loader2 size={14} className="animate-spin" />
        Carregando…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto max-w-md py-12 text-center">
        <Building2 size={32} className="text-fg-muted mx-auto mb-3" />
        <h1 className="text-lg font-semibold">Configurações da organização</h1>
        <p className="text-fg-muted mt-2 text-sm">
          Acesso restrito a OWNER e ADMIN. Fale com um admin se precisa alterar essas configurações.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6">
      <header className="mb-5 flex items-center gap-3">
        <Link
          href="/configuracoes"
          className="text-fg-muted hover:text-fg inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft size={14} />
          Configurações
        </Link>
        <span className="text-fg-subtle">/</span>
        <div className="flex items-center gap-2">
          <Building2 size={18} className="text-fg-muted" />
          <h1 className="text-lg font-semibold">Organização</h1>
        </div>
      </header>

      <section className="border-border bg-bg flex flex-col gap-4 rounded-md border p-4">
        <h2 className="text-fg text-sm font-semibold">Sincronização automática de status</h2>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={orgQ.data.autoCompleteCardWhenAllFinal}
            onChange={(e) => toggleMut.mutate(e.target.checked)}
            disabled={toggleMut.isPending}
            className="mt-1 size-4 shrink-0"
          />
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium">
              <CheckCircle2 size={13} className="text-emerald-600" />
              Marcar cards como concluídos automaticamente
            </span>
            <span className="text-fg-muted text-xs leading-relaxed">
              Quando todas as presenças ativas do card (em todos os fluxos) chegam em colunas
              marcadas como “coluna final” (ex: Finalizado), o status do card vira{' '}
              <strong>Concluído</strong>. Se algum fluxo voltar pra uma coluna não-final, o status
              volta pra <strong>Ativo</strong>.
            </span>
            <span className="text-fg-subtle text-[11px] leading-relaxed">
              • Cards com status <strong>Cancelado</strong> nunca mudam (cancelamento é terminal).
              <br />• Se um card está em vários quadros e fica concluído só em alguns, o status
              permanece <strong>Ativo</strong> até concluir em todos.
            </span>
          </div>
        </label>

        {toggleMut.isPending && (
          <p className="text-fg-muted inline-flex items-center gap-1 text-xs">
            <Loader2 size={11} className="animate-spin" />
            Salvando…
          </p>
        )}

        {error && (
          <p className="bg-danger-subtle text-danger rounded-md px-3 py-2 text-xs">{error}</p>
        )}
      </section>
    </div>
  );
}
