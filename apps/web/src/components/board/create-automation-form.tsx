'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

import type { ListWithCards } from '@/lib/queries/boards';
import {
  automationsQueries,
  createAutomation,
  type AutomationActionType,
  type AutomationTrigger,
  type CreateAutomationInput,
} from '@/lib/queries/automations';
import { labelsQueries } from '@/lib/queries/labels';
import { useNotify } from '@/components/ui/dialogs';

/**
 * Form de criação de automação. Fase A entrega só `INSERT_TAGS` —
 * outras actions vêm conforme handlers viram prontos na engine.
 *
 * Estrutura:
 *   1. Trigger (radio com 6 opções; default CARD_ENTERED)
 *   2. Configuração específica do trigger (delay, etc.) — TIME_IN_LIST tem
 *      input de minutos
 *   3. Configuração específica da action — INSERT_TAGS lista as labels
 *      do board pra escolher
 *   4. Label opcional pra identificação humana
 */
export function CreateAutomationForm({
  actionType,
  list,
  boardId,
  onCreated,
  onCancel,
}: {
  actionType: AutomationActionType;
  list: ListWithCards;
  boardId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  // Trigger
  const [trigger, setTrigger] = useState<AutomationTrigger>('CARD_ENTERED');
  const [minutes, setMinutes] = useState(60);

  // Action config — específica por tipo
  const [tagIds, setTagIds] = useState<string[]>([]);

  // Label humana (opcional)
  const [label, setLabel] = useState('');

  const queryClient = useQueryClient();
  const notify = useNotify();

  // Lista de labels do board pra picker do INSERT_TAGS
  const labelsQ = useQuery({
    ...labelsQueries.byBoard(boardId),
    enabled: actionType === 'INSERT_TAGS',
  });

  const createMut = useMutation({
    mutationFn: () => {
      const input: CreateAutomationInput = {
        trigger,
        triggerConfig: trigger === 'TIME_IN_LIST' ? { minutes } : {},
        actionType,
        actionConfig: actionType === 'INSERT_TAGS' ? { tagIds } : {},
        label: label.trim() || undefined,
      };
      return createAutomation(list.id, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: automationsQueries.byList(list.id).queryKey });
      notify.success('Automação criada.');
      onCreated();
    },
    onError: () => notify.error('Falha ao criar automação.'),
  });

  const canSubmit =
    actionType === 'INSERT_TAGS' ? tagIds.length > 0 && !createMut.isPending : !createMut.isPending;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        createMut.mutate();
      }}
      className="flex flex-1 flex-col overflow-hidden"
    >
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <section className="mb-5">
          <h3 className="text-fg mb-2 text-[12px] font-semibold uppercase tracking-wide">Quando</h3>
          <div className="flex flex-col gap-1.5">
            {TRIGGERS.map((t) => (
              <label
                key={t.value}
                className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 ${
                  trigger === t.value
                    ? 'border-primary bg-primary-subtle/30'
                    : 'border-border/60 hover:border-border-strong'
                } ${t.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <input
                  type="radio"
                  name="trigger"
                  value={t.value}
                  checked={trigger === t.value}
                  onChange={() => setTrigger(t.value)}
                  disabled={t.disabled}
                  className="accent-primary mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-fg text-[13px] font-medium">{t.label}</p>
                  {t.disabled && (
                    <p className="text-fg-subtle text-[10px]">
                      Disponível quando os triggers temporais estiverem rodando.
                    </p>
                  )}
                </div>
              </label>
            ))}
          </div>

          {trigger === 'TIME_IN_LIST' && (
            <div className="mt-3">
              <label className="text-fg-muted block text-[11px] font-medium">
                Tempo na coluna (minutos)
              </label>
              <input
                type="number"
                min={1}
                max={43200}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="border-border focus:border-primary mt-1 w-32 rounded-md border px-2 py-1 text-sm focus:outline-none"
              />
            </div>
          )}
        </section>

        <section>
          <h3 className="text-fg mb-2 text-[12px] font-semibold uppercase tracking-wide">
            O que fazer
          </h3>

          {actionType === 'INSERT_TAGS' && (
            <InsertTagsConfig
              boardId={boardId}
              labels={labelsQ.data ?? []}
              loading={labelsQ.isLoading}
              selectedIds={tagIds}
              onChange={setTagIds}
            />
          )}

          {actionType !== 'INSERT_TAGS' && (
            <p className="text-fg-muted text-[12px]">
              Configuração específica desta ação ainda não foi implementada.
            </p>
          )}
        </section>

        <section className="mt-5">
          <label className="text-fg-muted block text-[11px] font-medium">Apelido (opcional)</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder='Ex: "Marcar como urgente quando entrar em A fazer"'
            maxLength={120}
            className="border-border focus:border-primary mt-1 w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none"
          />
        </section>
      </div>

      <div className="border-border/60 bg-bg-subtle/40 flex shrink-0 justify-end gap-2 border-t px-5 py-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={createMut.isPending}
          className="border-border text-fg hover:bg-bg-muted inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-60"
        >
          Voltar
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-60"
        >
          {createMut.isPending && <Loader2 size={13} className="animate-spin" />}
          Criar automação
        </button>
      </div>
    </form>
  );
}

const TRIGGERS: Array<{ value: AutomationTrigger; label: string; disabled?: boolean }> = [
  { value: 'CARD_ENTERED', label: 'Quando um card entrar na coluna' },
  { value: 'CARD_LEFT', label: 'Quando um card sair da coluna' },
  { value: 'TIME_IN_LIST', label: 'Quando um card ficar tempo demais na coluna', disabled: true },
  {
    value: 'TIME_NO_INTERACTION',
    label: 'Quando um card ficar parado (sem interação)',
    disabled: true,
  },
  { value: 'DUE_DATE_TODAY', label: 'Quando o prazo do card cair pra hoje', disabled: true },
  { value: 'DUE_DATE_OVERDUE', label: 'Quando o prazo do card vencer', disabled: true },
];

function InsertTagsConfig({
  labels,
  loading,
  selectedIds,
  onChange,
}: {
  boardId: string;
  labels: Array<{ id: string; name: string; color: string }>;
  loading: boolean;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  if (loading) {
    return <Loader2 size={14} className="text-fg-muted animate-spin" />;
  }
  if (labels.length === 0) {
    return (
      <p className="border-border/60 bg-bg-subtle/50 text-fg-muted rounded-md border border-dashed px-3 py-2 text-[12px]">
        Este quadro não tem etiquetas ainda. Crie etiquetas no card primeiro (clique em
        &quot;Etiqueta&quot; em qualquer card).
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((l) => {
        const selected = selectedIds.includes(l.id);
        return (
          <button
            key={l.id}
            type="button"
            onClick={() => toggle(l.id)}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
              selected ? 'ring-fg/30 ring-2 ring-offset-1' : 'opacity-70 hover:opacity-100'
            }`}
            style={{ backgroundColor: l.color, color: '#fff' }}
          >
            {l.name}
          </button>
        );
      })}
    </div>
  );
}
