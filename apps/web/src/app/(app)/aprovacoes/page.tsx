'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Filter,
  History,
  Loader2,
  MessageCircle,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  X,
  XCircle,
} from 'lucide-react';
import type { OrgRole } from '@ktask/contracts';

import { api } from '@/lib/api-client';
import {
  approvalsQueries,
  decideApproval,
  type PendingApprovalForUser,
} from '@/lib/queries/approvals';
import {
  managementQueries,
  type DispatchStatus,
  type ManagementApprovalItem,
  type ManagementApprovalsFilters,
  type ManagementDispatchRow,
} from '@/lib/queries/management';
import { ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { UserAvatar } from '@/components/user-avatar';

const PRIVILEGED_ROLES: OrgRole[] = ['OWNER', 'ADMIN', 'GESTOR'];

interface CurrentOrg {
  id: string;
  myRole: OrgRole;
}

type View = 'minhas' | 'todas' | 'historico';

/**
 * Inbox de aprovacoes pendentes. Tem 2 modos:
 * - "Minhas" (default, todos): cards onde o user logado eh reviewer.
 * - "Todas" (so OWNER/ADMIN/GESTOR): todas pendentes da org, escopadas
 *   aos boards acessiveis. Botoes Aprovar/Reprovar desabilitados quando
 *   o user nao eh reviewer da aprovacao especifica.
 */
export default function AprovacoesPage() {
  const { user } = useAuthStore();
  const orgQuery = useQuery({
    queryKey: ['org', 'current'],
    queryFn: () => api.get<CurrentOrg>('/api/v1/organizations/current'),
    enabled: !!user,
  });
  const isPrivileged = orgQuery.data ? PRIVILEGED_ROLES.includes(orgQuery.data.myRole) : false;

  const [view, setView] = useState<View>('minhas');
  const [reviewerId, setReviewerId] = useState<string | undefined>(undefined);
  const [ageFilter, setAgeFilter] = useState<ManagementApprovalsFilters['ageFilter']>('all');

  const myQ = useQuery({ ...approvalsQueries.myPending() });
  const allQ = useQuery({
    ...managementQueries.approvals({ reviewerId, ageFilter }),
    enabled: isPrivileged && view === 'todas',
  });

  const myItems = myQ.data ?? [];
  const allItems = allQ.data?.items ?? [];
  const allReviewers = allQ.data?.reviewers ?? [];

  // Contador discreto na aba pra dar visibilidade do volume.
  const myCount = myItems.length;
  const allCount = allQ.data?.total ?? 0;

  // Metrica "esperando >7d" do conjunto Todas (so renderiza em isPrivileged).
  const over7dCount = useMemo(() => {
    if (view !== 'todas') return 0;
    const threshold = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return allItems.filter((a) => new Date(a.requestedAt).getTime() < threshold).length;
  }, [view, allItems]);

  // Histórico tem loading próprio dentro de HistoricoTab. Pra minhas/todas,
  // usa o estado da query correspondente.
  const isLoading = view === 'minhas' ? myQ.isLoading : view === 'todas' ? allQ.isLoading : false;

  return (
    <div className="container mx-auto max-w-4xl py-6">
      <header className="mb-6 flex items-center gap-3">
        <ShieldCheck size={22} className="text-primary" />
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Aprovações pendentes</h1>
          <p className="text-fg-muted text-sm">
            {view === 'minhas'
              ? 'Cards aguardando sua decisão. A primeira resposta encerra o pedido.'
              : 'Todas as aprovações pendentes da organização — visão de gestão.'}
          </p>
        </div>
      </header>

      {/* Tabs: "Todas" e "Histórico" so aparecem pra gestor. Render condicional
          evita flicker de aba aparecendo depois que orgQuery resolve. */}
      {isPrivileged && (
        <div className="border-border mb-4 flex items-center gap-1 border-b">
          <TabButton active={view === 'minhas'} onClick={() => setView('minhas')}>
            Minhas
            <span className="text-fg-muted ml-1.5 text-xs">({myCount})</span>
          </TabButton>
          <TabButton active={view === 'todas'} onClick={() => setView('todas')}>
            Todas (gestão)
            <span className="text-fg-muted ml-1.5 text-xs">({allCount})</span>
          </TabButton>
          <TabButton active={view === 'historico'} onClick={() => setView('historico')}>
            Histórico
          </TabButton>
          {view === 'todas' && over7dCount > 0 && (
            <span className="bg-warning-subtle text-warning border-warning/40 ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium">
              <AlertTriangle size={12} />
              {over7dCount} esperando &gt;7 dias
            </span>
          )}
        </div>
      )}

      {/* Aba Historico: tabela agregada por (approval × reviewer) com filtros
          + drill-down ao expandir. Component separado pra nao inchar essa fn. */}
      {view === 'historico' && isPrivileged && <HistoricoTab />}

      {/* Filtros (so na aba "Todas") */}
      {view === 'todas' && isPrivileged && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Filter size={14} className="text-fg-muted" />
          <select
            value={reviewerId ?? ''}
            onChange={(e) => setReviewerId(e.target.value || undefined)}
            className="border-border bg-bg focus-visible:ring-primary rounded-md border px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2"
          >
            <option value="">Todos os aprovadores</option>
            {allReviewers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            value={ageFilter ?? 'all'}
            onChange={(e) =>
              setAgeFilter(e.target.value as ManagementApprovalsFilters['ageFilter'])
            }
            className="border-border bg-bg focus-visible:ring-primary rounded-md border px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2"
          >
            <option value="all">Qualquer idade</option>
            <option value="over3d">Paradas há mais de 3 dias</option>
            <option value="over7d">Paradas há mais de 7 dias</option>
          </select>
        </div>
      )}

      {isLoading && (
        <div className="text-fg-muted flex items-center gap-2 py-12 text-sm">
          <Loader2 size={16} className="animate-spin" />
          Carregando…
        </div>
      )}

      {/* Estado vazio: contextualizado por aba */}
      {!isLoading &&
        ((view === 'minhas' && myItems.length === 0) ||
          (view === 'todas' && allItems.length === 0)) && (
          <div className="border-border bg-bg-muted/30 flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
            <CheckCircle2 size={28} className="text-success/60" />
            <p className="text-sm font-medium">
              {view === 'minhas'
                ? 'Nenhuma aprovação pendente.'
                : 'Nenhuma aprovação pendente na organização.'}
            </p>
            <p className="text-fg-muted text-xs">
              {view === 'minhas'
                ? 'Você verá aqui quando alguém pedir sua aprovação em um card.'
                : 'Tudo decidido — ou os filtros não retornaram nada.'}
            </p>
          </div>
        )}

      <ul className="flex flex-col gap-3">
        {view === 'minhas' && myItems.map((a) => <ApprovalRow key={a.id} approval={a} canDecide />)}
        {view === 'todas' &&
          allItems.map((a) => (
            <ApprovalRow key={a.id} approval={mgmtToRow(a)} canDecide={a.canDecide} />
          ))}
      </ul>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-sm font-medium transition ${
        active ? 'border-primary text-primary -mb-px border-b-2' : 'text-fg-muted hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Adapta o shape `ManagementApprovalItem` (response do endpoint gerencial)
 * pro shape `PendingApprovalForUser` (usado pelo ApprovalRow). Diferenca
 * principal: ManagementApprovalItem nao traz todos os campos de CardApproval
 * (so os necessarios pra exibir + decidir). Preenchemos os faltantes com
 * defaults — ApprovalRow nao usa esses campos.
 */
function mgmtToRow(a: ManagementApprovalItem): PendingApprovalForUser {
  return {
    id: a.id,
    cardId: a.cardId,
    organizationId: '', // nao usado no row
    requestedById: a.requestedBy?.id ?? '',
    status: 'PENDING',
    requestedAt: a.requestedAt,
    decidedAt: null,
    decidedById: null,
    decidedByExternalName: null,
    note: null,
    defaultOnApproveListId: null,
    defaultOnRejectListId: null,
    sideEffects: null,
    revertedAt: null,
    revertedById: null,
    revertReason: null,
    canceledAt: null,
    canceledById: null,
    cancelReason: null,
    message: null,
    lastNotifiedAt: null,
    notifyCount: 0,
    reviewers: a.reviewers,
    requestedBy: a.requestedBy ?? undefined,
    card: a.card,
  };
}

function ApprovalRow({
  approval,
  canDecide,
}: {
  approval: PendingApprovalForUser;
  canDecide: boolean;
}) {
  const queryClient = useQueryClient();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const decideMut = useMutation({
    mutationFn: (input: { decision: 'APPROVE' | 'REJECT'; note?: string }) =>
      decideApproval(approval.id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me', 'pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['management', 'approvals'] });
      queryClient.invalidateQueries({ queryKey: ['cards', approval.cardId] });
      queryClient.invalidateQueries({ queryKey: ['cards', approval.cardId, 'approvals'] });
      setRejectOpen(false);
      setRejectNote('');
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Erro ao decidir.');
    },
  });

  const requestedAgo = useMemo(() => formatRelative(approval.requestedAt), [approval.requestedAt]);

  // Tooltip "Aguardando: Anna, Lucas" quando o user nao eh reviewer.
  // Mostra reviewers internos (com user.name) e externos (externalName/phone).
  const reviewersLabel = useMemo(() => {
    if (canDecide) return '';
    const names = approval.reviewers.map((r) => r.user?.name ?? r.externalName ?? r.phone ?? '?');
    return `Aguardando: ${names.join(', ')}`;
  }, [canDecide, approval.reviewers]);

  return (
    <li className="border-border bg-bg flex flex-col gap-3 rounded-md border p-4 shadow-sm">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <a
            href={`/aprovacoes?card=${approval.cardId}`}
            className="hover:text-primary group inline-flex items-center gap-1.5 text-base font-medium"
          >
            <span className="truncate">{approval.card.title}</span>
            <ExternalLink
              size={12}
              className="text-fg-muted group-hover:text-primary opacity-0 transition group-hover:opacity-100"
            />
          </a>
          <p className="text-fg-muted mt-0.5 text-xs">
            <span
              className="border-border/60 inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5"
              style={
                approval.card.board.color
                  ? { borderColor: approval.card.board.color, color: approval.card.board.color }
                  : undefined
              }
            >
              {approval.card.board.name}
            </span>
            <span className="ml-1.5">· {approval.card.list.name}</span>
          </p>
        </div>
        <div className="text-fg-muted flex shrink-0 items-center gap-2 text-xs">
          <Clock size={12} />
          <span>{requestedAgo}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs">
        {approval.requestedBy && (
          <UserAvatar
            name={approval.requestedBy.name}
            userId={approval.requestedBy.id}
            avatarUrl={approval.requestedBy.avatarUrl}
            size="xs"
          />
        )}
        <span className="text-fg-muted">
          {approval.requestedBy?.name ?? 'Alguém'} pediu aprovação
        </span>
      </div>

      {/* Quando o user nao eh reviewer, mostra quem deve aprovar (em vez
          dos botoes). Gestor olhando aprovacao alheia ve quem cobrar. */}
      {!canDecide ? (
        <div className="border-border/60 bg-bg-muted/30 flex items-start gap-2 rounded-md border px-3 py-2 text-xs">
          <Clock size={12} className="text-fg-muted mt-0.5 shrink-0" />
          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            <span className="text-fg-muted">Aguardando:</span>
            {approval.reviewers.map((r) => {
              const name = r.user?.name ?? r.externalName ?? r.phone ?? '?';
              return (
                <span
                  key={r.id}
                  className="border-border bg-bg inline-flex items-center gap-1 rounded border px-1.5 py-0.5"
                >
                  {r.user && (
                    <UserAvatar
                      name={r.user.name}
                      userId={r.user.id}
                      avatarUrl={r.user.avatarUrl}
                      size="xs"
                    />
                  )}
                  <span>{name}</span>
                </span>
              );
            })}
          </div>
          <a
            href={`/aprovacoes?card=${approval.cardId}`}
            className="border-border hover:bg-bg-muted text-fg-muted shrink-0 rounded-md border px-2 py-1 text-xs font-medium"
            title="Abrir card"
          >
            <ExternalLink size={11} />
          </a>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => decideMut.mutate({ decision: 'APPROVE' })}
            disabled={decideMut.isPending}
            title={reviewersLabel || undefined}
            className="bg-success text-success-fg hover:bg-success/90 inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium disabled:opacity-50 sm:flex-none sm:py-1.5"
          >
            {decideMut.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <ThumbsUp size={12} />
            )}
            Aprovar
          </button>
          <button
            type="button"
            onClick={() => setRejectOpen(true)}
            disabled={decideMut.isPending}
            className="bg-danger text-danger-fg hover:bg-danger/90 inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium disabled:opacity-50 sm:flex-none sm:py-1.5"
          >
            <ThumbsDown size={12} />
            Reprovar
          </button>
          <a
            href={`/aprovacoes?card=${approval.cardId}`}
            className="border-border hover:bg-bg-muted text-fg-muted inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium sm:ml-auto sm:w-auto"
          >
            Ver card completo
            <ExternalLink size={11} />
          </a>
        </div>
      )}

      {error && (
        <p className="bg-danger-subtle text-danger rounded-md px-3 py-1.5 text-xs">{error}</p>
      )}

      {rejectOpen && canDecide && (
        <div className="border-warning bg-warning-subtle/40 mt-1 flex flex-col gap-2 rounded-md border-l-2 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <p className="text-fg text-xs font-medium">Justificativa (mín. 5 caracteres)</p>
            <button
              type="button"
              onClick={() => setRejectOpen(false)}
              className="text-fg-muted hover:text-fg"
              aria-label="Fechar"
            >
              <X size={13} />
            </button>
          </div>
          <textarea
            autoFocus
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Por que está reprovando?"
            className="border-border bg-bg focus-visible:ring-primary resize-none rounded-md border px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2"
          />
          <button
            type="button"
            onClick={() => decideMut.mutate({ decision: 'REJECT', note: rejectNote })}
            disabled={decideMut.isPending || rejectNote.trim().length < 5}
            className="bg-danger text-danger-fg hover:bg-danger/90 inline-flex items-center gap-1.5 self-start rounded-md px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            {decideMut.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <XCircle size={12} />
            )}
            Confirmar reprovação
          </button>
        </div>
      )}
    </li>
  );
}

function formatRelative(iso: string): string {
  const dt = new Date(iso);
  const diff = Date.now() - dt.getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `há ${days}d`;
  return dt.toLocaleDateString('pt-BR');
}

// ===================== Aba "Histórico" =====================

const STATUS_LABEL: Record<DispatchStatus, { label: string; tone: string }> = {
  PENDING: { label: 'Pendente', tone: 'bg-amber-500/15 text-amber-700 border-amber-500/30' },
  APPROVED: { label: 'Aprovada', tone: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' },
  REJECTED: { label: 'Reprovada', tone: 'bg-red-500/15 text-red-700 border-red-500/30' },
  CANCELED: { label: 'Cancelada', tone: 'bg-zinc-500/15 text-zinc-600 border-zinc-500/30' },
  REVERTED: { label: 'Revertida', tone: 'bg-orange-500/15 text-orange-700 border-orange-500/30' },
};

const STATUS_OPTIONS: DispatchStatus[] = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELED',
  'REVERTED',
];

function HistoricoTab() {
  const [status, setStatus] = useState<DispatchStatus[]>([]);
  const [reviewerId, setReviewerId] = useState<string | undefined>(undefined);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [onlyFailures, setOnlyFailures] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const q = useQuery({
    ...managementQueries.approvalDispatches({
      status,
      reviewerId,
      period,
      onlyFailures,
      page,
      pageSize,
    }),
  });

  const data = q.data;
  const items = data?.items ?? [];
  const reviewers = data?.reviewers ?? [];
  const summary = data?.summary;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  function toggleStatus(s: DispatchStatus) {
    setStatus((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Resumo agregado */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Envios" value={summary.totalDispatches} icon={History} />
          <SummaryCard
            label="Entregues"
            value={summary.successCount}
            icon={CheckCircle2}
            tone="success"
          />
          <SummaryCard
            label="Falhas"
            value={summary.failureCount}
            icon={AlertTriangle}
            tone={summary.failureCount > 0 ? 'danger' : 'neutral'}
          />
          <SummaryCard
            label="WhatsApp / In-app"
            value={`${summary.whatsappCount} / ${summary.inAppCount}`}
            icon={MessageCircle}
          />
        </div>
      )}

      {/* Filtros */}
      <div className="border-border bg-bg flex flex-col gap-3 rounded-md border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={14} className="text-fg-muted" />
          <span className="text-fg-muted text-xs font-medium">Status:</span>
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition ${
                status.includes(s)
                  ? STATUS_LABEL[s].tone
                  : 'border-border text-fg-muted hover:bg-bg-muted'
              }`}
            >
              {STATUS_LABEL[s].label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={reviewerId ?? ''}
            onChange={(e) => {
              setReviewerId(e.target.value || undefined);
              setPage(1);
            }}
            className="border-border bg-bg focus-visible:ring-primary rounded-md border px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2"
          >
            <option value="">Todos os aprovadores</option>
            {reviewers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value as typeof period);
              setPage(1);
            }}
            className="border-border bg-bg focus-visible:ring-primary rounded-md border px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2"
          >
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="90d">Últimos 90 dias</option>
            <option value="all">Tudo</option>
          </select>
          <label className="text-fg-muted inline-flex cursor-pointer items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={onlyFailures}
              onChange={(e) => {
                setOnlyFailures(e.target.checked);
                setPage(1);
              }}
            />
            Só com falha
          </label>
        </div>
      </div>

      {q.isLoading && (
        <div className="text-fg-muted flex items-center gap-2 py-12 text-sm">
          <Loader2 size={16} className="animate-spin" />
          Carregando histórico…
        </div>
      )}

      {!q.isLoading && items.length === 0 && (
        <div className="border-border bg-bg-muted/30 flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
          <History size={28} className="text-fg-muted" />
          <p className="text-sm font-medium">Nenhum envio no período/filtro.</p>
          <p className="text-fg-muted text-xs">Tente expandir o período ou afrouxar os filtros.</p>
        </div>
      )}

      {!q.isLoading && items.length > 0 && (
        <>
          {/* Tabela. Cada linha eh expansivel pra ver timeline detalhada. */}
          <div className="border-border overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-bg-muted/30 text-fg-muted text-xs">
                <tr>
                  <th className="w-6" />
                  <th className="px-2 py-2 text-left font-medium">Card</th>
                  <th className="px-2 py-2 text-left font-medium">Aprovador</th>
                  <th className="px-2 py-2 text-left font-medium">Pedido</th>
                  <th className="px-2 py-2 text-left font-medium">Atraso</th>
                  <th className="px-2 py-2 text-left font-medium">Cobranças</th>
                  <th className="px-2 py-2 text-left font-medium">Status</th>
                  <th className="px-2 py-2 text-left font-medium">Último</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {items.map((row) => (
                  <DispatchRow
                    key={`${row.approvalId}|${row.reviewerUserId ?? row.phone}`}
                    row={row}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginacao simples */}
          {totalPages > 1 && (
            <div className="text-fg-muted flex items-center justify-between text-xs">
              <span>
                Página {page} de {totalPages} · {data?.total ?? 0} registros
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="border-border hover:bg-bg-muted rounded border px-2 py-1 disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="border-border hover:bg-bg-muted rounded border px-2 py-1 disabled:opacity-40"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string;
  value: number | string;
  icon: typeof Bell;
  tone?: 'neutral' | 'success' | 'danger';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-emerald-700 border-emerald-500/30 bg-emerald-500/5'
      : tone === 'danger'
        ? 'text-red-700 border-red-500/30 bg-red-500/5'
        : 'border-border bg-bg';
  return (
    <div className={`rounded-md border p-3 ${toneClass}`}>
      <div className="flex items-center gap-1.5 text-xs">
        <Icon size={12} />
        <span>{label}</span>
      </div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function DispatchRow({ row }: { row: ManagementDispatchRow }) {
  const [open, setOpen] = useState(false);
  const requested = useMemo(() => new Date(row.requestedAt), [row.requestedAt]);
  const decided = row.decidedAt ? new Date(row.decidedAt) : null;
  const ago = useMemo(() => formatDuration(Date.now() - requested.getTime()), [requested]);
  const lastAgo = useMemo(() => formatRelative(row.lastDispatchAt), [row.lastDispatchAt]);
  const statusInfo = STATUS_LABEL[row.status];

  // Timeline lazy: so busca quando expandido.
  const timelineQ = useQuery({
    ...managementQueries.approvalDispatchTimeline(row.approvalId),
    enabled: open,
  });

  return (
    <>
      <tr className="hover:bg-bg-muted/30">
        <td className="px-1 py-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-fg-muted hover:text-fg"
            aria-label="Expandir"
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </td>
        <td className="px-2 py-2">
          <a href={`/aprovacoes?card=${row.cardId}`} className="hover:text-primary font-medium">
            {row.cardTitle}
          </a>
          <div className="text-fg-muted mt-0.5 text-[11px]">
            <span
              className="border-border/60 inline-flex items-center gap-1.5 rounded border px-1 py-0.5"
              style={
                row.board.color
                  ? { borderColor: row.board.color, color: row.board.color }
                  : undefined
              }
            >
              {row.board.name}
            </span>
          </div>
        </td>
        <td className="px-2 py-2 text-xs">{row.recipientName}</td>
        <td className="px-2 py-2 text-xs">
          {requested.toLocaleDateString('pt-BR')}
          <div className="text-fg-muted text-[10px]">
            {requested.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </td>
        <td className="px-2 py-2 text-xs">
          {row.status === 'PENDING'
            ? ago
            : decided
              ? formatDuration(decided.getTime() - requested.getTime())
              : '—'}
        </td>
        <td className="px-2 py-2 text-xs">
          <span className="font-semibold">{row.totalDispatches}</span>
          <span className="text-fg-muted ml-1">
            ({row.autoDispatches}a + {row.manualDispatches}m
            {row.failures > 0 ? ` · ${row.failures} falha${row.failures > 1 ? 's' : ''}` : ''})
          </span>
        </td>
        <td className="px-2 py-2 text-xs">
          <span
            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${statusInfo.tone}`}
          >
            {statusInfo.label}
          </span>
          {decided && (
            <div className="text-fg-muted mt-0.5 text-[10px]">
              {decided.toLocaleDateString('pt-BR')}
            </div>
          )}
        </td>
        <td className="px-2 py-2 text-xs">
          <span className="inline-flex items-center gap-1">
            {row.lastChannel === 'WHATSAPP' ? <MessageCircle size={11} /> : <Bell size={11} />}
            {row.lastSuccess ? (
              <CheckCircle2 size={11} className="text-emerald-600" />
            ) : (
              <XCircle size={11} className="text-red-600" />
            )}
            <span className="text-fg-muted">{lastAgo}</span>
          </span>
        </td>
      </tr>
      {open && (
        <tr>
          <td />
          <td colSpan={7} className="bg-bg-muted/20 p-3">
            {timelineQ.isLoading && (
              <div className="text-fg-muted flex items-center gap-1 text-xs">
                <Loader2 size={11} className="animate-spin" />
                Carregando timeline…
              </div>
            )}
            {timelineQ.data && timelineQ.data.items.length === 0 && (
              <p className="text-fg-muted text-xs">Sem envios registrados.</p>
            )}
            {timelineQ.data && timelineQ.data.items.length > 0 && (
              <ul className="space-y-1">
                {timelineQ.data.items.map((e) => (
                  <li
                    key={e.id}
                    className="border-border bg-bg flex items-center gap-2 rounded border px-2 py-1.5 text-xs"
                  >
                    <span className="text-fg-muted w-32 shrink-0">
                      {new Date(e.createdAt).toLocaleString('pt-BR')}
                    </span>
                    <span className="border-border w-20 shrink-0 rounded border px-1 py-0.5 text-center text-[10px] uppercase">
                      {e.kind === 'REMINDER'
                        ? 'Automático'
                        : e.kind === 'INITIAL'
                          ? 'Inicial'
                          : 'Manual'}
                    </span>
                    <span className="inline-flex w-24 shrink-0 items-center gap-1">
                      {e.channel === 'WHATSAPP' ? <MessageCircle size={11} /> : <Bell size={11} />}
                      {e.channel === 'WHATSAPP' ? 'WhatsApp' : 'In-app'}
                    </span>
                    <span className="text-fg-muted flex-1 truncate">{e.recipientName}</span>
                    {e.success ? (
                      <CheckCircle2 size={12} className="text-emerald-600" />
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-600">
                        <XCircle size={12} />
                        {e.errorMessage && (
                          <span className="text-[10px]">{e.errorMessage.slice(0, 60)}</span>
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function formatDuration(ms: number): string {
  if (ms < 0) return '—';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}
