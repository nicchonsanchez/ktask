'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Loader2, Plus, Trash2 } from 'lucide-react';

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
import { describeAutomationRich } from './describe-automation';

/**
 * Doc 48: dialog de automações escopadas a um checklist ou item de
 * checklist. Versão simplificada do ColumnAutomationsDialog — sem abas,
 * só lista + form de criação.
 *
 * O CreateAutomationForm recebe `scope` e ajusta:
 *   - trigger fixo (CHECKLIST_COMPLETED ou CHECKLIST_ITEM_DONE)
 *   - mutation pra endpoint correto
 *   - invalidação correta do query cache
 */
export function ChecklistAutomationDialog({
  scope,
  scopeLabel,
  list,
  boardId,
  open,
  onOpenChange,
}: {
  scope: { kind: 'checklist'; id: string } | { kind: 'item'; id: string };
  /** Texto descritivo do alvo (título do checklist ou texto do item) */
  scopeLabel: string;
  /** Lista atual do card — passada pro CreateAutomationForm pra contexto */
  list: ListWithCards;
  boardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [actionType, setActionType] = useState<AutomationActionType>('UPDATE_FLOW_POSITION');

  // Doc 48: useQuery por escopo. Spread direto de union confunde o TS,
  // então escolhemos a query inline com a tupla fixa de queryKey.
  const automationsQuery = useQuery<Automation[]>({
    queryKey:
      scope.kind === 'checklist'
        ? ['automations', 'by-checklist', scope.id]
        : ['automations', 'by-checklist-item', scope.id],
    queryFn:
      scope.kind === 'checklist'
        ? automationsQueries.byChecklist(scope.id).queryFn
        : automationsQueries.byChecklistItem(scope.id).queryFn,
    enabled: open,
  });

  const queryClient = useQueryClient();
  const notify = useNotify();
  const confirm = useConfirm();

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateAutomation(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey:
          scope.kind === 'checklist'
            ? automationsQueries.byChecklist(scope.id).queryKey
            : automationsQueries.byChecklistItem(scope.id).queryKey,
      });
    },
    onError: () => notify.error('Falha ao alternar automação.'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAutomation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey:
          scope.kind === 'checklist'
            ? automationsQueries.byChecklist(scope.id).queryKey
            : automationsQueries.byChecklistItem(scope.id).queryKey,
      });
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

  const automations = automationsQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(80vh,640px)] w-[min(100vw,640px)] flex-col p-0">
        <header className="border-border/60 flex items-center gap-2 border-b px-5 py-3">
          <Bot size={16} className="text-primary" />
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-fg truncate text-[14px] font-semibold">
              Automações {scope.kind === 'checklist' ? 'do checklist' : 'da tarefa'}
            </DialogTitle>
            <p className="text-fg-muted truncate text-[11px]">
              {scope.kind === 'checklist'
                ? `Quando "${scopeLabel}" for 100% concluído`
                : `Quando "${scopeLabel}" for concluída`}
            </p>
          </div>
        </header>

        {createOpen ? (
          <CreateAutomationForm
            actionType={actionType}
            list={list}
            boardId={boardId}
            scope={scope}
            onCreated={() => setCreateOpen(false)}
            onCancel={() => setCreateOpen(false)}
          />
        ) : (
          <div className="flex flex-1 flex-col overflow-y-auto px-5 py-4">
            {automationsQuery.isLoading && (
              <div className="text-fg-muted flex items-center justify-center gap-2 py-8 text-sm">
                <Loader2 size={14} className="animate-spin" />
                Carregando…
              </div>
            )}
            {!automationsQuery.isLoading && automations.length === 0 && (
              <p className="text-fg-muted py-8 text-center text-sm">
                Nenhuma automação ainda. Crie uma pra reagir à conclusão.
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
            <div className="mt-4 flex flex-col gap-2">
              <label className="text-fg-muted block text-[11px] font-medium">Tipo de ação</label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value as AutomationActionType)}
                className="border-border bg-bg text-fg rounded-md border px-2 py-1.5 text-[13px]"
              >
                <option value="UPDATE_FLOW_POSITION">Mover card no topo/base da coluna</option>
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
