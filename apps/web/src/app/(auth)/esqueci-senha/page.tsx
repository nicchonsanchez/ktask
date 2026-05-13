'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, CheckCircle2, Loader2, Mail } from 'lucide-react';

import { Button, Input, Label } from '@ktask/ui';
import { api } from '@/lib/api-client';

const Schema = z.object({
  email: z.string().email('Email inválido.').max(255),
});
type FormValues = z.infer<typeof Schema>;

/**
 * Doc 43: solicita link de redefinicao de senha por email.
 * Sempre exibe sucesso (anti-enumeracao) — server retorna 200 mesmo se
 * email nao existir.
 */
export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    getValues,
  } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    try {
      await api.post('/api/v1/auth/forgot-password', { email: values.email });
      setSubmitted(true);
    } catch (e) {
      // 429 vira mensagem amigavel; outros viram texto cru
      const status = (e as { status?: number })?.status;
      if (status === 429) {
        setSubmitError('Muitas tentativas. Aguarde 15 minutos.');
      } else {
        setSubmitError('Não foi possível processar. Tente novamente.');
      }
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="bg-bg-subtle border-border w-full max-w-md rounded-xl border p-8 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <div className="bg-success-subtle text-success mb-4 inline-flex size-12 items-center justify-center rounded-full">
              <CheckCircle2 size={24} />
            </div>
            <h1 className="text-fg text-lg font-semibold">Confira seus canais</h1>
            <p className="text-fg-muted mt-2 text-sm leading-relaxed">
              Se <strong className="text-fg">{getValues('email')}</strong> tem conta no KTask, você
              receberá um link pra redefinir sua senha em alguns minutos — pelo{' '}
              <strong className="text-fg">e-mail</strong> e também pelo{' '}
              <strong className="text-fg">WhatsApp</strong>, se você tem telefone cadastrado. O link
              vale por 1 hora.
            </p>
            <p className="text-fg-subtle mt-4 text-xs">
              Não chegou? Verifique a pasta de spam do e-mail, ou{' '}
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                className="text-primary hover:underline"
              >
                tente outro email
              </button>
              .
            </p>
            <Link
              href="/entrar"
              className="text-fg-muted hover:text-fg mt-6 inline-flex items-center gap-1 text-xs"
            >
              <ArrowLeft size={12} /> Voltar pro login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="bg-bg-subtle border-border w-full max-w-md rounded-xl border p-8 shadow-sm">
        <Link
          href="/entrar"
          className="text-fg-muted hover:text-fg mb-4 inline-flex items-center gap-1 text-xs"
        >
          <ArrowLeft size={12} /> Voltar pro login
        </Link>
        <h1 className="text-fg text-xl font-semibold">Esqueci minha senha</h1>
        <p className="text-fg-muted mt-1 text-sm">
          Digite seu e-mail — enviaremos o link de redefinição por <strong>e-mail</strong> e também
          por <strong>WhatsApp</strong> (se você tem telefone cadastrado).
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="voce@exemplo.com"
              error={!!errors.email}
              {...register('email')}
            />
            {errors.email && <p className="text-danger text-xs">{errors.email.message}</p>}
          </div>

          {submitError && (
            <p className="bg-danger-subtle text-danger rounded-md px-3 py-2 text-sm">
              {submitError}
            </p>
          )}

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
            Enviar link
          </Button>
        </form>
      </div>
    </div>
  );
}
