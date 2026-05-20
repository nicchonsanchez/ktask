'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@ktask/ui';
import type { ListWithCards } from '@/lib/queries/boards';
import {
  automationsQueries,
  deleteAutomation,
  updateAutomation,
  type Automation,
  type AutomationActionType,
  type AutomationCondition,
} from '@/lib/queries/automations';
import { useConfirm, useNotify } from '@/components/ui/dialogs';
import { CreateAutomationForm } from './create-automation-form';
import { describeAutomationRich } from './describe-automation';

/**
 * Shape de uma sub-automacao em "draft mode" — usada por automacoes em
 * cascata (INSERT_CHECKLIST_GROUP/ITEMS). Persistencia eh no actionConfig
 * da automacao-pai, nao em registro Automation proprio. Por isso o dialog
 * precisa de um modo separado: nao consulta API, nao cria, so devolve o
 * payload via callback.
 */
export interface ChecklistAutomationDraft {
  actionType: AutomationActionType;
  actionConfig: Record<string, unknown>;
  label?: string;
  conditions?: AutomationCondition[] | null;
}

/**
 * Doc 48: dialog de automações escopadas a um checklist ou item de
 * checklist. Versão simplificada do ColumnAutomationsDialog — sem abas,
 * só lista + form de criação.
 *
 * Aceita 2 modos via prop `scope`:
 *   - `{ kind: 'checklist' | 'item', id }` — modo padrão: lista automações
 *     existentes, cria via API.
 *   - `{ kind: 'draft', triggerLock, initialDraft, onDraftSave, onRemove }`
 *     — modo cascata: nao consulta API, exibe (no maximo) UMA sub-automacao,
 *     edicao chama onDraftSave em vez de POST/PATCH.
 *
 * O CreateAutomationForm recebe `scope` e ajusta:
 *   - trigger fixo (CHECKLIST_COMPLETED ou CHECKLIST_ITEM_DONE)
 *   - mutation pra endpoint correto (modo padrão) ou callback (modo draft)
 *   - invalidação correta do query cache (modo padrão)
 */
export function ChecklistAutomationDialog({
  scope,
  scopeLabel,
  list,
  boardId,
  open,
  onOpenChange,
}: {
  scope:
    | { kind: 'checklist'; id: string }
    | { kind: 'item'; id: string }
    | {
        kind: 'draft';
        triggerLock: 'CHECKLIST_COMPLETED' | 'CHECKLIST_ITEM_DONE';
        initialDraft: ChecklistAutomationDraft | null;
        onDraftSave: (next: ChecklistAutomationDraft) => void;
        onRemove: () => void;
      };
  /** Texto descritivo do alvo (título do checklist ou texto do item) */
  scopeLabel: string;
  /** Lista atual do card — passada pro CreateAutomationForm pra contexto */
  list: ListWithCards;
  boardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isDraft = scope.kind === 'draft';
  const [createOpen, setCreateOpen] = useState(false);
  const [actionType, setActionType] = useState<AutomationActionType>(
    isDraft ? (scope.initialDraft?.actionType ?? 'MOVE_CARD') : 'MOVE_CARD',
  );
  /**
   * Modo draft: estado local do draft atual. Carrega de initialDraft,
   * atualiza via onDraftSave (que sobe pro parent). Editar = reabrir o
   * form com esse draft.
   */
  const [draft, setDraft] = useState<ChecklistAutomationDraft | null>(
    isDraft ? scope.initialDraft : null,
  );

  // Doc 48: useQuery por escopo. Spread direto de union confunde o TS,
  // então escolhemos a query inline com a tupla fixa de queryKey.
  // Em modo draft, skip a query (não há automation registrada — vive
  // no actionConfig da automação-pai).
  const automationsQuery = useQuery<Automation[]>({
    queryKey:
      scope.kind === 'checklist'
        ? ['automations', 'by-checklist', scope.id]
        : scope.kind === 'item'
          ? ['automations', 'by-checklist-item', scope.id]
          : ['automations', 'draft'],
    queryFn:
      scope.kind === 'checklist'
        ? automationsQueries.byChecklist(scope.id).queryFn
        : scope.kind === 'item'
          ? automationsQueries.byChecklistItem(scope.id).queryFn
          : () => Promise.resolve([] as Automation[]),
    enabled: open && !isDraft,
  });

  const queryClient = useQueryClient();
  const notify = useNotify();
  const confirm = useConfirm();

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateAutomation(id, { isActive }),
    onSuccess: () => {
      if (scope.kind === 'checklist' || scope.kind === 'item') {
        queryClient.invalidateQueries({
          queryKey:
            scope.kind === 'checklist'
              ? automationsQueries.byChecklist(scope.id).queryKey
              : automationsQueries.byChecklistItem(scope.id).queryKey,
        });
      }
    },
    onError: () => notify.error('Falha ao alternar automação.'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAutomation(id),
    onSuccess: () => {
      if (scope.kind === 'checklist' || scope.kind === 'item') {
        queryClient.invalidateQueries({
          queryKey:
            scope.kind === 'checklist'
              ? automationsQueries.byChecklist(scope.id).queryKey
              : automationsQueries.byChecklistItem(scope.id).queryKey,
        });
      }
      notify.success('Automação excluída.');
    },
    onError: () => notify.error('Falha ao excluir automação.'),
  });

  async function handleDelete(automation: Automation) {
    const ok = await confirm({
      title: 'Excluir automação?',
      description: 'Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (ok) deleteMut.mutate(automation.id);
  }

  async function handleDeleteDraft() {
    const ok = await confirm({
      title: 'Remover automação automática?',
      description: 'A automação não será mais anexada ao item quando criado.',
      confirmLabel: 'Remover',
      danger: true,
    });
    if (ok && isDraft) {
      setDraft(null);
      scope.onRemove();
    }
  }

  const automations = isDraft ? [] : (automationsQuery.data ?? []);

  // Em modo draft, mostramos o draft como "fake automation" pra reuso
  // visual da lista. Edicao reabre o form pre-preenchido.
  const draftAsAutomation: Automation | null =
    isDraft && draft
      ? ({
          id: '__draft__',
          actionType: draft.actionType,
          actionConfig: draft.actionConfig as unknown as Automation['actionConfig'],
          label: draft.label ?? null,
          conditions: (draft.conditions ?? null) as unknown as Automation['conditions'],
          isActive: true,
          trigger: scope.triggerLock,
          triggerConfig: {} as Automation['triggerConfig'],
          listId: null,
          boardId: null,
          scopeChecklistId: null,
          scopeChecklistItemId: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          _count: { runs: 0 },
        } as unknown as Automation)
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(80vh,640px)] w-[min(100vw,640px)] flex-col p-0">
        <header className="border-border/60 flex items-center gap-2 border-b px-5 py-3">
          <Bot size={16} className="text-primary" />
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-fg truncate text-[14px] font-semibold">
              {isDraft
                ? 'Automação automática'
                : `Automações ${scope.kind === 'checklist' ? 'do checklist' : 'da tarefa'}`}
            </DialogTitle>
            <p className="text-fg-muted truncate text-[11px]">
              {scope.kind === 'checklist'
                ? `Quando "${scopeLabel}" for 100% concluído`
                : scope.kind === 'item'
                  ? `Quando "${scopeLabel}" for concluída`
                  : scope.triggerLock === 'CHECKLIST_COMPLETED'
                    ? `Quando "${scopeLabel}" for 100% concluído (será criada quando a automação-pai rodar)`
                    : `Quando "${scopeLabel}" for marcada (será criada quando a automação-pai rodar)`}
            </p>
          </div>
        </header>

        {createOpen ? (
          <CreateAutomationForm
            actionType={actionType}
            list={list}
            boardId={boardId}
            editing={draftAsAutomation ?? undefined}
            scope={
              isDraft
                ? {
                    kind: 'draft',
                    triggerLock: scope.triggerLock,
                    onDraftSave: (payload) => {
                      const next: ChecklistAutomationDraft = {
                        actionType: payload.actionType,
                        actionConfig: payload.actionConfig,
                        label: payload.label,
                        conditions: payload.conditions ?? null,
                      };
                      setDraft(next);
                      scope.onDraftSave(next);
                    },
                  }
                : scope
            }
            onCreated={() => setCreateOpen(false)}
            onCancel={() => setCreateOpen(false)}
          />
        ) : (
          <div className="flex flex-1 flex-col overflow-y-auto px-5 py-4">
            {!isDraft && automationsQuery.isLoading && (
              <div className="text-fg-muted flex items-center justify-center gap-2 py-8 text-sm">
                <Loader2 size={14} className="animate-spin" />
                Carregando…
              </div>
            )}
            {!isDraft && !automationsQuery.isLoading && automations.length === 0 && (
              <p className="text-fg-muted py-8 text-center text-sm">
                Nenhuma automação ainda. Crie uma pra reagir à conclusão.
              </p>
            )}
            {isDraft && !draft && (
              <p className="text-fg-muted py-8 text-center text-sm">
                Nenhuma automação configurada. Adicione uma pra ser criada automaticamente quando a
                automação-pai criar este item.
              </p>
            )}
            {automations.length > 0 && (
              <ul className="divide-border/60 divide-y">
                {automations.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-fg text-[13px]">
                        {a.label ?? describeAutomationRich(a, { labels: [], members: [] })}
                      </p>
                      <p className="text-fg-subtle mt-0.5 text-[11px]">{a._count.runs} execuções</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleMut.mutate({ id: a.id, isActive: !a.isActive })}
                      className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                        a.isActive ? 'bg-success-subtle text-success' : 'bg-bg-muted text-fg-muted'
                      }`}
                    >
                      {a.isActive ? 'Ativa' : 'Inativa'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(a)}
                      className="text-danger hover:bg-danger-subtle/60 rounded-md p-1"
                      aria-label="Excluir"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {isDraft && draft && (
              <div className="border-border/60 flex items-start gap-3 rounded-md border px-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-fg text-[13px]">
                    {draft.label ?? actionTypeLabel(draft.actionType)}
                  </p>
                  <p className="text-fg-subtle mt-0.5 text-[11px]">
                    {actionTypeLabel(draft.actionType)} · será criada quando a automação-pai rodar
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActionType(draft.actionType);
                    setCreateOpen(true);
                  }}
                  className="text-fg-muted hover:bg-bg-muted rounded-md p-1.5"
                  aria-label="Editar"
                  title="Editar"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={handleDeleteDraft}
                  className="text-danger hover:bg-danger-subtle/60 rounded-md p-1.5"
                  aria-label="Remover"
                  title="Remover"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
            {(!isDraft || !draft) && (
              <div className="mt-4 flex flex-col gap-2">
                <label className="text-fg-muted block text-[11px] font-medium">Tipo de ação</label>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value as AutomationActionType)}
                  className="border-border bg-bg text-fg rounded-md border px-2 py-1.5 text-[13px]"
                >
                  <option value="MOVE_CARD">Mover card pra outra coluna</option>
                  <option value="UPDATE_FLOW_POSITION">
                    Mover card no topo/base da coluna atual
                  </option>
                  <option value="INSERT_TAGS">Adicionar etiquetas</option>
                  <option value="REMOVE_TAGS">Remover etiquetas</option>
                  <option value="SET_CARD_STATUS">Mudar status do card</option>
                  <option value="SET_LEAD">Definir líder do card</option>
                  <option value="ADD_TEAM">Adicionar membros à equipe</option>
                  <option value="SET_PRIVACY">Mudar visibilidade</option>
                  <option value="SEND_WHATSAPP">Notificar via WhatsApp</option>
                  <option value="POST_COMMENT">Adicionar comentário</option>
                </select>
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="bg-primary text-primary-fg hover:bg-primary-hover mt-1 inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium"
                >
                  <Plus size={14} />
                  Nova automação
                </button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function actionTypeLabel(actionType: AutomationActionType): string {
  switch (actionType) {
    case 'MOVE_CARD':
      return 'Mover card pra outra coluna';
    case 'UPDATE_FLOW_POSITION':
      return 'Mover card no topo/base';
    case 'INSERT_TAGS':
      return 'Adicionar etiquetas';
    case 'REMOVE_TAGS':
      return 'Remover etiquetas';
    case 'SET_CARD_STATUS':
      return 'Mudar status do card';
    case 'SET_LEAD':
      return 'Definir líder';
    case 'ADD_TEAM':
      return 'Adicionar membros';
    case 'SET_PRIVACY':
      return 'Mudar visibilidade';
    case 'SEND_WHATSAPP':
      return 'Notificar via WhatsApp';
    case 'POST_COMMENT':
      return 'Adicionar comentário';
    default:
      return String(actionType);
  }
}
