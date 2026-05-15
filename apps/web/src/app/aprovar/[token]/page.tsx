'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  CheckSquare,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  MessageSquare,
  ShieldCheck,
  Square,
  Tag,
  ThumbsDown,
  ThumbsUp,
  Users,
  XCircle,
} from 'lucide-react';

import {
  approvalsQueries,
  publicDecideApproval,
  type PublicApprovalActivity,
  type PublicApprovalAttachment,
  type PublicApprovalChecklist,
  type PublicApprovalComment,
  type PublicApprovalView,
} from '@/lib/queries/approvals';
import { ApiError } from '@/lib/api-client';
import { UserAvatar } from '@/components/user-avatar';
import { RichEditor } from '@/components/editor';

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
        <div className="border-border mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={decideMut.isPending}
            className="bg-success text-success-fg hover:bg-success/90 inline-flex w-full items-center justify-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-medium disabled:opacity-50 sm:w-auto sm:py-2"
          >
            <ThumbsUp size={14} />
            Aprovar
          </button>
          <button
            type="button"
            onClick={() => setRejectOpen(true)}
            disabled={decideMut.isPending}
            className="bg-danger text-danger-fg hover:bg-danger/90 inline-flex w-full items-center justify-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-medium disabled:opacity-50 sm:w-auto sm:py-2"
          >
            <ThumbsDown size={14} />
            Reprovar
          </button>
        </div>
      )}

      {isDecided && <DecidedBanner approval={approval} />}

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

function CardSummary({ approval }: { approval: PublicApprovalView['approval'] }) {
  const card = approval.card;
  const hasDescription = Boolean(card.description) && JSON.stringify(card.description) !== '{}';
  const labels = card.labels.map((l) => l.label);

  return (
    <div className="flex flex-col gap-4">
      {/* Cabecalho do card */}
      <div className="border-border bg-bg-muted/30 flex flex-col gap-3 rounded-md border p-4">
        <div>
          <h2 className="text-base font-semibold leading-tight">{card.title}</h2>
          <p className="text-fg-muted mt-1 text-xs">
            <span
              className="border-border/60 inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5"
              style={
                card.board.color
                  ? { borderColor: card.board.color, color: card.board.color }
                  : undefined
              }
            >
              {card.board.name}
            </span>
            <span className="ml-1.5">· {card.list.name}</span>
          </p>
        </div>

        {/* Metadata: prioridade + datas */}
        <MetaRow card={card} />

        {labels.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag size={12} className="text-fg-muted" />
            {labels.map((l) => (
              <span
                key={l.id}
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ backgroundColor: l.color + '33', color: l.color }}
              >
                {l.name}
              </span>
            ))}
          </div>
        )}

        {(card.lead || card.members.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Users size={12} className="text-fg-muted" />
            {card.lead && (
              <span className="border-border/60 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]">
                <UserAvatar
                  name={card.lead.name}
                  userId={card.lead.id}
                  avatarUrl={card.lead.avatarUrl}
                  size="xs"
                />
                <span className="font-medium">{card.lead.name}</span>
                <span className="text-fg-muted">· líder</span>
              </span>
            )}
            {card.members
              .filter((m) => m.user.id !== card.lead?.id)
              .map((m) => (
                <span
                  key={m.user.id}
                  className="border-border/60 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]"
                >
                  <UserAvatar
                    name={m.user.name}
                    userId={m.user.id}
                    avatarUrl={m.user.avatarUrl}
                    size="xs"
                  />
                  {m.user.name}
                </span>
              ))}
          </div>
        )}

        {approval.requestedBy && (
          <div className="border-border/60 mt-1 flex items-center gap-2 border-t pt-3 text-xs">
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

      {hasDescription && (
        <Section title="Descrição" icon={<FileText size={13} />}>
          <RichEditor value={card.description} readOnly onChange={() => undefined} />
        </Section>
      )}

      {card.checklists.length > 0 && (
        <Section title={`Checklists (${card.checklists.length})`} icon={<CheckSquare size={13} />}>
          <ChecklistsView checklists={card.checklists} />
        </Section>
      )}

      {card.attachments.length > 0 && (
        <Section
          title={`Anexos (${card.attachments.length})`}
          icon={<FileText size={13} />}
          defaultOpen
        >
          <AttachmentsView attachments={card.attachments} />
        </Section>
      )}

      {(card.comments.length > 0 || card.activities.length > 0) && (
        <Section title="Histórico" icon={<MessageSquare size={13} />}>
          <TimelineView comments={card.comments} activities={card.activities} />
        </Section>
      )}
    </div>
  );
}

function MetaRow({ card }: { card: PublicApprovalView['approval']['card'] }) {
  const meta: React.ReactNode[] = [];
  if (card.startDate) {
    meta.push(
      <span key="start" className="text-fg-muted text-[11px]">
        início {formatDate(card.startDate)}
      </span>,
    );
  }
  if (card.dueDate) {
    meta.push(
      <span key="due" className="text-fg-muted text-[11px]">
        prazo {formatDate(card.dueDate)}
      </span>,
    );
  }
  if (card.completedAt) {
    meta.push(
      <span key="done" className="text-success text-[11px]">
        finalizado {formatDate(card.completedAt)}
      </span>,
    );
  }
  if (meta.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {meta.map((m, i) => (
        <span key={i}>{m}</span>
      ))}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
  defaultOpen,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="border-border bg-bg-muted/20 group rounded-md border [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="text-fg flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm font-medium">
        <span className="text-fg-muted">{icon}</span>
        <span className="flex-1">{title}</span>
        <span className="text-fg-muted text-[11px] group-open:hidden">expandir</span>
        <span className="text-fg-muted hidden text-[11px] group-open:inline">recolher</span>
      </summary>
      <div className="border-border/60 border-t px-4 py-3">{children}</div>
    </details>
  );
}

function ChecklistsView({ checklists }: { checklists: PublicApprovalChecklist[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {checklists.map((cl) => {
        const total = cl.items.length;
        const done = cl.items.filter((i) => i.isDone).length;
        return (
          <li key={cl.id} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-fg text-sm font-medium">{cl.title}</span>
              <span className="text-fg-muted text-[11px]">
                {done}/{total}
              </span>
            </div>
            <ul className="flex flex-col gap-1">
              {cl.items.map((it) => (
                <li key={it.id} className="flex items-start gap-2 text-xs">
                  {it.isDone ? (
                    <CheckSquare size={13} className="text-success mt-0.5 shrink-0" />
                  ) : (
                    <Square size={13} className="text-fg-subtle mt-0.5 shrink-0" />
                  )}
                  <span className={it.isDone ? 'text-fg-muted line-through' : 'text-fg'}>
                    {it.text}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

function AttachmentsView({ attachments }: { attachments: PublicApprovalAttachment[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {attachments.map((a) => (
        <li
          key={a.id}
          className="border-border/60 hover:bg-bg-muted/40 flex items-center gap-3 rounded-md border p-2"
        >
          <span className="text-fg-muted shrink-0">
            {a.kind === 'IMAGE' ? (
              <ImageIcon size={16} />
            ) : a.kind === 'LINK' ? (
              <Link2 size={16} />
            ) : (
              <FileText size={16} />
            )}
          </span>
          {a.kind === 'IMAGE' && a.publicUrl && (
            <img
              src={a.publicUrl}
              alt={a.fileName}
              className="border-border/60 size-10 shrink-0 rounded border object-cover sm:size-12"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-fg truncate text-xs font-medium">{a.fileName}</p>
            <p className="text-fg-muted text-[11px]">
              {formatBytes(a.sizeBytes)} · {a.mimeType}
            </p>
          </div>
          {a.publicUrl ? (
            <a
              href={a.publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="border-border text-fg hover:bg-bg-muted shrink-0 rounded-md border px-2 py-1 text-[11px]"
            >
              {a.kind === 'LINK' ? <ExternalLink size={11} /> : <Download size={11} />}
            </a>
          ) : (
            <span className="text-fg-subtle shrink-0 text-[10px]">indisponível</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function TimelineView({
  comments,
  activities,
}: {
  comments: PublicApprovalComment[];
  activities: PublicApprovalActivity[];
}) {
  // Merge ordenado por createdAt desc.
  type Item =
    | { kind: 'comment'; data: PublicApprovalComment; t: number }
    | { kind: 'activity'; data: PublicApprovalActivity; t: number };
  const items: Item[] = [
    ...comments.map<Item>((c) => ({
      kind: 'comment',
      data: c,
      t: new Date(c.createdAt).getTime(),
    })),
    ...activities.map<Item>((a) => ({
      kind: 'activity',
      data: a,
      t: new Date(a.createdAt).getTime(),
    })),
  ].sort((a, b) => b.t - a.t);

  return (
    <ul className="flex flex-col gap-3">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2 text-xs">
          {it.kind === 'comment' ? (
            <CommentItem comment={it.data} />
          ) : (
            <ActivityItem activity={it.data} />
          )}
        </li>
      ))}
    </ul>
  );
}

function CommentItem({ comment }: { comment: PublicApprovalComment }) {
  return (
    <>
      <UserAvatar
        name={comment.author.name}
        userId={comment.author.id}
        avatarUrl={comment.author.avatarUrl}
        size="xs"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-fg font-medium">{comment.author.name}</span>
          <span className="text-fg-muted text-[10px]">{formatDateTime(comment.createdAt)}</span>
        </div>
        <div className="text-fg mt-0.5 text-xs leading-relaxed">
          <RichEditor value={comment.body} readOnly onChange={() => undefined} />
        </div>
      </div>
    </>
  );
}

function ActivityItem({ activity }: { activity: PublicApprovalActivity }) {
  return (
    <>
      {activity.actor ? (
        <UserAvatar
          name={activity.actor.name}
          userId={activity.actor.id}
          avatarUrl={activity.actor.avatarUrl}
          size="xs"
        />
      ) : (
        <span className="bg-bg-muted size-5 shrink-0 rounded-full" />
      )}
      <div className="min-w-0 flex-1 text-[11px] leading-relaxed">
        <span className="text-fg">
          {activity.actor?.name ?? 'Sistema'} · {humanActivity(activity.type)}
        </span>
        <span className="text-fg-muted ml-1">{formatDateTime(activity.createdAt)}</span>
      </div>
    </>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
function humanActivity(type: string): string {
  const map: Record<string, string> = {
    CARD_CREATED: 'criou o card',
    CARD_UPDATED: 'atualizou o card',
    CARD_MOVED: 'moveu o card',
    CARD_COMPLETED: 'finalizou o card',
    CARD_UNCOMPLETED: 'reabriu o card',
    CARD_ARCHIVED: 'arquivou o card',
    COMMENT_CREATED: 'comentou',
    APPROVAL_REQUESTED: 'pediu aprovação',
    APPROVAL_APPROVED: 'aprovou',
    APPROVAL_REJECTED: 'reprovou',
  };
  return map[type] ?? type.toLowerCase().replace(/_/g, ' ');
}

function DecidedBanner({ approval }: { approval: PublicApprovalView['approval'] }) {
  const status = approval.status;
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
  if (status === 'CANCELED') {
    const who = approval.canceledBy?.name ?? 'a equipe';
    const when = approval.canceledAt
      ? new Date(approval.canceledAt).toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;
    return (
      <div className="border-fg-muted bg-bg-muted/40 mt-4 flex items-start gap-2 rounded-md border-l-2 px-3 py-3">
        <XCircle size={18} className="text-fg-muted mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium">Pedido de aprovação cancelado</p>
          <p className="text-fg-muted text-xs">
            Cancelado por {who}
            {when ? ` em ${when}` : ''}. Você não precisa mais decidir.
          </p>
          {approval.cancelReason && (
            <p className="text-fg-muted bg-bg/60 mt-2 rounded px-2 py-1 text-xs italic">
              Motivo: {approval.cancelReason}
            </p>
          )}
        </div>
      </div>
    );
  }
  return null;
}

function CenteredCard({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="bg-bg-muted/40 flex min-h-screen justify-center px-3 py-6 sm:px-4 sm:py-10">
      <div
        className={`bg-bg border-border h-fit w-full rounded-lg border p-4 shadow-md sm:p-6 ${
          wide ? 'max-w-2xl' : 'max-w-md'
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
