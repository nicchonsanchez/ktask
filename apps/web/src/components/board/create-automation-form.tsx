'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Flag, Loader2, User as UserIcon, Zap } from 'lucide-react';

import { boardsQueries, type ListWithCards } from '@/lib/queries/boards';
import {
  automationsQueries,
  createAutomation,
  createAutomationForChecklist,
  createAutomationForChecklistItem,
  updateAutomation,
  type Automation,
  type AutomationActionType,
  type AutomationCondition,
  type AutomationTrigger,
  type CreateAutomationInput,
} from '@/lib/queries/automations';
import { labelsQueries } from '@/lib/queries/labels';
import { orgMembersQuery } from '@/lib/queries/cards';
import { contactsQueries, type ContactRow } from '@/lib/queries/contacts';
import { UserAvatar } from '@/components/user-avatar';
import { useNotify } from '@/components/ui/dialogs';
import { TemplateVarsBar } from './template-vars-bar';
import { VarTextarea, type TemplateVar } from './var-textarea';
import { MessageTemplateButtons } from './message-template-buttons';
import { ConditionsBuilder } from './conditions-builder';
import { NestedAutomationButton, type NestedAutomationDraft } from './nested-automation-popover';

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

const WHATSAPP_VARS_BASE: TemplateVar[] = [
  { token: '{{card.title}}', label: 'Título do card' },
  { token: '{{card.list.name}}', label: 'Coluna' },
  { token: '{{card.board.name}}', label: 'Fluxo' },
  { token: '{{card.lead.name}}', label: 'Líder do card' },
  { token: '{{actor.name}}', label: 'Quem disparou' },
];

/** Modos User / Lead / Phone — vars de "destinatário" abstrato. */
const WHATSAPP_VARS_RECIPIENT: TemplateVar[] = [
  ...WHATSAPP_VARS_BASE,
  {
    token: '{{recipient.name}}',
    label: 'Nome do destinatário',
    hint: 'Quem vai receber a mensagem',
  },
  {
    token: '{{recipient.firstName}}',
    label: 'Primeiro nome do destinatário',
    hint: 'Útil pra saudação informal',
  },
];

/** Modos CARD_CONTACTS / CONTACT — vars do Contact específico (doc 33). */
const WHATSAPP_VARS_CONTACT: TemplateVar[] = [
  ...WHATSAPP_VARS_BASE,
  { token: '{{contact.name}}', label: 'Nome do contato', hint: 'Nome do CRM' },
  {
    token: '{{contact.firstName}}',
    label: 'Primeiro nome do contato',
    hint: 'Útil pra saudação informal',
  },
  { token: '{{contact.email}}', label: 'Email do contato' },
  { token: '{{contact.phone}}', label: 'Telefone do contato' },
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
  scope,
  onCreated,
  onCancel,
}: {
  actionType: AutomationActionType;
  list: ListWithCards;
  boardId: string;
  editing?: Automation;
  /**
   * Doc 48: quando definido, o form cria automação escopada a um checklist
   * ou item, com trigger pré-fixado e oculto. Default = list-scoped.
   *
   * `draft`: variante usada por automações em cascata (subAutomation dentro
   * de INSERT_CHECKLIST_GROUP/ITEMS). Em vez de fazer POST/PATCH no backend,
   * o submit chama `onDraftSave(payload)` — quem chama persiste no
   * actionConfig da automação-pai. Trigger fixado por `triggerLock`.
   */
  scope?:
    | { kind: 'checklist'; id: string }
    | { kind: 'item'; id: string }
    | {
        kind: 'draft';
        triggerLock: 'CHECKLIST_COMPLETED' | 'CHECKLIST_ITEM_DONE';
        onDraftSave: (payload: {
          actionType: AutomationActionType;
          actionConfig: Record<string, unknown>;
          label?: string;
          conditions?: AutomationCondition[] | null;
        }) => void;
      };
  onCreated: () => void;
  onCancel: () => void;
}) {
  const isEdit = Boolean(editing);
  const initial = editing ? extractInitial(editing) : null;
  const lockedTrigger: AutomationTrigger | null =
    scope?.kind === 'checklist'
      ? 'CHECKLIST_COMPLETED'
      : scope?.kind === 'item'
        ? 'CHECKLIST_ITEM_DONE'
        : scope?.kind === 'draft'
          ? scope.triggerLock
          : null;

  const [trigger, setTrigger] = useState<AutomationTrigger>(
    lockedTrigger ?? initial?.trigger ?? 'CARD_ENTERED',
  );
  const [minutes, setMinutes] = useState(initial?.minutes ?? 60);

  // Action-specific state
  const [tagIds, setTagIds] = useState<string[]>(initial?.tagIds ?? []);
  const [checklistTitle, setChecklistTitle] = useState(initial?.checklistTitle ?? 'Tarefas');
  const [checklistItems, setChecklistItems] = useState<ChecklistItemDraft[]>(
    initial?.checklistItems && initial.checklistItems.length > 0
      ? initial.checklistItems
      : [newChecklistDraft()],
  );
  // Sub-automacao da LISTA inteira (scope=CHECKLIST_COMPLETED). null = nao
  // configurada — backend nao cria automation extra na execucao.
  const [listAutomation, setListAutomation] = useState<NestedAutomationDraft | null>(
    initial?.listAutomation ?? null,
  );
  const [leadUserId, setLeadUserId] = useState(initial?.leadUserId ?? '');
  const [leadReplaceMode, setLeadReplaceMode] = useState<LeadReplaceMode>(
    initial?.leadReplaceMode ?? 'MOVE_TO_TEAM',
  );
  const [teamUserIds, setTeamUserIds] = useState<string[]>(initial?.teamUserIds ?? []);
  const [commentTemplate, setCommentTemplate] = useState(initial?.commentTemplate ?? '');
  const [cardStatus, setCardStatus] = useState<'COMPLETED' | 'REOPENED' | 'ARCHIVED'>(
    initial?.cardStatus ?? 'COMPLETED',
  );
  // Doc 25 V1.1: SET_PRIVACY action
  const [cardPrivacy, setCardPrivacy] = useState<'PUBLIC' | 'TEAM_ONLY'>(
    initial?.cardPrivacy ?? 'TEAM_ONLY',
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
  // MOVE_CARD: target list (CUID) e posicao no destino
  const [moveTargetListId, setMoveTargetListId] = useState<string>(initial?.moveTargetListId ?? '');
  const [movePosition, setMovePosition] = useState<'TOP' | 'BOTTOM'>(
    initial?.movePosition ?? 'BOTTOM',
  );
  // SEND_WHATSAPP: 3 modos de destinatário (lead do card / member da org / phone literal)
  const [waRecipientMode, setWaRecipientMode] = useState<
    'CARD_LEAD' | 'USER' | 'PHONE' | 'CARD_CONTACTS' | 'CONTACT'
  >(initial?.waRecipientMode ?? 'CARD_LEAD');
  const [waUserId, setWaUserId] = useState(initial?.waUserId ?? '');
  const [waPhone, setWaPhone] = useState(initial?.waPhone ?? '');
  const [waContactId, setWaContactId] = useState(initial?.waContactId ?? '');
  const [waTemplate, setWaTemplate] = useState(
    initial?.waTemplate ??
      'Olá! O card "{{card.title}}" entrou em "{{card.list.name}}". Pode dar uma olhada?',
  );

  const [label, setLabel] = useState(initial?.label ?? '');
  const [conditions, setConditions] = useState<AutomationCondition[]>(initial?.conditions ?? []);

  // Quando editar uma automação diferente sem desmontar, ressincroniza state.
  useEffect(() => {
    if (!editing) return;
    const next = extractInitial(editing);
    setTrigger(next.trigger);
    setMinutes(next.minutes);
    setTagIds(next.tagIds);
    setChecklistTitle(next.checklistTitle);
    setChecklistItems(next.checklistItems.length > 0 ? next.checklistItems : [newChecklistDraft()]);
    setListAutomation(next.listAutomation);
    setLeadUserId(next.leadUserId);
    setLeadReplaceMode(next.leadReplaceMode);
    setTeamUserIds(next.teamUserIds);
    setCommentTemplate(next.commentTemplate);
    setCardStatus(next.cardStatus);
    setCardPrivacy(next.cardPrivacy);
    setChildTitleTemplate(next.childTitleTemplate);
    setCopyLead(next.copyLead);
    setCopyTeam(next.copyTeam);
    setCopyTags(next.copyTags);
    setCopyDueDate(next.copyDueDate);
    setFlowPosition(next.flowPosition);
    setMoveTargetListId(next.moveTargetListId);
    setMovePosition(next.movePosition);
    setWaRecipientMode(next.waRecipientMode);
    setWaUserId(next.waUserId);
    setWaPhone(next.waPhone);
    setWaContactId(next.waContactId);
    setWaTemplate(next.waTemplate);
    setLabel(next.label);
    setConditions(next.conditions);
  }, [editing]);

  const queryClient = useQueryClient();
  const notify = useNotify();

  // labels e members também são usados pelo ConditionsBuilder, então
  // ficam sempre habilitados — qualquer actionType pode ter condições
  // de tags/lead.
  const labelsQ = useQuery(labelsQueries.byBoard(boardId));
  const membersQ = useQuery(orgMembersQuery);
  // Pra MOVE_CARD precisamos das listas do board (excluindo a atual,
  // se houver — automation em coluna nao deve "mover" pra propria).
  const boardQ = useQuery({
    ...boardsQueries.detail(boardId),
    enabled: actionType === 'MOVE_CARD',
  });
  const contactsQ = useQuery({
    ...contactsQueries.list(),
    enabled: actionType === 'SEND_WHATSAPP',
  });

  const createMut = useMutation({
    mutationFn: () => {
      const actionConfig = buildActionConfig(actionType, {
        tagIds,
        checklistTitle,
        checklistItems,
        listAutomation,
        leadUserId,
        leadReplaceMode,
        teamUserIds,
        commentTemplate,
        cardStatus,
        cardPrivacy,
        childTitleTemplate,
        copyLead,
        copyTeam,
        copyTags,
        copyDueDate,
        flowPosition,
        moveTargetListId,
        movePosition,
        waRecipientMode,
        waUserId,
        waPhone,
        waContactId,
        waTemplate,
      });
      const triggerConfig =
        trigger === 'TIME_IN_LIST' || trigger === 'TIME_NO_INTERACTION' ? { minutes } : {};
      // Backend distingue undefined (não mexer) de null (limpar). Lista vazia -> null.
      const conditionsPayload = conditions.length > 0 ? conditions : null;
      // Modo draft: nao chama API. Apenas devolve o payload via callback
      // pra que o caller (automacao-pai) persista no actionConfig.
      if (scope?.kind === 'draft') {
        scope.onDraftSave({
          actionType,
          actionConfig,
          label: label.trim() || undefined,
          conditions: conditionsPayload,
        });
        return Promise.resolve({ ok: true } as never);
      }
      if (editing) {
        return updateAutomation(editing.id, {
          trigger,
          triggerConfig,
          actionType,
          actionConfig,
          label: label.trim() ? label.trim() : null,
          conditions: conditionsPayload,
        });
      }
      const input: CreateAutomationInput = {
        trigger,
        triggerConfig,
        actionType,
        actionConfig,
        label: label.trim() || undefined,
        conditions: conditionsPayload,
      };
      if (scope?.kind === 'checklist') return createAutomationForChecklist(scope.id, input);
      if (scope?.kind === 'item') return createAutomationForChecklistItem(scope.id, input);
      return createAutomation(list.id, input);
    },
    onSuccess: () => {
      if (scope?.kind === 'draft') {
        // Sem invalidate nem notify (nada foi pra API). onDraftSave ja
        // foi chamado dentro de mutationFn — caller decide se mostra toast.
        onCreated();
        return;
      }
      if (scope?.kind === 'checklist') {
        queryClient.invalidateQueries({
          queryKey: automationsQueries.byChecklist(scope.id).queryKey,
        });
      } else if (scope?.kind === 'item') {
        queryClient.invalidateQueries({
          queryKey: automationsQueries.byChecklistItem(scope.id).queryKey,
        });
      } else {
        queryClient.invalidateQueries({ queryKey: automationsQueries.byList(list.id).queryKey });
      }
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
      checklistItems,
      leadUserId,
      teamUserIds,
      commentTemplate,
      childTitleTemplate,
      moveTargetListId,
      waRecipientMode,
      waUserId,
      waPhone,
      waContactId,
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
          {lockedTrigger ? (
            // Doc 48: trigger fixo no escopo de checklist/item. Mostra
            // como info read-only.
            <div className="border-primary/40 bg-primary-subtle/30 rounded-md border px-3 py-2 text-[13px]">
              <p className="text-fg font-medium">
                {TRIGGERS.find((t) => t.value === lockedTrigger)?.label}
              </p>
              <p className="text-fg-subtle mt-0.5 text-[11px]">
                Gatilho fixado pelo escopo da automação.
              </p>
            </div>
          ) : (
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
          )}

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
              items={checklistItems}
              setItems={setChecklistItems}
              listAutomation={listAutomation}
              setListAutomation={setListAutomation}
              list={list}
              boardId={boardId}
              members={membersQ.data ?? []}
              membersLoading={membersQ.isLoading}
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

          {actionType === 'MOVE_CARD' && (
            <MoveCardConfig
              lists={(boardQ.data?.lists ?? []).filter((l) => l.id !== list.id && !l.isArchived)}
              targetListId={moveTargetListId}
              onChangeTarget={setMoveTargetListId}
              position={movePosition}
              onChangePosition={setMovePosition}
            />
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

          {actionType === 'SET_PRIVACY' && (
            <CardPrivacyConfig value={cardPrivacy} onChange={setCardPrivacy} />
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
              contacts={contactsQ.data ?? []}
              contactsLoading={contactsQ.isLoading}
              recipientMode={waRecipientMode}
              setRecipientMode={setWaRecipientMode}
              userId={waUserId}
              setUserId={setWaUserId}
              phone={waPhone}
              setPhone={setWaPhone}
              contactId={waContactId}
              setContactId={setWaContactId}
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
          <h3 className="text-fg mb-2 text-[12px] font-semibold uppercase tracking-wide">
            Quando rodar (condições)
          </h3>
          <ConditionsBuilder
            conditions={conditions}
            onChange={setConditions}
            labels={labelsQ.data ?? []}
            members={membersQ.data ?? []}
          />
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
          {scope?.kind === 'draft'
            ? isEdit
              ? 'Aplicar mudanças'
              : 'Adicionar automação ao item'
            : isEdit
              ? 'Salvar alterações'
              : 'Criar automação'}
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
  'SET_PRIVACY',
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
  { value: 'CARD_APPROVED', label: 'Quando o card for aprovado (cliente externo)' },
  { value: 'CARD_REJECTED', label: 'Quando o card for rejeitado (cliente externo)' },
  { value: 'CHECKLIST_ITEM_DONE', label: 'Quando esta tarefa for concluída' },
  { value: 'CHECKLIST_COMPLETED', label: 'Quando este checklist for 100% concluído' },
];

type LeadReplaceMode = 'MOVE_TO_TEAM' | 'REMOVE_FROM_TEAM' | 'KEEP_IF_HAS_LEAD';

interface ConfigState {
  tagIds: string[];
  checklistTitle: string;
  checklistItems: ChecklistItemDraft[];
  /** Sub-automacao opcional anexada na Checklist criada (scope=CHECKLIST_COMPLETED). */
  listAutomation: NestedAutomationDraft | null;
  leadUserId: string;
  leadReplaceMode: LeadReplaceMode;
  teamUserIds: string[];
  commentTemplate: string;
  cardStatus: 'COMPLETED' | 'REOPENED' | 'ARCHIVED';
  cardPrivacy: 'PUBLIC' | 'TEAM_ONLY';
  childTitleTemplate: string;
  copyLead: boolean;
  copyTeam: boolean;
  copyTags: boolean;
  copyDueDate: boolean;
  flowPosition: 'TOP' | 'BOTTOM';
  moveTargetListId: string;
  movePosition: 'TOP' | 'BOTTOM';
  waRecipientMode: 'CARD_LEAD' | 'USER' | 'PHONE' | 'CARD_CONTACTS' | 'CONTACT';
  waUserId: string;
  waPhone: string;
  waContactId: string;
  waTemplate: string;
}

/**
 * Empacota 1 ChecklistItemDraft no shape esperado pelo backend.
 * Omite campos NONE/vazios — backend cai pro default da automacao
 * (se houver) ou pra null.
 */
function checklistItemToPayload(item: ChecklistItemDraft): Record<string, unknown> {
  const out: Record<string, unknown> = { text: item.text.trim() };
  if (item.assigneeMode !== 'NONE') {
    out.assigneeMode = item.assigneeMode;
    if (item.assigneeMode === 'SPECIFIC_USER' && item.assigneeUserId) {
      out.assigneeUserId = item.assigneeUserId;
    }
  }
  if (item.dueMode !== 'NONE') {
    out.dueMode = item.dueMode;
    if (item.dueMode === 'OFFSET_FROM_CARD_DUE' || item.dueMode === 'OFFSET_FROM_NOW') {
      out.dueOffsetDays = item.dueOffsetDays;
    } else if (item.dueMode === 'FIXED_DATE' && item.dueDate) {
      out.dueDate = item.dueDate;
    }
  }
  if (item.itemPriority !== 'NONE') {
    out.itemPriority = item.itemPriority;
  }
  if (item.itemAutomation) {
    // Trigger fixo CHECKLIST_ITEM_DONE — backend valida via isValidNestedAutomation.
    out.itemAutomation = {
      trigger: 'CHECKLIST_ITEM_DONE',
      actionType: item.itemAutomation.actionType,
      actionConfig: item.itemAutomation.actionConfig,
      ...(item.itemAutomation.label ? { label: item.itemAutomation.label } : {}),
    };
  }
  return out;
}

/** Label PT-BR pros actionTypes suportados na sub-automacao. Reusado no badge. */
function actionLabelOf(actionType: AutomationActionType): string {
  switch (actionType) {
    case 'POST_COMMENT':
      return 'postar comentário';
    case 'INSERT_TAGS':
      return 'adicionar etiquetas';
    case 'REMOVE_TAGS':
      return 'remover etiquetas';
    case 'SET_CARD_STATUS':
      return 'mudar status';
    case 'FLAG_DUE_TODAY':
      return 'marcar prazo hoje';
    case 'FLAG_OVERDUE':
      return 'marcar prazo atrasado';
    case 'SEND_WHATSAPP':
      return 'enviar WhatsApp';
    default:
      return String(actionType).toLowerCase();
  }
}

/**
 * Empacota a sub-automacao da LISTA (scope=CHECKLIST_COMPLETED) pro shape
 * esperado pelo backend. Trigger fixo. Retorna undefined quando nao
 * configurada — chave fica fora do actionConfig (compat com configs
 * antigos que nao tem o campo).
 */
function listAutomationToPayload(
  value: NestedAutomationDraft | null,
): Record<string, unknown> | undefined {
  if (!value) return undefined;
  return {
    trigger: 'CHECKLIST_COMPLETED',
    actionType: value.actionType,
    actionConfig: value.actionConfig,
    ...(value.label ? { label: value.label } : {}),
  };
}

function buildActionConfig(
  actionType: AutomationActionType,
  s: ConfigState,
): Record<string, unknown> {
  switch (actionType) {
    case 'INSERT_TAGS':
    case 'REMOVE_TAGS':
      return { tagIds: s.tagIds };
    case 'INSERT_CHECKLIST_ITEMS': {
      const out: Record<string, unknown> = {
        checklistTitle: s.checklistTitle.trim() || 'Tarefas',
        items: s.checklistItems.filter((i) => i.text.trim().length > 0).map(checklistItemToPayload),
      };
      const listAuto = listAutomationToPayload(s.listAutomation);
      if (listAuto) out.listAutomation = listAuto;
      return out;
    }
    case 'INSERT_CHECKLIST_GROUP': {
      const out: Record<string, unknown> = {
        title: s.checklistTitle.trim() || 'Tarefas',
        items: s.checklistItems.filter((i) => i.text.trim().length > 0).map(checklistItemToPayload),
      };
      const listAuto = listAutomationToPayload(s.listAutomation);
      if (listAuto) out.listAutomation = listAuto;
      return out;
    }
    case 'UPDATE_FLOW_POSITION':
      return { position: s.flowPosition };
    case 'MOVE_CARD':
      return { targetListId: s.moveTargetListId, position: s.movePosition };
    case 'SET_LEAD':
      return { userId: s.leadUserId, replaceMode: s.leadReplaceMode };
    case 'ADD_TEAM':
      return { userIds: s.teamUserIds };
    case 'POST_COMMENT':
      return { template: s.commentTemplate.trim() };
    case 'SET_CARD_STATUS':
      return { status: s.cardStatus };
    case 'SET_PRIVACY':
      return { privacy: s.cardPrivacy };
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
        ...(s.waRecipientMode === 'CARD_CONTACTS' ? { useCardContacts: true } : {}),
        ...(s.waRecipientMode === 'CONTACT' ? { contactId: s.waContactId } : {}),
      };
    default:
      return {};
  }
}

function validateAction(
  actionType: AutomationActionType,
  s: {
    tagIds: string[];
    checklistItems: ChecklistItemDraft[];
    leadUserId: string;
    teamUserIds: string[];
    commentTemplate: string;
    childTitleTemplate: string;
    moveTargetListId: string;
    waRecipientMode: 'CARD_LEAD' | 'USER' | 'PHONE' | 'CARD_CONTACTS' | 'CONTACT';
    waUserId: string;
    waPhone: string;
    waContactId: string;
    waTemplate: string;
  },
): boolean {
  switch (actionType) {
    case 'INSERT_TAGS':
    case 'REMOVE_TAGS':
      return s.tagIds.length > 0;
    case 'INSERT_CHECKLIST_ITEMS':
    case 'INSERT_CHECKLIST_GROUP':
      return s.checklistItems.some((i) => i.text.trim().length > 0);
    case 'UPDATE_FLOW_POSITION':
      return true;
    case 'MOVE_CARD':
      return Boolean(s.moveTargetListId);
    case 'SET_LEAD':
      return Boolean(s.leadUserId);
    case 'ADD_TEAM':
      return s.teamUserIds.length > 0;
    case 'POST_COMMENT':
      return s.commentTemplate.trim().length > 0;
    case 'SET_CARD_STATUS':
      return true; // sempre tem default 'COMPLETED'
    case 'SET_PRIVACY':
      return true; // default 'TEAM_ONLY'
    case 'CREATE_CHILD_CARD':
      return s.childTitleTemplate.trim().length > 0;
    case 'SEND_WHATSAPP':
      if (s.waTemplate.trim().length === 0) return false;
      if (s.waRecipientMode === 'CARD_LEAD') return true;
      if (s.waRecipientMode === 'USER') return Boolean(s.waUserId);
      if (s.waRecipientMode === 'PHONE') return /^\d{10,15}$/.test(s.waPhone.replace(/\D/g, ''));
      if (s.waRecipientMode === 'CARD_CONTACTS') return true;
      if (s.waRecipientMode === 'CONTACT') return Boolean(s.waContactId);
      return false;
    default:
      return false;
  }
}

type ChecklistAssigneeMode = 'NONE' | 'CARD_LEAD' | 'SPECIFIC_USER';
type ChecklistDueMode = 'NONE' | 'OFFSET_FROM_CARD_DUE' | 'OFFSET_FROM_NOW' | 'FIXED_DATE';
type ChecklistItemPriority = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

interface ChecklistItemDraft {
  /** UID local pro React key — nao vai pro backend. */
  uid: string;
  text: string;
  assigneeMode: ChecklistAssigneeMode;
  assigneeUserId: string;
  dueMode: ChecklistDueMode;
  dueOffsetDays: number;
  dueDate: string;
  itemPriority: ChecklistItemPriority;
  /**
   * Sub-automacao opcional anexada quando este item for criado pela
   * automacao-pai. Engine cria 1 row Automation com scopeChecklistItemId
   * apontando pro item recem-criado. Trigger CHECKLIST_ITEM_DONE.
   */
  itemAutomation: NestedAutomationDraft | null;
}

function newChecklistDraft(text = ''): ChecklistItemDraft {
  return {
    uid: Math.random().toString(36).slice(2, 10),
    text,
    assigneeMode: 'NONE',
    assigneeUserId: '',
    dueMode: 'NONE',
    dueOffsetDays: 0,
    dueDate: '',
    itemPriority: 'NONE',
    itemAutomation: null,
  };
}

interface InitialState {
  trigger: AutomationTrigger;
  minutes: number;
  tagIds: string[];
  checklistTitle: string;
  checklistItems: ChecklistItemDraft[];
  listAutomation: NestedAutomationDraft | null;
  leadUserId: string;
  leadReplaceMode: LeadReplaceMode;
  teamUserIds: string[];
  commentTemplate: string;
  cardStatus: 'COMPLETED' | 'REOPENED' | 'ARCHIVED';
  cardPrivacy: 'PUBLIC' | 'TEAM_ONLY';
  childTitleTemplate: string;
  copyLead: boolean;
  copyTeam: boolean;
  copyTags: boolean;
  copyDueDate: boolean;
  flowPosition: 'TOP' | 'BOTTOM';
  moveTargetListId: string;
  movePosition: 'TOP' | 'BOTTOM';
  waRecipientMode: 'CARD_LEAD' | 'USER' | 'PHONE' | 'CARD_CONTACTS' | 'CONTACT';
  waUserId: string;
  waPhone: string;
  waContactId: string;
  waTemplate: string;
  label: string;
  conditions: AutomationCondition[];
}

/**
 * Lê uma Automation existente e extrai os defaults de UI.
 * Cada actionType olha apenas as chaves que produziu em buildActionConfig —
 * o resto fica com o default neutro pra evitar "vazamento" entre tipos.
 */
/**
 * Le actionConfig.items e devolve no formato ChecklistItemDraft.
 *
 * Aceita 2 formatos:
 *  - Legacy `string[]`: cada item ganha defaults vazios. Os campos
 *    assignee/due/priority herdados do nivel cfg.* da automacao
 *    (caso o user tenha setado defaults globais no schema antigo)
 *    sao copiados pra TODOS os items pra preservar o comportamento.
 *  - Novo: `Array<{ text, assigneeMode?, ... }>` — usa direto.
 */
function parseChecklistItemsFromConfig(cfg: Record<string, unknown>): ChecklistItemDraft[] {
  const raw = Array.isArray(cfg.items) ? (cfg.items as unknown[]) : [];
  if (raw.length === 0) return [];

  // Legacy defaults (no nivel global do cfg). Se existir, propaga pra
  // todos os items que vierem como string.
  const legacyAssigneeMode: ChecklistAssigneeMode =
    cfg.assigneeMode === 'CARD_LEAD' || cfg.assigneeMode === 'SPECIFIC_USER'
      ? (cfg.assigneeMode as ChecklistAssigneeMode)
      : 'NONE';
  const legacyAssigneeUserId =
    typeof cfg.assigneeUserId === 'string' ? (cfg.assigneeUserId as string) : '';
  const legacyDueMode: ChecklistDueMode =
    cfg.dueMode === 'OFFSET_FROM_CARD_DUE' ||
    cfg.dueMode === 'OFFSET_FROM_NOW' ||
    cfg.dueMode === 'FIXED_DATE'
      ? (cfg.dueMode as ChecklistDueMode)
      : 'NONE';
  const legacyDueOffsetDays =
    typeof cfg.dueOffsetDays === 'number' ? (cfg.dueOffsetDays as number) : 0;
  const legacyDueDate = typeof cfg.dueDate === 'string' ? (cfg.dueDate as string) : '';
  const legacyPriority: ChecklistItemPriority =
    cfg.itemPriority === 'LOW' ||
    cfg.itemPriority === 'MEDIUM' ||
    cfg.itemPriority === 'HIGH' ||
    cfg.itemPriority === 'URGENT'
      ? (cfg.itemPriority as ChecklistItemPriority)
      : 'NONE';

  return raw.map((entry) => {
    if (typeof entry === 'string') {
      return {
        ...newChecklistDraft(entry),
        assigneeMode: legacyAssigneeMode,
        assigneeUserId: legacyAssigneeUserId,
        dueMode: legacyDueMode,
        dueOffsetDays: legacyDueOffsetDays,
        dueDate: legacyDueDate,
        itemPriority: legacyPriority,
      };
    }
    const e = (entry ?? {}) as Record<string, unknown>;
    const base = newChecklistDraft(typeof e.text === 'string' ? (e.text as string) : '');
    return {
      ...base,
      assigneeMode:
        e.assigneeMode === 'CARD_LEAD' || e.assigneeMode === 'SPECIFIC_USER'
          ? (e.assigneeMode as ChecklistAssigneeMode)
          : 'NONE',
      assigneeUserId: typeof e.assigneeUserId === 'string' ? (e.assigneeUserId as string) : '',
      dueMode:
        e.dueMode === 'OFFSET_FROM_CARD_DUE' ||
        e.dueMode === 'OFFSET_FROM_NOW' ||
        e.dueMode === 'FIXED_DATE'
          ? (e.dueMode as ChecklistDueMode)
          : 'NONE',
      dueOffsetDays: typeof e.dueOffsetDays === 'number' ? (e.dueOffsetDays as number) : 0,
      dueDate: typeof e.dueDate === 'string' ? (e.dueDate as string) : '',
      itemPriority:
        e.itemPriority === 'LOW' ||
        e.itemPriority === 'MEDIUM' ||
        e.itemPriority === 'HIGH' ||
        e.itemPriority === 'URGENT'
          ? (e.itemPriority as ChecklistItemPriority)
          : 'NONE',
      itemAutomation: parseNestedAutomation(e.itemAutomation),
    };
  });
}

/**
 * Le um campo `itemAutomation` ou `listAutomation` do actionConfig
 * persistido e devolve o draft. Retorna null se o shape nao for valido —
 * UI trata como "nao configurado".
 */
function parseNestedAutomation(raw: unknown): NestedAutomationDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.actionType !== 'string') return null;
  return {
    actionType: r.actionType as AutomationActionType,
    actionConfig:
      r.actionConfig && typeof r.actionConfig === 'object'
        ? (r.actionConfig as Record<string, unknown>)
        : {},
    label: typeof r.label === 'string' ? (r.label as string) : undefined,
  };
}

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
    checklistItems: parseChecklistItemsFromConfig(cfg),
    listAutomation: parseNestedAutomation(cfg.listAutomation),
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
    cardPrivacy:
      cfg.privacy === 'PUBLIC' || cfg.privacy === 'TEAM_ONLY'
        ? (cfg.privacy as 'PUBLIC' | 'TEAM_ONLY')
        : 'TEAM_ONLY',
    childTitleTemplate:
      typeof cfg.titleTemplate === 'string'
        ? (cfg.titleTemplate as string)
        : 'Sub-tarefa de {{card.title}}',
    copyLead: cfg.copyLead === true,
    copyTeam: cfg.copyTeam === true,
    copyTags: cfg.copyTags === true,
    copyDueDate: cfg.copyDueDate === true,
    flowPosition: cfg.position === 'BOTTOM' ? 'BOTTOM' : 'TOP',
    moveTargetListId: typeof cfg.targetListId === 'string' ? (cfg.targetListId as string) : '',
    movePosition:
      a.actionType === 'MOVE_CARD' && cfg.position === 'TOP'
        ? 'TOP'
        : ('BOTTOM' as 'TOP' | 'BOTTOM'),
    waRecipientMode:
      a.actionType === 'SEND_WHATSAPP'
        ? cfg.useCardContacts === true
          ? 'CARD_CONTACTS'
          : typeof cfg.contactId === 'string' && cfg.contactId
            ? 'CONTACT'
            : cfg.useCardLead === true
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
    waContactId:
      a.actionType === 'SEND_WHATSAPP' && typeof cfg.contactId === 'string'
        ? (cfg.contactId as string)
        : '',
    waTemplate:
      a.actionType === 'SEND_WHATSAPP' && typeof cfg.template === 'string'
        ? (cfg.template as string)
        : '',
    label: a.label ?? '',
    conditions: Array.isArray(a.conditions) ? a.conditions : [],
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
  items,
  setItems,
  listAutomation,
  setListAutomation,
  list,
  boardId,
  members,
  membersLoading,
  hint,
}: {
  checklistTitle: string;
  setChecklistTitle: (v: string) => void;
  items: ChecklistItemDraft[];
  setItems: (v: ChecklistItemDraft[]) => void;
  listAutomation: NestedAutomationDraft | null;
  setListAutomation: (v: NestedAutomationDraft | null) => void;
  list: ListWithCards;
  boardId: string;
  members: OrgMember[];
  membersLoading: boolean;
  hint?: string;
}) {
  function patch(uid: string, partial: Partial<ChecklistItemDraft>) {
    setItems(items.map((i) => (i.uid === uid ? { ...i, ...partial } : i)));
  }
  function remove(uid: string) {
    const next = items.filter((i) => i.uid !== uid);
    setItems(next.length > 0 ? next : [newChecklistDraft()]);
  }
  function add() {
    setItems([...items, newChecklistDraft()]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="flex items-center justify-between gap-2">
          <label className="text-fg-muted block text-[11px] font-medium">
            Nome da lista de tarefas
          </label>
          {/* Bot icon — sub-automacao da lista inteira (CHECKLIST_COMPLETED).
              Aparece preenchido quando configurada. */}
          <NestedAutomationButton
            scope="list"
            list={list}
            boardId={boardId}
            value={listAutomation}
            onChange={setListAutomation}
            size="sm"
          />
        </div>
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
        {listAutomation && (
          <p className="text-fg-muted mt-1 text-[10px]">
            <strong>Automação da lista:</strong> quando 100% concluída →{' '}
            {actionLabelOf(listAutomation.actionType)}
          </p>
        )}
      </div>

      <div>
        <label className="text-fg-muted mb-1 block text-[11px] font-medium">Itens</label>
        <div className="flex flex-col gap-1.5">
          {items.map((item, idx) => (
            <ChecklistItemRow
              key={item.uid}
              item={item}
              onPatch={(p) => patch(item.uid, p)}
              onRemove={() => remove(item.uid)}
              onEnterAddNew={() => {
                if (idx === items.length - 1 && item.text.trim()) add();
              }}
              list={list}
              boardId={boardId}
              members={members}
              membersLoading={membersLoading}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={add}
          className="text-fg-muted hover:text-fg hover:bg-bg-muted/60 mt-1.5 inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium"
        >
          + adicionar item
        </button>
      </div>
    </div>
  );
}

/**
 * Linha de um item de checklist com 3 botoes-popover:
 * 👤 responsavel (Sem / Lider / Especifico),
 * 🚩 prazo (Sem / N dias apos / N dias do prazo / Data fixa),
 * ⚡ prioridade (5 niveis).
 *
 * Cada botao mostra ativo (preenchido) quando o item tem override
 * setado pra aquele campo. Click toggla popover absoluto na propria
 * linha — fecha ao clicar em outro botao ou Esc.
 */
function ChecklistItemRow({
  item,
  onPatch,
  onRemove,
  onEnterAddNew,
  list,
  boardId,
  members,
  membersLoading,
}: {
  item: ChecklistItemDraft;
  onPatch: (p: Partial<ChecklistItemDraft>) => void;
  onRemove: () => void;
  onEnterAddNew: () => void;
  list: ListWithCards;
  boardId: string;
  members: OrgMember[];
  membersLoading: boolean;
}) {
  const [open, setOpen] = useState<'assignee' | 'due' | 'priority' | null>(null);

  const hasAssignee = item.assigneeMode !== 'NONE';
  const hasDue = item.dueMode !== 'NONE';
  const hasPriority = item.itemPriority !== 'NONE';

  function toggle(p: 'assignee' | 'due' | 'priority') {
    setOpen(open === p ? null : p);
  }
  function close() {
    setOpen(null);
  }

  return (
    <div className="border-border/60 hover:border-border bg-bg relative flex items-center gap-1 rounded-md border px-2 py-1">
      <input
        type="text"
        value={item.text}
        onChange={(e) => onPatch({ text: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onEnterAddNew();
          }
        }}
        placeholder="Descrever a tarefa"
        className="flex-1 bg-transparent text-sm focus:outline-none"
      />
      <IconBtn
        title="Responsável"
        active={hasAssignee}
        onClick={() => toggle('assignee')}
        icon={<UserIcon size={13} />}
      />
      <IconBtn
        title="Prazo"
        active={hasDue}
        onClick={() => toggle('due')}
        icon={<Flag size={13} />}
      />
      <IconBtn
        title="Prioridade"
        active={hasPriority}
        onClick={() => toggle('priority')}
        icon={<Zap size={13} />}
      />
      {/* 4° botao: automacao no item (CHECKLIST_ITEM_DONE). Popover proprio
          via Radix (NestedAutomationButton) — nao confunde com os ItemPopovers
          dos outros 3 botoes, que usam absolute. */}
      <NestedAutomationButton
        scope="item"
        list={list}
        boardId={boardId}
        value={item.itemAutomation}
        onChange={(next) => onPatch({ itemAutomation: next })}
        size="sm"
      />
      <button
        type="button"
        onClick={onRemove}
        title="Remover item"
        className="text-fg-subtle hover:text-danger ml-0.5 size-6 shrink-0 text-sm"
      >
        ×
      </button>

      {open === 'assignee' && (
        <ItemPopover onClose={close}>
          <p className="text-fg-muted mb-1 text-[10px] font-medium uppercase">Responsável</p>
          <RadioRow
            label="Sem responsável"
            active={item.assigneeMode === 'NONE'}
            onClick={() => {
              onPatch({ assigneeMode: 'NONE', assigneeUserId: '' });
              close();
            }}
          />
          <RadioRow
            label="Líder do card"
            active={item.assigneeMode === 'CARD_LEAD'}
            onClick={() => {
              onPatch({ assigneeMode: 'CARD_LEAD', assigneeUserId: '' });
              close();
            }}
          />
          <RadioRow
            label="Membro específico"
            active={item.assigneeMode === 'SPECIFIC_USER'}
            onClick={() => onPatch({ assigneeMode: 'SPECIFIC_USER' })}
          />
          {item.assigneeMode === 'SPECIFIC_USER' && (
            <div className="mt-2">
              <SingleUserConfig
                members={members}
                loading={membersLoading}
                selectedId={item.assigneeUserId}
                onChange={(id) => {
                  onPatch({ assigneeUserId: id });
                  close();
                }}
              />
            </div>
          )}
        </ItemPopover>
      )}

      {open === 'due' && (
        <ItemPopover onClose={close}>
          <p className="text-fg-muted mb-1 text-[10px] font-medium uppercase">Prazo</p>
          <RadioRow
            label="Sem prazo"
            active={item.dueMode === 'NONE'}
            onClick={() => {
              onPatch({ dueMode: 'NONE', dueOffsetDays: 0, dueDate: '' });
              close();
            }}
          />
          <RadioRow
            label="N dias após a criação"
            active={item.dueMode === 'OFFSET_FROM_NOW'}
            onClick={() => onPatch({ dueMode: 'OFFSET_FROM_NOW' })}
          />
          <RadioRow
            label="N dias do prazo do card"
            active={item.dueMode === 'OFFSET_FROM_CARD_DUE'}
            onClick={() => onPatch({ dueMode: 'OFFSET_FROM_CARD_DUE' })}
          />
          <RadioRow
            label="Data fixa"
            active={item.dueMode === 'FIXED_DATE'}
            onClick={() => onPatch({ dueMode: 'FIXED_DATE' })}
          />
          {(item.dueMode === 'OFFSET_FROM_NOW' || item.dueMode === 'OFFSET_FROM_CARD_DUE') && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                value={item.dueOffsetDays}
                onChange={(e) => onPatch({ dueOffsetDays: Number(e.target.value) })}
                className="border-border focus:border-primary w-20 rounded-md border px-2 py-1 text-sm focus:outline-none"
              />
              <span className="text-fg-subtle text-[10px]">
                {item.dueMode === 'OFFSET_FROM_CARD_DUE' ? '(±)' : 'a partir de hoje'}
              </span>
            </div>
          )}
          {item.dueMode === 'FIXED_DATE' && (
            <input
              type="date"
              value={item.dueDate}
              onChange={(e) => onPatch({ dueDate: e.target.value })}
              className="border-border focus:border-primary mt-2 rounded-md border px-2 py-1 text-sm focus:outline-none"
            />
          )}
        </ItemPopover>
      )}

      {open === 'priority' && (
        <ItemPopover onClose={close}>
          <p className="text-fg-muted mb-1 text-[10px] font-medium uppercase">Prioridade</p>
          {(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'] as ChecklistItemPriority[]).map((p) => (
            <RadioRow
              key={p}
              label={
                {
                  NONE: 'Sem prioridade',
                  LOW: 'Baixa',
                  MEDIUM: 'Média',
                  HIGH: 'Alta',
                  URGENT: 'Urgente',
                }[p]
              }
              active={item.itemPriority === p}
              onClick={() => {
                onPatch({ itemPriority: p });
                close();
              }}
            />
          ))}
        </ItemPopover>
      )}
    </div>
  );
}

function IconBtn({
  title,
  active,
  onClick,
  icon,
}: {
  title: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`hover:bg-bg-muted inline-flex size-6 shrink-0 items-center justify-center rounded transition-opacity ${
        active ? 'text-fg opacity-100' : 'text-fg-muted opacity-60 hover:opacity-100'
      }`}
    >
      {icon}
    </button>
  );
}

function RadioRow({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`hover:bg-bg-muted flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs ${
        active ? 'bg-primary-subtle/30 text-fg font-medium' : 'text-fg-muted'
      }`}
    >
      <span className={`inline-block size-2 rounded-full ${active ? 'bg-primary' : 'bg-border'}`} />
      {label}
    </button>
  );
}

function ItemPopover({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} aria-hidden />
      <div className="bg-bg border-border absolute right-0 top-full z-20 mt-1 flex w-64 flex-col gap-1 rounded-md border p-2 shadow-lg">
        {children}
      </div>
    </>
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

/**
 * Subform da action MOVE_CARD. Seletor de coluna alvo do mesmo board
 * (a coluna atual e arquivadas sao filtradas) + posicao no destino.
 */
function MoveCardConfig({
  lists,
  targetListId,
  onChangeTarget,
  position,
  onChangePosition,
}: {
  lists: Array<{ id: string; name: string; isFinalList?: boolean; isBacklog?: boolean }>;
  targetListId: string;
  onChangeTarget: (v: string) => void;
  position: 'TOP' | 'BOTTOM';
  onChangePosition: (v: 'TOP' | 'BOTTOM') => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-fg-muted text-[11px] font-medium">Mover para</label>
        <select
          value={targetListId}
          onChange={(e) => onChangeTarget(e.target.value)}
          className="border-border bg-bg focus-visible:ring-primary rounded-md border px-2 py-1.5 text-[13px] focus-visible:outline-none focus-visible:ring-2"
        >
          <option value="">(escolha a coluna)</option>
          {lists.map((l) => {
            const tag = l.isFinalList ? ' · final' : l.isBacklog ? ' · backlog' : '';
            return (
              <option key={l.id} value={l.id}>
                {l.name}
                {tag}
              </option>
            );
          })}
        </select>
        {!targetListId && (
          <p className="text-warning text-[11px]">Selecione uma coluna de destino.</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-fg-muted text-[11px] font-medium">Posição no destino</label>
        <div className="flex gap-2">
          {(['TOP', 'BOTTOM'] as const).map((p) => (
            <label
              key={p}
              className={`flex flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-[13px] ${
                position === p
                  ? 'border-primary bg-primary-subtle/30'
                  : 'border-border/60 hover:border-border-strong'
              }`}
            >
              <input
                type="radio"
                name="move-position"
                value={p}
                checked={position === p}
                onChange={() => onChangePosition(p)}
                className="accent-primary"
              />
              {p === 'TOP' ? 'Topo' : 'Base'}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Doc 25 V1.1: subform da action SET_PRIVACY. Avisa que cards privados
 * podem sumir pra quem nao esta na equipe — comportamento esperado mas
 * vale alertar quem configura.
 */
function CardPrivacyConfig({
  value,
  onChange,
}: {
  value: 'PUBLIC' | 'TEAM_ONLY';
  onChange: (next: 'PUBLIC' | 'TEAM_ONLY') => void;
}) {
  const options: Array<{ value: 'PUBLIC' | 'TEAM_ONLY'; label: string; hint: string }> = [
    {
      value: 'PUBLIC',
      label: 'Público',
      hint: 'Todos do fluxo conseguem ver o card.',
    },
    {
      value: 'TEAM_ONLY',
      label: 'Só equipe',
      hint: 'Apenas líder e membros da equipe veem (admin/gestor da Org sempre veem).',
    },
  ];
  return (
    <div className="flex flex-col gap-2">
      <p className="text-fg-muted text-[11px] font-medium">Mudar privacidade para:</p>
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`hover:bg-bg-muted/30 flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition-colors ${
            value === opt.value ? 'border-primary bg-primary-subtle/30' : 'border-border/60'
          }`}
        >
          <input
            type="radio"
            name="card-privacy"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="accent-primary mt-0.5"
          />
          <div className="flex-1">
            <p className="text-fg text-[13px] font-medium">{opt.label}</p>
            <p className="text-fg-subtle mt-0.5 text-[11px]">{opt.hint}</p>
          </div>
        </label>
      ))}
      <p className="text-warning text-[11px] leading-snug">
        Atenção: ao mudar pra &quot;Só equipe&quot;, o card pode sumir pra quem não estiver na lista
        de membros do card. Comportamento esperado, mas vale avisar a equipe.
      </p>
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
  contacts,
  contactsLoading,
  recipientMode,
  setRecipientMode,
  userId,
  setUserId,
  phone,
  setPhone,
  contactId,
  setContactId,
  template,
  setTemplate,
}: {
  members: Array<{ userId: string; user: { id: string; name: string; phone: string | null } }>;
  membersLoading: boolean;
  contacts: ContactRow[];
  contactsLoading: boolean;
  recipientMode: 'CARD_LEAD' | 'USER' | 'PHONE' | 'CARD_CONTACTS' | 'CONTACT';
  setRecipientMode: (v: 'CARD_LEAD' | 'USER' | 'PHONE' | 'CARD_CONTACTS' | 'CONTACT') => void;
  userId: string;
  setUserId: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  contactId: string;
  setContactId: (v: string) => void;
  template: string;
  setTemplate: (v: string) => void;
}) {
  const membersWithPhone = members.filter((m) => m.user.phone);
  // Doc 33: contato com phone valido (CRM aceita formato livre, mas pra
  // WhatsApp precisa ter ao menos 10 digitos apos sanitizacao).
  const contactsWithPhone = contacts.filter(
    (c) => c.phone && c.phone.replace(/\D/g, '').length >= 10,
  );
  const templateRef = useRef<HTMLTextAreaElement>(null);

  // Doc 33: vars variam conforme modo. Modos de contato so mostram
  // {{contact.*}}; outros mostram {{recipient.*}}.
  const isContactMode = recipientMode === 'CARD_CONTACTS' || recipientMode === 'CONTACT';
  const activeVars = isContactMode ? WHATSAPP_VARS_CONTACT : WHATSAPP_VARS_RECIPIENT;

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
          <ModeBtn
            active={recipientMode === 'CARD_CONTACTS'}
            onClick={() => setRecipientMode('CARD_CONTACTS')}
          >
            Contato do card
          </ModeBtn>
          <ModeBtn active={recipientMode === 'CONTACT'} onClick={() => setRecipientMode('CONTACT')}>
            Contato fixo
          </ModeBtn>
        </div>
      </div>

      {recipientMode === 'CARD_LEAD' && (
        <p className="text-fg-subtle bg-bg-muted/40 rounded px-2 py-1.5 text-[11px] leading-relaxed">
          Usa o telefone do líder do card no momento que a automação rodar. Se o líder não tiver
          telefone cadastrado no perfil, a automação registra a tentativa mas não envia.
        </p>
      )}

      {recipientMode === 'CARD_CONTACTS' && (
        <p className="text-fg-subtle bg-bg-muted/40 rounded px-2 py-1.5 text-[11px] leading-relaxed">
          Envia uma mensagem pra cada contato vinculado ao card no momento que a automação disparar.
          Contatos sem WhatsApp são pulados (registrado na timeline). Card sem contatos vinculados
          não envia nada.
        </p>
      )}

      {recipientMode === 'CONTACT' && (
        <div className="flex flex-col gap-1">
          <label className="text-fg-muted text-[11px] font-medium">
            Contato do CRM (precisa ter WhatsApp)
          </label>
          <select
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
            className="border-border focus:border-primary rounded-md border px-2 py-1.5 text-sm focus:outline-none"
          >
            <option value="">Selecione um contato</option>
            {contactsLoading && <option disabled>Carregando…</option>}
            {contactsWithPhone.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.phone})
              </option>
            ))}
          </select>
          {!contactsLoading && contactsWithPhone.length === 0 && (
            <p className="text-fg-subtle text-[11px]">
              Nenhum contato com WhatsApp cadastrado. Adicione em /contatos.
            </p>
          )}
        </div>
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
          vars={activeVars}
          rows={4}
          placeholder='Digite / para inserir uma variável. Ex: O card "/título" entrou em /coluna'
        />
        <TemplateVarsBar
          inputRef={templateRef}
          value={template}
          onChange={setTemplate}
          vars={activeVars.map((v) => ({ token: v.token, label: v.label }))}
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
