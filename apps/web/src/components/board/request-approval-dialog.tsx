'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, MessageCircle, Phone, Trash2, User, X } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@ktask/ui';
import { boardsQueries } from '@/lib/queries/boards';
import { cardsQueries } from '@/lib/queries/cards';
import { labelsQueries } from '@/lib/queries/labels';
import { membersQueries } from '@/lib/queries/members';
import {
  requestApproval,
  type ApprovalTargetDTO,
  type ReviewerInputDTO,
} from '@/lib/queries/approvals';
import { ApiError } from '@/lib/api-client';
import { UserAvatar } from '@/components/user-avatar';
import { TemplateVarsBar } from './template-vars-bar';
import { MessageTemplateButtons } from './message-template-buttons';

type Mode = 'user' | 'phone-new';

interface ReviewerDraft {
  /** ID local pra remoção. */
  key: string;
  data: ReviewerInputDTO;
  /** Texto pra mostrar na lista. */
  display: { name: string; subtitle?: string; avatarUrl?: string | null; phone?: string };
}

export function RequestApprovalDialog({
  cardId,
  boardId,
  open,
  onOpenChange,
}: {
  cardId: string;
  boardId: string;
  /** Aceita por compatibilidade com callers; não é mais usado internamente. */
  currentListId?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const [reviewers, setReviewers] = useState<ReviewerDraft[]>([]);
  const [message, setMessage] = useState('');
  // Multi-fluxo: 1 entry por board onde o card tem presence ativa.
  // Key = boardId, value = { approve: listId | '', reject: listId | '' }.
  // '' significa "(nao mover)" pra aquele fluxo.
  const [targets, setTargets] = useState<Record<string, { approve: string; reject: string }>>({});
  // Tags a adicionar/remover (CUIDs de labels do board) ao aprovar/reprovar.
  const [onApproveAddTagIds, setOnApproveAddTagIds] = useState<string[]>([]);
  const [onApproveRemoveTagIds, setOnApproveRemoveTagIds] = useState<string[]>([]);
  const [onRejectAddTagIds, setOnRejectAddTagIds] = useState<string[]>([]);
  const [onRejectRemoveTagIds, setOnRejectRemoveTagIds] = useState<string[]>([]);
  const [notifyOnWhatsApp, setNotifyOnWhatsApp] = useState(true);
  // Override per-approval do lembrete automatico. Default: usar setting da org.
  // `reminderDisabled = true` desliga so essa approval. `reminderInterval` vazio
  // = usa intervalo da org (default 4h). Section "Opcoes avancadas" colapsada.
  const [reminderDisabled, setReminderDisabled] = useState(false);
  const [reminderInterval, setReminderInterval] = useState<string>(''); // '' = usa org
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const boardQ = useQuery({ ...boardsQueries.detail(boardId) });
  const flowsQ = useQuery({ ...cardsQueries.flows(cardId), enabled: open });
  const labelsQ = useQuery({ ...labelsQueries.byBoard(boardId), enabled: open });

  useEffect(() => {
    if (open) {
      setReviewers([]);
      setMessage('');
      setTargets({});
      setOnApproveAddTagIds([]);
      setOnApproveRemoveTagIds([]);
      setOnRejectAddTagIds([]);
      setOnRejectRemoveTagIds([]);
      setNotifyOnWhatsApp(true);
      setReminderDisabled(false);
      setReminderInterval('');
      setShowAdvanced(false);
      setError(null);
    }
  }, [open]);

  // Sincroniza shape do state quando flows chegam — cria entries '' (nao mover)
  // pros boards ainda nao representados.
  useEffect(() => {
    if (!flowsQ.data) return;
    setTargets((prev) => {
      const next = { ...prev };
      for (const f of flowsQ.data) {
        if (!next[f.boardId]) next[f.boardId] = { approve: '', reject: '' };
      }
      return next;
    });
  }, [flowsQ.data]);

  function addReviewer(r: ReviewerDraft) {
    setReviewers((prev) => {
      // Dedup por userId ou phone
      const exists = prev.some((p) =>
        r.data.userId ? p.data.userId === r.data.userId : p.data.phone === r.data.phone,
      );
      if (exists) return prev;
      return [...prev, r];
    });
  }

  function removeReviewer(key: string) {
    setReviewers((prev) => prev.filter((r) => r.key !== key));
  }

  const mut = useMutation({
    mutationFn: () => {
      const onApproveActions =
        onApproveAddTagIds.length > 0 || onApproveRemoveTagIds.length > 0
          ? {
              ...(onApproveAddTagIds.length > 0 ? { addTagIds: onApproveAddTagIds } : {}),
              ...(onApproveRemoveTagIds.length > 0 ? { removeTagIds: onApproveRemoveTagIds } : {}),
            }
          : undefined;
      const onRejectActions =
        onRejectAddTagIds.length > 0 || onRejectRemoveTagIds.length > 0
          ? {
              ...(onRejectAddTagIds.length > 0 ? { addTagIds: onRejectAddTagIds } : {}),
              ...(onRejectRemoveTagIds.length > 0 ? { removeTagIds: onRejectRemoveTagIds } : {}),
            }
          : undefined;
      // Constroi arrays de targets por decisao, filtrando entries com ''
      // (nao mover). Cards multi-fluxo enviam N targets; mono-fluxo envia
      // 0 ou 1 — backend ja sabe que sem targets = nao move nada.
      const approveTargets: ApprovalTargetDTO[] = [];
      const rejectTargets: ApprovalTargetDTO[] = [];
      for (const [bId, t] of Object.entries(targets)) {
        if (t.approve) approveTargets.push({ boardId: bId, listId: t.approve });
        if (t.reject) rejectTargets.push({ boardId: bId, listId: t.reject });
      }
      const intervalNum = reminderInterval.trim() ? Number(reminderInterval) : undefined;
      const reminderIntervalHoursOverride =
        intervalNum && Number.isFinite(intervalNum) && intervalNum > 0 ? intervalNum : undefined;
      return requestApproval(cardId, {
        reviewers: reviewers.map((r) => r.data),
        message: message.trim() || undefined,
        defaultOnApproveTargets: approveTargets.length > 0 ? approveTargets : undefined,
        defaultOnRejectTargets: rejectTargets.length > 0 ? rejectTargets : undefined,
        onApproveActions,
        onRejectActions,
        notifyOnWhatsApp,
        reminderDisabled: reminderDisabled || undefined,
        reminderIntervalHoursOverride,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards', cardId] });
      queryClient.invalidateQueries({ queryKey: ['cards', cardId, 'approvals'] });
      onOpenChange(false);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Erro ao pedir aprovação.');
    },
  });

  // Lista todas as colunas do board (inclusive a atual). Antes filtrava a
  // currentListId pra "não oferecer mover pra mesma coluna", mas isso
  // (a) confunde o operador que espera ver todas, (b) deixa o caso real
  // descoberto: entre pedir aprovação e o cliente decidir, o card pode ter
  // sido movido manualmente — a regra "mover pra X ao aprovar" precisa
  // continuar funcionando independente de onde o card estiver no momento.
  const lists = useMemo(() => boardQ.data?.lists ?? [], [boardQ.data]);

  // Flows ativos onde o card tem presence. Backend ja filtra removedAt.
  // Sempre ordena com board "primary" primeiro pra UI ficar previsivel.
  const flows = useMemo(() => {
    const all = flowsQ.data ?? [];
    return [...all].sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return a.board.name.localeCompare(b.board.name);
    });
  }, [flowsQ.data]);

  // Fallback: se flows ainda nao carregou, pelo menos mostra o board "atual"
  // com as listas que ja temos do boardQ. Evita "tela vazia" durante load.
  const flowBlocks = useMemo(() => {
    if (flows.length > 0) {
      return flows.map((f) => ({
        boardId: f.boardId,
        boardName: f.board.name,
        boardColor: f.board.color,
        lists:
          f.board.lists.filter((l) => !l.isFinalList && !l.isBacklog).length > 0
            ? f.board.lists
            : f.board.lists, // mostra todas inclusive final/backlog — operador decide
      }));
    }
    return [{ boardId, boardName: boardQ.data?.name ?? '', boardColor: null, lists }];
  }, [flows, boardId, boardQ.data, lists]);

  function setTargetFor(bId: string, kind: 'approve' | 'reject', value: string) {
    setTargets((prev) => ({
      ...prev,
      [bId]: { approve: prev[bId]?.approve ?? '', reject: prev[bId]?.reject ?? '', [kind]: value },
    }));
  }

  const canSubmit = reviewers.length > 0 && !mut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="max-w-lg gap-0 p-0">
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
          <div>
            <DialogTitle className="text-base font-semibold">Pedir aprovação</DialogTitle>
            <p className="text-fg-muted mt-1 text-xs">
              Escolha 1 ou mais revisores. Quem decidir primeiro encerra o pedido.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-fg-muted hover:bg-bg-muted rounded p-1"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-5 pb-5">
          <ReviewerPicker onAdd={addReviewer} />

          {/* Lista de reviewers selecionados */}
          {reviewers.length > 0 && (
            <div className="border-border flex flex-col gap-1.5 rounded-md border p-2">
              <p className="text-fg-muted px-1 text-[11px] font-semibold uppercase tracking-wide">
                Revisores ({reviewers.length})
              </p>
              <ul className="flex flex-col gap-1">
                {reviewers.map((r) => (
                  <li
                    key={r.key}
                    className="hover:bg-bg-muted flex items-center gap-2 rounded px-2 py-1.5 text-sm"
                  >
                    {r.data.userId ? (
                      <UserAvatar
                        name={r.display.name}
                        userId={r.data.userId}
                        avatarUrl={r.display.avatarUrl ?? null}
                        size="sm"
                      />
                    ) : (
                      <span className="bg-bg-muted text-fg-muted inline-flex size-6 items-center justify-center rounded-full">
                        <Phone size={12} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{r.display.name}</span>
                      {r.display.subtitle && (
                        <span className="text-fg-muted ml-1.5 text-xs">· {r.display.subtitle}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeReviewer(r.key)}
                      className="text-fg-muted hover:text-danger rounded p-1"
                      aria-label="Remover"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="approval-message" className="text-fg-muted text-xs font-medium">
                Mensagem (opcional)
              </label>
              <MessageTemplateButtons type="whatsapp" value={message} onChange={setMessage} />
            </div>
            <textarea
              ref={messageRef}
              id="approval-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Ex: Pode revisar antes de publicar {{card.title}}?"
              className="border-border bg-bg focus-visible:ring-primary resize-none rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
            />
            <TemplateVarsBar
              inputRef={messageRef}
              value={message}
              onChange={setMessage}
              vars={[
                { token: '{{card.title}}', label: 'Título do card' },
                { token: '{{card.list.name}}', label: 'Coluna' },
                { token: '{{card.board.name}}', label: 'Fluxo' },
                { token: '{{requester.name}}', label: 'Quem pediu' },
                { token: '{{reviewer.firstName}}', label: 'Primeiro nome do revisor' },
                { token: '{{reviewer.name}}', label: 'Nome completo do revisor' },
                { token: '{{link}}', label: 'Link de aprovação' },
              ]}
            />
            <p className="text-fg-subtle text-[10px] leading-relaxed">
              Se deixar vazio, usa template padrão com saudação personalizada. Cada revisor recebe a
              mensagem com seu próprio nome em{' '}
              <code className="text-fg-muted">{'{{reviewer.firstName}}'}</code>. O link de aprovação
              sempre é adicionado no fim — não precisa colocar manualmente.
            </p>
          </div>

          <details className="border-border bg-bg-muted/20 rounded-md border">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium">
              Ações automáticas conforme a decisão
            </summary>
            <div className="flex flex-col gap-4 px-3 pb-3 pt-1">
              {/* Bloco APROVAR — 1 select por fluxo onde o card esta */}
              <div className="flex flex-col gap-2">
                <p className="text-fg text-[11px] font-semibold uppercase tracking-wide">
                  Quando aprovar
                </p>
                {flowBlocks.map((fb) => (
                  <div key={`approve-${fb.boardId}`} className="flex flex-col gap-1">
                    {flowBlocks.length > 1 && (
                      <span
                        className="text-fg-muted inline-flex items-center gap-1.5 text-[11px] font-medium"
                        style={fb.boardColor ? { color: fb.boardColor } : undefined}
                      >
                        <span
                          aria-hidden
                          className="inline-block size-2 rounded-full"
                          style={{ backgroundColor: fb.boardColor ?? 'var(--fg-muted)' }}
                        />
                        {fb.boardName}
                      </span>
                    )}
                    <ListSelect
                      label="Mover pra"
                      value={targets[fb.boardId]?.approve ?? ''}
                      onChange={(v) => setTargetFor(fb.boardId, 'approve', v)}
                      lists={fb.lists}
                      emptyLabel="(não mover)"
                    />
                  </div>
                ))}
                <LabelMultiSelect
                  label="Adicionar etiquetas"
                  labels={labelsQ.data ?? []}
                  selected={onApproveAddTagIds}
                  onChange={setOnApproveAddTagIds}
                />
                <LabelMultiSelect
                  label="Remover etiquetas"
                  labels={labelsQ.data ?? []}
                  selected={onApproveRemoveTagIds}
                  onChange={setOnApproveRemoveTagIds}
                />
              </div>

              {/* Bloco REPROVAR — mesmo loop */}
              <div className="border-border/40 flex flex-col gap-2 border-t pt-3">
                <p className="text-fg text-[11px] font-semibold uppercase tracking-wide">
                  Quando reprovar
                </p>
                {flowBlocks.map((fb) => (
                  <div key={`reject-${fb.boardId}`} className="flex flex-col gap-1">
                    {flowBlocks.length > 1 && (
                      <span
                        className="text-fg-muted inline-flex items-center gap-1.5 text-[11px] font-medium"
                        style={fb.boardColor ? { color: fb.boardColor } : undefined}
                      >
                        <span
                          aria-hidden
                          className="inline-block size-2 rounded-full"
                          style={{ backgroundColor: fb.boardColor ?? 'var(--fg-muted)' }}
                        />
                        {fb.boardName}
                      </span>
                    )}
                    <ListSelect
                      label="Mover pra"
                      value={targets[fb.boardId]?.reject ?? ''}
                      onChange={(v) => setTargetFor(fb.boardId, 'reject', v)}
                      lists={fb.lists}
                      emptyLabel="(não mover)"
                    />
                  </div>
                ))}
                <LabelMultiSelect
                  label="Adicionar etiquetas"
                  labels={labelsQ.data ?? []}
                  selected={onRejectAddTagIds}
                  onChange={setOnRejectAddTagIds}
                />
                <LabelMultiSelect
                  label="Remover etiquetas"
                  labels={labelsQ.data ?? []}
                  selected={onRejectRemoveTagIds}
                  onChange={setOnRejectRemoveTagIds}
                />
              </div>

              <p className="text-fg-subtle text-[11px] leading-relaxed">
                {flowBlocks.length > 1
                  ? 'Este card está em múltiplos fluxos — configure o destino em cada um. Fluxos não selecionados ficam onde estavam.'
                  : 'Além disso, automações com gatilho CARD_APPROVED / CARD_REJECTED na coluna também rodam em cadeia.'}
              </p>
            </div>
          </details>

          <label className="border-border bg-bg-muted/20 flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm">
            <input
              type="checkbox"
              checked={notifyOnWhatsApp}
              onChange={(e) => setNotifyOnWhatsApp(e.target.checked)}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <MessageCircle size={13} className="text-emerald-600" />
                Notificar por WhatsApp
              </span>
              <span className="text-fg-muted text-xs leading-relaxed">
                Externos recebem por WhatsApp. Membros do workspace também recebem se tiverem
                telefone cadastrado no perfil.
              </span>
            </span>
          </label>

          {/* Opcoes avancadas: override de lembrete (default usa setting da org).
              Colapsado por default pra nao poluir o popup — quem precisa abre. */}
          <details
            open={showAdvanced}
            onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
            className="border-border rounded-md border"
          >
            <summary className="text-fg-muted hover:text-fg cursor-pointer select-none px-3 py-2 text-xs font-medium">
              Opções avançadas (lembrete automático)
            </summary>
            <div className="border-border flex flex-col gap-3 border-t p-3">
              <label className="flex cursor-pointer items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={reminderDisabled}
                  onChange={(e) => setReminderDisabled(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">Sem lembrete automático para este pedido</span>
                  <span className="text-fg-muted leading-relaxed">
                    Útil quando você vai cobrar manualmente ou a aprovação é silenciosa. O lembrete
                    da organização não vai disparar nesta aprovação.
                  </span>
                </span>
              </label>

              <label
                className={`flex flex-col gap-1 text-xs ${reminderDisabled ? 'opacity-40' : ''}`}
              >
                <span className="font-medium">Intervalo personalizado (horas)</span>
                <input
                  type="number"
                  min={1}
                  max={72}
                  value={reminderInterval}
                  onChange={(e) => setReminderInterval(e.target.value)}
                  disabled={reminderDisabled}
                  placeholder="vazio = usa padrão da organização"
                  className="border-border bg-bg focus-visible:ring-primary w-48 rounded-md border px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50"
                />
                <span className="text-fg-subtle leading-relaxed">
                  Sobrescreve o intervalo padrão da organização (ex: 2h pra cobrar mais rápido).
                </span>
              </label>
            </div>
          </details>

          {error && (
            <p className="bg-danger-subtle text-danger rounded-md px-3 py-2 text-xs">{error}</p>
          )}

          <div className="border-border flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-fg-muted hover:bg-bg-muted rounded-md px-3 py-1.5 text-sm"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => mut.mutate()}
              disabled={!canSubmit}
              className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mut.isPending && <Loader2 size={14} className="animate-spin" />}
              <CheckCircle2 size={14} />
              Pedir aprovação
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ListSelect({
  label,
  value,
  onChange,
  lists,
  emptyLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  lists: Array<{ id: string; name: string }>;
  emptyLabel: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-fg-muted text-[11px] font-medium">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-border bg-bg focus-visible:ring-primary rounded-md border px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2"
      >
        <option value="">{emptyLabel}</option>
        {lists.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Multi-select compacto de labels do board. Clicar num chip toggle
 * sua presenca no array `selected`. Sem dropdown — mostra todas as
 * labels em wrap.
 */
function LabelMultiSelect({
  label,
  labels,
  selected,
  onChange,
}: {
  label: string;
  labels: Array<{ id: string; name: string; color: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  return (
    <div className="flex flex-col gap-1">
      <label className="text-fg-muted text-[11px] font-medium">{label}</label>
      {labels.length === 0 ? (
        <p className="text-fg-subtle text-[11px] italic">Nenhuma etiqueta no quadro.</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {labels.map((l) => {
            const on = selected.includes(l.id);
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => toggle(l.id)}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  on
                    ? 'border-transparent text-white'
                    : 'border-border text-fg-muted hover:border-border-strong'
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
      )}
    </div>
  );
}

/**
 * Picker com 2 modos:
 *   1. user: busca por nome/email de membro da Org
 *   2. phone-new: digita um telefone avulso + nome de exibição (externo)
 *
 * Quando o telefone digitado em phone-new bate com o `phone` de algum membro,
 * o reviewer é promovido pra interno automaticamente (`userId`). Garante que
 * o membro veja os botões Aprovar/Reprovar dentro do app — só usar telefone
 * cria reviewer externo, que só pode aprovar via link público no WhatsApp.
 */
function ReviewerPicker({ onAdd }: { onAdd: (r: ReviewerDraft) => void }) {
  const [mode, setMode] = useState<Mode>('user');
  const [query, setQuery] = useState('');
  const [externalName, setExternalName] = useState('');
  const [externalPhone, setExternalPhone] = useState('');

  const membersQ = useQuery({ ...membersQueries.all() });

  const filteredMembers = useMemo(() => {
    const all = membersQ.data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all.slice(0, 8);
    return all
      .filter(
        (m) => m.user.name.toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [membersQ.data, query]);

  // Membro do workspace cujo phone bate com o digitado em phone-new. Quando
  // encontrado, o submit vira "Vincular como membro" e o reviewer é gravado
  // como interno (userId) em vez de externo.
  const matchedMember = useMemo(() => {
    if (mode !== 'phone-new') return null;
    if (externalPhone.length < 10) return null;
    return (
      (membersQ.data ?? []).find(
        (m) => (m.user.phone ?? '').replace(/\D/g, '') === externalPhone,
      ) ?? null
    );
  }, [mode, externalPhone, membersQ.data]);

  function submitPhoneNew() {
    if (!/^\d{10,15}$/.test(externalPhone)) return;
    if (matchedMember) {
      onAdd({
        key: `user-${matchedMember.userId}`,
        data: { userId: matchedMember.userId },
        display: {
          name: matchedMember.user.name,
          subtitle: matchedMember.user.email,
          avatarUrl: matchedMember.user.avatarUrl,
        },
      });
    } else {
      if (externalName.trim().length === 0) return;
      onAdd({
        key: `new-${externalPhone}`,
        data: { phone: externalPhone, externalName: externalName.trim() },
        display: {
          name: externalName.trim(),
          subtitle: externalPhone,
          phone: externalPhone,
        },
      });
    }
    setExternalName('');
    setExternalPhone('');
  }

  const phoneNewSubmitDisabled =
    !/^\d{10,15}$/.test(externalPhone) || (!matchedMember && externalName.trim().length === 0);

  return (
    <div className="border-border flex flex-col gap-2 rounded-md border p-3">
      <div className="flex flex-wrap gap-1">
        <ModeBtn active={mode === 'user'} onClick={() => setMode('user')} icon={<User size={12} />}>
          Membro
        </ModeBtn>
        <ModeBtn
          active={mode === 'phone-new'}
          onClick={() => setMode('phone-new')}
          icon={<Phone size={12} />}
        >
          WhatsApp avulso
        </ModeBtn>
      </div>

      {mode === 'user' && (
        <>
          <input
            type="text"
            placeholder="Buscar por nome ou email..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border-border bg-bg focus-visible:ring-primary rounded-md border px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2"
          />
          <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
            {filteredMembers.map((m) => (
              <li key={m.userId}>
                <button
                  type="button"
                  onClick={() =>
                    onAdd({
                      key: `user-${m.userId}`,
                      data: { userId: m.userId },
                      display: {
                        name: m.user.name,
                        subtitle: m.user.email,
                        avatarUrl: m.user.avatarUrl,
                      },
                    })
                  }
                  className="hover:bg-bg-muted flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm"
                >
                  <UserAvatar
                    name={m.user.name}
                    userId={m.userId}
                    avatarUrl={m.user.avatarUrl}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{m.user.name}</span>
                    <span className="text-fg-muted ml-1.5 text-xs">· {m.user.email}</span>
                  </span>
                </button>
              </li>
            ))}
            {filteredMembers.length === 0 && (
              <p className="text-fg-muted py-3 text-center text-xs">Nenhum membro encontrado.</p>
            )}
          </ul>
        </>
      )}

      {mode === 'phone-new' && (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            placeholder={
              matchedMember
                ? `Nome (preenchido com "${matchedMember.user.name}")`
                : 'Nome do revisor (ex: João - Cliente XYZ)'
            }
            value={externalName}
            onChange={(e) => setExternalName(e.target.value)}
            disabled={!!matchedMember}
            className="border-border bg-bg focus-visible:ring-primary rounded-md border px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <input
            type="text"
            placeholder="Telefone (apenas dígitos, com DDI). Ex: 5531999999999"
            inputMode="numeric"
            value={externalPhone}
            onChange={(e) => setExternalPhone(e.target.value.replace(/\D/g, ''))}
            className="border-border bg-bg focus-visible:ring-primary rounded-md border px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2"
          />

          {matchedMember && (
            <div className="border-primary/40 bg-primary/5 flex items-center gap-2 rounded-md border p-2">
              <UserAvatar
                name={matchedMember.user.name}
                userId={matchedMember.userId}
                avatarUrl={matchedMember.user.avatarUrl}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="text-fg text-xs leading-snug">
                  <CheckCircle2
                    size={11}
                    className="text-primary mr-1 inline-block align-text-bottom"
                  />
                  Esse número é do <span className="font-medium">{matchedMember.user.name}</span> —
                  será vinculado como membro pra ele(a) ver os botões Aprovar/Reprovar no app.
                </p>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={submitPhoneNew}
            disabled={phoneNewSubmitDisabled}
            className="bg-bg-muted hover:bg-bg-emphasis self-start rounded-md px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            {matchedMember ? 'Vincular como membro' : 'Adicionar revisor'}
          </button>
        </div>
      )}
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
        active ? 'bg-primary text-primary-fg' : 'bg-bg-muted text-fg-muted hover:bg-bg-emphasis'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
