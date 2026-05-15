'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  X,
  XCircle,
} from 'lucide-react';

import {
  approvalsQueries,
  decideApproval,
  type PendingApprovalForUser,
} from '@/lib/queries/approvals';
import { ApiError } from '@/lib/api-client';
import { UserAvatar } from '@/components/user-avatar';

/**
 * Inbox de aprovações pendentes do user logado. Lista cards aguardando
 * decisão sua, com ação rápida de aprovar/reprovar inline.
 *
 * Diferente do block dentro do card modal, aqui o objetivo é "passar uma
 * pilha de aprovações" rapidamente — então mostramos o essencial (título
 * do card, quem pediu, quando, board/lista) e botões de ação.
 */
export default function AprovacoesPage() {
  const q = useQuery({ ...approvalsQueries.myPending() });
  const items = q.data ?? [];

  return (
    <div className="container mx-auto max-w-4xl py-6">
      <header className="mb-6 flex items-center gap-3">
        <ShieldCheck size={22} className="text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Aprovações pendentes</h1>
          <p className="text-fg-muted text-sm">
            Cards aguardando sua decisão. A primeira resposta encerra o pedido.
          </p>
        </div>
      </header>

      {q.isLoading && (
        <div className="text-fg-muted flex items-center gap-2 py-12 text-sm">
          <Loader2 size={16} className="animate-spin" />
          Carregando…
        </div>
      )}

      {!q.isLoading && items.length === 0 && (
        <div className="border-border bg-bg-muted/30 flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
          <CheckCircle2 size={28} className="text-success/60" />
          <p className="text-sm font-medium">Nenhuma aprovação pendente.</p>
          <p className="text-fg-muted text-xs">
            Você verá aqui quando alguém pedir sua aprovação em um card.
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {items.map((a) => (
          <ApprovalRow key={a.id} approval={a} />
        ))}
      </ul>
    </div>
  );
}

function ApprovalRow({ approval }: { approval: PendingApprovalForUser }) {
  const queryClient = useQueryClient();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const decideMut = useMutation({
    mutationFn: (input: { decision: 'APPROVE' | 'REJECT'; note?: string }) =>
      decideApproval(approval.id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me', 'pending-approvals'] });
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

  return (
    <li className="border-border bg-bg flex flex-col gap-3 rounded-md border p-4 shadow-sm">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <a
            href={`/b/${approval.card.boardId}?card=${approval.cardId}`}
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
          {approval.requestedBy?.name ?? 'Alguém'} pediu sua aprovação
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => decideMut.mutate({ decision: 'APPROVE' })}
          disabled={decideMut.isPending}
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
          href={`/b/${approval.card.boardId}?card=${approval.cardId}`}
          className="border-border hover:bg-bg-muted text-fg-muted inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium sm:ml-auto sm:w-auto"
        >
          Ver card completo
          <ExternalLink size={11} />
        </a>
      </div>

      {error && (
        <p className="bg-danger-subtle text-danger rounded-md px-3 py-1.5 text-xs">{error}</p>
      )}

      {rejectOpen && (
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
