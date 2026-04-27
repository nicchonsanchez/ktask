'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, MessageCircle, Phone, Trash2, User, X } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@ktask/ui';
import { boardsQueries } from '@/lib/queries/boards';
import { membersQueries } from '@/lib/queries/members';
import { requestApproval, type ReviewerInputDTO } from '@/lib/queries/approvals';
import { ApiError } from '@/lib/api-client';
import { UserAvatar } from '@/components/user-avatar';
import { TemplateVarsBar } from './template-vars-bar';

type Mode = 'user' | 'phone-existing' | 'phone-new';

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
  currentListId,
  open,
  onOpenChange,
}: {
  cardId: string;
  boardId: string;
  currentListId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const [reviewers, setReviewers] = useState<ReviewerDraft[]>([]);
  const [message, setMessage] = useState('');
  const [defaultOnApproveListId, setDefaultOnApproveListId] = useState<string>('');
  const [defaultOnRejectListId, setDefaultOnRejectListId] = useState<string>('');
  const [notifyOnWhatsApp, setNotifyOnWhatsApp] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const boardQ = useQuery({ ...boardsQueries.detail(boardId) });

  useEffect(() => {
    if (open) {
      setReviewers([]);
      setMessage('');
      setDefaultOnApproveListId('');
      setDefaultOnRejectListId('');
      setNotifyOnWhatsApp(true);
      setError(null);
    }
  }, [open]);

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
    mutationFn: () =>
      requestApproval(cardId, {
        reviewers: reviewers.map((r) => r.data),
        message: message.trim() || undefined,
        defaultOnApproveListId: defaultOnApproveListId || undefined,
        defaultOnRejectListId: defaultOnRejectListId || undefined,
        notifyOnWhatsApp,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards', cardId] });
      queryClient.invalidateQueries({ queryKey: ['cards', cardId, 'approvals'] });
      onOpenChange(false);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Erro ao pedir aprovação.');
    },
  });

  const lists = useMemo(() => {
    return (boardQ.data?.lists ?? []).filter((l) => l.id !== currentListId);
  }, [boardQ.data, currentListId]);

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
            <label htmlFor="approval-message" className="text-fg-muted text-xs font-medium">
              Mensagem (opcional)
            </label>
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
              Mover card automaticamente conforme a decisão
            </summary>
            <div className="flex flex-col gap-3 px-3 pb-3 pt-1">
              <ListSelect
                label="Quando aprovar, mover pra"
                value={defaultOnApproveListId}
                onChange={setDefaultOnApproveListId}
                lists={lists}
                emptyLabel="(não mover)"
              />
              <ListSelect
                label="Quando reprovar, mover pra"
                value={defaultOnRejectListId}
                onChange={setDefaultOnRejectListId}
                lists={lists}
                emptyLabel="(não mover)"
              />
              <p className="text-fg-subtle text-[11px] leading-relaxed">
                As automações configuradas pra esses gatilhos (CARD_APPROVED / CARD_REJECTED) rodam
                em sequência. Se preferir só rodar automações sem mover, deixe em branco.
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
                Externos sempre recebem por WhatsApp. Revisores internos recebem se tiverem opt-in
                ativado no perfil.
              </span>
            </span>
          </label>

          {error && (
            <p className="bg-danger-subtle text-danger rounded-md px-3 py-2 text-xs">{error}</p>
          )}

          <div className="border-border flex items-center justify-end gap-2 border-t pt-3">
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
 * Picker com 3 modos:
 *   1. user: busca por nome de membro da Org
 *   2. phone-existing: busca em nome dos membros e usa o `phone` deles
 *   3. phone-new: digita um telefone avulso + nome de exibição
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

  const filteredWithPhone = useMemo(() => {
    return (membersQ.data ?? [])
      .filter((m) => m.user.phone)
      .filter((m) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return (
          m.user.name.toLowerCase().includes(q) || (m.user.phone ?? '').toLowerCase().includes(q)
        );
      })
      .slice(0, 8);
  }, [membersQ.data, query]);

  return (
    <div className="border-border flex flex-col gap-2 rounded-md border p-3">
      <div className="flex flex-wrap gap-1">
        <ModeBtn active={mode === 'user'} onClick={() => setMode('user')} icon={<User size={12} />}>
          Membro
        </ModeBtn>
        <ModeBtn
          active={mode === 'phone-existing'}
          onClick={() => setMode('phone-existing')}
          icon={<Phone size={12} />}
        >
          WhatsApp de membro
        </ModeBtn>
        <ModeBtn
          active={mode === 'phone-new'}
          onClick={() => setMode('phone-new')}
          icon={<MessageCircle size={12} />}
        >
          WhatsApp avulso
        </ModeBtn>
      </div>

      {(mode === 'user' || mode === 'phone-existing') && (
        <>
          <input
            type="text"
            placeholder={
              mode === 'user' ? 'Buscar por nome ou email...' : 'Buscar membros com WhatsApp...'
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border-border bg-bg focus-visible:ring-primary rounded-md border px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2"
          />
          <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
            {(mode === 'user' ? filteredMembers : filteredWithPhone).map((m) => (
              <li key={m.userId}>
                <button
                  type="button"
                  onClick={() =>
                    onAdd(
                      mode === 'user'
                        ? {
                            key: `user-${m.userId}`,
                            data: { userId: m.userId },
                            display: {
                              name: m.user.name,
                              subtitle: m.user.email,
                              avatarUrl: m.user.avatarUrl,
                            },
                          }
                        : {
                            key: `phone-${m.user.phone}`,
                            data: {
                              phone: m.user.phone!,
                              externalName: m.user.name,
                            },
                            display: {
                              name: m.user.name,
                              subtitle: m.user.phone!,
                              phone: m.user.phone!,
                            },
                          },
                    )
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
                    <span className="text-fg-muted ml-1.5 text-xs">
                      · {mode === 'user' ? m.user.email : m.user.phone}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {(mode === 'user' ? filteredMembers : filteredWithPhone).length === 0 && (
              <p className="text-fg-muted py-3 text-center text-xs">
                {mode === 'phone-existing'
                  ? 'Nenhum membro com WhatsApp cadastrado.'
                  : 'Nenhum membro encontrado.'}
              </p>
            )}
          </ul>
        </>
      )}

      {mode === 'phone-new' && (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            placeholder="Nome do revisor (ex: João - Cliente XYZ)"
            value={externalName}
            onChange={(e) => setExternalName(e.target.value)}
            className="border-border bg-bg focus-visible:ring-primary rounded-md border px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2"
          />
          <input
            type="text"
            placeholder="Telefone (apenas dígitos, com DDI). Ex: 5531999999999"
            inputMode="numeric"
            value={externalPhone}
            onChange={(e) => setExternalPhone(e.target.value.replace(/\D/g, ''))}
            className="border-border bg-bg focus-visible:ring-primary rounded-md border px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2"
          />
          <button
            type="button"
            onClick={() => {
              if (externalName.trim().length === 0) return;
              if (!/^\d{10,15}$/.test(externalPhone)) return;
              onAdd({
                key: `new-${externalPhone}`,
                data: { phone: externalPhone, externalName: externalName.trim() },
                display: {
                  name: externalName.trim(),
                  subtitle: externalPhone,
                  phone: externalPhone,
                },
              });
              setExternalName('');
              setExternalPhone('');
            }}
            disabled={externalName.trim().length === 0 || !/^\d{10,15}$/.test(externalPhone)}
            className="bg-bg-muted hover:bg-bg-emphasis self-start rounded-md px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            Adicionar revisor
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
