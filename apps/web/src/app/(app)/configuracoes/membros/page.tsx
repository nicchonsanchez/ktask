'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Copy, MailPlus, Trash2, UserX, Check, Loader2 } from 'lucide-react';
import { ORG_ROLE_LABELS, OrgRoleSchema, type OrgRole } from '@ktask/contracts';

import { Button, Input, Label } from '@ktask/ui';
import {
  inviteMember,
  membersQueries,
  removeMember,
  revokeInvitation,
  updateMemberRole,
  type InvitationRow,
  type MemberRow,
} from '@/lib/queries/members';
import { useAuthStore } from '@/stores/auth-store';
import { ApiError } from '@/lib/api-client';
import { useConfirm } from '@/components/ui/dialogs';

const InviteSchema = z.object({
  email: z.string().email('E-mail inválido.').toLowerCase().trim(),
  role: OrgRoleSchema.exclude(['OWNER']),
});
type InviteInput = z.infer<typeof InviteSchema>;

const ROLE_OPTIONS: OrgRole[] = ['ADMIN', 'GESTOR', 'MEMBER', 'GUEST'];

export default function MembersPage() {
  const members = useQuery(membersQueries.all());
  const invites = useQuery(membersQueries.pendingInvitations());
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['org', 'members'] });
    queryClient.invalidateQueries({ queryKey: ['org', 'invitations'] });
  }

  return (
    <div className="container max-w-4xl py-10">
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
        <h2 className="text-fg-muted mb-3 text-xs font-semibold uppercase tracking-wide">
          Membros ativos
        </h2>
        {members.isLoading && <p className="text-fg-muted text-sm">Carregando...</p>}
        {members.data && members.data.length > 0 && (
          <ul className="border-border bg-bg-subtle divide-border divide-y rounded-lg border">
            {members.data.map((m) => (
              <MemberRowItem
                key={m.id}
                member={m}
                isSelf={m.userId === currentUser?.id}
                onChange={invalidate}
              />
            ))}
          </ul>
        )}
      </section>
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
    mutationFn: (input: InviteInput) => inviteMember(input.email, input.role),
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
      <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
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
  const revoke = useMutation({
    mutationFn: () => revokeInvitation(invitation.id),
    onSuccess: onChange,
  });

  return (
    <li className="flex items-center gap-3 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{invitation.email}</p>
        <p className="text-fg-muted mt-0.5 text-xs">
          Papel: <span className="text-fg">{ORG_ROLE_LABELS[invitation.role]}</span> · Enviado por{' '}
          {invitation.invitedBy.name} · Expira{' '}
          {new Date(invitation.expiresAt).toLocaleDateString('pt-BR')}
        </p>
      </div>
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
        disabled={revoke.isPending}
        className="text-fg-muted hover:text-danger inline-flex items-center gap-1 text-xs"
      >
        <Trash2 size={12} /> Revogar
      </button>
    </li>
  );
}

function MemberRowItem({
  member,
  isSelf,
  onChange,
}: {
  member: MemberRow;
  isSelf: boolean;
  onChange: () => void;
}) {
  const confirm = useConfirm();
  const roleMut = useMutation({
    mutationFn: (role: OrgRole) => updateMemberRole(member.userId, role),
    onSuccess: onChange,
  });

  const removeMut = useMutation({
    mutationFn: () => removeMember(member.userId),
    onSuccess: onChange,
  });

  const initials = member.user.name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <li className="flex items-center gap-3 px-4 py-3 text-sm">
      <div className="bg-primary-subtle text-primary flex size-9 items-center justify-center rounded-full text-xs font-semibold">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {member.user.name}
          {isSelf && <span className="text-fg-muted ml-1 text-xs">(você)</span>}
        </p>
        <p className="text-fg-muted truncate text-xs">{member.user.email}</p>
      </div>

      <select
        value={member.role}
        onChange={(e) => roleMut.mutate(e.target.value as OrgRole)}
        disabled={roleMut.isPending || member.role === 'OWNER'}
        className="border-border bg-bg h-8 rounded-md border px-2 text-xs disabled:opacity-60"
      >
        {(['OWNER', 'ADMIN', 'GESTOR', 'MEMBER', 'GUEST'] as OrgRole[]).map((r) => (
          <option key={r} value={r}>
            {ORG_ROLE_LABELS[r]}
          </option>
        ))}
      </select>

      {!isSelf && member.role !== 'OWNER' && (
        <button
          type="button"
          onClick={async () => {
            if (
              await confirm({
                title: `Remover ${member.user.name}?`,
                description:
                  'O membro perderá acesso à organização e não conseguirá mais entrar. Quem comentou ou trabalhou em cards continua visível no histórico.',
                confirmLabel: 'Remover',
                danger: true,
              })
            )
              removeMut.mutate();
          }}
          disabled={removeMut.isPending}
          className="text-fg-muted hover:text-danger inline-flex size-8 items-center justify-center rounded-md"
          title="Remover"
        >
          <UserX size={14} />
        </button>
      )}
    </li>
  );
}
