'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, MailCheck } from 'lucide-react';

import { Button } from '@ktask/ui';
import { api } from '@/lib/api-client';

/**
 * Doc 53: confirma troca de email pedida por admin. Token chega por email
 * no NOVO endereco (48h, single-use). Confirmacao exige clique — nao roda
 * no carregamento pra scanners de link nao consumirem o token.
 */
export default function ConfirmEmailChangePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [confirmedEmail, setConfirmedEmail] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ ok: boolean; email: string }>(
        '/api/v1/auth/confirm-email-change',
        { token },
      );
      setConfirmedEmail(res.email);
    } catch (e) {
      const status = (e as { status?: number })?.status;
      const message = (e as { message?: string })?.message;
      if (status === 429) {
        setError('Muitas tentativas. Aguarde 15 minutos.');
      } else if (status === 400 || status === 409) {
        setError(message || 'Link inválido ou expirado. Peça ao administrador para reenviar.');
      } else {
        setError('Não foi possível confirmar. Tente novamente.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmedEmail) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="bg-bg border-border w-full max-w-md rounded-lg border p-8 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <div className="bg-success-subtle text-success mb-4 inline-flex size-12 items-center justify-center rounded-full">
              <CheckCircle2 size={24} />
            </div>
            <h1 className="text-fg text-lg font-semibold">E-mail confirmado</h1>
            <p className="text-fg-muted mt-2 text-sm leading-relaxed">
              A partir de agora, entre no KTask com <strong>{confirmedEmail}</strong>. Sua senha
              continua a mesma.
            </p>
            <Link href="/entrar" className="text-primary mt-4 text-sm font-medium hover:underline">
              Ir para o login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="bg-bg border-border w-full max-w-md rounded-lg border p-8 shadow-sm">
        <Link
          href="/entrar"
          className="text-fg-muted hover:text-fg mb-4 inline-flex items-center gap-1 text-xs"
        >
          <ArrowLeft size={12} /> Voltar pro login
        </Link>
        <h1 className="text-fg text-xl font-semibold">Confirmar novo e-mail</h1>
        <p className="text-fg-muted mt-1 text-sm">
          Um administrador pediu para trocar o e-mail da sua conta para este endereço. Confirme para
          concluir. Depois disso, o login passa a ser com o novo e-mail.
        </p>

        {error && (
          <p className="bg-danger-subtle text-danger mt-6 rounded-md px-3 py-2 text-sm">{error}</p>
        )}

        <Button type="button" onClick={onConfirm} disabled={submitting} className="mt-6 w-full">
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <MailCheck size={16} />}
          Confirmar novo e-mail
        </Button>
      </div>
    </div>
  );
}
