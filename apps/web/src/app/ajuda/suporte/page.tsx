import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, MessageCircle, Construction } from 'lucide-react';
import { HelpBreadcrumb } from '@/components/ajuda/help-breadcrumb';

export const metadata: Metadata = {
  title: 'Suporte',
  description: 'Fale com o time do KTask: tire dúvidas, reporte problemas ou peça ajuda.',
};

export default function SuportePage() {
  return (
    <div className="container py-8">
      <HelpBreadcrumb items={[{ label: 'Ajuda', href: '/ajuda' }, { label: 'Suporte' }]} />

      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <h1 className="text-fg text-2xl font-bold tracking-tight sm:text-3xl">
            Fale com o suporte
          </h1>
          <p className="text-fg-muted mt-2 text-sm sm:text-base">
            Não achou a resposta nos tutoriais? Conta o que está acontecendo que a equipe responde
            em horário comercial.
          </p>
        </header>

        <div className="border-warning/40 bg-warning-subtle text-fg flex items-start gap-3 rounded-lg border p-4">
          <Construction size={18} className="text-warning mt-0.5 shrink-0" aria-hidden />
          <div className="text-sm">
            <p className="font-medium">Formulário em construção</p>
            <p className="text-fg-muted mt-1">
              O formulário de contato está sendo finalizado. Enquanto isso, use um dos canais
              abaixo.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <a
            href="mailto:suporte@agenciakharis.com.br"
            className="border-border bg-bg hover:border-primary/40 hover:bg-bg-subtle group flex flex-col gap-2 rounded-lg border p-5 transition-colors"
          >
            <div className="bg-primary-subtle text-primary flex size-9 items-center justify-center rounded-lg">
              <Mail size={16} aria-hidden />
            </div>
            <h2 className="text-fg group-hover:text-primary text-sm font-semibold transition-colors">
              E-mail
            </h2>
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
            <h2 className="text-fg group-hover:text-primary text-sm font-semibold transition-colors">
              WhatsApp
            </h2>
            <p className="text-fg-muted text-xs">Horário comercial</p>
          </a>
        </div>

        <div className="mt-10 text-center">
          <Link href="/ajuda" className="text-primary text-sm hover:underline">
            ← Voltar para a Central de Ajuda
          </Link>
        </div>
      </div>
    </div>
  );
}
