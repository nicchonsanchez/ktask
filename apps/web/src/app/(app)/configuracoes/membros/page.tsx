'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Copy, MailPlus, Trash2, Check, Loader2, Search, Send } from 'lucide-react';
import { ORG_ROLE_LABELS, OrgRoleSchema, type OrgRole } from '@ktask/contracts';

import { Button, Input, Label } from '@ktask/ui';
import {
  inviteMember,
  membersQueries,
  resendInvitation,
  revokeInvitation,
  type InvitationRow,
  type MemberRow,
} from '@/lib/queries/members';
import { useAuthStore } from '@/stores/auth-store';
import { ApiError } from '@/lib/api-client';
import { useConfirm, useNotify } from '@/components/ui/dialogs';
import { UserAvatar } from '@/components/user-avatar';
import { MemberDetailModal } from '@/components/settings/member-detail-modal';

const InviteSchema = z.object({
  email: z.string().email('E-mail inválido.').toLowerCase().trim(),
  role: OrgRoleSchema.exclude(['OWNER']),
  // Doc 35: telefone opcional pra envio via WhatsApp em paralelo ao email.
  // Campo livre — sanitizamos client-side antes de enviar; backend revalida.
  phone: z
    .string()
    .optional()
    .refine(
      (v) => !v || v.replace(/\D/g, '').length >= 10,
      'Telefone precisa de DDI+DDD+número (mín. 10 dígitos).',
    ),
});
type InviteInput = z.infer<typeof InviteSchema>;

const ROLE_OPTIONS: OrgRole[] = ['ADMIN', 'GESTOR', 'MEMBER', 'GUEST'];

export default function MembersPage() {
  const members = useQuery(membersQueries.all());
  const invites = useQuery(membersQueries.pendingInvitations());
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<OrgRole | 'ALL'>('ALL');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['org', 'members'] });
    queryClient.invalidateQueries({ queryKey: ['org', 'invitations'] });
  }

  const filtered = useMemo(() => {
    const all = members.data ?? [];
    const q = search.trim().toLowerCase();
    return all.filter((m) => {
      if (roleFilter !== 'ALL' && m.role !== roleFilter) return false;
      if (!q) return true;
      return (
        m.user.name.toLowerCase().includes(q) ||
        m.user.email.toLowerCase().includes(q) ||
        (m.user.phone ?? '').includes(q)
      );
    });
  }, [members.data, search, roleFilter]);

  return (
    <div className="container max-w-4xl py-8">
      <h1 className="text-2xl font-semibold">Membros</h1>
      <p className="text-fg-muted mt-1 text-sm">
        Gerencie quem tem acesso à sua organização e quais papéis assumem.
      </p>

      <section className="mt-8">
        <h2 className="text-fg-muted mb-3 text-xs font-semibold uppercase tracking-wide">
          Convidar novo membro
        </h2>
        <InviteForm onInvited={invalidate} />
      </section>

      <section className="mt-10">
        <h2 className="text-fg-muted mb-3 text-xs font-semibold uppercase tracking-wide">
          Convites pendentes
          {invites.data && invites.data.length > 0 && ` (${invites.data.length})`}
        </h2>
        {invites.isLoading && <p className="text-fg-muted text-sm">Carregando...</p>}
        {invites.data && invites.data.length === 0 && (
          <p className="text-fg-muted text-sm">Nenhum convite pendente.</p>
        )}
        {invites.data && invites.data.length > 0 && (
          <ul className="border-border bg-bg-subtle divide-border divide-y rounded-lg border">
            {invites.data.map((inv) => (
              <PendingInviteRow key={inv.id} invitation={inv} onChange={invalidate} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-fg-muted text-xs font-semibold uppercase tracking-wide">
            Membros ativos {filtered.length > 0 && `(${filtered.length})`}
          </h2>
          <div className="flex items-center gap-2">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as OrgRole | 'ALL')}
              className="border-border bg-bg h-8 rounded-md border px-2 text-xs"
            >
              <option value="ALL">Todos os papéis</option>
              {(['OWNER', 'ADMIN', 'GESTOR', 'MEMBER', 'GUEST'] as OrgRole[]).map((r) => (
                <option key={r} value={r}>
                  {ORG_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <div className="border-border bg-bg flex items-center gap-1.5 rounded-md border px-2 py-1">
              <Search size={12} className="text-fg-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-44 bg-transparent text-xs focus:outline-none"
              />
            </div>
          </div>
        </div>

        {members.isLoading && <p className="text-fg-muted text-sm">Carregando...</p>}
        {filtered.length === 0 && !members.isLoading && (
          <p className="text-fg-muted py-6 text-center text-sm">
            {search || roleFilter !== 'ALL' ? 'Nenhum membro com esse filtro.' : 'Sem membros.'}
          </p>
        )}
        {filtered.length > 0 && (
          <ul className="flex flex-col gap-2">
            {filtered.map((m) => (
              <MemberRowItem
                key={m.id}
                member={m}
                isSelf={m.userId === currentUser?.id}
                onClick={() => setSelectedUserId(m.userId)}
              />
            ))}
          </ul>
        )}
      </section>

      {selectedUserId && (
        <MemberDetailModal
          userId={selectedUserId}
          onClose={() => {
            setSelectedUserId(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function InviteForm({ onInvited }: { onInvited: () => void }) {
  const [lastToken, setLastToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteInput>({
    resolver: zodResolver(InviteSchema),
    defaultValues: { role: 'MEMBER' },
  });

  const mut = useMutation({
    mutationFn: (input: InviteInput) =>
      inviteMember({
        email: input.email,
        role: input.role,
        phone: input.phone?.replace(/\D/g, '') || undefined,
      }),
    onSuccess: (res) => {
      setLastToken(res.rawToken);
      setSubmitError(null);
      reset();
      onInvited();
    },
    onError: (err) => {
      setSubmitError(err instanceof ApiError ? err.message : 'Falha ao enviar convite.');
    },
  });

  const inviteUrl =
    lastToken && typeof window !== 'undefined'
      ? `${window.location.origin}/convite/${lastToken}`
      : null;

  return (
    <form
      onSubmit={handleSubmit((v) => mut.mutate(v))}
      className="border-border bg-bg-subtle rounded-lg border p-4"
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_180px_180px_auto]">
        <div className="flex flex-col gap-1">
          <Label htmlFor="invite-email">E-mail</Label>
          <Input
            id="invite-email"
            type="email"
            placeholder="fulano@empresa.com"
            error={!!errors.email}
            {...register('email')}
          />
          {errors.email && <p className="text-danger text-xs">{errors.email.message}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="invite-phone">
            WhatsApp <span className="text-fg-subtle text-[10px]">(opcional)</span>
          </Label>
          <Input
            id="invite-phone"
            type="tel"
            placeholder="5531999999999"
            error={!!errors.phone}
            {...register('phone')}
          />
          {errors.phone && <p className="text-danger text-xs">{errors.phone.message}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="invite-role">Papel</Label>
          <select
            id="invite-role"
            className="border-border bg-bg h-9 rounded-md border px-2 text-sm"
            {...register('role')}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {ORG_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={mut.isPending} className="w-full">
            {mut.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <MailPlus size={14} />
            )}
            Convidar
          </Button>
        </div>
      </div>

      {submitError && (
        <p role="alert" className="bg-danger-subtle text-danger mt-3 rounded-md px-3 py-2 text-xs">
          {submitError}
        </p>
      )}

      {inviteUrl && (
        <div className="bg-bg-emphasis text-fg-muted mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-xs">
          <span className="flex-1 truncate font-mono">{inviteUrl}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(inviteUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
        </div>
      )}

      <p className="text-fg-subtle mt-2 text-[11px]">
        O e-mail ainda não é enviado automaticamente (v1). Copie o link e envie para o convidado.
      </p>
    </form>
  );
}

function PendingInviteRow({
  invitation,
  onChange,
}: {
  invitation: InvitationRow;
  onChange: () => void;
}) {
  const confirm = useConfirm();
  const notify = useNotify();
  const revoke = useMutation({
    mutationFn: () => revokeInvitation(invitation.id),
    onSuccess: onChange,
  });
  const resend = useMutation({
    mutationFn: () => resendInvitation(invitation.id),
    onSuccess: () => {
      const channels = invitation.phone ? 'e-mail e WhatsApp' : 'e-mail';
      notify.success(`Convite reenviado por ${channels}.`);
      onChange();
    },
    onError: (err) =>
      notify.error(err instanceof ApiError ? err.message : 'Falha ao reenviar convite.'),
  });

  return (
    <li className="flex items-center gap-3 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{invitation.email}</p>
        <p className="text-fg-muted mt-0.5 text-xs">
          Papel: <span className="text-fg">{ORG_ROLE_LABELS[invitation.role]}</span> · Enviado por{' '}
          {invitation.invitedBy.name} · Expira{' '}
          {new Date(invitation.expiresAt).toLocaleDateString('pt-BR')}
          {invitation.phone && ` · WhatsApp ${invitation.phone}`}
        </p>
      </div>
      <button
        type="button"
        onClick={() => resend.mutate()}
        disabled={resend.isPending || revoke.isPending}
        title="Gera novo link e dispara nos canais configurados (link antigo deixa de valer)"
        className="text-fg-muted hover:text-primary inline-flex items-center gap-1 text-xs disabled:opacity-50"
      >
        {resend.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
        Reenviar
      </button>
      <button
        type="button"
        onClick={async () => {
          if (
            await confirm({
              title: 'Revogar convite?',
              description: `O convite para ${invitation.email} deixará de ser válido.`,
              confirmLabel: 'Revogar',
              danger: true,
            })
          )
            revoke.mutate();
        }}
        disabled={revoke.isPending || resend.isPending}
        className="text-fg-muted hover:text-danger inline-flex items-center gap-1 text-xs disabled:opacity-50"
      >
        <Trash2 size={12} /> Revogar
      </button>
    </li>
  );
}

function MemberRowItem({
  member,
  isSelf,
  onClick,
}: {
  member: MemberRow;
  isSelf: boolean;
  onClick: () => void;
}) {
  const roleColors: Record<OrgRole, string> = {
    OWNER: 'bg-primary-subtle/60 text-primary',
    ADMIN: 'bg-warning-subtle text-warning',
    GESTOR: 'bg-bg-emphasis text-fg',
    MEMBER: 'bg-bg-muted text-fg-muted',
    GUEST: 'bg-bg-muted text-fg-subtle',
  };

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="border-border bg-bg hover:border-border-strong hover:bg-bg-muted/30 flex w-full items-center gap-3 rounded-md border p-3 text-left text-sm transition-colors"
      >
        <UserAvatar
          name={member.user.name}
          userId={member.userId}
          avatarUrl={member.user.avatarUrl}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-fg truncate font-medium">{member.user.name}</span>
            {isSelf && <span className="text-fg-muted text-[11px]">(você)</span>}
          </div>
          <p className="text-fg-muted mt-0.5 flex items-center gap-2 truncate text-[11px]">
            <span className="truncate">{member.user.email}</span>
            {member.user.phone && <span className="text-fg-subtle">· {member.user.phone}</span>}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${roleColors[member.role]}`}
        >
          {ORG_ROLE_LABELS[member.role]}
        </span>
      </button>
    </li>
  );
}
