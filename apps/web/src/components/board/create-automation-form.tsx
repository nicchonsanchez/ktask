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
import { orgMembersQuery } from '@/lib/queries/cards';
import { UserAvatar } from '@/components/user-avatar';
import { useNotify } from '@/components/ui/dialogs';

/**
 * Form de criação de automação. Cada actionType tem seu próprio
 * componente de configuração — isolando UI específica e validação
 * de canSubmit.
 *
 * Actions implementadas (Fase B+C):
 *   INSERT_TAGS, REMOVE_TAGS, INSERT_CHECKLIST_ITEMS, SET_LEAD,
 *   ADD_TEAM, POST_COMMENT, SET_CARD_STATUS, CREATE_CHILD_CARD
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
  const [trigger, setTrigger] = useState<AutomationTrigger>('CARD_ENTERED');
  const [minutes, setMinutes] = useState(60);

  // Action-specific state
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [checklistTitle, setChecklistTitle] = useState('Tarefas');
  const [checklistItemsRaw, setChecklistItemsRaw] = useState('');
  const [leadUserId, setLeadUserId] = useState('');
  const [teamUserIds, setTeamUserIds] = useState<string[]>([]);
  const [commentTemplate, setCommentTemplate] = useState('');
  const [cardStatus, setCardStatus] = useState<'COMPLETED' | 'REOPENED' | 'ARCHIVED'>('COMPLETED');
  const [childTitleTemplate, setChildTitleTemplate] = useState('Sub-tarefa de {{card.title}}');
  const [copyLead, setCopyLead] = useState(false);
  const [copyTeam, setCopyTeam] = useState(false);
  const [copyTags, setCopyTags] = useState(false);
  const [copyDueDate, setCopyDueDate] = useState(false);
  const [flowPosition, setFlowPosition] = useState<'TOP' | 'BOTTOM'>('TOP');

  const [label, setLabel] = useState('');

  const queryClient = useQueryClient();
  const notify = useNotify();

  const labelsQ = useQuery({
    ...labelsQueries.byBoard(boardId),
    enabled: actionType === 'INSERT_TAGS' || actionType === 'REMOVE_TAGS',
  });
  const membersQ = useQuery({
    ...orgMembersQuery,
    enabled: actionType === 'SET_LEAD' || actionType === 'ADD_TEAM',
  });

  const createMut = useMutation({
    mutationFn: () => {
      const actionConfig = buildActionConfig(actionType, {
        tagIds,
        checklistTitle,
        checklistItems: checklistItemsRaw,
        leadUserId,
        teamUserIds,
        commentTemplate,
        cardStatus,
        childTitleTemplate,
        copyLead,
        copyTeam,
        copyTags,
        copyDueDate,
        flowPosition,
      });
      const input: CreateAutomationInput = {
        trigger,
        triggerConfig:
          trigger === 'TIME_IN_LIST' || trigger === 'TIME_NO_INTERACTION' ? { minutes } : {},
        actionType,
        actionConfig,
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
    !createMut.isPending &&
    validateAction(actionType, {
      tagIds,
      checklistItems: checklistItemsRaw,
      leadUserId,
      teamUserIds,
      commentTemplate,
      childTitleTemplate,
    });

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

          {(trigger === 'TIME_IN_LIST' || trigger === 'TIME_NO_INTERACTION') && (
            <div className="mt-3">
              <label className="text-fg-muted block text-[11px] font-medium">
                {trigger === 'TIME_IN_LIST'
                  ? 'Tempo na coluna (minutos)'
                  : 'Tempo sem interação (minutos)'}
              </label>
              <input
                type="number"
                min={1}
                max={43200}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="border-border focus:border-primary mt-1 w-32 rounded-md border px-2 py-1 text-sm focus:outline-none"
              />
              <p className="text-fg-subtle mt-1 text-[10px]">
                A automação roda quando o tempo é atingido (verificado a cada minuto).
              </p>
            </div>
          )}
          {(trigger === 'DUE_DATE_TODAY' || trigger === 'DUE_DATE_OVERDUE') && (
            <p className="text-fg-subtle mt-3 text-[11px]">
              {trigger === 'DUE_DATE_TODAY'
                ? 'Roda 1x quando o prazo do card cair pra hoje (verificação horária).'
                : 'Roda 1x por dia para cada card vencido (verificação horária).'}
            </p>
          )}
        </section>

        <section>
          <h3 className="text-fg mb-2 text-[12px] font-semibold uppercase tracking-wide">
            O que fazer
          </h3>

          {(actionType === 'INSERT_TAGS' || actionType === 'REMOVE_TAGS') && (
            <TagsConfig
              labels={labelsQ.data ?? []}
              loading={labelsQ.isLoading}
              selectedIds={tagIds}
              onChange={setTagIds}
              hint={
                actionType === 'INSERT_TAGS'
                  ? 'Etiquetas serão adicionadas ao card (sem duplicar).'
                  : 'Etiquetas serão removidas do card se estiverem presentes.'
              }
            />
          )}

          {(actionType === 'INSERT_CHECKLIST_ITEMS' || actionType === 'INSERT_CHECKLIST_GROUP') && (
            <ChecklistItemsConfig
              checklistTitle={checklistTitle}
              setChecklistTitle={setChecklistTitle}
              itemsRaw={checklistItemsRaw}
              setItemsRaw={setChecklistItemsRaw}
              hint={
                actionType === 'INSERT_CHECKLIST_GROUP'
                  ? 'Cria um novo checklist sempre — útil pra rodadas que se repetem em fases diferentes.'
                  : 'Reaproveita o checklist existente com este título; senão cria um novo.'
              }
            />
          )}

          {actionType === 'UPDATE_FLOW_POSITION' && (
            <FlowPositionConfig value={flowPosition} onChange={setFlowPosition} />
          )}

          {actionType === 'SET_LEAD' && (
            <SingleUserConfig
              members={membersQ.data ?? []}
              loading={membersQ.isLoading}
              selectedId={leadUserId}
              onChange={setLeadUserId}
            />
          )}

          {actionType === 'ADD_TEAM' && (
            <MultiUserConfig
              members={membersQ.data ?? []}
              loading={membersQ.isLoading}
              selectedIds={teamUserIds}
              onChange={setTeamUserIds}
            />
          )}

          {actionType === 'POST_COMMENT' && (
            <CommentTemplateConfig value={commentTemplate} onChange={setCommentTemplate} />
          )}

          {actionType === 'SET_CARD_STATUS' && (
            <CardStatusConfig value={cardStatus} onChange={setCardStatus} />
          )}

          {actionType === 'CREATE_CHILD_CARD' && (
            <CreateChildConfig
              titleTemplate={childTitleTemplate}
              setTitleTemplate={setChildTitleTemplate}
              copyLead={copyLead}
              setCopyLead={setCopyLead}
              copyTeam={copyTeam}
              setCopyTeam={setCopyTeam}
              copyTags={copyTags}
              setCopyTags={setCopyTags}
              copyDueDate={copyDueDate}
              setCopyDueDate={setCopyDueDate}
            />
          )}

          {!IMPLEMENTED.has(actionType) && (
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

const IMPLEMENTED = new Set<AutomationActionType>([
  'INSERT_TAGS',
  'REMOVE_TAGS',
  'INSERT_CHECKLIST_ITEMS',
  'INSERT_CHECKLIST_GROUP',
  'SET_LEAD',
  'ADD_TEAM',
  'POST_COMMENT',
  'SET_CARD_STATUS',
  'CREATE_CHILD_CARD',
  'UPDATE_FLOW_POSITION',
]);

const TRIGGERS: Array<{ value: AutomationTrigger; label: string; disabled?: boolean }> = [
  { value: 'CARD_ENTERED', label: 'Quando um card entrar na coluna' },
  { value: 'CARD_LEFT', label: 'Quando um card sair da coluna' },
  { value: 'TIME_IN_LIST', label: 'Quando um card ficar tempo demais na coluna' },
  {
    value: 'TIME_NO_INTERACTION',
    label: 'Quando um card ficar parado (sem interação)',
  },
  { value: 'DUE_DATE_TODAY', label: 'Quando o prazo do card cair pra hoje' },
  { value: 'DUE_DATE_OVERDUE', label: 'Quando o prazo do card vencer' },
];

interface ConfigState {
  tagIds: string[];
  checklistTitle: string;
  checklistItems: string;
  leadUserId: string;
  teamUserIds: string[];
  commentTemplate: string;
  cardStatus: 'COMPLETED' | 'REOPENED' | 'ARCHIVED';
  childTitleTemplate: string;
  copyLead: boolean;
  copyTeam: boolean;
  copyTags: boolean;
  copyDueDate: boolean;
  flowPosition: 'TOP' | 'BOTTOM';
}

function buildActionConfig(
  actionType: AutomationActionType,
  s: ConfigState,
): Record<string, unknown> {
  switch (actionType) {
    case 'INSERT_TAGS':
    case 'REMOVE_TAGS':
      return { tagIds: s.tagIds };
    case 'INSERT_CHECKLIST_ITEMS':
      return {
        checklistTitle: s.checklistTitle.trim() || 'Tarefas',
        items: s.checklistItems
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
      };
    case 'INSERT_CHECKLIST_GROUP':
      return {
        title: s.checklistTitle.trim() || 'Tarefas',
        items: s.checklistItems
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
      };
    case 'UPDATE_FLOW_POSITION':
      return { position: s.flowPosition };
    case 'SET_LEAD':
      return { userId: s.leadUserId };
    case 'ADD_TEAM':
      return { userIds: s.teamUserIds };
    case 'POST_COMMENT':
      return { template: s.commentTemplate.trim() };
    case 'SET_CARD_STATUS':
      return { status: s.cardStatus };
    case 'CREATE_CHILD_CARD':
      return {
        titleTemplate: s.childTitleTemplate.trim(),
        copyLead: s.copyLead,
        copyTeam: s.copyTeam,
        copyTags: s.copyTags,
        copyDueDate: s.copyDueDate,
      };
    default:
      return {};
  }
}

function validateAction(
  actionType: AutomationActionType,
  s: {
    tagIds: string[];
    checklistItems: string;
    leadUserId: string;
    teamUserIds: string[];
    commentTemplate: string;
    childTitleTemplate: string;
  },
): boolean {
  switch (actionType) {
    case 'INSERT_TAGS':
    case 'REMOVE_TAGS':
      return s.tagIds.length > 0;
    case 'INSERT_CHECKLIST_ITEMS':
    case 'INSERT_CHECKLIST_GROUP':
      return s.checklistItems.split('\n').some((l) => l.trim().length > 0);
    case 'UPDATE_FLOW_POSITION':
      return true;
    case 'SET_LEAD':
      return Boolean(s.leadUserId);
    case 'ADD_TEAM':
      return s.teamUserIds.length > 0;
    case 'POST_COMMENT':
      return s.commentTemplate.trim().length > 0;
    case 'SET_CARD_STATUS':
      return true; // sempre tem default 'COMPLETED'
    case 'CREATE_CHILD_CARD':
      return s.childTitleTemplate.trim().length > 0;
    default:
      return false;
  }
}

// ---------------- Sub-componentes de configuração ----------------

function TagsConfig({
  labels,
  loading,
  selectedIds,
  onChange,
  hint,
}: {
  labels: Array<{ id: string; name: string; color: string }>;
  loading: boolean;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  hint: string;
}) {
  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }
  if (loading) return <Loader2 size={14} className="text-fg-muted animate-spin" />;
  if (labels.length === 0) {
    return (
      <p className="border-border/60 bg-bg-subtle/50 text-fg-muted rounded-md border border-dashed px-3 py-2 text-[12px]">
        Este quadro não tem etiquetas. Crie uma primeiro pelo menu de etiquetas de qualquer card.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-fg-subtle text-[11px]">{hint}</p>
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
    </div>
  );
}

function ChecklistItemsConfig({
  checklistTitle,
  setChecklistTitle,
  itemsRaw,
  setItemsRaw,
  hint,
}: {
  checklistTitle: string;
  setChecklistTitle: (v: string) => void;
  itemsRaw: string;
  setItemsRaw: (v: string) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <label className="text-fg-muted block text-[11px] font-medium">
          Nome da lista de tarefas
        </label>
        <input
          type="text"
          value={checklistTitle}
          onChange={(e) => setChecklistTitle(e.target.value)}
          maxLength={200}
          placeholder="Tarefas"
          className="border-border focus:border-primary mt-1 w-full rounded-md border px-2 py-1 text-sm focus:outline-none"
        />
        <p className="text-fg-subtle mt-0.5 text-[10px]">
          {hint ?? 'Se já existir uma lista com esse nome no card, os itens são anexados nela.'}
        </p>
      </div>
      <div>
        <label className="text-fg-muted block text-[11px] font-medium">Itens (um por linha)</label>
        <textarea
          value={itemsRaw}
          onChange={(e) => setItemsRaw(e.target.value)}
          rows={5}
          placeholder={'Conferir layout\nValidar copy\nAprovação cliente'}
          className="border-border focus:border-primary mt-1 w-full rounded-md border px-2 py-1 text-sm focus:outline-none"
        />
      </div>
    </div>
  );
}

interface OrgMember {
  userId: string;
  user: { id: string; name: string; email: string; avatarUrl: string | null };
}

function SingleUserConfig({
  members,
  loading,
  selectedId,
  onChange,
}: {
  members: OrgMember[];
  loading: boolean;
  selectedId: string;
  onChange: (id: string) => void;
}) {
  if (loading) return <Loader2 size={14} className="text-fg-muted animate-spin" />;
  return (
    <ul className="divide-border/40 border-border/60 max-h-64 divide-y overflow-y-auto rounded-md border">
      {members.map((m) => (
        <li key={m.userId}>
          <button
            type="button"
            onClick={() => onChange(m.userId)}
            className={`hover:bg-bg-muted flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs ${
              selectedId === m.userId ? 'bg-primary-subtle/30' : ''
            }`}
          >
            <UserAvatar
              name={m.user.name}
              userId={m.user.id}
              avatarUrl={m.user.avatarUrl}
              size="sm"
            />
            <span className="flex-1 truncate">{m.user.name}</span>
            {selectedId === m.userId && (
              <span className="text-primary text-[10px]">selecionado</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function MultiUserConfig({
  members,
  loading,
  selectedIds,
  onChange,
}: {
  members: OrgMember[];
  loading: boolean;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }
  if (loading) return <Loader2 size={14} className="text-fg-muted animate-spin" />;
  return (
    <ul className="divide-border/40 border-border/60 max-h-64 divide-y overflow-y-auto rounded-md border">
      {members.map((m) => {
        const selected = selectedIds.includes(m.userId);
        return (
          <li key={m.userId}>
            <button
              type="button"
              onClick={() => toggle(m.userId)}
              className={`hover:bg-bg-muted flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs ${
                selected ? 'bg-primary-subtle/30' : ''
              }`}
            >
              <input type="checkbox" checked={selected} readOnly className="accent-primary" />
              <UserAvatar
                name={m.user.name}
                userId={m.user.id}
                avatarUrl={m.user.avatarUrl}
                size="sm"
              />
              <span className="flex-1 truncate">{m.user.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function CommentTemplateConfig({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder="Ex: Card chegou em {{card.list.name}} — atribuído por {{actor.name}}"
        className="border-border focus:border-primary w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none"
      />
      <p className="text-fg-subtle text-[10px] leading-relaxed">
        Variáveis suportadas: <code className="text-fg-muted">{'{{card.title}}'}</code>{' '}
        <code className="text-fg-muted">{'{{card.list.name}}'}</code>{' '}
        <code className="text-fg-muted">{'{{card.board.name}}'}</code>{' '}
        <code className="text-fg-muted">{'{{actor.name}}'}</code>
      </p>
    </div>
  );
}

function CardStatusConfig({
  value,
  onChange,
}: {
  value: 'COMPLETED' | 'REOPENED' | 'ARCHIVED';
  onChange: (v: 'COMPLETED' | 'REOPENED' | 'ARCHIVED') => void;
}) {
  const options = [
    { value: 'COMPLETED', label: 'Marcar como finalizado' },
    { value: 'REOPENED', label: 'Reabrir (desmarcar finalizado)' },
    { value: 'ARCHIVED', label: 'Arquivar' },
  ] as const;
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 ${
            value === opt.value
              ? 'border-primary bg-primary-subtle/30'
              : 'border-border/60 hover:border-border-strong'
          }`}
        >
          <input
            type="radio"
            name="card-status"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="accent-primary"
          />
          <span className="text-fg text-[13px]">{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

function FlowPositionConfig({
  value,
  onChange,
}: {
  value: 'TOP' | 'BOTTOM';
  onChange: (v: 'TOP' | 'BOTTOM') => void;
}) {
  const options = [
    { value: 'TOP' as const, label: 'Subir pro topo da coluna' },
    { value: 'BOTTOM' as const, label: 'Mandar pra base da coluna' },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 ${
            value === opt.value
              ? 'border-primary bg-primary-subtle/30'
              : 'border-border/60 hover:border-border-strong'
          }`}
        >
          <input
            type="radio"
            name="flow-position"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="accent-primary"
          />
          <span className="text-fg text-[13px]">{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

function CreateChildConfig({
  titleTemplate,
  setTitleTemplate,
  copyLead,
  setCopyLead,
  copyTeam,
  setCopyTeam,
  copyTags,
  setCopyTags,
  copyDueDate,
  setCopyDueDate,
}: {
  titleTemplate: string;
  setTitleTemplate: (v: string) => void;
  copyLead: boolean;
  setCopyLead: (v: boolean) => void;
  copyTeam: boolean;
  setCopyTeam: (v: boolean) => void;
  copyTags: boolean;
  setCopyTags: (v: boolean) => void;
  copyDueDate: boolean;
  setCopyDueDate: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-fg-muted block text-[11px] font-medium">Título do card filho</label>
        <input
          type="text"
          value={titleTemplate}
          onChange={(e) => setTitleTemplate(e.target.value)}
          maxLength={500}
          className="border-border focus:border-primary mt-1 w-full rounded-md border px-2 py-1 text-sm focus:outline-none"
        />
        <p className="text-fg-subtle mt-0.5 text-[10px]">
          Variáveis: <code>{'{{card.title}}'}</code> <code>{'{{card.list.name}}'}</code>
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <CheckboxRow label="Copiar líder do card" checked={copyLead} onChange={setCopyLead} />
        <CheckboxRow label="Copiar equipe do card" checked={copyTeam} onChange={setCopyTeam} />
        <CheckboxRow label="Copiar etiquetas" checked={copyTags} onChange={setCopyTags} />
        <CheckboxRow
          label="Copiar prazo (dueDate)"
          checked={copyDueDate}
          onChange={setCopyDueDate}
        />
      </div>
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[12px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-primary"
      />
      <span className="text-fg">{label}</span>
    </label>
  );
}
