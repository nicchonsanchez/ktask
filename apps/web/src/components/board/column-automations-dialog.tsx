'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bot,
  ChevronLeft,
  Eye,
  Flag,
  GitBranch,
  Layers,
  ListChecks,
  Loader2,
  Mail,
  MessageSquare,
  Plus,
  Send,
  Tag,
  Trash2,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@ktask/ui';
import type { ListWithCards } from '@/lib/queries/boards';
import {
  automationsQueries,
  deleteAutomation,
  updateAutomation,
  type Automation,
  type AutomationActionType,
} from '@/lib/queries/automations';
import { useConfirm, useNotify } from '@/components/ui/dialogs';
import { CreateAutomationForm } from './create-automation-form';

/**
 * Modal de automações da coluna — Fase A.
 *
 * UI conectada ao backend:
 *   - Lista as automações reais via GET /lists/:listId/automations
 *   - Toggle isActive via PATCH
 *   - Excluir via DELETE
 *   - Criar via formulário simples (apenas INSERT_TAGS funcional na Fase A;
 *     outras actions ficam disabled "em breve")
 *
 * Engine de execução ainda não está rodando — quando uma automação
 * dispara, nada acontece. A UI mostra aviso "Engine em desenvolvimento"
 * pra deixar isso claro.
 */

type Tab = 'details' | 'automations' | 'advanced';

export function ColumnAutomationsDialog({
  list,
  boardId,
  open,
  onOpenChange,
}: {
  list: ListWithCards;
  boardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState<Tab>('automations');
  const [createOpen, setCreateOpen] = useState(false);

  const automationsQuery = useQuery({
    ...automationsQueries.byList(list.id),
    enabled: open,
  });

  const automations = automationsQuery.data ?? [];

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
              count={automations.length}
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
                <EngineWarningBanner />

                <div className="flex items-center justify-between gap-2 px-5 py-3">
                  <p className="text-fg-muted text-[12px]">
                    {automationsQuery.isLoading
                      ? 'Carregando…'
                      : automations.length === 0
                        ? 'Nenhuma automação configurada nesta coluna.'
                        : `${automations.length} automação${automations.length === 1 ? '' : 's'} configurada${automations.length === 1 ? '' : 's'}.`}
                  </p>
                  <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium"
                  >
                    <Plus size={12} />
                    Nova automação
                  </button>
                </div>

                {automationsQuery.isLoading && (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 size={16} className="text-fg-muted animate-spin" />
                  </div>
                )}

                {!automationsQuery.isLoading && automations.length === 0 && (
                  <EmptyState onCreate={() => setCreateOpen(true)} listName={list.name} />
                )}

                {!automationsQuery.isLoading && automations.length > 0 && (
                  <ul className="divide-border/40 flex flex-col divide-y px-2">
                    {automations.map((auto) => (
                      <AutomationRow key={auto.id} automation={auto} listId={list.id} />
                    ))}
                  </ul>
                )}

                <div className="border-border/60 bg-bg-subtle/40 mt-auto flex shrink-0 items-center justify-between gap-2 border-t px-5 py-2.5 text-[11px]">
                  <p className="text-fg-muted">Cards vinculados na coluna</p>
                  <div className="flex items-center gap-3">
                    <span className="text-fg-muted inline-flex items-center gap-1">
                      <span className="text-primary font-semibold tabular-nums">
                        {list.cards.length}
                      </span>
                      entradas
                    </span>
                  </div>
                </div>
              </div>
            )}

            {tab === 'advanced' && (
              <div className="px-5 py-6">
                <p className="text-fg-muted text-sm">
                  Configurações avançadas (logs de execução, retentativas, escopo de permissão)
                  chegam quando a engine de automações estiver rodando.
                </p>
                <p className="text-fg-subtle mt-3 text-[11px]">
                  Stub do schema já está commitado: <code>Automation</code> +{' '}
                  <code>AutomationRun</code> com <code>chainDepth</code> pra anti-loop.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <CreateAutomationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        list={list}
        boardId={boardId}
      />
    </>
  );
}

function EngineWarningBanner() {
  return (
    <div className="border-warning/40 bg-warning-subtle/40 mx-3 mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-[11px]">
      <AlertTriangle size={13} className="text-warning mt-0.5 shrink-0" />
      <p className="text-fg-muted leading-snug">
        <strong className="text-warning">Engine em desenvolvimento.</strong> Você pode criar e
        salvar automações, mas as ações ainda não disparam quando o gatilho acontece. A engine vai
        entrar numa próxima sprint (ver <code>tarefas-md/23-automacoes-coluna.md</code>).
      </p>
    </div>
  );
}

function EmptyState({ onCreate, listName }: { onCreate: () => void; listName: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-10 text-center">
      <span className="bg-primary-subtle text-primary inline-flex size-12 items-center justify-center rounded-full">
        <Bot size={22} />
      </span>
      <p className="text-fg text-sm font-medium">
        Automatize o fluxo da coluna &quot;{listName}&quot;
      </p>
      <p className="text-fg-muted max-w-sm text-[12px] leading-relaxed">
        Crie regras pra disparar ações quando cards entram, saem, ficam parados ou vencem o prazo.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="text-primary hover:text-primary-hover mt-1 text-[12px] font-medium"
      >
        Criar primeira automação
      </button>
    </div>
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

// ---------------- AutomationRow ----------------

function AutomationRow({ automation, listId }: { automation: Automation; listId: string }) {
  const queryClient = useQueryClient();
  const notify = useNotify();
  const confirm = useConfirm();

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: automationsQueries.byList(listId).queryKey });
  }

  const toggleMut = useMutation({
    mutationFn: () => updateAutomation(automation.id, { isActive: !automation.isActive }),
    onSuccess: invalidate,
    onError: () => notify.error('Falha ao alterar automação.'),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteAutomation(automation.id),
    onSuccess: () => {
      invalidate();
      notify.success('Automação excluída.');
    },
    onError: () => notify.error('Falha ao excluir automação.'),
  });

  async function handleDelete() {
    const ok = await confirm({
      title: 'Excluir esta automação?',
      description: `${describeTrigger(automation.trigger)} → ${describeAction(automation.actionType)}`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (ok) deleteMut.mutate();
  }

  return (
    <li className="hover:bg-bg-subtle/50 flex items-start gap-3 px-3 py-2.5">
      <span className="bg-primary-subtle text-primary mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded">
        {iconFor(automation.actionType)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-fg text-[13px] font-medium leading-snug">
          {automation.label || describeAction(automation.actionType)}
        </p>
        <p className="text-fg-muted mt-0.5 text-[11px] leading-snug">
          Quando: <strong>{describeTrigger(automation.trigger)}</strong>
        </p>
      </div>
      <button
        type="button"
        onClick={() => toggleMut.mutate()}
        disabled={toggleMut.isPending}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          automation.isActive ? 'bg-primary' : 'bg-bg-emphasis'
        }`}
        aria-label={automation.isActive ? 'Desativar' : 'Ativar'}
        title={
          automation.isActive ? 'Ativa — clique para desativar' : 'Desativada — clique para ativar'
        }
      >
        <span
          className={`bg-bg inline-block size-4 transform rounded-full shadow-sm transition-transform ${
            automation.isActive ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleteMut.isPending}
        className="text-fg-muted hover:text-danger shrink-0 rounded p-1"
        aria-label="Excluir automação"
        title="Excluir"
      >
        {deleteMut.isPending ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Trash2 size={12} />
        )}
      </button>
    </li>
  );
}

// ---------------- Helpers de display ----------------

const TRIGGER_LABEL: Record<Automation['trigger'], string> = {
  CARD_ENTERED: 'card entrar nesta coluna',
  CARD_LEFT: 'card sair desta coluna',
  TIME_IN_LIST: 'card ficar tempo demais na coluna',
  TIME_NO_INTERACTION: 'card ficar parado sem interação',
  DUE_DATE_TODAY: 'prazo do card cair pra hoje',
  DUE_DATE_OVERDUE: 'prazo do card vencer',
};

function describeTrigger(trigger: Automation['trigger']): string {
  return TRIGGER_LABEL[trigger];
}

const ACTION_LABEL: Partial<Record<AutomationActionType, string>> = {
  INSERT_TAGS: 'Adicionar etiquetas',
  REMOVE_TAGS: 'Remover etiquetas',
  INSERT_CHECKLIST_ITEMS: 'Inserir tarefas',
  INSERT_CHECKLIST_GROUP: 'Inserir grupo de tarefas',
  SET_CARD_STATUS: 'Alterar status do card',
  FILL_FIELDS: 'Preencher campos',
  SAVE_DESCRIPTION_VERSION: 'Salvar versão da descrição',
  SET_LEAD: 'Definir líder',
  ADD_TEAM: 'Adicionar equipe',
  POST_COMMENT: 'Postar comentário automático',
  CREATE_CHILD_CARD: 'Criar card filho',
  SEND_EMAIL: 'Enviar e-mail',
  SEND_WHATSAPP: 'Enviar WhatsApp',
  LINK_FLOW: 'Vincular a outro fluxo',
  UNLINK_FLOW: 'Desvincular do fluxo',
  UPDATE_FLOW_POSITION: 'Atualizar posição em outro fluxo',
  FLAG_DUE_TODAY: 'Sinalizar marcos para hoje',
  FLAG_OVERDUE: 'Sinalizar marcos atrasados',
};

function describeAction(action: AutomationActionType): string {
  return ACTION_LABEL[action] ?? action;
}

const ACTION_ICON: Partial<Record<AutomationActionType, LucideIcon>> = {
  INSERT_TAGS: Tag,
  REMOVE_TAGS: Tag,
  INSERT_CHECKLIST_ITEMS: ListChecks,
  INSERT_CHECKLIST_GROUP: ListChecks,
  SET_CARD_STATUS: Flag,
  FILL_FIELDS: ListChecks,
  SAVE_DESCRIPTION_VERSION: Layers,
  SET_LEAD: UserCog,
  ADD_TEAM: Users,
  POST_COMMENT: MessageSquare,
  CREATE_CHILD_CARD: Plus,
  SEND_EMAIL: Mail,
  SEND_WHATSAPP: Send,
  LINK_FLOW: GitBranch,
  UNLINK_FLOW: GitBranch,
  UPDATE_FLOW_POSITION: GitBranch,
  FLAG_DUE_TODAY: Flag,
  FLAG_OVERDUE: Flag,
};

function iconFor(action: AutomationActionType) {
  const Icon = ACTION_ICON[action] ?? Bot;
  return <Icon size={13} />;
}

// ---------------- Catálogo (criação) ----------------

interface CatalogItem {
  key: AutomationActionType;
  label: string;
  icon: LucideIcon;
  plan: 'PRO' | 'ENTERPRISE';
  description: string;
  /** Implementado na Fase A da engine? Se não, fica disabled. */
  ready: boolean;
}
interface CatalogCategory {
  name: string;
  items: CatalogItem[];
}

const CATALOG: CatalogCategory[] = [
  {
    name: 'Tags',
    items: [
      {
        key: 'INSERT_TAGS',
        label: 'Inserir tags',
        icon: Tag,
        plan: 'PRO',
        ready: true,
        description: 'Adiciona uma ou mais etiquetas ao card automaticamente.',
      },
      {
        key: 'REMOVE_TAGS',
        label: 'Remover tags',
        icon: Tag,
        plan: 'PRO',
        ready: false,
        description: 'Remove etiquetas do card.',
      },
    ],
  },
  {
    name: 'Tarefas',
    items: [
      {
        key: 'INSERT_CHECKLIST_ITEMS',
        label: 'Inserir tarefas',
        icon: ListChecks,
        plan: 'PRO',
        ready: false,
        description: 'Cria itens de checklist a partir de uma lista de templates.',
      },
      {
        key: 'INSERT_CHECKLIST_GROUP',
        label: 'Inserir grupo de tarefas',
        icon: ListChecks,
        plan: 'PRO',
        ready: false,
        description: 'Cria um checklist inteiro a partir de um template salvo.',
      },
    ],
  },
  {
    name: 'Card',
    items: [
      {
        key: 'SET_CARD_STATUS',
        label: 'Alterar status do card',
        icon: Flag,
        plan: 'PRO',
        ready: false,
        description: 'Marca como Finalizado, Reativado, Arquivado ou Privado.',
      },
      {
        key: 'CREATE_CHILD_CARD',
        label: 'Criar card filho',
        icon: Plus,
        plan: 'PRO',
        ready: false,
        description: 'Cria automaticamente um sub-card da família.',
      },
      {
        key: 'FILL_FIELDS',
        label: 'Preencher campos',
        icon: ListChecks,
        plan: 'PRO',
        ready: false,
        description: 'Define valor de um campo personalizado.',
      },
      {
        key: 'SAVE_DESCRIPTION_VERSION',
        label: 'Salvar versão da descrição',
        icon: Layers,
        plan: 'PRO',
        ready: false,
        description: 'Snapshot da descrição atual.',
      },
    ],
  },
  {
    name: 'Equipe',
    items: [
      {
        key: 'SET_LEAD',
        label: 'Definir líder do card',
        icon: UserCog,
        plan: 'PRO',
        ready: false,
        description: 'Atribui um usuário como líder.',
      },
      {
        key: 'ADD_TEAM',
        label: 'Adicionar equipe no card',
        icon: Users,
        plan: 'PRO',
        ready: false,
        description: 'Adiciona N usuários como membros do card.',
      },
      {
        key: 'POST_COMMENT',
        label: 'Postar comentário automático',
        icon: MessageSquare,
        plan: 'PRO',
        ready: false,
        description: 'Cria comentário no card a partir de template.',
      },
      {
        key: 'SEND_WHATSAPP',
        label: 'Enviar WhatsApp',
        icon: Send,
        plan: 'ENTERPRISE',
        ready: false,
        description: 'Dispara mensagem WhatsApp via Evolution API.',
      },
      {
        key: 'SEND_EMAIL',
        label: 'Configurar disparo de e-mail',
        icon: Mail,
        plan: 'PRO',
        ready: false,
        description: 'Envia e-mail com template pra destinatários do card.',
      },
    ],
  },
  {
    name: 'Sinalizar',
    items: [
      {
        key: 'FLAG_DUE_TODAY',
        label: 'Cards com marcos para hoje',
        icon: Flag,
        plan: 'PRO',
        ready: false,
        description: 'Sinaliza visualmente cards cujo dueDate é hoje.',
      },
      {
        key: 'FLAG_OVERDUE',
        label: 'Cards com marcos atrasados',
        icon: Flag,
        plan: 'PRO',
        ready: false,
        description: 'Idem, pra cards com dueDate < hoje.',
      },
    ],
  },
  {
    name: 'Fluxo',
    items: [
      {
        key: 'LINK_FLOW',
        label: 'Vincular a um novo fluxo',
        icon: GitBranch,
        plan: 'PRO',
        ready: false,
        description: 'Replica o card em outro fluxo escolhido.',
      },
      {
        key: 'UNLINK_FLOW',
        label: 'Desvincular do fluxo atual',
        icon: GitBranch,
        plan: 'PRO',
        ready: false,
        description: 'Remove este card deste fluxo.',
      },
      {
        key: 'UPDATE_FLOW_POSITION',
        label: 'Atualizar posição no fluxo',
        icon: GitBranch,
        plan: 'PRO',
        ready: false,
        description: 'Move o card vinculado em outro fluxo pra uma coluna específica.',
      },
    ],
  },
];

// ---------------- CreateAutomationDialog ----------------

function CreateAutomationDialog({
  open,
  onOpenChange,
  list,
  boardId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  list: ListWithCards;
  boardId: string;
}) {
  const [step, setStep] = useState<'catalog' | 'form'>('catalog');
  const [selected, setSelected] = useState<AutomationActionType | null>(null);

  function reset() {
    setStep('catalog');
    setSelected(null);
  }

  function handleClose() {
    onOpenChange(false);
    setTimeout(reset, 200);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : handleClose())}>
      <DialogContent className="flex h-[85vh] w-[calc(100vw-2rem)] max-w-xl flex-col gap-0 overflow-hidden rounded-md p-0">
        <header className="border-border/60 flex shrink-0 items-center gap-2 border-b px-5 py-3">
          {step === 'form' ? (
            <button
              type="button"
              onClick={reset}
              className="text-fg-muted hover:bg-bg-muted hover:text-fg rounded p-1"
              aria-label="Voltar ao catálogo"
            >
              <ChevronLeft size={16} />
            </button>
          ) : (
            <Bot size={16} className="text-fg-muted" />
          )}
          <DialogTitle className="text-fg flex-1 text-sm font-semibold">
            {step === 'catalog' ? 'Selecione uma automação' : 'Configurar automação'}
          </DialogTitle>
          <button
            type="button"
            onClick={handleClose}
            className="text-fg-muted hover:bg-bg-muted hover:text-fg rounded p-1"
            aria-label="Fechar"
          >
            <X size={14} />
          </button>
        </header>

        {step === 'catalog' && (
          <Catalog
            onPick={(action) => {
              setSelected(action);
              setStep('form');
            }}
          />
        )}

        {step === 'form' && selected && (
          <CreateAutomationForm
            actionType={selected}
            list={list}
            boardId={boardId}
            onCreated={handleClose}
            onCancel={reset}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Catalog({ onPick }: { onPick: (action: AutomationActionType) => void }) {
  return (
    <>
      <p className="text-fg-muted border-border/60 bg-bg-subtle/30 shrink-0 border-b px-5 py-2 text-[11px]">
        Apenas <strong className="text-success">Inserir tags</strong> está implementada na engine
        nesta versão. As outras automações ficam disabled até o handler delas chegar (ver{' '}
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
                    disabled={!item.ready}
                    onClick={() => item.ready && onPick(item.key)}
                    title={
                      item.ready ? item.description : 'Em breve — handler ainda não implementado'
                    }
                    className={`group/item flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left ${
                      item.ready
                        ? 'text-fg hover:bg-bg-muted/40 cursor-pointer'
                        : 'text-fg-subtle cursor-not-allowed opacity-70'
                    }`}
                  >
                    <span
                      className={item.ready ? 'text-primary shrink-0' : 'text-fg-muted shrink-0'}
                    >
                      <item.icon size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-[13px] font-medium ${item.ready ? 'text-fg' : 'text-fg-subtle'}`}
                      >
                        {item.label}
                      </p>
                    </div>
                    {!item.ready && (
                      <span className="text-fg-subtle shrink-0 text-[10px]">em breve</span>
                    )}
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
          18 automações no catálogo · 1 implementada nesta versão
        </div>
      </div>
    </>
  );
}
