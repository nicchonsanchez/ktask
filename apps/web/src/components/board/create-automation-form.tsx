'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

import type { ListWithCards } from '@/lib/queries/boards';
import {
  automationsQueries,
  createAutomation,
  updateAutomation,
  type Automation,
  type AutomationActionType,
  type AutomationTrigger,
  type CreateAutomationInput,
} from '@/lib/queries/automations';
import { labelsQueries } from '@/lib/queries/labels';
import { orgMembersQuery } from '@/lib/queries/cards';
import { UserAvatar } from '@/components/user-avatar';
import { useNotify } from '@/components/ui/dialogs';
import { TemplateVarsBar } from './template-vars-bar';
import { VarTextarea, type TemplateVar } from './var-textarea';
import { MessageTemplateButtons } from './message-template-buttons';

const COMMENT_VARS: TemplateVar[] = [
  { token: '{{card.title}}', label: 'Título do card' },
  { token: '{{card.list.name}}', label: 'Coluna' },
  { token: '{{card.board.name}}', label: 'Fluxo' },
  { token: '{{actor.name}}', label: 'Quem disparou' },
];

const CHILD_TITLE_VARS: TemplateVar[] = [
  { token: '{{card.title}}', label: 'Título do card pai' },
  { token: '{{card.list.name}}', label: 'Coluna' },
];

const WHATSAPP_VARS: TemplateVar[] = [
  { token: '{{card.title}}', label: 'Título do card' },
  { token: '{{card.list.name}}', label: 'Coluna' },
  { token: '{{card.board.name}}', label: 'Fluxo' },
  { token: '{{card.lead.name}}', label: 'Líder do card' },
  { token: '{{actor.name}}', label: 'Quem disparou' },
  {
    token: '{{recipient.name}}',
    label: 'Nome do contato',
    hint: 'Quem vai receber a mensagem',
  },
  {
    token: '{{recipient.firstName}}',
    label: 'Primeiro nome do contato',
    hint: 'Útil pra saudação informal',
  },
];

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
  editing,
  onCreated,
  onCancel,
}: {
  actionType: AutomationActionType;
  list: ListWithCards;
  boardId: string;
  editing?: Automation;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const isEdit = Boolean(editing);
  const initial = editing ? extractInitial(editing) : null;

  const [trigger, setTrigger] = useState<AutomationTrigger>(initial?.trigger ?? 'CARD_ENTERED');
  const [minutes, setMinutes] = useState(initial?.minutes ?? 60);

  // Action-specific state
  const [tagIds, setTagIds] = useState<string[]>(initial?.tagIds ?? []);
  const [checklistTitle, setChecklistTitle] = useState(initial?.checklistTitle ?? 'Tarefas');
  const [checklistItemsRaw, setChecklistItemsRaw] = useState(initial?.checklistItemsRaw ?? '');
  const [leadUserId, setLeadUserId] = useState(initial?.leadUserId ?? '');
  const [leadReplaceMode, setLeadReplaceMode] = useState<LeadReplaceMode>(
    initial?.leadReplaceMode ?? 'MOVE_TO_TEAM',
  );
  const [teamUserIds, setTeamUserIds] = useState<string[]>(initial?.teamUserIds ?? []);
  const [commentTemplate, setCommentTemplate] = useState(initial?.commentTemplate ?? '');
  const [cardStatus, setCardStatus] = useState<'COMPLETED' | 'REOPENED' | 'ARCHIVED'>(
    initial?.cardStatus ?? 'COMPLETED',
  );
  const [childTitleTemplate, setChildTitleTemplate] = useState(
    initial?.childTitleTemplate ?? 'Sub-tarefa de {{card.title}}',
  );
  const [copyLead, setCopyLead] = useState(initial?.copyLead ?? false);
  const [copyTeam, setCopyTeam] = useState(initial?.copyTeam ?? false);
  const [copyTags, setCopyTags] = useState(initial?.copyTags ?? false);
  const [copyDueDate, setCopyDueDate] = useState(initial?.copyDueDate ?? false);
  const [flowPosition, setFlowPosition] = useState<'TOP' | 'BOTTOM'>(
    initial?.flowPosition ?? 'TOP',
  );
  // SEND_WHATSAPP: 3 modos de destinatário (lead do card / member da org / phone literal)
  const [waRecipientMode, setWaRecipientMode] = useState<'CARD_LEAD' | 'USER' | 'PHONE'>(
    initial?.waRecipientMode ?? 'CARD_LEAD',
  );
  const [waUserId, setWaUserId] = useState(initial?.waUserId ?? '');
  const [waPhone, setWaPhone] = useState(initial?.waPhone ?? '');
  const [waTemplate, setWaTemplate] = useState(
    initial?.waTemplate ??
      'Olá! O card "{{card.title}}" entrou em "{{card.list.name}}". Pode dar uma olhada?',
  );

  const [label, setLabel] = useState(initial?.label ?? '');

  // Quando editar uma automação diferente sem desmontar, ressincroniza state.
  useEffect(() => {
    if (!editing) return;
    const next = extractInitial(editing);
    setTrigger(next.trigger);
    setMinutes(next.minutes);
    setTagIds(next.tagIds);
    setChecklistTitle(next.checklistTitle);
    setChecklistItemsRaw(next.checklistItemsRaw);
    setLeadUserId(next.leadUserId);
    setLeadReplaceMode(next.leadReplaceMode);
    setTeamUserIds(next.teamUserIds);
    setCommentTemplate(next.commentTemplate);
    setCardStatus(next.cardStatus);
    setChildTitleTemplate(next.childTitleTemplate);
    setCopyLead(next.copyLead);
    setCopyTeam(next.copyTeam);
    setCopyTags(next.copyTags);
    setCopyDueDate(next.copyDueDate);
    setFlowPosition(next.flowPosition);
    setWaRecipientMode(next.waRecipientMode);
    setWaUserId(next.waUserId);
    setWaPhone(next.waPhone);
    setWaTemplate(next.waTemplate);
    setLabel(next.label);
  }, [editing]);

  const queryClient = useQueryClient();
  const notify = useNotify();

  const labelsQ = useQuery({
    ...labelsQueries.byBoard(boardId),
    enabled: actionType === 'INSERT_TAGS' || actionType === 'REMOVE_TAGS',
  });
  const membersQ = useQuery({
    ...orgMembersQuery,
    enabled:
      actionType === 'SET_LEAD' || actionType === 'ADD_TEAM' || actionType === 'SEND_WHATSAPP',
  });

  const createMut = useMutation({
    mutationFn: () => {
      const actionConfig = buildActionConfig(actionType, {
        tagIds,
        checklistTitle,
        checklistItems: checklistItemsRaw,
        leadUserId,
        leadReplaceMode,
        teamUserIds,
        commentTemplate,
        cardStatus,
        childTitleTemplate,
        copyLead,
        copyTeam,
        copyTags,
        copyDueDate,
        flowPosition,
        waRecipientMode,
        waUserId,
        waPhone,
        waTemplate,
      });
      const triggerConfig =
        trigger === 'TIME_IN_LIST' || trigger === 'TIME_NO_INTERACTION' ? { minutes } : {};
      if (editing) {
        return updateAutomation(editing.id, {
          trigger,
          triggerConfig,
          actionType,
          actionConfig,
          label: label.trim() ? label.trim() : null,
        });
      }
      const input: CreateAutomationInput = {
        trigger,
        triggerConfig,
        actionType,
        actionConfig,
        label: label.trim() || undefined,
      };
      return createAutomation(list.id, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: automationsQueries.byList(list.id).queryKey });
      notify.success(isEdit ? 'Automação atualizada.' : 'Automação criada.');
      onCreated();
    },
    onError: () =>
      notify.error(isEdit ? 'Falha ao atualizar automação.' : 'Falha ao criar automação.'),
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
      waRecipientMode,
      waUserId,
      waPhone,
      waTemplate,
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
            <div className="flex flex-col gap-3">
              <SingleUserConfig
                members={membersQ.data ?? []}
                loading={membersQ.isLoading}
                selectedId={leadUserId}
                onChange={setLeadUserId}
              />
              <LeadReplaceModeConfig value={leadReplaceMode} onChange={setLeadReplaceMode} />
            </div>
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

          {actionType === 'SEND_WHATSAPP' && (
            <SendWhatsAppConfig
              members={membersQ.data ?? []}
              membersLoading={membersQ.isLoading}
              recipientMode={waRecipientMode}
              setRecipientMode={setWaRecipientMode}
              userId={waUserId}
              setUserId={setWaUserId}
              phone={waPhone}
              setPhone={setWaPhone}
              template={waTemplate}
              setTemplate={setWaTemplate}
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
          {isEdit ? 'Salvar alterações' : 'Criar automação'}
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
  'SEND_WHATSAPP',
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

type LeadReplaceMode = 'MOVE_TO_TEAM' | 'REMOVE_FROM_TEAM' | 'KEEP_IF_HAS_LEAD';

interface ConfigState {
  tagIds: string[];
  checklistTitle: string;
  checklistItems: string;
  leadUserId: string;
  leadReplaceMode: LeadReplaceMode;
  teamUserIds: string[];
  commentTemplate: string;
  cardStatus: 'COMPLETED' | 'REOPENED' | 'ARCHIVED';
  childTitleTemplate: string;
  copyLead: boolean;
  copyTeam: boolean;
  copyTags: boolean;
  copyDueDate: boolean;
  flowPosition: 'TOP' | 'BOTTOM';
  waRecipientMode: 'CARD_LEAD' | 'USER' | 'PHONE';
  waUserId: string;
  waPhone: string;
  waTemplate: string;
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
      return { userId: s.leadUserId, replaceMode: s.leadReplaceMode };
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
    case 'SEND_WHATSAPP':
      return {
        template: s.waTemplate.trim(),
        ...(s.waRecipientMode === 'CARD_LEAD' ? { useCardLead: true } : {}),
        ...(s.waRecipientMode === 'USER' ? { userId: s.waUserId } : {}),
        ...(s.waRecipientMode === 'PHONE' ? { phone: s.waPhone.replace(/\D/g, '') } : {}),
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
    waRecipientMode: 'CARD_LEAD' | 'USER' | 'PHONE';
    waUserId: string;
    waPhone: string;
    waTemplate: string;
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
    case 'SEND_WHATSAPP':
      if (s.waTemplate.trim().length === 0) return false;
      if (s.waRecipientMode === 'CARD_LEAD') return true;
      if (s.waRecipientMode === 'USER') return Boolean(s.waUserId);
      if (s.waRecipientMode === 'PHONE') return /^\d{10,15}$/.test(s.waPhone.replace(/\D/g, ''));
      return false;
    default:
      return false;
  }
}

interface InitialState {
  trigger: AutomationTrigger;
  minutes: number;
  tagIds: string[];
  checklistTitle: string;
  checklistItemsRaw: string;
  leadUserId: string;
  leadReplaceMode: LeadReplaceMode;
  teamUserIds: string[];
  commentTemplate: string;
  cardStatus: 'COMPLETED' | 'REOPENED' | 'ARCHIVED';
  childTitleTemplate: string;
  copyLead: boolean;
  copyTeam: boolean;
  copyTags: boolean;
  copyDueDate: boolean;
  flowPosition: 'TOP' | 'BOTTOM';
  waRecipientMode: 'CARD_LEAD' | 'USER' | 'PHONE';
  waUserId: string;
  waPhone: string;
  waTemplate: string;
  label: string;
}

/**
 * Lê uma Automation existente e extrai os defaults de UI.
 * Cada actionType olha apenas as chaves que produziu em buildActionConfig —
 * o resto fica com o default neutro pra evitar "vazamento" entre tipos.
 */
function extractInitial(a: Automation): InitialState {
  const cfg = (a.actionConfig ?? {}) as Record<string, unknown>;
  const tCfg = (a.triggerConfig ?? {}) as Record<string, unknown>;
  const minutes = typeof tCfg.minutes === 'number' ? (tCfg.minutes as number) : 60;

  return {
    trigger: a.trigger,
    minutes,
    tagIds: Array.isArray(cfg.tagIds) ? (cfg.tagIds as string[]) : [],
    checklistTitle:
      (typeof cfg.checklistTitle === 'string' && (cfg.checklistTitle as string)) ||
      (typeof cfg.title === 'string' && (cfg.title as string)) ||
      'Tarefas',
    checklistItemsRaw: Array.isArray(cfg.items) ? (cfg.items as string[]).join('\n') : '',
    leadUserId: typeof cfg.userId === 'string' ? (cfg.userId as string) : '',
    leadReplaceMode:
      cfg.replaceMode === 'REMOVE_FROM_TEAM' || cfg.replaceMode === 'KEEP_IF_HAS_LEAD'
        ? (cfg.replaceMode as LeadReplaceMode)
        : 'MOVE_TO_TEAM',
    teamUserIds: Array.isArray(cfg.userIds) ? (cfg.userIds as string[]) : [],
    commentTemplate: typeof cfg.template === 'string' ? (cfg.template as string) : '',
    cardStatus:
      cfg.status === 'COMPLETED' || cfg.status === 'REOPENED' || cfg.status === 'ARCHIVED'
        ? (cfg.status as 'COMPLETED' | 'REOPENED' | 'ARCHIVED')
        : 'COMPLETED',
    childTitleTemplate:
      typeof cfg.titleTemplate === 'string'
        ? (cfg.titleTemplate as string)
        : 'Sub-tarefa de {{card.title}}',
    copyLead: cfg.copyLead === true,
    copyTeam: cfg.copyTeam === true,
    copyTags: cfg.copyTags === true,
    copyDueDate: cfg.copyDueDate === true,
    flowPosition: cfg.position === 'BOTTOM' ? 'BOTTOM' : 'TOP',
    waRecipientMode:
      a.actionType === 'SEND_WHATSAPP'
        ? cfg.useCardLead === true
          ? 'CARD_LEAD'
          : typeof cfg.userId === 'string' && cfg.userId
            ? 'USER'
            : 'PHONE'
        : 'CARD_LEAD',
    waUserId:
      a.actionType === 'SEND_WHATSAPP' && typeof cfg.userId === 'string'
        ? (cfg.userId as string)
        : '',
    waPhone: typeof cfg.phone === 'string' ? (cfg.phone as string) : '',
    waTemplate:
      a.actionType === 'SEND_WHATSAPP' && typeof cfg.template === 'string'
        ? (cfg.template as string)
        : '',
    label: a.label ?? '',
  };
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
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="flex flex-col gap-2">
      <MessageTemplateButtons type="comment" value={value} onChange={onChange} />
      <VarTextarea
        ref={ref}
        value={value}
        onChange={onChange}
        vars={COMMENT_VARS}
        rows={4}
        placeholder="Digite / para inserir uma variável. Ex: Card chegou em /coluna"
      />
      <TemplateVarsBar
        inputRef={ref}
        value={value}
        onChange={onChange}
        vars={COMMENT_VARS.map((v) => ({ token: v.token, label: v.label }))}
      />
    </div>
  );
}

function LeadReplaceModeConfig({
  value,
  onChange,
}: {
  value: LeadReplaceMode;
  onChange: (v: LeadReplaceMode) => void;
}) {
  const options: Array<{ value: LeadReplaceMode; label: string; hint: string }> = [
    {
      value: 'MOVE_TO_TEAM',
      label: 'Substituir o líder atual e defini-lo como equipe do card',
      hint: 'O líder anterior continua no card como membro da equipe.',
    },
    {
      value: 'REMOVE_FROM_TEAM',
      label: 'Substituir o líder atual e removê-lo da equipe do card',
      hint: 'O líder anterior é removido completamente do card.',
    },
    {
      value: 'KEEP_IF_HAS_LEAD',
      label: 'Não substituir o líder atual do card',
      hint: 'Se o card já tiver líder, a automação não roda nele.',
    },
  ];

  return (
    <div className="border-border/60 bg-bg-subtle/40 flex flex-col gap-2 rounded-md border p-3">
      <p className="text-fg text-[12px] font-semibold">
        O que fazer com cards que já possuem líder?
      </p>
      <p className="text-fg-muted -mt-1 text-[11px]">
        Defina o que deve acontecer caso o card já tenha um líder ao entrar nesta coluna.
      </p>
      <div className="mt-1 flex flex-col gap-1.5">
        {options.map((opt) => (
          <label
            key={opt.value}
            className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 ${
              value === opt.value
                ? 'border-primary bg-primary-subtle/30'
                : 'border-border/60 hover:border-border-strong bg-bg'
            }`}
          >
            <input
              type="radio"
              name="lead-replace-mode"
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="accent-primary mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <p className="text-fg text-[12px] font-medium leading-snug">{opt.label}</p>
              <p className="text-fg-muted mt-0.5 text-[10px] leading-snug">{opt.hint}</p>
            </div>
          </label>
        ))}
      </div>
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
  const titleRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-fg-muted block text-[11px] font-medium">Título do card filho</label>
        <VarTextarea
          ref={titleRef}
          singleLine
          value={titleTemplate}
          onChange={setTitleTemplate}
          vars={CHILD_TITLE_VARS}
          maxLength={500}
          placeholder="Digite / para inserir variáveis"
        />
        <TemplateVarsBar
          inputRef={titleRef}
          value={titleTemplate}
          onChange={setTitleTemplate}
          vars={CHILD_TITLE_VARS.map((v) => ({ token: v.token, label: v.label }))}
        />
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

function SendWhatsAppConfig({
  members,
  membersLoading,
  recipientMode,
  setRecipientMode,
  userId,
  setUserId,
  phone,
  setPhone,
  template,
  setTemplate,
}: {
  members: Array<{ userId: string; user: { id: string; name: string; phone: string | null } }>;
  membersLoading: boolean;
  recipientMode: 'CARD_LEAD' | 'USER' | 'PHONE';
  setRecipientMode: (v: 'CARD_LEAD' | 'USER' | 'PHONE') => void;
  userId: string;
  setUserId: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  template: string;
  setTemplate: (v: string) => void;
}) {
  const membersWithPhone = members.filter((m) => m.user.phone);
  const templateRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-fg-muted text-[11px] font-medium">Destinatário</label>
        <div className="flex flex-wrap gap-1">
          <ModeBtn
            active={recipientMode === 'CARD_LEAD'}
            onClick={() => setRecipientMode('CARD_LEAD')}
          >
            Líder do card
          </ModeBtn>
          <ModeBtn active={recipientMode === 'USER'} onClick={() => setRecipientMode('USER')}>
            Membro fixo
          </ModeBtn>
          <ModeBtn active={recipientMode === 'PHONE'} onClick={() => setRecipientMode('PHONE')}>
            Número avulso
          </ModeBtn>
        </div>
      </div>

      {recipientMode === 'CARD_LEAD' && (
        <p className="text-fg-subtle bg-bg-muted/40 rounded px-2 py-1.5 text-[11px] leading-relaxed">
          Usa o telefone do líder do card no momento que a automação rodar. Se o líder não tiver
          telefone cadastrado no perfil, a automação registra a tentativa mas não envia.
        </p>
      )}

      {recipientMode === 'USER' && (
        <div className="flex flex-col gap-1">
          <label className="text-fg-muted text-[11px] font-medium">
            Membro (precisa ter WhatsApp no perfil)
          </label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="border-border focus:border-primary rounded-md border px-2 py-1.5 text-sm focus:outline-none"
          >
            <option value="">Selecione um membro</option>
            {membersLoading && <option disabled>Carregando…</option>}
            {membersWithPhone.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.user.name} ({m.user.phone})
              </option>
            ))}
          </select>
          {!membersLoading && membersWithPhone.length === 0 && (
            <p className="text-fg-subtle text-[11px]">
              Nenhum membro tem WhatsApp cadastrado. Peça pra preencherem em /configuracoes/perfil.
            </p>
          )}
        </div>
      )}

      {recipientMode === 'PHONE' && (
        <div className="flex flex-col gap-1">
          <label className="text-fg-muted text-[11px] font-medium">
            Telefone (E.164 sem &quot;+&quot;)
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            placeholder="5531999999999"
            className="border-border focus:border-primary rounded-md border px-2 py-1.5 text-sm focus:outline-none"
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-fg-muted text-[11px] font-medium">Mensagem</label>
          <MessageTemplateButtons type="whatsapp" value={template} onChange={setTemplate} />
        </div>
        <VarTextarea
          ref={templateRef}
          value={template}
          onChange={setTemplate}
          vars={WHATSAPP_VARS}
          rows={4}
          placeholder='Digite / para inserir uma variável. Ex: O card "/título" entrou em /coluna'
        />
        <TemplateVarsBar
          inputRef={templateRef}
          value={template}
          onChange={setTemplate}
          vars={WHATSAPP_VARS.map((v) => ({ token: v.token, label: v.label }))}
        />
      </div>
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
        active ? 'bg-primary text-primary-fg' : 'bg-bg-muted text-fg-muted hover:bg-bg-emphasis'
      }`}
    >
      {children}
    </button>
  );
}
