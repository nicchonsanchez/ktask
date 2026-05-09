'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';

import { Button, Input, Label } from '@ktask/ui';
import { api } from '@/lib/api-client';

const Schema = z
  .object({
    newPassword: z.string().min(8, 'Mínimo 8 caracteres.').max(200),
    confirm: z.string().min(8),
  })
  .refine((v) => v.newPassword === v.confirm, {
    message: 'As senhas não conferem.',
    path: ['confirm'],
  });
type FormValues = z.infer<typeof Schema>;

/**
 * Doc 43: redefine senha com token recebido por email. Token validado
 * no submit (1h TTL, single-use). Sucesso revoga todas as sessoes ativas.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { newPassword: '', confirm: '' },
  });

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    try {
      await api.post('/api/v1/auth/reset-password', {
        token,
        newPassword: values.newPassword,
      });
      setSubmitted(true);
      setTimeout(() => router.replace('/entrar'), 2500);
    } catch (e) {
      const status = (e as { status?: number })?.status;
      const message = (e as { message?: string })?.message;
      if (status === 429) {
        setSubmitError('Muitas tentativas. Aguarde 15 minutos.');
      } else if (status === 400) {
        setSubmitError(message || 'Link inválido ou expirado. Solicite um novo.');
      } else {
        setSubmitError('Não foi possível redefinir. Tente novamente.');
      }
    }
  }

  if (submitted) {
    return (
      <div className="bg-bg border-border w-full max-w-md rounded-lg border p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="bg-success-subtle text-success mb-4 inline-flex size-12 items-center justify-center rounded-full">
            <CheckCircle2 size={24} />
          </div>
          <h1 className="text-fg text-lg font-semibold">Senha redefinida</h1>
          <p className="text-fg-muted mt-2 text-sm leading-relaxed">
            Tudo certo. Suas sessões anteriores foram desconectadas. Redirecionando pro login…
          </p>
          <Loader2 size={18} className="text-fg-muted mt-4 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bg border-border w-full max-w-md rounded-lg border p-8 shadow-sm">
      <Link
        href="/entrar"
        className="text-fg-muted hover:text-fg mb-4 inline-flex items-center gap-1 text-xs"
      >
        <ArrowLeft size={12} /> Voltar pro login
      </Link>
      <h1 className="text-fg text-xl font-semibold">Definir nova senha</h1>
      <p className="text-fg-muted mt-1 text-sm">
        Escolha uma senha forte. Mínimo 8 caracteres. Suas sessões abertas vão ser desconectadas
        depois.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="newPassword">Nova senha</Label>
          <div className="relative">
            <Input
              id="newPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              autoFocus
              error={!!errors.newPassword}
              className="pr-10"
              {...register('newPassword')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              className="text-fg-muted hover:text-fg absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {errors.newPassword && (
            <p className="text-danger text-xs">{errors.newPassword.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm">Confirmar nova senha</Label>
          <Input
            id="confirm"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            error={!!errors.confirm}
            {...register('confirm')}
          />
          {errors.confirm && <p className="text-danger text-xs">{errors.confirm.message}</p>}
        </div>

        {submitError && (
          <p className="bg-danger-subtle text-danger rounded-md px-3 py-2 text-sm">{submitError}</p>
        )}

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
          Redefinir senha
        </Button>
      </form>
    </div>
  );
}
