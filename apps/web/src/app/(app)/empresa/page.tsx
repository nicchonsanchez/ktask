'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Users, Building2, Eye, ChevronRight, Clock, ShieldCheck } from 'lucide-react';
import type { OrgRole } from '@ktask/contracts';
import { ORG_ROLE_LABELS } from '@ktask/contracts';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { orgMembersSummaryQuery, type MemberSummaryRow } from '@/lib/queries/user-view';

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

const PRIVILEGED_ROLES: OrgRole[] = ['OWNER', 'ADMIN', 'GESTOR'];

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

  const isPrivileged = orgQuery.data ? PRIVILEGED_ROLES.includes(orgQuery.data.myRole) : false;

  const summaryQuery = useQuery({
    ...orgMembersSummaryQuery,
    enabled: !!user && isPrivileged,
  });

  const summaryMap = new Map<string, MemberSummaryRow>();
  for (const row of summaryQuery.data ?? []) summaryMap.set(row.userId, row);

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
          <span className="text-fg-subtle text-[11px]">
            {isPrivileged
              ? 'Veja contadores ou abra a visão de tarefas do membro.'
              : 'Clique pra ver o timesheet do membro.'}
          </span>
        </div>
        <div className="border-border bg-bg-subtle overflow-hidden rounded-lg border">
          {membersQuery.isLoading ? (
            <div className="text-fg-muted p-4 text-sm">Carregando...</div>
          ) : membersQuery.data && membersQuery.data.length > 0 ? (
            <ul className="divide-border divide-y">
              {membersQuery.data.map((m) => {
                const s = summaryMap.get(m.user.id);
                return (
                  <li key={m.id} className="hover:bg-bg-muted/40 transition-colors">
                    <div className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
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

                      {isPrivileged && (
                        <div className="order-3 flex shrink-0 gap-1.5 sm:order-none">
                          <CounterBadge
                            value={s?.overdue ?? 0}
                            label="atrasadas"
                            tone="danger"
                            loading={summaryQuery.isLoading}
                          />
                          <CounterBadge
                            value={s?.today ?? 0}
                            label="vencem hoje"
                            tone="warn"
                            loading={summaryQuery.isLoading}
                          />
                          <CounterBadge
                            value={s?.pending ?? 0}
                            label="pendentes"
                            tone="muted"
                            loading={summaryQuery.isLoading}
                          />
                        </div>
                      )}

                      <span className="bg-bg-muted text-fg-muted shrink-0 rounded-full px-2 py-0.5 text-xs font-medium">
                        {ORG_ROLE_LABELS[m.role]}
                      </span>

                      <div className="flex shrink-0 items-center gap-1">
                        {isPrivileged && (
                          <Link
                            href={`/?as=${m.user.id}`}
                            className="text-fg-muted hover:text-primary hover:bg-bg inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors"
                            title={`Ver home de ${m.user.name}`}
                          >
                            <Eye size={12} />
                            Ver como
                          </Link>
                        )}
                        <Link
                          href={`/indicadores/timesheet?userId=${m.user.id}`}
                          className="text-fg-muted hover:text-primary hover:bg-bg inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors"
                          title={`Timesheet de ${m.user.name}`}
                        >
                          <Clock size={12} />
                          Timesheet
                          <ChevronRight size={12} />
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="text-fg-muted p-4 text-sm">Nenhum membro encontrado.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function CounterBadge({
  value,
  label,
  tone,
  loading,
}: {
  value: number;
  label: string;
  tone: 'danger' | 'warn' | 'muted';
  loading?: boolean;
}) {
  const toneClass =
    tone === 'danger'
      ? 'bg-danger-subtle text-danger border-danger/20'
      : tone === 'warn'
        ? 'bg-warning-subtle text-warning border-warning/20'
        : 'bg-bg-muted text-fg-muted border-border';
  const dim = value === 0 ? 'opacity-50' : '';
  return (
    <span
      className={`inline-flex min-w-[28px] items-center justify-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${toneClass} ${dim}`}
      title={`${value} ${label}`}
    >
      {loading ? '…' : value}
    </span>
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
