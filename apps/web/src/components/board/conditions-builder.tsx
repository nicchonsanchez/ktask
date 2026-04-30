'use client';

import { Filter, Plus, Trash2 } from 'lucide-react';
import type { AutomationCondition, Priority } from '@/lib/queries/automations';
import type { Label } from '@/lib/queries/labels';

interface OrgMember {
  userId: string;
  user: { id: string; name: string };
}

const FIELDS: Array<{ value: AutomationCondition['field']; label: string }> = [
  { value: 'tags', label: 'Tags' },
  { value: 'priority', label: 'Prioridade' },
  { value: 'lead', label: 'Líder do card' },
  { value: 'dueDate', label: 'Prazo' },
];

const TAG_OPS: Array<{ value: string; label: string }> = [
  { value: 'containsAny', label: 'Contém alguma das tags' },
  { value: 'notContainsAny', label: 'Não contém nenhuma das tags' },
  { value: 'containsAll', label: 'Contém todas as tags' },
  { value: 'notContainsAll', label: 'Não contém todas as tags' },
];

const PRIORITY_OPS: Array<{ value: string; label: string }> = [
  { value: 'is', label: 'É' },
  { value: 'isNot', label: 'Não é' },
  { value: 'isAny', label: 'É qualquer uma de' },
  { value: 'isNotAny', label: 'Não é nenhuma de' },
];

const LEAD_OPS: Array<{ value: string; label: string }> = [
  { value: 'is', label: 'É' },
  { value: 'isNot', label: 'Não é' },
  { value: 'isAny', label: 'É qualquer um de' },
  { value: 'isSet', label: 'Está definido (qualquer pessoa)' },
  { value: 'isNotSet', label: 'Não está definido' },
];

const DUEDATE_OPS: Array<{ value: string; label: string; needsValue?: boolean }> = [
  { value: 'overdue', label: 'Está atrasado' },
  { value: 'dueToday', label: 'Vence hoje' },
  { value: 'dueWithinDays', label: 'Vence nos próximos N dias', needsValue: true },
  { value: 'dueAfterDays', label: 'Vence depois de N dias', needsValue: true },
  { value: 'hasDueDate', label: 'Tem prazo definido' },
  { value: 'noDueDate', label: 'Não tem prazo' },
];

const PRIORITY_LABELS: Record<Priority, string> = {
  NONE: 'Sem prioridade',
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};
const PRIORITIES: Priority[] = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'];

/**
 * Builder das condicoes (AND) de uma automacao. Cada linha tem field +
 * operator + value especifico do field. Lista vazia = automacao sempre roda.
 */
export function ConditionsBuilder({
  conditions,
  onChange,
  labels,
  members,
}: {
  conditions: AutomationCondition[];
  onChange: (next: AutomationCondition[]) => void;
  labels: Label[];
  members: OrgMember[];
}) {
  function addCondition() {
    onChange([...conditions, { field: 'tags', operator: 'containsAny', value: [] }]);
  }

  function updateAt(idx: number, next: AutomationCondition) {
    onChange(conditions.map((c, i) => (i === idx ? next : c)));
  }

  function removeAt(idx: number) {
    onChange(conditions.filter((_, i) => i !== idx));
  }

  return (
    <div className="border-border/60 bg-bg-subtle/40 flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <Filter size={13} className="text-fg-muted" />
        <p className="text-fg text-[12px] font-semibold">Configuração condicional (opcional)</p>
      </div>
      {conditions.length === 0 ? (
        <p className="text-fg-muted text-[11px]">
          A automação roda em todos os cards que dispararem o trigger. Adicione condições pra
          filtrar.
        </p>
      ) : (
        <p className="text-fg-muted text-[11px]">
          Roda só quando <strong>todas</strong> estas forem verdadeiras:
        </p>
      )}

      {conditions.map((c, i) => (
        <ConditionRow
          key={i}
          index={i}
          condition={c}
          labels={labels}
          members={members}
          onChange={(next) => updateAt(i, next)}
          onRemove={() => removeAt(i)}
        />
      ))}

      <button
        type="button"
        onClick={addCondition}
        className="border-border/70 text-fg-muted hover:bg-bg hover:text-fg mt-1 inline-flex w-fit items-center gap-1 rounded-md border bg-transparent px-2.5 py-1 text-[11px] transition-colors"
      >
        <Plus size={11} />
        Adicionar condição
      </button>
    </div>
  );
}

function ConditionRow({
  index,
  condition,
  labels,
  members,
  onChange,
  onRemove,
}: {
  index: number;
  condition: AutomationCondition;
  labels: Label[];
  members: OrgMember[];
  onChange: (next: AutomationCondition) => void;
  onRemove: () => void;
}) {
  function changeField(field: AutomationCondition['field']) {
    if (field === 'tags') onChange({ field, operator: 'containsAny', value: [] });
    if (field === 'priority') onChange({ field, operator: 'isAny', value: [] });
    if (field === 'lead') onChange({ field, operator: 'isAny', value: [] });
    if (field === 'dueDate') onChange({ field, operator: 'overdue' });
  }

  return (
    <div className="border-border/60 bg-bg flex flex-col gap-2 rounded-md border p-2">
      <div className="flex items-start gap-2">
        <span className="text-fg-muted shrink-0 pt-1.5 text-[11px] font-medium">
          Condição {index + 1}:
        </span>
        <select
          value={condition.field}
          onChange={(e) => changeField(e.target.value as AutomationCondition['field'])}
          className="border-border focus:border-primary bg-bg text-fg rounded-md border px-1.5 py-1 text-[12px] focus:outline-none"
        >
          {FIELDS.map((f) => (
            <option key={f.value} value={f.value} className="bg-bg text-fg">
              {f.label}
            </option>
          ))}
        </select>
        <select
          value={condition.operator}
          onChange={(e) =>
            onChange({ ...condition, operator: e.target.value as never } as AutomationCondition)
          }
          className="border-border focus:border-primary bg-bg text-fg flex-1 rounded-md border px-1.5 py-1 text-[12px] focus:outline-none"
        >
          {opsFor(condition.field).map((op) => (
            <option key={op.value} value={op.value} className="bg-bg text-fg">
              {op.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRemove}
          className="text-fg-muted hover:text-danger shrink-0 rounded p-1"
          aria-label="Remover condição"
          title="Remover"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Value picker — depende do field/operator */}
      {condition.field === 'tags' && (
        <MultiCheckList
          items={labels.map((l) => ({ value: l.id, label: l.name, color: l.color }))}
          selected={condition.value}
          onChange={(value) => onChange({ ...condition, value })}
          placeholder="Selecione tags…"
          emptyHint="Nenhuma etiqueta no fluxo. Crie uma primeiro."
        />
      )}

      {condition.field === 'priority' && (
        <MultiCheckList
          items={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
          selected={condition.value}
          onChange={(value) => onChange({ ...condition, value: value as Priority[] })}
          placeholder="Selecione prioridades…"
        />
      )}

      {condition.field === 'lead' &&
        condition.operator !== 'isSet' &&
        condition.operator !== 'isNotSet' && (
          <MultiCheckList
            items={members.map((m) => ({ value: m.userId, label: m.user.name }))}
            selected={condition.value ?? []}
            onChange={(value) => onChange({ ...condition, value })}
            placeholder="Selecione membros…"
          />
        )}

      {condition.field === 'dueDate' &&
        (condition.operator === 'dueWithinDays' || condition.operator === 'dueAfterDays') && (
          <div className="flex items-center gap-2">
            <span className="text-fg-muted text-[11px]">N dias:</span>
            <input
              type="number"
              min={0}
              max={365}
              value={condition.value ?? 0}
              onChange={(e) => onChange({ ...condition, value: Number(e.target.value) || 0 })}
              className="border-border focus:border-primary w-20 rounded-md border px-2 py-1 text-[12px] focus:outline-none"
            />
          </div>
        )}
    </div>
  );
}

function opsFor(field: AutomationCondition['field']) {
  if (field === 'tags') return TAG_OPS;
  if (field === 'priority') return PRIORITY_OPS;
  if (field === 'lead') return LEAD_OPS;
  return DUEDATE_OPS;
}

function MultiCheckList({
  items,
  selected,
  onChange,
  placeholder,
  emptyHint,
}: {
  items: Array<{ value: string; label: string; color?: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  emptyHint?: string;
}) {
  if (items.length === 0) {
    return <p className="text-fg-muted text-[11px]">{emptyHint ?? 'Nenhuma opção disponível.'}</p>;
  }
  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  }
  return (
    <div className="flex flex-wrap gap-1">
      <span className="text-fg-subtle text-[10px]">{placeholder}</span>
      {items.map((it) => {
        const isSelected = selected.includes(it.value);
        return (
          <button
            key={it.value}
            type="button"
            onClick={() => toggle(it.value)}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
              isSelected
                ? 'border-primary bg-primary-subtle/50 text-fg'
                : 'border-border/70 text-fg-muted hover:border-border-strong'
            }`}
            style={it.color && isSelected ? { backgroundColor: it.color, color: '#fff' } : {}}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
