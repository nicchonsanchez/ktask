'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Loader2, ShieldCheck, MailCheck, UserPlus } from 'lucide-react';
import { ORG_ROLE_LABELS } from '@ktask/contracts';

import { Button } from '@ktask/ui';
import {
  acceptInvitation,
  previewInvitation,
  signupFromInvite,
  type InvitePreview,
  type SignupFromInviteResult,
} from '@/lib/queries/members';
import { ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Pagina de convite (doc 34): 3 caminhos.
 *  1. Email do convite ja tem User (preview.userExists=true) E user logado:
 *     mostra "aceitar" (fluxo legado).
 *  2. Email tem User mas nao esta logado: redireciona pra /entrar.
 *  3. Email NAO tem User: mostra form de cadastro inline (nome + senha).
 *     Submit cria User + Membership + loga, redireciona pra /.
 */
export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params.token;
  const { user, initialized, setSession } = useAuthStore();

  const preview = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => previewInvitation(token),
    retry: false,
  });

  const acceptMut = useMutation({
    mutationFn: () => acceptInvitation(token),
    onSuccess: () => router.replace('/'),
  });

  // Redireciona pra login só quando email JA TEM User cadastrado e usuario
  // nao esta logado. Se o email nao existe, fica na pagina pra mostrar o
  // form de cadastro.
  useEffect(() => {
    if (!initialized || user) return;
    if (preview.data && preview.data.userExists === true) {
      router.replace(`/entrar?next=${encodeURIComponent(`/convite/${token}`)}`);
    }
  }, [initialized, user, preview.data, router, token]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="bg-bg-subtle border-border w-full max-w-md rounded-xl border p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="bg-primary text-primary-fg flex size-10 items-center justify-center rounded-md font-bold">
            K
          </div>
          <div>
            <h1 className="font-semibold">Convite para KTask</h1>
            <p className="text-fg-muted text-xs">Aceite para entrar na organização</p>
          </div>
        </div>

        {preview.isLoading && (
          <div className="text-fg-muted flex items-center gap-2 text-sm">
            <Loader2 size={14} className="animate-spin" />
            Verificando convite...
          </div>
        )}

        {preview.error && <InviteError error={preview.error as unknown as Error} />}

        {preview.data && preview.data.userExists && user && (
          <AcceptView
            preview={preview.data}
            userEmail={user.email}
            accepting={acceptMut.isPending}
            onAccept={() => acceptMut.mutate()}
            errorMessage={acceptMut.error instanceof ApiError ? acceptMut.error.message : null}
          />
        )}

        {preview.data && !preview.data.userExists && (
          <SignupView
            preview={preview.data}
            token={token}
            onSuccess={(result) => {
              setSession({
                accessToken: result.accessToken,
                user: result.user,
              });
              router.replace('/');
            }}
          />
        )}
      </div>
    </div>
  );
}

function InviteError({ error }: { error: Error }) {
  const message = error instanceof ApiError ? error.message : 'Convite inválido ou expirado.';
  return (
    <div className="bg-danger-subtle text-danger rounded-md px-3 py-3 text-sm">
      <p className="font-medium">Não foi possível abrir o convite</p>
      <p className="text-xs">{message}</p>
    </div>
  );
}

function AcceptView({
  preview,
  userEmail,
  accepting,
  onAccept,
  errorMessage,
}: {
  preview: InvitePreview;
  userEmail: string;
  accepting: boolean;
  onAccept: () => void;
  errorMessage: string | null;
}) {
  const mismatch = preview.email.toLowerCase() !== userEmail.toLowerCase();
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <PreviewCard preview={preview} />

      {mismatch && (
        <p className="bg-warning-subtle text-warning rounded-md px-3 py-2 text-xs">
          O convite foi enviado para <strong>{preview.email}</strong>, mas você está autenticado
          como <strong>{userEmail}</strong>. Faça login com a conta correta.
        </p>
      )}

      {errorMessage && (
        <p className="bg-danger-subtle text-danger rounded-md px-3 py-2 text-xs">{errorMessage}</p>
      )}

      <Button
        onClick={() => {
          setAccepted(true);
          onAccept();
        }}
        disabled={mismatch || accepting || accepted}
      >
        {accepting ? <Loader2 size={14} className="animate-spin" /> : <MailCheck size={14} />}
        Aceitar convite
      </Button>

      {!mismatch && (
        <p className="text-fg-subtle flex items-center gap-1 text-xs">
          <ShieldCheck size={12} /> Você será adicionado como{' '}
          <strong>{ORG_ROLE_LABELS[preview.role]}</strong>.
        </p>
      )}
    </div>
  );
}

/**
 * Doc 34: form de cadastro pra usuario novo. Email vem read-only do
 * convite. Senha minima 8 caracteres (alinhado com backend).
 */
function SignupView({
  preview,
  token,
  onSuccess,
}: {
  preview: InvitePreview;
  token: string;
  onSuccess: (result: SignupFromInviteResult) => void;
}) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const signupMut = useMutation({
    mutationFn: () => signupFromInvite({ token, name: name.trim(), password }),
    onSuccess: (result) => {
      setError(null);
      onSuccess(result);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Erro ao criar conta.'),
  });

  const passwordTooShort = password.length > 0 && password.length < 8;
  const passwordMismatch = confirm.length > 0 && password !== confirm;
  const canSubmit =
    name.trim().length >= 2 && password.length >= 8 && password === confirm && !signupMut.isPending;

  return (
    <div className="flex flex-col gap-4">
      <PreviewCard preview={preview} />

      <p className="text-fg-muted text-xs">
        Você ainda não tem conta. Defina seu nome e uma senha para entrar:
      </p>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) signupMut.mutate();
        }}
      >
        <div className="flex flex-col gap-1">
          <label className="text-fg-muted text-[11px] font-medium">E-mail</label>
          <input
            type="email"
            value={preview.email}
            readOnly
            className="border-border bg-bg-muted/40 rounded-md border px-2 py-1.5 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-fg-muted text-[11px] font-medium">Nome completo</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Seu nome"
            className="border-border focus:border-primary rounded-md border px-2 py-1.5 text-sm focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-fg-muted text-[11px] font-medium">Senha (mín. 8 caracteres)</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="border-border focus:border-primary rounded-md border px-2 py-1.5 text-sm focus:outline-none"
          />
          {passwordTooShort && (
            <p className="text-danger text-[11px]">Senha precisa de pelo menos 8 caracteres.</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-fg-muted text-[11px] font-medium">Confirme a senha</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className="border-border focus:border-primary rounded-md border px-2 py-1.5 text-sm focus:outline-none"
          />
          {passwordMismatch && <p className="text-danger text-[11px]">As senhas não coincidem.</p>}
        </div>

        {error && (
          <p className="bg-danger-subtle text-danger rounded-md px-3 py-2 text-xs">{error}</p>
        )}

        <Button type="submit" disabled={!canSubmit}>
          {signupMut.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <UserPlus size={14} />
          )}
          Criar conta e entrar
        </Button>
      </form>

      <p className="text-fg-subtle flex items-center gap-1 text-xs">
        <ShieldCheck size={12} /> Você entrará como <strong>{ORG_ROLE_LABELS[preview.role]}</strong>
        .
      </p>
    </div>
  );
}

function PreviewCard({ preview }: { preview: InvitePreview }) {
  return (
    <div className="border-border rounded-lg border p-4">
      <p className="text-fg-muted text-xs">Você foi convidado para</p>
      <p className="text-xl font-semibold">{preview.organization.name}</p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-fg-muted">E-mail do convite:</dt>
        <dd className="font-medium">{preview.email}</dd>
        <dt className="text-fg-muted">Papel:</dt>
        <dd className="font-medium">{ORG_ROLE_LABELS[preview.role]}</dd>
        <dt className="text-fg-muted">Expira em:</dt>
        <dd className="font-medium">{new Date(preview.expiresAt).toLocaleString('pt-BR')}</dd>
      </dl>
    </div>
  );
}
