'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock,
  Loader2,
  RotateCcw,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  X,
  XCircle,
} from 'lucide-react';

import { UserAvatar } from '@/components/user-avatar';
import { useAuthStore } from '@/stores/auth-store';
import { ApiError } from '@/lib/api-client';
import {
  approvalsQueries,
  decideApproval,
  undoApproval,
  type CardApproval,
} from '@/lib/queries/approvals';

import { RequestApprovalDialog } from './request-approval-dialog';

const UNDO_WINDOW_MS = 5 * 60 * 1000;

/**
 * Render principal das aprovações dentro do card modal. Estados:
 *  - sem aprovação ativa: botão "Pedir aprovação"
 *  - PENDING: banner amarelo + lista de revisores + botões aprovar/reprovar (se for reviewer)
 *  - APPROVED/REJECTED: banner verde/vermelho + nota + botão undo (5min)
 *  - REVERTED: linha histórica explicando que foi desfeita
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
  // mais recente que NÃO está pending — pra mostrar histórico/undo
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

        {/* Histórico (passadas: REVERTED ou múltiplas) */}
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

function PendingApprovalCard({ cardId, approval }: { cardId: string; approval: CardApproval }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const isReviewer = !!me && approval.reviewers.some((r) => r.userId === me.id);

  const decideMut = useMutation({
    mutationFn: (input: { decision: 'APPROVE' | 'REJECT'; note?: string }) =>
      decideApproval(approval.id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards', cardId] });
      queryClient.invalidateQueries({ queryKey: ['cards', cardId, 'approvals'] });
      setConfirmOpen(false);
      setRejectOpen(false);
      setRejectNote('');
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Erro ao decidir.');
    },
  });

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

      <ReviewerList reviewers={approval.reviewers} />

      {isReviewer && (
        <div className="border-border/60 mt-1 flex items-center gap-2 border-t pt-2">
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
    </div>
  );
}

function DecidedApprovalCard({ cardId, approval }: { cardId: string; approval: CardApproval }) {
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Contador pra mostrar tempo restante de undo. Reduz re-render usando 1s tick.
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
  // Quem pode desfazer: o decisor OU OWNER/ADMIN/GESTOR. O backend valida —
  // aqui mostramos o botão só pro decisor pra evitar confusão. ADMIN+ pode
  // chamar via console se precisar (raro em prática).
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

function ReviewerList({ reviewers }: { reviewers: CardApproval['reviewers'] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {reviewers.map((r) => (
        <li
          key={r.id}
          className="bg-bg/70 border-border/50 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
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
        </li>
      ))}
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
                  : 'Pendente';
          return (
            <li key={a.id} className="text-fg-muted">
              <span className="font-medium">{label}</span>
              {a.decidedAt && (
                <span className="ml-1.5">{new Date(a.decidedAt).toLocaleDateString('pt-BR')}</span>
              )}
              {a.note && <span className="ml-1.5 italic">— {a.note}</span>}
            </li>
          );
        })}
      </ul>
    </details>
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
