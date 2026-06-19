'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  CheckCircle2,
  Clock,
  Loader2,
  RotateCcw,
  Send,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  X,
  XCircle,
} from 'lucide-react';

import { UserAvatar } from '@/components/user-avatar';
import { useAuthStore } from '@/stores/auth-store';
import { api, ApiError } from '@/lib/api-client';
import {
  approvalsQueries,
  cancelApproval,
  decideApproval,
  removeApprovalReviewer,
  resendApproval,
  undoApproval,
  type CardApproval,
} from '@/lib/queries/approvals';

import { RequestApprovalDialog } from './request-approval-dialog';

const UNDO_WINDOW_MS = 5 * 60 * 1000;
const PRIVILEGED_ROLES = new Set(['OWNER', 'ADMIN', 'GESTOR']);

/**
 * Draft persistente em localStorage. Usado pra justificativa de
 * reprovacao e motivo de cancelamento — textos que o user pode estar
 * digitando quando o componente desmonta (aba descartada pelo Chrome em
 * background, approval expirar/ser cancelada por outro revisor, refresh
 * acidental). Sem isso o texto era perdido. Caso reportado em prod
 * (jun/2026): revisor estava reprovando, foi ate outra aba pegar um
 * texto, voltou e o popup tinha fechado, perdendo tudo.
 *
 * Limpa explicitamente apos commit (onSuccess) ou cancel.
 */
function usePersistentDraft(
  key: string,
  initial = '',
): [string, (next: string) => void, () => void] {
  const [value, setValue] = useState<string>(() => {
    if (typeof window === 'undefined') return initial;
    try {
      return window.localStorage.getItem(key) ?? initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (value) window.localStorage.setItem(key, value);
      else window.localStorage.removeItem(key);
    } catch {
      // localStorage cheio/desabilitado — ignora (volta a ser draft em memoria)
    }
  }, [key, value]);

  const clear = () => {
    setValue('');
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignora
      }
    }
  };

  return [value, setValue, clear];
}

interface CurrentOrgResponse {
  id: string;
  myRole: 'OWNER' | 'ADMIN' | 'GESTOR' | 'MEMBER' | 'GUEST';
}

/**
 * Render principal das aprovações dentro do card modal. Estados:
 *  - sem aprovação ativa: botão "Pedir aprovação"
 *  - PENDING: banner amarelo + lista de revisores + ações (aprovar/reprovar/cancelar/reenviar/remover revisor)
 *  - APPROVED/REJECTED: banner verde/vermelho + nota + botão undo (5min)
 *  - REVERTED/CANCELED: linha histórica explicando o estado
 */
export function ApprovalsBlock({
  cardId,
  boardId,
  currentListId,
}: {
  cardId: string;
  boardId: string;
  currentListId: string;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const approvalsQ = useQuery({ ...approvalsQueries.forCard(cardId) });

  const approvals = approvalsQ.data ?? [];
  const pending = approvals.find((a) => a.status === 'PENDING');
  // Decisão mais recente que NÃO seja PENDING/CANCELED — pra mostrar histórico/undo.
  const lastDecided = approvals.find((a) => a.status === 'APPROVED' || a.status === 'REJECTED');

  return (
    <>
      <div className="flex flex-col gap-3">
        {pending ? (
          <PendingApprovalCard cardId={cardId} approval={pending} />
        ) : lastDecided ? (
          <DecidedApprovalCard cardId={cardId} approval={lastDecided} />
        ) : null}

        {!pending && (
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="border-border hover:bg-bg-muted text-fg-muted hover:text-fg inline-flex items-center justify-center gap-1.5 self-start rounded-md border border-dashed px-3 py-1.5 text-xs font-medium transition-colors"
          >
            <ShieldCheck size={13} />
            Pedir aprovação
          </button>
        )}

        {/* Histórico (passadas: REVERTED, CANCELED ou múltiplas) */}
        {approvals.length > 1 && <ApprovalHistory approvals={approvals.slice(1)} />}
      </div>

      {dialogOpen && (
        <RequestApprovalDialog
          cardId={cardId}
          boardId={boardId}
          currentListId={currentListId}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </>
  );
}

function useCanManageApproval(approval: CardApproval): boolean {
  const me = useAuthStore((s) => s.user);
  const orgQuery = useQuery({
    queryKey: ['org', 'current'],
    queryFn: () => api.get<CurrentOrgResponse>('/api/v1/organizations/current'),
    enabled: !!me,
    staleTime: 5 * 60_000,
  });
  if (!me) return false;
  if (approval.requestedById === me.id) return true;
  return orgQuery.data ? PRIVILEGED_ROLES.has(orgQuery.data.myRole) : false;
}

function PendingApprovalCard({ cardId, approval }: { cardId: string; approval: CardApproval }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);
  // Drafts persistem em localStorage — chave por approvalId. Sobrevivem a
  // remount (tab discard do Chrome, refresh acidental, approval invalidada
  // por realtime). Ver doc do usePersistentDraft acima.
  const [rejectNote, setRejectNote, clearRejectNote] = usePersistentDraft(
    `ktask:reject-draft:${approval.id}`,
  );
  const [cancelReason, setCancelReason, clearCancelReason] = usePersistentDraft(
    `ktask:cancel-draft:${approval.id}`,
  );
  const [error, setError] = useState<string | null>(null);

  // Se o user tem draft de reprovacao salvo e o componente monta com a
  // approval ainda pendente, abre o ConfirmModal automaticamente — assim ele
  // ve o texto que estava escrevendo. Roda so na primeira render (eslint OK).
  useEffect(() => {
    if (rejectNote) setRejectOpen(true);
    if (cancelReason) setCancelOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const isReviewer = !!me && approval.reviewers.some((r) => r.userId === me.id);
  const canManage = useCanManageApproval(approval);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['cards', cardId] });
    queryClient.invalidateQueries({ queryKey: ['cards', cardId, 'approvals'] });
    queryClient.invalidateQueries({ queryKey: ['me', 'pending-approvals'] });
  };

  const decideMut = useMutation({
    mutationFn: (input: { decision: 'APPROVE' | 'REJECT'; note?: string }) =>
      decideApproval(approval.id, input),
    onSuccess: () => {
      invalidateAll();
      setConfirmOpen(false);
      setRejectOpen(false);
      clearRejectNote();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Erro ao decidir.');
    },
  });

  const cancelMut = useMutation({
    mutationFn: () => cancelApproval(approval.id, cancelReason.trim() || undefined),
    onSuccess: () => {
      invalidateAll();
      setCancelOpen(false);
      clearCancelReason();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Erro ao cancelar.');
    },
  });

  const resendMut = useMutation({
    mutationFn: (reviewerId: string | null) => resendApproval(approval.id, reviewerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards', cardId, 'approvals'] });
      setResendOpen(false);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Erro ao reenviar.');
    },
  });

  const removeReviewerMut = useMutation({
    mutationFn: (reviewerId: string) => removeApprovalReviewer(approval.id, reviewerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards', cardId, 'approvals'] });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Erro ao remover revisor.');
    },
  });

  const handleResendClick = () => {
    setError(null);
    // 1 reviewer: dispara direto, sem perguntar. 2+: abre modal de seleção.
    if (approval.reviewers.length === 1) {
      resendMut.mutate(null);
    } else {
      setResendOpen(true);
    }
  };

  return (
    <div className="border-warning bg-warning-subtle/40 flex flex-col gap-2 rounded-md border-l-2 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Clock size={14} className="text-warning" />
        <p className="text-fg text-sm font-medium">Aguardando aprovação</p>
        <span className="text-fg-muted ml-auto text-[11px]">
          Pedido por {approval.requestedBy?.name ?? '—'} ·{' '}
          {new Date(approval.requestedAt).toLocaleDateString('pt-BR')}
        </span>
      </div>

      <ReviewerList
        reviewers={approval.reviewers}
        onRemove={
          canManage && approval.reviewers.length > 1
            ? (id) => removeReviewerMut.mutate(id)
            : undefined
        }
        removing={removeReviewerMut.isPending ? removeReviewerMut.variables : null}
      />

      {/* Ações: revisor decide; quem gerencia pode cancelar / reenviar. */}
      {(isReviewer || canManage) && (
        <div className="border-border/60 mt-1 flex flex-wrap items-center gap-2 border-t pt-2">
          {isReviewer && (
            <>
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={decideMut.isPending}
                className="bg-success text-success-fg hover:bg-success/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                <ThumbsUp size={12} />
                Aprovar
              </button>
              <button
                type="button"
                onClick={() => setRejectOpen(true)}
                disabled={decideMut.isPending}
                className="bg-danger text-danger-fg hover:bg-danger/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                <ThumbsDown size={12} />
                Reprovar
              </button>
            </>
          )}
          {canManage && (
            <div className={`flex items-center gap-2 ${isReviewer ? 'ml-auto' : ''}`}>
              <button
                type="button"
                onClick={handleResendClick}
                disabled={resendMut.isPending}
                className="border-border hover:bg-bg-muted text-fg-muted hover:text-fg inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {resendMut.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Send size={12} />
                )}
                Reenviar
              </button>
              <button
                type="button"
                onClick={() => setCancelOpen(true)}
                disabled={cancelMut.isPending}
                className="border-border hover:bg-danger-subtle hover:text-danger hover:border-danger/40 text-fg-muted inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                <Ban size={12} />
                Cancelar pedido
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="bg-danger-subtle text-danger rounded px-2 py-1 text-[11px]">{error}</p>
      )}

      {/* Modal de confirmação pra Aprovar */}
      {confirmOpen && (
        <ConfirmModal
          title="Confirmar aprovação?"
          description="A decisão é registrada e dispara as automações configuradas. Você pode desfazer dentro de 5 minutos."
          confirmLabel="Aprovar"
          confirmTone="success"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => decideMut.mutate({ decision: 'APPROVE' })}
          loading={decideMut.isPending}
        />
      )}

      {/* Modal pra Reprovar (com note obrigatória) */}
      {rejectOpen && (
        <ConfirmModal
          title="Reprovar com justificativa"
          description="Reprovações exigem uma nota com pelo menos 5 caracteres."
          confirmLabel="Reprovar"
          confirmTone="danger"
          onCancel={() => setRejectOpen(false)}
          onConfirm={() => decideMut.mutate({ decision: 'REJECT', note: rejectNote })}
          loading={decideMut.isPending}
          confirmDisabled={rejectNote.trim().length < 5}
        >
          <textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            rows={3}
            placeholder="Por que está reprovando?"
            className="border-border bg-bg focus-visible:ring-primary mt-2 w-full resize-none rounded-md border px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2"
            maxLength={2000}
          />
        </ConfirmModal>
      )}

      {/* Modal pra Cancelar pedido */}
      {cancelOpen && (
        <ConfirmModal
          title="Cancelar este pedido?"
          description="Os revisores receberão uma mensagem avisando que o pedido foi cancelado. Esta ação não pode ser desfeita."
          confirmLabel="Cancelar pedido"
          confirmTone="danger"
          onCancel={() => {
            setCancelOpen(false);
            setCancelReason('');
          }}
          onConfirm={() => cancelMut.mutate()}
          loading={cancelMut.isPending}
        >
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={2}
            placeholder="Motivo (opcional) — aparece na mensagem aos revisores"
            className="border-border bg-bg focus-visible:ring-primary mt-2 w-full resize-none rounded-md border px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2"
            maxLength={500}
          />
        </ConfirmModal>
      )}

      {/* Modal pra Reenviar (só aparece se 2+ revisores) */}
      {resendOpen && (
        <ResendModal
          reviewers={approval.reviewers}
          loading={resendMut.isPending}
          onCancel={() => setResendOpen(false)}
          onConfirm={(reviewerId) => resendMut.mutate(reviewerId)}
        />
      )}
    </div>
  );
}

function DecidedApprovalCard({ cardId, approval }: { cardId: string; approval: CardApproval }) {
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const isApproved = approval.status === 'APPROVED';
  const tone = isApproved ? 'success' : 'danger';

  const decidedAt = approval.decidedAt ? new Date(approval.decidedAt).getTime() : 0;
  const elapsed = now - decidedAt;
  const remaining = Math.max(0, UNDO_WINDOW_MS - elapsed);
  const inWindow = remaining > 0;

  const isDecider = me?.id === approval.decidedById;
  const canUndo = isDecider && inWindow;

  const undoMut = useMutation({
    mutationFn: () => undoApproval(approval.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards', cardId] });
      queryClient.invalidateQueries({ queryKey: ['cards', cardId, 'approvals'] });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Erro ao desfazer.');
    },
  });

  return (
    <div
      className={`flex flex-col gap-2 rounded-md border-l-2 px-3 py-2.5 ${
        tone === 'success'
          ? 'border-success bg-success-subtle/40'
          : 'border-danger bg-danger-subtle/40'
      }`}
    >
      <div className="flex items-center gap-2">
        {isApproved ? (
          <CheckCircle2 size={14} className="text-success" />
        ) : (
          <XCircle size={14} className="text-danger" />
        )}
        <p className="text-fg text-sm font-medium">
          {isApproved ? 'Aprovado' : 'Reprovado'}
          {(approval.decidedBy?.name || approval.decidedByExternalName) && (
            <span className="text-fg-muted ml-1.5 text-xs font-normal">
              por {approval.decidedBy?.name ?? approval.decidedByExternalName}
            </span>
          )}
        </p>
        <span className="text-fg-muted ml-auto text-[11px]">
          {approval.decidedAt
            ? new Date(approval.decidedAt).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })
            : ''}
        </span>
      </div>

      {approval.note && (
        <p className="text-fg-muted bg-bg/60 rounded px-2 py-1 text-xs italic">“{approval.note}”</p>
      )}

      {canUndo && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => undoMut.mutate()}
            disabled={undoMut.isPending}
            className="border-border hover:bg-bg-muted text-fg-muted inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium disabled:opacity-50"
          >
            {undoMut.isPending ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <RotateCcw size={11} />
            )}
            Desfazer
          </button>
          <span className="text-fg-subtle text-[11px]">{formatCountdown(remaining)} restantes</span>
        </div>
      )}

      {error && (
        <p className="bg-danger-subtle text-danger rounded px-2 py-1 text-[11px]">{error}</p>
      )}
    </div>
  );
}

function ReviewerList({
  reviewers,
  onRemove,
  removing,
}: {
  reviewers: CardApproval['reviewers'];
  onRemove?: (reviewerId: string) => void;
  removing?: string | null | undefined;
}) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {reviewers.map((r) => {
        const sentAt = r.notifiedAt ? formatRelativeTime(r.notifiedAt) : null;
        const removingThis = removing === r.id;
        return (
          <li
            key={r.id}
            className="bg-bg/70 border-border/50 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
            title={sentAt ? `Notificação enviada ${sentAt}` : 'Ainda não notificado'}
          >
            {r.user ? (
              <>
                <UserAvatar
                  name={r.user.name}
                  userId={r.user.id}
                  avatarUrl={r.user.avatarUrl}
                  size="xs"
                />
                <span>{r.user.name}</span>
              </>
            ) : (
              <>
                <span className="bg-bg-muted text-fg-muted inline-flex size-4 items-center justify-center rounded-full">
                  <ThumbsUp size={9} />
                </span>
                <span>{r.externalName ?? r.phone}</span>
              </>
            )}
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(r.id)}
                disabled={removingThis}
                aria-label={`Remover ${r.user?.name ?? r.externalName ?? 'revisor'} do pedido`}
                className="text-fg-subtle hover:text-danger hover:bg-danger-subtle ml-0.5 inline-flex size-3.5 items-center justify-center rounded-full transition-colors disabled:opacity-50"
              >
                {removingThis ? <Loader2 size={9} className="animate-spin" /> : <X size={9} />}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ApprovalHistory({ approvals }: { approvals: CardApproval[] }) {
  return (
    <details className="border-border/40 rounded-md border-t pt-2">
      <summary className="text-fg-muted cursor-pointer select-none text-[11px] font-medium">
        Histórico ({approvals.length})
      </summary>
      <ul className="mt-2 flex flex-col gap-1 pl-1 text-[11px]">
        {approvals.map((a) => {
          const label =
            a.status === 'APPROVED'
              ? 'Aprovado'
              : a.status === 'REJECTED'
                ? 'Reprovado'
                : a.status === 'REVERTED'
                  ? 'Decisão desfeita'
                  : a.status === 'CANCELED'
                    ? 'Pedido cancelado'
                    : 'Pendente';
          const eventDate = a.canceledAt ?? a.decidedAt;
          const actor =
            a.status === 'CANCELED'
              ? a.canceledBy?.name
              : a.status === 'REVERTED'
                ? a.revertedBy?.name
                : (a.decidedBy?.name ?? a.decidedByExternalName);
          const reason = a.status === 'CANCELED' ? a.cancelReason : a.note;
          return (
            <li key={a.id} className="text-fg-muted">
              <span className="font-medium">{label}</span>
              {actor && <span className="ml-1.5">por {actor}</span>}
              {eventDate && (
                <span className="ml-1.5">{new Date(eventDate).toLocaleDateString('pt-BR')}</span>
              )}
              {reason && <span className="ml-1.5 italic">— {reason}</span>}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function ResendModal({
  reviewers,
  loading,
  onCancel,
  onConfirm,
}: {
  reviewers: CardApproval['reviewers'];
  loading: boolean;
  onCancel: () => void;
  onConfirm: (reviewerId: string | null) => void;
}) {
  // null = todos. string = id específico.
  const [target, setTarget] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-bg border-border w-full max-w-sm rounded-md border p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Reenviar mensagem</h3>
            <p className="text-fg-muted mt-1 text-xs leading-relaxed">
              Escolha pra quem reenviar o WhatsApp + notificação.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-fg-muted hover:bg-bg-muted rounded p-1"
            aria-label="Fechar"
          >
            <X size={14} />
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-1.5">
          <label className="hover:bg-bg-subtle flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm">
            <input
              type="radio"
              name="resend-target"
              checked={target === null}
              onChange={() => setTarget(null)}
              className="accent-primary"
            />
            <span className="font-medium">Para todos ({reviewers.length})</span>
          </label>
          {reviewers.map((r) => {
            const label = r.user?.name ?? r.externalName ?? r.phone ?? '—';
            return (
              <label
                key={r.id}
                className="hover:bg-bg-subtle flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm"
              >
                <input
                  type="radio"
                  name="resend-target"
                  checked={target === r.id}
                  onChange={() => setTarget(r.id)}
                  className="accent-primary"
                />
                <span>{label}</span>
                {r.notifiedAt && (
                  <span className="text-fg-subtle ml-auto text-[10px]">
                    Enviado {formatRelativeTime(r.notifiedAt)}
                  </span>
                )}
              </label>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-fg-muted hover:bg-bg-muted rounded-md px-3 py-1.5 text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(target)}
            disabled={loading}
            className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading && <Loader2 size={13} className="animate-spin" />}
            Reenviar
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({
  title,
  description,
  confirmLabel,
  confirmTone,
  onCancel,
  onConfirm,
  loading,
  confirmDisabled,
  children,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  confirmTone: 'success' | 'danger';
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
  confirmDisabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-bg border-border w-full max-w-sm rounded-md border p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">{title}</h3>
            <p className="text-fg-muted mt-1 text-xs leading-relaxed">{description}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-fg-muted hover:bg-bg-muted rounded p-1"
            aria-label="Fechar"
          >
            <X size={14} />
          </button>
        </div>
        {children}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-fg-muted hover:bg-bg-muted rounded-md px-3 py-1.5 text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || confirmDisabled}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
              confirmTone === 'success'
                ? 'bg-success text-success-fg hover:bg-success/90'
                : 'bg-danger text-danger-fg hover:bg-danger/90'
            }`}
          >
            {loading && <Loader2 size={13} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatCountdown(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'agora';
  const min = Math.floor(sec / 60);
  if (min < 60) return `há ${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `há ${hr}h`;
  const day = Math.floor(hr / 24);
  return `há ${day}d`;
}
