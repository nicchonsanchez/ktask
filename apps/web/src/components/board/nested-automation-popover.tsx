'use client';

import { useState } from 'react';
import { Bot } from 'lucide-react';

import type { ListWithCards } from '@/lib/queries/boards';
import type { AutomationActionType, AutomationCondition } from '@/lib/queries/automations';
import {
  ChecklistAutomationDialog,
  type ChecklistAutomationDraft,
} from './checklist-automation-dialog';

/**
 * Sub-automacao aninhada na config de INSERT_CHECKLIST_GROUP/ITEMS.
 * Trigger fixo pelo escopo (CHECKLIST_COMPLETED ou CHECKLIST_ITEM_DONE).
 *
 * Reusa EXATAMENTE o `ChecklistAutomationDialog` que ja aparece quando
 * o user adiciona automacao manualmente em um item/lista de checklist.
 * Mesma UI, mesma navegacao (lista → click "Nova automacao" → form). A
 * diferenca eh so a persistencia: em vez de POST/PATCH no backend, o
 * dialog em modo draft devolve via callback pra ser salvo no
 * actionConfig da automacao-pai.
 */
export interface NestedAutomationDraft {
  actionType: AutomationActionType;
  actionConfig: Record<string, unknown>;
  label?: string;
  conditions?: AutomationCondition[] | null;
}

export function NestedAutomationButton({
  scope,
  scopeLabel,
  list,
  boardId,
  value,
  onChange,
  size = 'sm',
}: {
  scope: 'list' | 'item';
  /** Texto usado no header do dialog (titulo da lista ou texto do item). */
  scopeLabel?: string;
  /** Lista do board onde a automacao-pai roda. Passada pro dialog herdado. */
  list: ListWithCards;
  boardId: string;
  value: NestedAutomationDraft | null;
  onChange: (next: NestedAutomationDraft | null) => void;
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  const isSet = value !== null;

  const btnSize = size === 'sm' ? 'size-6' : 'size-7';
  const iconSize = size === 'sm' ? 13 : 14;
  const triggerLock = scope === 'list' ? 'CHECKLIST_COMPLETED' : 'CHECKLIST_ITEM_DONE';

  return (
    <>
      <button
        type="button"
        title={isSet ? 'Editar automação automática' : 'Configurar automação automática'}
        onClick={(e) => {
          e.stopPropagation();
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

      <ChecklistAutomationDialog
        open={open}
        onOpenChange={setOpen}
        scopeLabel={scopeLabel ?? (scope === 'list' ? 'esta lista' : 'esta tarefa')}
        list={list}
        boardId={boardId}
        scope={{
          kind: 'draft',
          triggerLock,
          initialDraft: value
            ? {
                actionType: value.actionType,
                actionConfig: value.actionConfig,
                label: value.label,
                conditions: value.conditions ?? null,
              }
            : null,
          onDraftSave: (next: ChecklistAutomationDraft) => {
            onChange({
              actionType: next.actionType,
              actionConfig: next.actionConfig,
              label: next.label,
              conditions: next.conditions ?? null,
            });
          },
          onRemove: () => {
            onChange(null);
          },
        }}
      />
    </>
  );
}
