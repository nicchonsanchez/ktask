'use client';

import Link from 'next/link';
import {
  Building2,
  ChevronRight,
  FileUp,
  MessageSquareText,
  User as UserIcon,
  Users,
} from 'lucide-react';

/**
 * Hub de configurações — lista todas as sub-páginas em cards.
 * Cada card é um link pra rota específica. Visibilidade do conteúdo
 * sensível (admin) é controlada pelo backend (403 se não tem permissão).
 */
const SECTIONS: Array<{
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  adminOnly?: boolean;
}> = [
  {
    href: '/configuracoes/perfil',
    label: 'Meu perfil',
    description: 'Nome, foto, telefone, opt-in pra notificações por WhatsApp e troca de senha.',
    icon: UserIcon,
  },
  {
    href: '/configuracoes/membros',
    label: 'Membros',
    description: 'Convidar, gerenciar papéis, suspender, ver atividade e auditar acessos.',
    icon: Users,
  },
  {
    href: '/configuracoes/modelos-mensagem',
    label: 'Modelos de mensagem',
    description: 'Templates reutilizáveis pra comentários e disparos de WhatsApp.',
    icon: MessageSquareText,
  },
  {
    href: '/configuracoes/organizacao',
    label: 'Organização',
    description:
      'Sincronização automática de status de cards e outras preferências da organização.',
    icon: Building2,
    adminOnly: true,
  },
  {
    href: '/configuracoes/importar',
    label: 'Importar fluxo do Ummense',
    description: 'Upload do .csv exportado do Ummense pra criar boards/cards no KTask.',
    icon: FileUp,
    adminOnly: true,
  },
];

export default function ConfiguracoesPage() {
  return (
    <div className="container max-w-3xl py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-fg-muted mt-1 text-sm">
          Acesso a todas as configurações da sua conta e organização.
        </p>
      </header>

      <ul className="flex flex-col gap-2">
        {SECTIONS.map(({ href, label, description, icon: Icon, adminOnly }) => (
          <li key={href}>
            <Link
              href={href}
              className="border-border bg-bg hover:border-border-strong hover:bg-bg-muted/30 group flex items-center gap-4 rounded-md border p-4 transition-colors"
            >
              <span className="bg-bg-muted text-fg-muted group-hover:bg-primary-subtle/40 group-hover:text-primary inline-flex size-10 shrink-0 items-center justify-center rounded-md transition-colors">
                <Icon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-fg text-sm font-medium">{label}</span>
                  {adminOnly && (
                    <span className="bg-warning-subtle text-warning rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                      ADMIN
                    </span>
                  )}
                </div>
                <p className="text-fg-muted mt-0.5 text-xs">{description}</p>
              </div>
              <ChevronRight
                size={16}
                className="text-fg-subtle group-hover:text-primary shrink-0"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
