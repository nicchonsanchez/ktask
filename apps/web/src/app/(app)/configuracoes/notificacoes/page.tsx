'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageCircle, Settings2, X } from 'lucide-react';

import { api } from '@/lib/api-client';
import { useNotify } from '@/components/ui/dialogs';
import {
  notificationPrefsQuery,
  updateNotificationPreferences,
  type NotificationEventKey,
  type NotificationPreferences,
  type NotificationScope,
} from '@/lib/queries/notifications';

/**
 * Matriz de preferencias de notificacao por evento × canal.
 *
 * Cada linha = 1 evento (14 ao todo, dividido em 3 grupos). Cada celula
 * = toggle pra canal (App / WhatsApp). Eventos contextuais (card_*) tem
 * radio extra de escopo (somente lider / quando participo).
 *
 * WhatsApp: alguns eventos sao "indisponivel" no canal (definicao de
 * produto pra evitar volume). Toggle aparece desabilitado nessas linhas.
 * Pra eventos elegiveis, se user nao tem telefone cadastrado, clicar no
 * toggle abre popup pedindo o numero.
 */

const WHATSAPP_ELIGIBLE: Set<NotificationEventKey> = new Set([
  'mention_comment',
  'task_assigned',
  'task_due_soon',
  'approval_pending',
  'approval_responded',
  'card_lead_assigned',
  'card_sla_breach',
]);

const SCOPED_EVENTS: Set<NotificationEventKey> = new Set([
  'card_commented',
  'card_completed',
  'card_moved',
  'card_due_changed',
  'card_checklist_changed',
  'card_sla_breach',
]);

const GROUPS: Array<{
  title: string;
  description: string;
  events: Array<{ key: NotificationEventKey; label: string; description: string }>;
}> = [
  {
    title: 'Coisas dirigidas a você',
    description: 'Quando alguém faz algo que aponta direto pra você.',
    events: [
      {
        key: 'mention_comment',
        label: 'Menção em comentário',
        description: 'Quando alguém escreve @você num comentário de qualquer card.',
      },
      {
        key: 'task_assigned',
        label: 'Tarefa atribuída a você',
        description: 'Quando atribuem uma tarefa de checklist pra você (manual ou via automação).',
      },
      {
        key: 'task_unassigned',
        label: 'Tarefa desatribuída',
        description: 'Quando você é removido como responsável de uma tarefa.',
      },
      {
        key: 'task_due_changed',
        label: 'Prazo da sua tarefa mudou',
        description: 'Quando o prazo de uma tarefa atribuída a você é alterado.',
      },
      {
        key: 'task_due_soon',
        label: 'Sua tarefa vence em breve',
        description: 'Aviso automático quando o prazo de uma tarefa sua está chegando (24h).',
      },
      {
        key: 'approval_pending',
        label: 'Aprovação pendente',
        description: 'Quando alguém pede sua aprovação num card.',
      },
      {
        key: 'approval_responded',
        label: 'Sua aprovação foi respondida',
        description: 'Quando uma aprovação que você pediu foi aprovada ou rejeitada.',
      },
      {
        key: 'card_lead_assigned',
        label: 'Você virou líder de um card',
        description: 'Quando alguém te define como líder.',
      },
    ],
  },
  {
    title: 'Atividade em cards que você participa',
    description:
      'Eventos contextuais. Escolha entre "Só onde sou líder" ou "Onde participo" (inclui líder + equipe).',
    events: [
      {
        key: 'card_commented',
        label: 'Comentaram em um card',
        description: 'Qualquer comentário novo. Use "menção" pra ser tocado só quando citado.',
      },
      {
        key: 'card_completed',
        label: 'Card foi concluído',
        description: 'Quando alguém marca o card como completo.',
      },
      {
        key: 'card_moved',
        label: 'Card mudou de coluna',
        description: 'Quando alguém arrasta ou move o card de lista.',
      },
      {
        key: 'card_due_changed',
        label: 'Prazo do card mudou',
        description: 'Edição do prazo do card (não da tarefa).',
      },
      {
        key: 'card_checklist_changed',
        label: 'Lista de tarefas mudou',
        description: 'Quando adicionam, removem ou renomeiam items do checklist.',
      },
      {
        key: 'card_sla_breach',
        label: 'Card ficou atrasado',
        description: 'Quando o card passa do prazo. Por padrão só pra líder.',
      },
    ],
  },
];

interface CurrentUser {
  phone: string | null;
}

export default function NotificacoesConfigPage() {
  const queryClient = useQueryClient();
  const notify = useNotify();
  const prefsQ = useQuery(notificationPrefsQuery);
  const meQ = useQuery({
    queryKey: ['users', 'me'] as const,
    queryFn: () => api.get<CurrentUser>('/api/v1/users/me'),
  });
  const [phonePopupOpen, setPhonePopupOpen] = useState(false);
  const [pendingWaToggle, setPendingWaToggle] = useState<NotificationEventKey | null>(null);

  const patchMut = useMutation({
    mutationFn: (patch: Partial<NotificationPreferences>) => updateNotificationPreferences(patch),
    onSuccess: (next) => {
      queryClient.setQueryData(notificationPrefsQuery.queryKey, next);
    },
    onError: () => notify.error('Não foi possível salvar a preferência.'),
  });

  function setEvent(
    key: NotificationEventKey,
    changes: { app?: boolean; whatsapp?: boolean; scope?: NotificationScope },
  ) {
    const current = prefsQ.data?.[key];
    if (!current) return;
    patchMut.mutate({ [key]: { ...current, ...changes } });
  }

  function onToggleWhatsapp(key: NotificationEventKey, next: boolean) {
    // Habilitar WA sem telefone — abre popup pra cadastrar.
    if (next && !meQ.data?.phone) {
      setPendingWaToggle(key);
      setPhonePopupOpen(true);
      return;
    }
    setEvent(key, { whatsapp: next });
  }

  if (prefsQ.isLoading || meQ.isLoading) {
    return (
      <div className="text-fg-muted flex items-center justify-center gap-2 p-12 text-sm">
        <Loader2 size={14} className="animate-spin" /> Carregando…
      </div>
    );
  }

  const prefs = prefsQ.data;
  if (!prefs) return null;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6">
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <Settings2 size={20} className="text-primary" />
          <h1 className="text-lg font-semibold">Gerenciar notificações</h1>
        </div>
        <p className="text-fg-muted mt-1 text-sm">
          Escolha quais tipos chegam no app e no WhatsApp. Telefone necessário pra ativar canal
          WhatsApp.
        </p>
      </header>

      {GROUPS.map((group) => (
        <section key={group.title} className="mb-8">
          <header className="mb-3">
            <h2 className="text-fg text-sm font-semibold">{group.title}</h2>
            <p className="text-fg-muted text-xs">{group.description}</p>
          </header>
          <div className="border-border bg-bg divide-border/60 flex flex-col divide-y rounded-md border">
            <div className="text-fg-subtle hidden grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2 text-[11px] uppercase tracking-wide sm:grid">
              <span>Evento</span>
              <span className="w-16 text-center">No app</span>
              <span className="w-16 text-center">WhatsApp</span>
              <span className="w-32" />
            </div>
            {group.events.map((evt) => {
              const p = prefs[evt.key];
              const isScoped = SCOPED_EVENTS.has(evt.key);
              const waEligible = WHATSAPP_ELIGIBLE.has(evt.key);
              return (
                <div
                  key={evt.key}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[1fr_auto_auto_auto]"
                >
                  <div className="min-w-0">
                    <p className="text-fg text-sm font-medium">{evt.label}</p>
                    <p className="text-fg-muted text-[11px]">{evt.description}</p>
                  </div>
                  <Toggle
                    checked={p.app}
                    onChange={(v) => setEvent(evt.key, { app: v })}
                    label="No app"
                  />
                  <Toggle
                    checked={p.whatsapp && waEligible}
                    disabled={!waEligible}
                    title={
                      waEligible
                        ? meQ.data?.phone
                          ? 'Receber via WhatsApp'
                          : 'Cadastre seu número primeiro'
                        : 'Este evento não é enviado por WhatsApp'
                    }
                    onChange={(v) => onToggleWhatsapp(evt.key, v)}
                    label="WhatsApp"
                  />
                  {isScoped ? (
                    <ScopeSelect
                      value={p.scope ?? 'present'}
                      onChange={(s) => setEvent(evt.key, { scope: s })}
                    />
                  ) : (
                    <span className="hidden sm:inline" />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {phonePopupOpen && pendingWaToggle && (
        <PhoneCapturePopup
          eventKey={pendingWaToggle}
          onClose={() => {
            setPhonePopupOpen(false);
            setPendingWaToggle(null);
          }}
          onSaved={() => {
            // Telefone cadastrado — ativa o toggle WA
            setEvent(pendingWaToggle, { whatsapp: true });
            setPhonePopupOpen(false);
            setPendingWaToggle(null);
            queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
            notify.success('Número salvo. WhatsApp ativado pra esse evento.');
          }}
        />
      )}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  title,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  title?: string;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      title={title}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        checked && !disabled ? 'bg-primary' : disabled ? 'bg-bg-muted opacity-50' : 'bg-bg-emphasis'
      }`}
    >
      <span
        className={`bg-bg absolute top-0.5 size-4 rounded-full shadow transition-all ${
          checked ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

function ScopeSelect({
  value,
  onChange,
}: {
  value: NotificationScope;
  onChange: (s: NotificationScope) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as NotificationScope)}
      className="border-border bg-bg text-fg-muted rounded-md border px-2 py-1 text-[11px] sm:w-32"
      title="Escopo: só onde sou líder ou onde participo (lead + membro)"
    >
      <option value="present">Onde participo</option>
      <option value="leader">Só como líder</option>
    </select>
  );
}

function PhoneCapturePopup({
  onClose,
  onSaved,
}: {
  eventKey: NotificationEventKey;
  onClose: () => void;
  onSaved: () => void;
}) {
  const notify = useNotify();
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      notify.error('Telefone deve ter de 10 a 15 dígitos (DDI + DDD + número).');
      return;
    }
    setSaving(true);
    try {
      await api.patch('/api/v1/users/me', { phone: digits });
      onSaved();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Falha ao salvar telefone.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="border-border bg-bg w-full max-w-md rounded-md border shadow-xl">
        <header className="border-border flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-fg inline-flex items-center gap-2 text-sm font-semibold">
            <MessageCircle size={16} className="text-primary" /> WhatsApp não cadastrado
          </h3>
          <button onClick={onClose} className="text-fg-muted hover:text-fg p-0.5">
            <X size={14} />
          </button>
        </header>
        <div className="px-4 py-4">
          <p className="text-fg-muted text-xs">
            Pra receber notificações via WhatsApp, precisamos do seu número. Formato: DDI + DDD +
            número (ex: 5527999998888).
          </p>
          <input
            type="tel"
            autoFocus
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="55 27 99999-8888"
            className="border-border bg-bg mt-3 w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <footer className="border-border flex justify-end gap-2 border-t px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="text-fg-muted hover:bg-bg-muted rounded-md px-3 py-1.5 text-xs"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !phone}
            className="bg-primary text-primary-fg hover:bg-primary-hover rounded-md px-3 py-1.5 text-xs disabled:opacity-60"
          >
            {saving ? 'Salvando…' : 'Salvar e ativar'}
          </button>
        </footer>
      </div>
    </div>
  );
}
