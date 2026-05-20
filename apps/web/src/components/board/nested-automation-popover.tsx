'use client';

import { useState } from 'react';
import { Bot, Loader2, Trash2, X } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@ktask/ui';
import type { AutomationActionType } from '@/lib/queries/automations';
import { labelsQueries } from '@/lib/queries/labels';
import { useQuery } from '@tanstack/react-query';

/**
 * Forma compacta de uma sub-automacao aninhada na config de
 * INSERT_CHECKLIST_GROUP/ITEMS. Trigger e fixo pelo escopo
 * (CHECKLIST_COMPLETED ou CHECKLIST_ITEM_DONE) — nao aparece no form.
 *
 * Subset de actionTypes pro MVP — cobre os casos comuns em checklist:
 *   - POST_COMMENT
 *   - INSERT_TAGS / REMOVE_TAGS
 *   - SET_CARD_STATUS
 *   - FLAG_DUE_TODAY / FLAG_OVERDUE
 *   - SEND_WHATSAPP (subset: card lead ou phone fixo)
 *
 * Pra acoes mais complexas (MOVE_CARD com targetListId etc), o user
 * adiciona manualmente depois (mesmo fluxo de hoje).
 */
export interface NestedAutomationDraft {
  actionType: AutomationActionType;
  actionConfig: Record<string, unknown>;
  label?: string;
}

const SUPPORTED_ACTIONS: Array<{ value: AutomationActionType; label: string }> = [
  { value: 'POST_COMMENT', label: 'Postar comentário' },
  { value: 'INSERT_TAGS', label: 'Adicionar etiquetas' },
  { value: 'REMOVE_TAGS', label: 'Remover etiquetas' },
  { value: 'SET_CARD_STATUS', label: 'Mudar status do card' },
  { value: 'FLAG_DUE_TODAY', label: 'Marcar prazo: hoje' },
  { value: 'FLAG_OVERDUE', label: 'Marcar prazo: atrasado' },
  { value: 'SEND_WHATSAPP', label: 'Enviar WhatsApp' },
];

/**
 * Botao + popover pra configurar uma sub-automacao. Quando `value` esta
 * setada, o botao mostra cor diferente (preenchido). Click toggla popover.
 */
export function NestedAutomationButton({
  scope,
  boardId,
  value,
  onChange,
  size = 'sm',
}: {
  scope: 'list' | 'item';
  boardId: string;
  value: NestedAutomationDraft | null;
  onChange: (next: NestedAutomationDraft | null) => void;
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  const isSet = value !== null;

  const triggerLabel = scope === 'list' ? 'Quando lista 100% concluída' : 'Quando item marcado';
  const btnSize = size === 'sm' ? 'size-6' : 'size-7';
  const iconSize = size === 'sm' ? 13 : 14;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={isSet ? 'Editar automação' : 'Configurar automação'}
          className={`${btnSize} inline-flex shrink-0 items-center justify-center rounded transition-colors ${
            isSet
              ? 'bg-primary-subtle text-primary hover:bg-primary-subtle/80'
              : 'text-fg-muted hover:bg-bg-muted hover:text-fg opacity-60 hover:opacity-100'
          }`}
        >
          <Bot size={iconSize} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="flex w-[min(360px,calc(100vw-2rem))] flex-col gap-3 p-3"
      >
        <header className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-fg text-sm font-semibold">Automação automática</h3>
            <p className="text-fg-muted text-[11px]">{triggerLabel}</p>
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

        <NestedAutomationForm
          boardId={boardId}
          value={value}
          onChange={(next) => {
            onChange(next);
            setOpen(false);
          }}
          onRemove={() => {
            onChange(null);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function NestedAutomationForm({
  boardId,
  value,
  onChange,
  onRemove,
}: {
  boardId: string;
  value: NestedAutomationDraft | null;
  onChange: (next: NestedAutomationDraft) => void;
  onRemove: () => void;
}) {
  const [actionType, setActionType] = useState<AutomationActionType>(
    value?.actionType ?? 'POST_COMMENT',
  );
  const [config, setConfig] = useState<Record<string, unknown>>(value?.actionConfig ?? {});
  const [label, setLabel] = useState(value?.label ?? '');

  function save() {
    onChange({
      actionType,
      actionConfig: config,
      label: label.trim() || undefined,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-fg-muted text-[11px] font-medium">O que fazer</label>
        <select
          value={actionType}
          onChange={(e) => {
            setActionType(e.target.value as AutomationActionType);
            setConfig({}); // reset config quando muda action
          }}
          className="border-border bg-bg focus:border-primary rounded-md border px-2 py-1.5 text-sm focus:outline-none"
        >
          {SUPPORTED_ACTIONS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      <ActionConfigEditor
        boardId={boardId}
        actionType={actionType}
        config={config}
        onChange={setConfig}
      />

      <div className="flex flex-col gap-1">
        <label className="text-fg-muted text-[11px] font-medium">Apelido (opcional)</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={120}
          placeholder="ex: Notificar líder quando feito"
          className="border-border bg-bg focus:border-primary rounded-md border px-2 py-1 text-xs focus:outline-none"
        />
      </div>

      <div className="border-border/60 flex items-center justify-between gap-2 border-t pt-2">
        {value ? (
          <button
            type="button"
            onClick={onRemove}
            className="text-fg-muted hover:text-danger inline-flex items-center gap-1 text-[11px]"
          >
            <Trash2 size={11} /> Remover
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={save}
          className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium"
        >
          {value ? 'Salvar' : 'Configurar'}
        </button>
      </div>
    </div>
  );
}

function ActionConfigEditor({
  boardId,
  actionType,
  config,
  onChange,
}: {
  boardId: string;
  actionType: AutomationActionType;
  config: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  if (actionType === 'POST_COMMENT') {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-fg-muted text-[11px] font-medium">Texto do comentário</label>
        <textarea
          value={(config.template as string) ?? ''}
          onChange={(e) => onChange({ template: e.target.value })}
          rows={3}
          placeholder="Pode usar {{card.title}}, {{lead.name}}, etc."
          className="border-border bg-bg focus:border-primary resize-none rounded-md border px-2 py-1.5 text-xs focus:outline-none"
        />
      </div>
    );
  }

  if (actionType === 'INSERT_TAGS' || actionType === 'REMOVE_TAGS') {
    return <TagsEditor boardId={boardId} config={config} onChange={onChange} />;
  }

  if (actionType === 'SET_CARD_STATUS') {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-fg-muted text-[11px] font-medium">Novo status</label>
        <select
          value={(config.status as string) ?? 'COMPLETED'}
          onChange={(e) => onChange({ status: e.target.value })}
          className="border-border bg-bg focus:border-primary rounded-md border px-2 py-1.5 text-xs focus:outline-none"
        >
          <option value="COMPLETED">Concluído</option>
          <option value="REOPENED">Reabrir (Ativo)</option>
          <option value="ARCHIVED">Arquivar</option>
        </select>
      </div>
    );
  }

  if (actionType === 'FLAG_DUE_TODAY' || actionType === 'FLAG_OVERDUE') {
    return (
      <p className="text-fg-muted bg-bg-muted/40 rounded-md p-2 text-[11px] leading-relaxed">
        Esta ação não tem configuração — quando a automação rodar, o card é marcado conforme o nome
        da ação.
      </p>
    );
  }

  if (actionType === 'SEND_WHATSAPP') {
    return <WhatsAppEditor config={config} onChange={onChange} />;
  }

  return (
    <p className="text-fg-muted bg-bg-muted/40 rounded-md p-2 text-[11px]">
      Configuração não disponível neste editor compacto. Pra ações mais avançadas, crie a automação
      manualmente no item depois.
    </p>
  );
}

function TagsEditor({
  boardId,
  config,
  onChange,
}: {
  boardId: string;
  config: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const labelsQ = useQuery({ ...labelsQueries.byBoard(boardId) });
  const selected = Array.isArray(config.tagIds) ? (config.tagIds as string[]) : [];

  function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    onChange({ tagIds: next });
  }

  if (labelsQ.isLoading) {
    return (
      <div className="text-fg-muted flex items-center gap-2 py-2 text-xs">
        <Loader2 size={12} className="animate-spin" /> Carregando etiquetas…
      </div>
    );
  }
  const labels = labelsQ.data ?? [];
  if (labels.length === 0) {
    return (
      <p className="text-fg-muted bg-bg-muted/40 rounded-md p-2 text-[11px]">
        Esse quadro não tem etiquetas cadastradas.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-fg-muted text-[11px] font-medium">Etiquetas</label>
      <div className="flex flex-wrap gap-1">
        {labels.map((l) => {
          const on = selected.includes(l.id);
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => toggle(l.id)}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                on ? 'border-transparent text-white' : 'border-border text-fg-muted'
              }`}
              style={on ? { backgroundColor: l.color } : undefined}
            >
              {!on && (
                <span
                  aria-hidden
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: l.color }}
                />
              )}
              {l.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WhatsAppEditor({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const mode = ((config.recipientMode as string) ?? 'CARD_LEAD') as 'CARD_LEAD' | 'PHONE';
  const phone = (config.phone as string) ?? '';
  const template = (config.template as string) ?? '';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <label className="text-fg-muted text-[11px] font-medium">Destinatário</label>
        <select
          value={mode}
          onChange={(e) => onChange({ ...config, recipientMode: e.target.value })}
          className="border-border bg-bg focus:border-primary rounded-md border px-2 py-1.5 text-xs focus:outline-none"
        >
          <option value="CARD_LEAD">Líder do card</option>
          <option value="PHONE">Telefone fixo</option>
        </select>
      </div>
      {mode === 'PHONE' && (
        <div className="flex flex-col gap-1">
          <label className="text-fg-muted text-[11px] font-medium">Telefone (com DDI)</label>
          <input
            type="text"
            value={phone}
            inputMode="numeric"
            onChange={(e) => onChange({ ...config, phone: e.target.value.replace(/\D/g, '') })}
            placeholder="5531999999999"
            className="border-border bg-bg focus:border-primary rounded-md border px-2 py-1 text-xs focus:outline-none"
          />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label className="text-fg-muted text-[11px] font-medium">Mensagem</label>
        <textarea
          value={template}
          onChange={(e) => onChange({ ...config, template: e.target.value })}
          rows={3}
          placeholder="Pode usar {{card.title}}, {{lead.name}}, etc."
          className="border-border bg-bg focus:border-primary resize-none rounded-md border px-2 py-1.5 text-xs focus:outline-none"
        />
      </div>
    </div>
  );
}
