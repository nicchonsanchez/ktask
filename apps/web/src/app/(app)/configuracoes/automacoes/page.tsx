'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Inbox,
  Loader2,
  RotateCw,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { OrgRole } from '@ktask/contracts';

import { api, ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

interface CurrentOrg {
  id: string;
  myRole: OrgRole;
}

interface HealthFailure {
  id: string;
  automationId: string;
  automationLabel: string | null;
  automationActionType: string;
  cardId: string;
  trigger: string;
  actionType: string;
  attempts: number;
  errorMessage: string;
  createdAt: string;
}

interface HealthRun {
  id: string;
  automationId: string;
  automationLabel: string | null;
  automationActionType: string;
  cardId: string | null;
  status: 'FAILED' | 'ABANDONED' | string;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  chainDepth: number;
}

interface OutboxRow {
  id: string;
  trigger: string;
  cardId: string;
  scopeKind: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string;
  createdAt: string;
}

interface HealthResponse {
  counters: {
    failures7d: number;
    stuckRuns: number;
    outboxBacklog: number;
  };
  failures: HealthFailure[];
  recentRuns: HealthRun[];
  outboxPending: OutboxRow[];
}

const ADMIN_ROLES: OrgRole[] = ['OWNER', 'ADMIN'];

/**
 * Painel de saúde das automações. Acesso ADMIN/OWNER. Mostra:
 *   - 3 contadores: falhas 7d, runs travados, outbox backlog
 *   - Tabela de AutomationFailure (dead-letter) com botão "Reprocessar"
 *   - Tabela de últimos runs FAILED/ABANDONED
 *   - Tabela de outbox pendente (devido há muito tempo = problema)
 */
export default function ConfiguracoesAutomacoesPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const orgQ = useQuery({
    queryKey: ['org', 'current'],
    queryFn: () => api.get<CurrentOrg>('/api/v1/organizations/current'),
    enabled: !!user,
  });

  const isAdmin = orgQ.data ? ADMIN_ROLES.includes(orgQ.data.myRole) : false;

  const healthQ = useQuery({
    queryKey: ['admin', 'automations', 'health'],
    queryFn: () => api.get<HealthResponse>('/api/v1/admin/automations/health'),
    enabled: isAdmin,
    refetchInterval: 30_000, // auto-refresh a cada 30s pra ver progresso
  });

  const reprocessMut = useMutation({
    mutationFn: (id: string) =>
      api.post<{ ok: true; outboxId: string }>(
        `/api/v1/admin/automations/failures/${id}/reprocess`,
        {},
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'automations', 'health'] });
      setActionError(null);
    },
    onError: (e) => {
      setActionError(e instanceof ApiError ? e.message : 'Erro ao reprocessar.');
    },
  });

  const resolveMut = useMutation({
    mutationFn: (id: string) =>
      api.post<{ ok: true }>(`/api/v1/admin/automations/failures/${id}/resolve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'automations', 'health'] });
      setActionError(null);
    },
    onError: (e) => {
      setActionError(e instanceof ApiError ? e.message : 'Erro ao resolver.');
    },
  });

  if (orgQ.isLoading) {
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
        <Activity size={32} className="text-fg-muted mx-auto mb-3" />
        <h1 className="text-lg font-semibold">Saúde das automações</h1>
        <p className="text-fg-muted mt-2 text-sm">
          Acesso restrito a OWNER e ADMIN. Fale com um admin se precisa investigar problemas de
          automação.
        </p>
      </div>
    );
  }

  const data = healthQ.data;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6">
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
          <Activity size={18} className="text-fg-muted" />
          <h1 className="text-lg font-semibold">Saúde das automações</h1>
        </div>
        {healthQ.isFetching && <Loader2 size={12} className="text-fg-muted ml-auto animate-spin" />}
      </header>

      {/* 3 contadores no topo */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CounterCard
          label="Falhas (7d)"
          value={data?.counters.failures7d ?? 0}
          icon={XCircle}
          tone={data && data.counters.failures7d > 0 ? 'danger' : 'neutral'}
          hint="Dead-letter — falhou após 3 tentativas"
        />
        <CounterCard
          label="Runs travados"
          value={data?.counters.stuckRuns ?? 0}
          icon={Clock}
          tone={data && data.counters.stuckRuns > 0 ? 'warning' : 'neutral'}
          hint="RUNNING há mais de 5 minutos"
        />
        <CounterCard
          label="Outbox pendente"
          value={data?.counters.outboxBacklog ?? 0}
          icon={Inbox}
          tone={data && data.counters.outboxBacklog > 100 ? 'warning' : 'neutral'}
          hint="Eventos aguardando processamento"
        />
      </div>

      {actionError && (
        <p className="bg-danger-subtle text-danger mb-4 rounded-md px-3 py-2 text-xs">
          {actionError}
        </p>
      )}

      {healthQ.isLoading && (
        <div className="text-fg-muted flex items-center gap-2 py-12 text-sm">
          <Loader2 size={16} className="animate-spin" />
          Carregando dados de saúde…
        </div>
      )}

      {data && (
        <>
          {/* Dead-letter: prioridade alta — gestor age aqui */}
          <Section
            title="Falhas dead-letter (esgotaram retries)"
            count={data.failures.length}
            empty="Nenhuma falha pendente. Tudo certo."
          >
            {data.failures.length > 0 && (
              <div className="border-border overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-bg-muted/30 text-fg-muted text-xs">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium">Quando</th>
                      <th className="px-2 py-2 text-left font-medium">Automação</th>
                      <th className="px-2 py-2 text-left font-medium">Card</th>
                      <th className="px-2 py-2 text-left font-medium">Erro</th>
                      <th className="px-2 py-2 text-left font-medium">Tent.</th>
                      <th className="px-2 py-2 text-right font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {data.failures.map((f) => (
                      <tr key={f.id} className="hover:bg-bg-muted/30">
                        <td className="px-2 py-2 text-xs">{formatRelative(f.createdAt)}</td>
                        <td className="px-2 py-2 text-xs">
                          <div className="font-medium">
                            {f.automationLabel ?? f.automationActionType}
                          </div>
                          <div className="text-fg-muted text-[10px]">
                            {f.trigger} · {f.actionType}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-xs">
                          <a
                            href={`/?card=${f.cardId}`}
                            className="text-primary hover:underline"
                            title={f.cardId}
                          >
                            abrir card
                          </a>
                        </td>
                        <td className="px-2 py-2 text-xs">
                          <span
                            title={f.errorMessage}
                            className="text-fg-muted line-clamp-2 max-w-md"
                          >
                            {f.errorMessage}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center text-xs">{f.attempts}</td>
                        <td className="px-2 py-2 text-right">
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={() => reprocessMut.mutate(f.id)}
                              disabled={reprocessMut.isPending}
                              className="border-border hover:bg-primary-subtle hover:border-primary hover:text-primary inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium disabled:opacity-50"
                              title="Reempurra pro outbox e marca como resolvida"
                            >
                              <RotateCw size={10} />
                              Reprocessar
                            </button>
                            <button
                              type="button"
                              onClick={() => resolveMut.mutate(f.id)}
                              disabled={resolveMut.isPending}
                              className="border-border text-fg-muted hover:bg-bg-muted inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium disabled:opacity-50"
                              title="Marca como resolvida sem reprocessar"
                            >
                              <CheckCircle2 size={10} />
                              Marcar OK
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Runs FAILED/ABANDONED recentes — só pra contexto, sem ação direta */}
          <Section
            title="Runs com erro (últimos 7 dias)"
            count={data.recentRuns.length}
            empty="Nenhum run com erro no período."
          >
            {data.recentRuns.length > 0 && (
              <div className="border-border overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-bg-muted/30 text-fg-muted text-xs">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium">Quando</th>
                      <th className="px-2 py-2 text-left font-medium">Status</th>
                      <th className="px-2 py-2 text-left font-medium">Automação</th>
                      <th className="px-2 py-2 text-left font-medium">Card</th>
                      <th className="px-2 py-2 text-left font-medium">Erro</th>
                      <th className="px-2 py-2 text-center font-medium">Profundidade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {data.recentRuns.map((r) => (
                      <tr key={r.id} className="hover:bg-bg-muted/30">
                        <td className="px-2 py-2 text-xs">
                          {r.startedAt ? formatRelative(r.startedAt) : '—'}
                        </td>
                        <td className="px-2 py-2">
                          <span
                            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
                              r.status === 'FAILED'
                                ? 'border-red-500/30 bg-red-500/15 text-red-700'
                                : 'border-orange-500/30 bg-orange-500/15 text-orange-700'
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-xs">
                          <div className="font-medium">
                            {r.automationLabel ?? r.automationActionType}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-xs">
                          {r.cardId ? (
                            <a
                              href={`/?card=${r.cardId}`}
                              className="text-primary hover:underline"
                              title={r.cardId}
                            >
                              abrir
                            </a>
                          ) : (
                            <span className="text-fg-muted">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-xs">
                          <span
                            title={r.error ?? undefined}
                            className="text-fg-muted line-clamp-2 max-w-md"
                          >
                            {r.error ?? '—'}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center text-xs">{r.chainDepth}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Outbox engasgado: smoke gun de problema no worker */}
          <Section
            title="Outbox pendente há mais tempo"
            count={data.outboxPending.length}
            empty="Outbox fluindo normalmente."
          >
            {data.outboxPending.length > 0 && (
              <div className="border-border overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-bg-muted/30 text-fg-muted text-xs">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium">Criado</th>
                      <th className="px-2 py-2 text-left font-medium">Próxima tentativa</th>
                      <th className="px-2 py-2 text-left font-medium">Trigger</th>
                      <th className="px-2 py-2 text-left font-medium">Card</th>
                      <th className="px-2 py-2 text-center font-medium">Tent.</th>
                      <th className="px-2 py-2 text-left font-medium">Último erro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {data.outboxPending.map((o) => (
                      <tr key={o.id} className="hover:bg-bg-muted/30">
                        <td className="px-2 py-2 text-xs">{formatRelative(o.createdAt)}</td>
                        <td className="px-2 py-2 text-xs">{formatRelative(o.nextAttemptAt)}</td>
                        <td className="px-2 py-2 text-xs">
                          {o.trigger}
                          <div className="text-fg-muted text-[10px]">{o.scopeKind}</div>
                        </td>
                        <td className="px-2 py-2 text-xs">
                          <a
                            href={`/?card=${o.cardId}`}
                            className="text-primary hover:underline"
                            title={o.cardId}
                          >
                            abrir
                          </a>
                        </td>
                        <td className="px-2 py-2 text-center text-xs">{o.attempts}</td>
                        <td className="px-2 py-2 text-xs">
                          <span
                            title={o.lastError ?? undefined}
                            className="text-fg-muted line-clamp-2 max-w-md"
                          >
                            {o.lastError ?? '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function CounterCard({
  label,
  value,
  icon: Icon,
  hint,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  hint?: string;
  tone: 'neutral' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-red-700 border-red-500/30 bg-red-500/5'
      : tone === 'warning'
        ? 'text-amber-700 border-amber-500/30 bg-amber-500/5'
        : 'border-border bg-bg';
  return (
    <div className={`rounded-md border p-4 ${toneClass}`}>
      <div className="flex items-center gap-1.5 text-xs">
        <Icon size={12} />
        <span>{label}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="text-fg-muted mt-0.5 text-[10px]">{hint}</div>}
    </div>
  );
}

function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <h2 className="text-fg mb-2 flex items-center gap-2 text-sm font-semibold">
        {title}
        <span className="text-fg-muted text-xs font-normal">({count})</span>
      </h2>
      {count === 0 ? (
        <div className="border-border bg-bg-muted/30 text-fg-muted rounded-md border border-dashed px-3 py-6 text-center text-xs">
          {empty}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function formatRelative(iso: string): string {
  const dt = new Date(iso);
  const diff = Date.now() - dt.getTime();
  const future = diff < 0;
  const absMin = Math.abs(Math.round(diff / 60_000));
  const prefix = future ? 'em ' : 'há ';
  if (absMin < 1) return future ? 'agora' : 'agora';
  if (absMin < 60) return `${prefix}${absMin} min`;
  const hours = Math.round(absMin / 60);
  if (hours < 24) return `${prefix}${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${prefix}${days}d`;
  return dt.toLocaleDateString('pt-BR');
}
