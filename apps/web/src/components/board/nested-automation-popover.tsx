'use client';

import { useState } from 'react';
import { Bot, X } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@ktask/ui';
import type { ListWithCards } from '@/lib/queries/boards';
import type { AutomationActionType, AutomationCondition } from '@/lib/queries/automations';
import { CreateAutomationForm } from './create-automation-form';

/**
 * Sub-automacao aninhada na config de INSERT_CHECKLIST_GROUP/ITEMS.
 * Trigger e fixo pelo escopo (CHECKLIST_COMPLETED ou CHECKLIST_ITEM_DONE) —
 * caller passa via `scope` no NestedAutomationButton.
 *
 * Reusa o MESMO formulario que o user ve quando adiciona automacao
 * manualmente em um item/lista de checklist (CreateAutomationForm com
 * scope={kind:'draft'}). Mesmas 10 acoes, mesma UI, mesma config —
 * so a persistencia muda: em vez de POST/PATCH, devolve via callback.
 */
export interface NestedAutomationDraft {
  actionType: AutomationActionType;
  actionConfig: Record<string, unknown>;
  label?: string;
  conditions?: AutomationCondition[] | null;
}

/**
 * Botao Bot + dialog pra configurar sub-automacao. Quando `value` esta
 * setada, o botao mostra cor diferente (preenchido). Click toggla dialog.
 */
export function NestedAutomationButton({
  scope,
  list,
  boardId,
  value,
  onChange,
  size = 'sm',
}: {
  scope: 'list' | 'item';
  /** Lista do board onde a automacao-pai roda. Passada pro form herdado. */
  list: ListWithCards;
  boardId: string;
  value: NestedAutomationDraft | null;
  onChange: (next: NestedAutomationDraft | null) => void;
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  const [actionType, setActionType] = useState<AutomationActionType>(
    value?.actionType ?? 'MOVE_CARD',
  );
  const isSet = value !== null;

  const btnSize = size === 'sm' ? 'size-6' : 'size-7';
  const iconSize = size === 'sm' ? 13 : 14;
  const triggerLock = scope === 'list' ? 'CHECKLIST_COMPLETED' : 'CHECKLIST_ITEM_DONE';
  const triggerLabel = scope === 'list' ? 'lista 100% concluída' : 'item marcado';

  return (
    <>
      <button
        type="button"
        title={isSet ? 'Editar automação automática' : 'Configurar automação automática'}
        onClick={(e) => {
          e.stopPropagation();
          setActionType(value?.actionType ?? 'MOVE_CARD');
          setOpen(true);
        }}
        className={`${btnSize} inline-flex shrink-0 items-center justify-center rounded transition-colors ${
          isSet
            ? 'bg-primary-subtle text-primary hover:bg-primary-subtle/80'
            : 'text-fg-muted hover:bg-bg-muted hover:text-fg opacity-60 hover:opacity-100'
        }`}
      >
        <Bot size={iconSize} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[min(85vh,720px)] w-[min(100vw,640px)] flex-col p-0">
          <header className="border-border/60 flex items-center gap-2 border-b px-5 py-3">
            <Bot size={16} className="text-primary" />
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-fg truncate text-[14px] font-semibold">
                Automação automática
              </DialogTitle>
              <p className="text-fg-muted truncate text-[11px]">Quando {triggerLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-fg-muted hover:text-fg rounded p-1"
              aria-label="Fechar"
            >
              <X size={14} />
            </button>
          </header>

          {/* Selector de actionType + form herdado. ActionType e controlado
              aqui (igual ChecklistAutomationDialog) e passado pro form. */}
          <div className="border-border/60 flex flex-col gap-2 border-b px-5 py-3">
            <label className="text-fg-muted block text-[11px] font-medium">Tipo de ação</label>
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value as AutomationActionType)}
              className="border-border bg-bg text-fg rounded-md border px-2 py-1.5 text-[13px]"
            >
              <option value="MOVE_CARD">Mover card pra outra coluna</option>
              <option value="UPDATE_FLOW_POSITION">Mover card no topo/base da coluna atual</option>
              <option value="INSERT_TAGS">Adicionar etiquetas</option>
              <option value="REMOVE_TAGS">Remover etiquetas</option>
              <option value="SET_CARD_STATUS">Mudar status do card</option>
              <option value="SET_LEAD">Definir líder do card</option>
              <option value="ADD_TEAM">Adicionar membros à equipe</option>
              <option value="SET_PRIVACY">Mudar visibilidade</option>
              <option value="SEND_WHATSAPP">Notificar via WhatsApp</option>
              <option value="POST_COMMENT">Adicionar comentário</option>
            </select>
          </div>

          <CreateAutomationForm
            key={`${actionType}-${value ? 'edit' : 'new'}`}
            actionType={actionType}
            list={list}
            boardId={boardId}
            editing={value ? buildPseudoAutomation(value, triggerLock) : undefined}
            scope={{
              kind: 'draft',
              triggerLock,
              onDraftSave: (payload) => {
                onChange({
                  actionType: payload.actionType,
                  actionConfig: payload.actionConfig,
                  label: payload.label,
                  conditions: payload.conditions ?? null,
                });
                setOpen(false);
              },
            }}
            onCreated={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />

          {value && (
            <footer className="border-border/60 flex items-center justify-end gap-2 border-t px-5 py-3">
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="text-fg-muted hover:text-danger text-[12px] font-medium"
              >
                Remover automação
              </button>
            </footer>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Constroi um pseudo-Automation pra alimentar o `editing` do CreateAutomationForm
 * a partir de um NestedAutomationDraft. So os campos que o form le sao
 * preenchidos (extractInitial olha actionConfig, triggerConfig, label, conditions).
 */
function buildPseudoAutomation(
  draft: NestedAutomationDraft,
  triggerLock: 'CHECKLIST_COMPLETED' | 'CHECKLIST_ITEM_DONE',
) {
  return {
    id: '__draft__',
    organizationId: '',
    listId: null,
    boardId: null,
    scopeChecklistId: null,
    scopeChecklistItemId: null,
    trigger: triggerLock,
    triggerConfig: {},
    actionType: draft.actionType,
    actionConfig: draft.actionConfig,
    isActive: true,
    conditions: draft.conditions ?? null,
    label: draft.label ?? null,
    createdById: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    _count: { runs: 0 },
  } as unknown as Parameters<typeof CreateAutomationForm>[0]['editing'];
}
