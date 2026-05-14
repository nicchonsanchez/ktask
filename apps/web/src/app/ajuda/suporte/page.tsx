import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, MessageCircle } from 'lucide-react';

import { HelpBreadcrumb } from '@/components/ajuda/help-breadcrumb';
import { SupportFaq } from '@/components/support/support-faq';
import { SupportForm } from '@/components/support/support-form';

export const metadata: Metadata = {
  title: 'Suporte',
  description: 'Tire dúvidas, reporte problemas ou envie sugestões para o time do KTask.',
};

export default function SuportePage() {
  return (
    <div className="container py-8">
      <HelpBreadcrumb items={[{ label: 'Ajuda', href: '/ajuda' }, { label: 'Suporte' }]} />

      <div className="mx-auto max-w-2xl space-y-10">
        <header>
          <h1 className="text-fg text-2xl font-bold tracking-tight sm:text-3xl">
            Fale com o suporte
          </h1>
          <p className="text-fg-muted mt-2 text-sm sm:text-base">
            Não achou a resposta nos tutoriais? Conta o que está acontecendo que a equipe responde
            em horário comercial.
          </p>
        </header>

        <SupportFaq />

        <section aria-labelledby="form-title" className="space-y-4">
          <h2 id="form-title" className="text-fg text-lg font-semibold tracking-tight">
            Envie sua mensagem
          </h2>
          <SupportForm />
        </section>

        <section aria-labelledby="canais-title" className="space-y-4">
          <h2 id="canais-title" className="text-fg text-lg font-semibold tracking-tight">
            Outros canais
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <a
              href="mailto:suporte@agenciakharis.com.br"
              className="border-border bg-bg hover:border-primary/40 hover:bg-bg-subtle group flex flex-col gap-2 rounded-lg border p-5 transition-colors"
            >
              <div className="bg-primary-subtle text-primary flex size-9 items-center justify-center rounded-lg">
                <Mail size={16} aria-hidden />
              </div>
              <h3 className="text-fg group-hover:text-primary text-sm font-semibold transition-colors">
                E-mail
              </h3>
              <p className="text-fg-muted text-xs">suporte@agenciakharis.com.br</p>
            </a>
            <a
              href="https://wa.me/5531993767301"
              target="_blank"
              rel="noopener noreferrer"
              className="border-border bg-bg hover:border-primary/40 hover:bg-bg-subtle group flex flex-col gap-2 rounded-lg border p-5 transition-colors"
            >
              <div className="bg-primary-subtle text-primary flex size-9 items-center justify-center rounded-lg">
                <MessageCircle size={16} aria-hidden />
              </div>
              <h3 className="text-fg group-hover:text-primary text-sm font-semibold transition-colors">
                WhatsApp
              </h3>
              <p className="text-fg-muted text-xs">Horário comercial</p>
            </a>
          </div>
        </section>

        <div className="text-center">
          <Link href="/ajuda" className="text-primary text-sm hover:underline">
            ← Voltar para a Central de Ajuda
          </Link>
        </div>
      </div>
    </div>
  );
}
