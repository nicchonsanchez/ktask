'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

import { env } from '@/lib/env';

type Categoria = 'duvida' | 'problema' | 'sugestao' | 'outro';

const CATEGORIA_OPTIONS: ReadonlyArray<{ value: Categoria; label: string }> = [
  { value: 'duvida', label: 'Dúvida' },
  { value: 'problema', label: 'Problema' },
  { value: 'sugestao', label: 'Sugestão' },
  { value: 'outro', label: 'Outro' },
];

interface FormState {
  nome: string;
  email: string;
  telefone: string;
  categoria: Categoria | '';
  mensagem: string;
  /** Honeypot — invisível pro usuário; bots preenchem. */
  website: string;
}

const initialState: FormState = {
  nome: '',
  email: '',
  telefone: '',
  categoria: '',
  mensagem: '',
  website: '',
};

interface SuccessState {
  ticketCode: string;
  message: string;
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

export function SupportForm() {
  const [form, setForm] = useState<FormState>(initialState);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  function validate(): boolean {
    const next: FieldErrors = {};
    if (form.nome.trim().length < 2) next.nome = 'Informe seu nome (mínimo 2 caracteres).';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = 'E-mail inválido.';
    }
    if (!form.categoria) next.categoria = 'Escolha uma categoria.';
    if (form.mensagem.trim().length < 10) {
      next.mensagem = 'Conte um pouco mais (mínimo 10 caracteres).';
    } else if (form.mensagem.length > 2000) {
      next.mensagem = 'Mensagem muito longa (máximo 2000 caracteres).';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGlobalError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const referrer =
        typeof document !== 'undefined' && document.referrer ? document.referrer : undefined;

      const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/v1/support-tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: form.nome.trim(),
          email: form.email.trim(),
          telefone: form.telefone.trim() || undefined,
          categoria: form.categoria,
          mensagem: form.mensagem.trim(),
          urlOrigem: referrer,
          website: form.website,
        }),
      });

      if (res.status === 429) {
        setGlobalError(
          'Você enviou muitas mensagens em pouco tempo. Aguarde alguns minutos e tente de novo.',
        );
        return;
      }

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          message?: string;
          errors?: { fields?: Record<string, string[] | undefined> };
        } | null;
        const fieldsFromApi = payload?.errors?.fields;
        if (fieldsFromApi) {
          const apiErrors: FieldErrors = {};
          for (const [field, msgs] of Object.entries(fieldsFromApi)) {
            const first = msgs?.[0];
            if (first && field in initialState) {
              apiErrors[field as keyof FormState] = first;
            }
          }
          if (Object.keys(apiErrors).length > 0) {
            setErrors(apiErrors);
            return;
          }
        }
        setGlobalError(
          payload?.message ?? 'Não conseguimos enviar agora. Tente novamente em instantes.',
        );
        return;
      }

      const data = (await res.json()) as SuccessState;
      setSuccess(data);
      setForm(initialState);
    } catch {
      setGlobalError('Sem conexão com o servidor. Verifique sua internet e tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div
        role="status"
        className="border-primary/40 bg-primary-subtle text-fg rounded-lg border p-6"
      >
        <div className="flex items-start gap-3">
          <CheckCircle2 className="text-primary mt-0.5 shrink-0" size={20} aria-hidden />
          <div className="flex-1">
            <p className="font-semibold">
              Recebemos sua mensagem <span className="font-mono">{success.ticketCode}</span>.
            </p>
            <p className="text-fg-muted mt-1 text-sm leading-relaxed">{success.message}</p>
            <button
              type="button"
              onClick={() => setSuccess(null)}
              className="text-primary mt-4 text-sm hover:underline"
            >
              Enviar outra mensagem
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {/* Honeypot — escondido fora da tela. Bots preenchem campos invisíveis. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '-10000px',
          top: 'auto',
          width: 1,
          height: 1,
          overflow: 'hidden',
        }}
      >
        <label>
          Não preencha este campo
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
          />
        </label>
      </div>

      <Field label="Nome" htmlFor="sup-nome" error={errors.nome}>
        <input
          id="sup-nome"
          type="text"
          required
          maxLength={100}
          autoComplete="name"
          value={form.nome}
          onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
          className={inputClass(Boolean(errors.nome))}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="E-mail" htmlFor="sup-email" error={errors.email}>
          <input
            id="sup-email"
            type="email"
            required
            maxLength={200}
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className={inputClass(Boolean(errors.email))}
          />
        </Field>
        <Field label="Telefone (opcional)" htmlFor="sup-telefone" error={errors.telefone}>
          <input
            id="sup-telefone"
            type="tel"
            maxLength={40}
            autoComplete="tel"
            value={form.telefone}
            onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
            className={inputClass(Boolean(errors.telefone))}
          />
        </Field>
      </div>

      <Field label="Categoria" htmlFor="sup-categoria" error={errors.categoria}>
        <select
          id="sup-categoria"
          required
          value={form.categoria}
          onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value as Categoria | '' }))}
          className={inputClass(Boolean(errors.categoria))}
        >
          <option value="">Selecione</option>
          {CATEGORIA_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Mensagem"
        htmlFor="sup-mensagem"
        error={errors.mensagem}
        hint={`${form.mensagem.length}/2000`}
      >
        <textarea
          id="sup-mensagem"
          required
          rows={6}
          maxLength={2000}
          value={form.mensagem}
          onChange={(e) => setForm((f) => ({ ...f, mensagem: e.target.value }))}
          placeholder="Descreva sua dúvida, problema ou sugestão. Se for um bug, conte o passo a passo do que aconteceu."
          className={inputClass(Boolean(errors.mensagem))}
        />
      </Field>

      {globalError && (
        <div
          role="alert"
          className="border-danger/40 bg-danger-subtle text-fg flex items-start gap-2 rounded-lg border p-3 text-sm"
        >
          <AlertCircle className="text-danger mt-0.5 shrink-0" size={16} aria-hidden />
          <span>{globalError}</span>
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-fg-muted text-xs">
          Respondemos por e-mail em horário comercial. Para urgências, use o WhatsApp abaixo.
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="bg-primary text-primary-fg hover:bg-primary-hover focus-visible:ring-primary/40 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="animate-spin" size={16} aria-hidden /> Enviando…
            </>
          ) : (
            'Enviar mensagem'
          )}
        </button>
      </div>
    </form>
  );
}

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={htmlFor} className="text-fg text-sm font-medium">
          {label}
        </label>
        {hint && <span className="text-fg-muted text-xs">{hint}</span>}
      </div>
      {children}
      {error && (
        <p className="text-danger text-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function inputClass(hasError: boolean): string {
  return [
    'bg-bg text-fg w-full rounded-md border px-3 py-2 text-sm',
    'focus:outline-none focus:ring-2 focus:ring-primary/40',
    hasError ? 'border-danger' : 'border-border',
  ].join(' ');
}
