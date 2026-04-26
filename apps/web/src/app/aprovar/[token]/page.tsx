'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock,
  Loader2,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from 'lucide-react';

import { approvalsQueries, publicDecideApproval } from '@/lib/queries/approvals';
import { ApiError } from '@/lib/api-client';
import { UserAvatar } from '@/components/user-avatar';

/**
 * Página pública de aprovação. Acessada via link tokenizado enviado por
 * WhatsApp/email. Sem login. Mostra:
 *   - Resumo do card (título, board, lista, prioridade, prazo)
 *   - Quem pediu a aprovação
 *   - Botões aprovar/reprovar (com confirmação no aprovar e nota no reprovar)
 *   - Estado pós-decisão: "obrigado, sua resposta foi registrada"
 */
export default function PublicApprovalPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const queryClient = useQueryClient();

  const q = useQuery({
    ...approvalsQueries.publicView(token),
    enabled: !!token,
    retry: false,
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const decideMut = useMutation({
    mutationFn: (input: { decision: 'APPROVE' | 'REJECT'; note?: string }) =>
      publicDecideApproval(token, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public', 'approvals', token] });
      setConfirmOpen(false);
      setRejectOpen(false);
      setRejectNote('');
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Erro ao registrar sua resposta.');
    },
  });

  if (q.isLoading) {
    return (
      <CenteredCard>
        <div className="flex items-center gap-2">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Carregando aprovação…</span>
        </div>
      </CenteredCard>
    );
  }

  if (q.isError || !q.data) {
    return (
      <CenteredCard>
        <div className="flex flex-col items-center gap-2 text-center">
          <XCircle size={32} className="text-danger" />
          <p className="text-base font-semibold">Link inválido</p>
          <p className="text-fg-muted text-sm">
            Este link de aprovação não foi encontrado ou já expirou. Peça um novo link a quem
            solicitou a aprovação.
          </p>
        </div>
      </CenteredCard>
    );
  }

  const { reviewer, approval } = q.data;

  if (reviewer.expired) {
    return (
      <CenteredCard>
        <div className="flex flex-col items-center gap-2 text-center">
          <Clock size={32} className="text-warning" />
          <p className="text-base font-semibold">Link expirado</p>
          <p className="text-fg-muted text-sm">
            O prazo deste link de aprovação se esgotou. Peça um novo link a quem solicitou.
          </p>
        </div>
      </CenteredCard>
    );
  }

  const isDecided = approval.status !== 'PENDING';

  return (
    <CenteredCard wide>
      <header className="flex items-start gap-3 pb-4">
        <ShieldCheck size={22} className="text-primary mt-0.5" />
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Pedido de aprovação</h1>
          <p className="text-fg-muted text-xs">
            Olá
            {reviewer.user?.name
              ? `, ${reviewer.user.name}`
              : reviewer.externalName
                ? `, ${reviewer.externalName}`
                : ''}
            . Avalie a tarefa abaixo e clique em aprovar ou reprovar.
          </p>
        </div>
      </header>

      <CardSummary approval={approval} />

      {!isDecided && (
        <div className="border-border mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={decideMut.isPending}
            className="bg-success text-success-fg hover:bg-success/90 inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            <ThumbsUp size={14} />
            Aprovar
          </button>
          <button
            type="button"
            onClick={() => setRejectOpen(true)}
            disabled={decideMut.isPending}
            className="bg-danger text-danger-fg hover:bg-danger/90 inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            <ThumbsDown size={14} />
            Reprovar
          </button>
        </div>
      )}

      {isDecided && <DecidedBanner status={approval.status} />}

      {error && (
        <p className="bg-danger-subtle text-danger mt-3 rounded-md px-3 py-2 text-sm">{error}</p>
      )}

      {confirmOpen && (
        <ConfirmModal
          title="Confirmar aprovação?"
          description="Sua resposta será registrada e a tarefa pode ser movida automaticamente. Após a confirmação, ela só pode ser desfeita por quem pediu (em até 5 min)."
          confirmLabel="Aprovar"
          tone="success"
          loading={decideMut.isPending}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => decideMut.mutate({ decision: 'APPROVE' })}
        />
      )}
      {rejectOpen && (
        <ConfirmModal
          title="Reprovar com justificativa"
          description="Conte brevemente o motivo da reprovação (mín. 5 caracteres)."
          confirmLabel="Confirmar reprovação"
          tone="danger"
          loading={decideMut.isPending}
          onCancel={() => setRejectOpen(false)}
          onConfirm={() => decideMut.mutate({ decision: 'REJECT', note: rejectNote })}
          confirmDisabled={rejectNote.trim().length < 5}
        >
          <textarea
            autoFocus
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Ex: ajustar o subtítulo antes de publicar"
            className="border-border bg-bg focus-visible:ring-primary mt-2 w-full resize-none rounded-md border px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2"
          />
        </ConfirmModal>
      )}
    </CenteredCard>
  );
}

interface CardSummaryProps {
  approval: {
    requestedBy?: { id: string; name: string; avatarUrl: string | null };
    card: {
      title: string;
      priority: string;
      dueDate: string | null;
      board: { name: string; color: string | null };
      list: { name: string };
    };
  };
}

function CardSummary({ approval }: CardSummaryProps) {
  return (
    <div className="border-border bg-bg-muted/30 flex flex-col gap-3 rounded-md border p-4">
      <div>
        <h2 className="text-base font-semibold leading-tight">{approval.card.title}</h2>
        <p className="text-fg-muted mt-1 text-xs">
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
      {approval.requestedBy && (
        <div className="flex items-center gap-2 text-xs">
          <UserAvatar
            name={approval.requestedBy.name}
            userId={approval.requestedBy.id}
            avatarUrl={approval.requestedBy.avatarUrl}
            size="xs"
          />
          <span className="text-fg-muted">
            <span className="text-fg font-medium">{approval.requestedBy.name}</span> pediu sua
            aprovação
          </span>
        </div>
      )}
    </div>
  );
}

function DecidedBanner({ status }: { status: string }) {
  if (status === 'APPROVED') {
    return (
      <div className="border-success bg-success-subtle/50 mt-4 flex items-center gap-2 rounded-md border-l-2 px-3 py-3">
        <CheckCircle2 size={18} className="text-success" />
        <div>
          <p className="text-sm font-medium">Você aprovou esta tarefa.</p>
          <p className="text-fg-muted text-xs">Sua resposta foi registrada. Obrigado!</p>
        </div>
      </div>
    );
  }
  if (status === 'REJECTED') {
    return (
      <div className="border-danger bg-danger-subtle/50 mt-4 flex items-center gap-2 rounded-md border-l-2 px-3 py-3">
        <XCircle size={18} className="text-danger" />
        <div>
          <p className="text-sm font-medium">Você reprovou esta tarefa.</p>
          <p className="text-fg-muted text-xs">Sua resposta foi registrada. Obrigado!</p>
        </div>
      </div>
    );
  }
  if (status === 'REVERTED') {
    return (
      <div className="border-warning bg-warning-subtle/50 mt-4 flex items-center gap-2 rounded-md border-l-2 px-3 py-3">
        <Clock size={18} className="text-warning" />
        <div>
          <p className="text-sm font-medium">Esta decisão foi desfeita.</p>
          <p className="text-fg-muted text-xs">
            Quem pediu a aprovação reverteu a decisão. Aguarde uma nova solicitação.
          </p>
        </div>
      </div>
    );
  }
  return null;
}

function CenteredCard({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="bg-bg-muted/40 flex min-h-screen items-center justify-center px-4 py-10">
      <div
        className={`bg-bg border-border w-full rounded-lg border p-6 shadow-md ${
          wide ? 'max-w-xl' : 'max-w-md'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function ConfirmModal({
  title,
  description,
  confirmLabel,
  tone,
  onCancel,
  onConfirm,
  loading,
  confirmDisabled,
  children,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  tone: 'success' | 'danger';
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
  confirmDisabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-bg border-border w-full max-w-sm rounded-md border p-4 shadow-xl">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-fg-muted mt-1 text-xs leading-relaxed">{description}</p>
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
              tone === 'success'
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
