'use client';

import { useState } from 'react';
import {
  Bot,
  Check,
  ChevronLeft,
  Eye,
  Flag,
  GitBranch,
  Layers,
  ListChecks,
  Mail,
  MessageSquare,
  Plus,
  Send,
  Tag,
  Timer,
  TimerOff,
  Trash2,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@ktask/ui';
import type { ListWithCards } from '@/lib/queries/boards';

/**
 * Modal de automações de uma coluna (Etapa 1 — placeholder visual).
 *
 * Layout inspirado no Ummense:
 *   - Header com ícone do gatilho + nome da coluna
 *   - 3 tabs: Detalhes · Automações (N) · Avançado
 *   - Aba Automações: lista vazia + botão "+" pra abrir catálogo
 *   - Catálogo: 18 automações em 6 categorias, todas disabled "em breve"
 *
 * Implementação real (schema, engine, handlers) entra na Etapa 2 — ver
 * `tarefas-md/23-automacoes-coluna.md`.
 */

type Tab = 'details' | 'automations' | 'advanced';

export function ColumnAutomationsDialog({
  list,
  open,
  onOpenChange,
}: {
  list: ListWithCards;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState<Tab>('automations');
  const [catalogOpen, setCatalogOpen] = useState(false);
  // Por enquanto sempre 0 — engine não existe ainda
  const automationsCount = 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[80vh] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-md p-0">
          <header className="border-border/60 flex shrink-0 items-center justify-between border-b px-5 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <Layers size={16} className="text-fg-muted shrink-0" />
              <DialogTitle className="text-fg truncate text-sm font-semibold">
                {list.name}
              </DialogTitle>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-fg-muted hover:bg-bg-muted hover:text-fg rounded p-1"
              aria-label="Fechar"
            >
              <X size={14} />
            </button>
          </header>

          <nav role="tablist" className="border-border/60 flex shrink-0 gap-1 border-b px-3">
            <TabBtn label="Detalhes" active={tab === 'details'} onClick={() => setTab('details')} />
            <TabBtn
              label="Automações"
              count={automationsCount}
              active={tab === 'automations'}
              onClick={() => setTab('automations')}
            />
            <TabBtn
              label="Avançado"
              active={tab === 'advanced'}
              onClick={() => setTab('advanced')}
            />
          </nav>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {tab === 'details' && (
              <div className="px-5 py-6">
                <p className="text-fg-muted text-sm">
                  Configurações detalhadas da coluna (limite de cards, SLA, ícone, cor) ainda não
                  estão expostas aqui — chega numa próxima iteração. Por enquanto, use a aba{' '}
                  <strong>Automações</strong> pra criar regras quando cards entrarem ou saírem desta
                  coluna.
                </p>
              </div>
            )}

            {tab === 'automations' && (
              <div className="flex flex-1 flex-col">
                <div className="flex items-center justify-between gap-2 px-5 py-3">
                  <p className="text-fg-muted text-[12px]">
                    {automationsCount === 0
                      ? 'Nenhuma automação configurada nesta coluna.'
                      : `${automationsCount} automação${automationsCount === 1 ? '' : 's'} ativa${automationsCount === 1 ? '' : 's'}.`}
                  </p>
                  <button
                    type="button"
                    onClick={() => setCatalogOpen(true)}
                    className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium"
                  >
                    <Plus size={12} />
                    Nova automação
                  </button>
                </div>

                {automationsCount === 0 && (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-10 text-center">
                    <span className="bg-primary-subtle text-primary inline-flex size-12 items-center justify-center rounded-full">
                      <Bot size={22} />
                    </span>
                    <p className="text-fg text-sm font-medium">
                      Automatize o fluxo da coluna &quot;{list.name}&quot;
                    </p>
                    <p className="text-fg-muted max-w-sm text-[12px] leading-relaxed">
                      Crie regras pra disparar ações quando cards entram, saem, ficam parados ou
                      vencem o prazo. Catálogo de 18 automações disponíveis.
                    </p>
                    <button
                      type="button"
                      onClick={() => setCatalogOpen(true)}
                      className="text-primary hover:text-primary-hover mt-1 text-[12px] font-medium"
                    >
                      Ver catálogo
                    </button>
                  </div>
                )}

                {/* Rodapé "Cards vinculados na coluna" — só placeholder visual */}
                <div className="border-border/60 bg-bg-subtle/40 mt-auto flex shrink-0 items-center justify-between gap-2 border-t px-5 py-2.5 text-[11px]">
                  <p className="text-fg-muted">Cards vinculados na coluna</p>
                  <div className="flex items-center gap-3">
                    <span className="text-fg-muted inline-flex items-center gap-1">
                      <span className="text-primary font-semibold tabular-nums">
                        {list.cards.length}
                      </span>
                      entradas
                    </span>
                    <span className="text-fg-muted inline-flex items-center gap-1">
                      <span className="text-fg-subtle font-semibold tabular-nums">0</span>
                      concluídos
                    </span>
                    <button
                      type="button"
                      disabled
                      className="text-fg-subtle hover:text-fg-muted rounded p-0.5 disabled:cursor-not-allowed"
                      aria-label="Limpar histórico (em breve)"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {tab === 'advanced' && (
              <div className="px-5 py-6">
                <p className="text-fg-muted text-sm">
                  Configurações avançadas (logs de execução, retentativas, escopo de permissão)
                  chegam quando a engine de automações estiver pronta.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AutomationCatalogDialog
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        listName={list.name}
      />
    </>
  );
}

function TabBtn({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${
        active ? 'text-primary' : 'text-fg-muted hover:text-fg'
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={`text-[11px] tabular-nums ${active ? 'text-primary' : 'text-fg-subtle'}`}>
          {count}
        </span>
      )}
      {active && (
        <span aria-hidden className="bg-primary absolute inset-x-2 -bottom-px h-0.5 rounded-full" />
      )}
    </button>
  );
}

// ---------------- Catálogo ----------------

interface CatalogItem {
  key: string;
  label: string;
  icon: LucideIcon;
  plan: 'PRO' | 'ENTERPRISE';
  description: string;
}
interface CatalogCategory {
  name: string;
  items: CatalogItem[];
}

const CATALOG: CatalogCategory[] = [
  {
    name: 'Fluxo',
    items: [
      {
        key: 'link-flow',
        label: 'Vincular a um novo fluxo',
        icon: GitBranch,
        plan: 'PRO',
        description: 'Quando o card entrar nesta coluna, replicar em outro fluxo escolhido.',
      },
      {
        key: 'unlink-flow',
        label: 'Desvincular do fluxo atual',
        icon: GitBranch,
        plan: 'PRO',
        description: 'Remove este card deste fluxo (continua em outros, se vinculado).',
      },
      {
        key: 'update-flow-position',
        label: 'Atualizar posição no fluxo',
        icon: GitBranch,
        plan: 'PRO',
        description: 'Move o card vinculado em outro fluxo pra uma coluna específica.',
      },
    ],
  },
  {
    name: 'Card',
    items: [
      {
        key: 'create-child',
        label: 'Criar card filho',
        icon: Plus,
        plan: 'PRO',
        description: 'Cria automaticamente um sub-card da família, com template configurável.',
      },
      {
        key: 'set-status',
        label: 'Alterar status do card',
        icon: Flag,
        plan: 'PRO',
        description: 'Marca como Finalizado, Reativado, Arquivado ou Privado.',
      },
      {
        key: 'fill-fields',
        label: 'Inserir ou preencher campos',
        icon: ListChecks,
        plan: 'PRO',
        description: 'Define valor de um campo personalizado (ex: data de entrega = hoje + 5).',
      },
      {
        key: 'save-description-version',
        label: 'Salvar versão da descrição',
        icon: Layers,
        plan: 'PRO',
        description: 'Snapshot da descrição atual num histórico pra auditoria.',
      },
    ],
  },
  {
    name: 'Tags',
    items: [
      {
        key: 'add-tags',
        label: 'Inserir tags',
        icon: Tag,
        plan: 'PRO',
        description: 'Adiciona uma ou mais etiquetas ao card.',
      },
      {
        key: 'remove-tags',
        label: 'Remover tags',
        icon: Tag,
        plan: 'PRO',
        description: 'Remove etiquetas do card.',
      },
    ],
  },
  {
    name: 'Tarefas',
    items: [
      {
        key: 'add-checklist-items',
        label: 'Inserir tarefas',
        icon: ListChecks,
        plan: 'PRO',
        description: 'Cria itens de checklist a partir de uma lista de templates.',
      },
      {
        key: 'add-checklist-group',
        label: 'Inserir grupo de tarefas',
        icon: ListChecks,
        plan: 'PRO',
        description: 'Cria um checklist inteiro a partir de um template salvo.',
      },
    ],
  },
  {
    name: 'Equipe',
    items: [
      {
        key: 'set-lead',
        label: 'Definir líder do card',
        icon: UserCog,
        plan: 'PRO',
        description: 'Atribui um usuário como líder. Suporta round-robin entre membros.',
      },
      {
        key: 'add-team',
        label: 'Adicionar equipe no card',
        icon: Users,
        plan: 'PRO',
        description: 'Adiciona N usuários como membros do card.',
      },
      {
        key: 'post-comment',
        label: 'Postar comentário automático',
        icon: MessageSquare,
        plan: 'PRO',
        description: 'Cria comentário no card a partir de um template (Mustache).',
      },
      {
        key: 'send-whatsapp',
        label: 'Enviar WhatsApp',
        icon: Send,
        plan: 'ENTERPRISE',
        description: 'Dispara mensagem WhatsApp via Evolution API pra membro, líder ou contato.',
      },
      {
        key: 'send-email',
        label: 'Configurar disparo de e-mail',
        icon: Mail,
        plan: 'PRO',
        description: 'Envia e-mail com template pra destinatários do card.',
      },
    ],
  },
  {
    name: 'Sinalizar',
    items: [
      {
        key: 'flag-due-today',
        label: 'Cards com marcos para hoje',
        icon: Flag,
        plan: 'PRO',
        description: 'Sinaliza visualmente cards cujo dueDate é hoje enquanto nesta coluna.',
      },
      {
        key: 'flag-overdue',
        label: 'Cards com marcos atrasados',
        icon: Flag,
        plan: 'PRO',
        description: 'Idem, mas pra cards com dueDate < hoje.',
      },
      {
        key: 'time-in-list',
        label: 'Tempo excedido na coluna',
        icon: Timer,
        plan: 'PRO',
        description: 'Dispara aviso quando card está mais de X horas/dias na coluna.',
      },
      {
        key: 'time-no-interaction',
        label: 'Tempo sem interação',
        icon: TimerOff,
        plan: 'PRO',
        description: 'Detecta cards parados (sem comentário, edição, mudança) há X tempo.',
      },
    ],
  },
];

function AutomationCatalogDialog({
  open,
  onOpenChange,
  listName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listName: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] w-[calc(100vw-2rem)] max-w-xl flex-col gap-0 overflow-hidden rounded-md p-0">
        <header className="border-border/60 flex shrink-0 items-center gap-2 border-b px-5 py-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-fg-muted hover:bg-bg-muted hover:text-fg rounded p-1"
            aria-label="Voltar"
          >
            <ChevronLeft size={16} />
          </button>
          <DialogTitle className="text-fg flex-1 text-sm font-semibold">
            Selecione uma automação
          </DialogTitle>
        </header>

        <p className="text-fg-muted border-border/60 bg-bg-subtle/30 shrink-0 border-b px-5 py-2 text-[11px]">
          Pra coluna <strong className="text-fg">{listName}</strong> — todas as automações ficam{' '}
          <strong>em breve</strong> nesta versão. Engine entra na próxima sprint (ver{' '}
          <code>tarefas-md/23-automacoes-coluna.md</code>).
        </p>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {CATALOG.map((cat) => (
            <section key={cat.name} className="py-2">
              <h3 className="text-primary px-2 pb-1 pt-1 text-[12px] font-semibold uppercase tracking-wide">
                {cat.name}
              </h3>
              <ul className="flex flex-col">
                {cat.items.map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      disabled
                      title="Em breve — engine de automações ainda não está pronta"
                      className="text-fg hover:bg-bg-muted/40 group/item flex w-full cursor-not-allowed items-center gap-3 rounded-md px-2 py-1.5 text-left disabled:opacity-70"
                    >
                      <span className="text-fg-muted shrink-0">
                        <item.icon size={15} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-fg text-[13px] font-medium">{item.label}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${
                          item.plan === 'ENTERPRISE'
                            ? 'bg-warning-subtle text-warning'
                            : 'bg-success-subtle text-success'
                        }`}
                      >
                        {item.plan}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <div className="text-fg-subtle flex items-center justify-center gap-2 px-2 py-4 text-[11px]">
            <Eye size={12} />
            18 automações no total · Implementação parcial conforme roadmap Fase 2
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Re-export pra evitar tree-shake quebrar tipos
export type { Tab as AutomationsTab };
// Marker pra tag dos itens (caso futuramente importemos)
export const _CATALOG_LENGTH = CATALOG.reduce((acc, c) => acc + c.items.length, 0);
// Sinaliza pro typescript que `Check` está sendo importado mas usado como
// re-export simbólico (lint não-utilizada): mantém pra futuro indicador de
// "automação ativa". Pode remover quando engine estiver pronta.
export const _RESERVED_ICONS = { Check };
