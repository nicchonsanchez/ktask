'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Users, Building2, ChevronRight, Clock, ShieldCheck } from 'lucide-react';
import type { OrgRole } from '@ktask/contracts';
import { ORG_ROLE_LABELS } from '@ktask/contracts';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

interface CurrentOrg {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  timezone: string;
  locale: string;
  plan: 'INTERNAL' | 'FREE' | 'PRO' | 'ENTERPRISE';
  myRole: OrgRole;
}

interface Member {
  id: string;
  role: OrgRole;
  createdAt: string;
  user: { id: string; name: string; email: string; avatarUrl: string | null };
}

/**
 * Página "Empresa" — visão da organização atual (papel, membros, plano).
 *
 * Era a home padrão (`/`); foi movida pra `/empresa` quando a nova
 * home pessoal (visão de tarefas/cards/calendário do user) foi criada.
 * Mantida intacta por enquanto — pode ganhar mais sessões da Org no futuro
 * (configurações compactas, integrações, billing, etc.).
 */
export default function EmpresaPage() {
  const { user } = useAuthStore();

  const orgQuery = useQuery({
    queryKey: ['org', 'current'],
    queryFn: () => api.get<CurrentOrg>('/api/v1/organizations/current'),
    enabled: !!user,
  });

  const membersQuery = useQuery({
    queryKey: ['org', 'members'],
    queryFn: () => api.get<Member[]>('/api/v1/organizations/members'),
    enabled: !!user,
  });

  return (
    <div className="container py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">{orgQuery.data?.name ?? 'Empresa'}</h1>
        <p className="text-fg-muted mt-1 text-sm">
          Visão geral da organização — plano, papel e membros ativos.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          icon={<Building2 size={18} />}
          label="Organização atual"
          value={orgQuery.data?.name ?? (orgQuery.isLoading ? 'Carregando...' : '—')}
          hint={orgQuery.data ? `@${orgQuery.data.slug}` : undefined}
        />
        <StatCard
          icon={<ShieldCheck size={18} />}
          label="Seu papel"
          value={orgQuery.data ? ORG_ROLE_LABELS[orgQuery.data.myRole] : '—'}
        />
        <StatCard
          icon={<Users size={18} />}
          label="Membros"
          value={membersQuery.data ? String(membersQuery.data.length) : '—'}
          hint="Ativos nesta organização"
        />
      </div>

      <section className="mt-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-fg-muted text-sm font-semibold uppercase tracking-wide">Membros</h2>
          <span className="text-fg-subtle text-[11px]">Clique pra ver o timesheet do membro.</span>
        </div>
        <div className="border-border bg-bg-subtle overflow-hidden rounded-lg border">
          {membersQuery.isLoading ? (
            <div className="text-fg-muted p-4 text-sm">Carregando...</div>
          ) : membersQuery.data && membersQuery.data.length > 0 ? (
            <ul className="divide-border divide-y">
              {membersQuery.data.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/indicadores/timesheet?userId=${m.user.id}`}
                    className="hover:bg-bg-muted/40 group flex items-center gap-3 p-3 transition-colors"
                    title={`Ver timesheet de ${m.user.name}`}
                  >
                    <div className="bg-primary-subtle text-primary flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                      {m.user.name
                        .split(' ')
                        .map((w) => w[0])
                        .filter(Boolean)
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{m.user.name}</p>
                      <p className="text-fg-muted truncate text-xs">{m.user.email}</p>
                    </div>
                    <span className="bg-bg-muted text-fg-muted rounded-full px-2 py-0.5 text-xs font-medium">
                      {ORG_ROLE_LABELS[m.role]}
                    </span>
                    <Clock
                      size={13}
                      className="text-fg-subtle group-hover:text-primary shrink-0 transition-colors"
                    />
                    <ChevronRight
                      size={14}
                      className="text-fg-subtle group-hover:text-primary shrink-0 transition-colors"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-fg-muted p-4 text-sm">Nenhum membro encontrado.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border-border bg-bg-subtle rounded-lg border p-4">
      <div className="bg-primary-subtle text-primary mb-3 inline-flex size-8 items-center justify-center rounded-md">
        {icon}
      </div>
      <p className="text-fg-muted text-xs uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      {hint && <p className="text-fg-subtle mt-0.5 text-xs">{hint}</p>}
    </div>
  );
}
