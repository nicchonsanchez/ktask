'use client';

import {
  Mail,
  MessageCircle,
  Phone,
  PhoneCall,
  Presentation,
  RefreshCcw,
  FileText,
  Tag,
  X,
} from 'lucide-react';
import {
  INTERACTION_OUTCOMES,
  INTERACTION_TYPE_LABELS,
  INTERACTION_TYPES,
  interactionOutcome,
  type CardInteractionDto,
  type InteractionInput,
  type InteractionType,
} from '@ktask/contracts';

/**
 * Doc 52 (Fase 3, D9) — botoes opcionais de registro de contato acima da
 * caixa de comentario. So renderizado em cards de fluxos com o recurso
 * ligado; nos demais a caixa de comentario fica identica.
 */

export interface ContactLogDraft {
  type: InteractionType | null;
  outcome: string | null;
  customLabel: string;
  followUpDate: string;
}

export const EMPTY_CONTACT_LOG: ContactLogDraft = {
  type: null,
  outcome: null,
  customLabel: '',
  followUpDate: '',
};

const ICONS: Record<InteractionType, React.ComponentType<{ size?: number }>> = {
  CALL: Phone,
  WHATSAPP: MessageCircle,
  EMAIL: Mail,
  MEETING: Presentation,
  FOLLOW_UP: RefreshCcw,
  PROPOSAL: FileText,
  OTHER: Tag,
};

/** Registro completo o bastante pra enviar? */
export function contactLogReady(d: ContactLogDraft): boolean {
  if (!d.type || !d.outcome) return false;
  if (d.type === 'OTHER' && !d.customLabel.trim()) return false;
  return true;
}

export function contactLogLabel(
  type: InteractionType,
  outcome: string,
  customLabel?: string | null,
): string {
  const t = type === 'OTHER' && customLabel ? customLabel : INTERACTION_TYPE_LABELS[type];
  const o = interactionOutcome(type, outcome);
  return o ? `${t} · ${o.label}` : t;
}

export function toInteractionInput(
  d: ContactLogDraft,
  boardId: string | null,
): InteractionInput | undefined {
  if (!contactLogReady(d)) return undefined;
  return {
    type: d.type!,
    outcome: d.outcome!,
    ...(d.type === 'OTHER' ? { customLabel: d.customLabel.trim() } : {}),
    ...(d.followUpDate ? { followUpDate: d.followUpDate } : {}),
    ...(boardId ? { boardId } : {}),
  };
}

const chip = (active: boolean) =>
  `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
    active
      ? 'border-primary bg-primary-subtle text-primary'
      : 'border-border text-fg-muted hover:text-fg hover:border-border-strong'
  }`;

export function ContactLogPicker({
  value,
  onChange,
}: {
  value: ContactLogDraft;
  onChange: (next: ContactLogDraft) => void;
}) {
  const outcomes = value.type ? INTERACTION_OUTCOMES[value.type] : [];
  const askFollowUp =
    value.outcome === 'CALL_BACK' || value.outcome === 'PENDING' || value.outcome === 'NO_ANSWER';

  return (
    <div className="flex flex-col gap-1.5" aria-label="Registrar contato">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-fg-subtle mr-1 inline-flex items-center gap-1 text-[11px]">
          <PhoneCall size={11} /> Registrar contato:
        </span>
        {INTERACTION_TYPES.map((t) => {
          const Icon = ICONS[t];
          const active = value.type === t;
          return (
            <button
              key={t}
              type="button"
              aria-pressed={active}
              onClick={() =>
                onChange(active ? EMPTY_CONTACT_LOG : { ...EMPTY_CONTACT_LOG, type: t })
              }
              className={chip(active)}
            >
              <Icon size={11} />
              {INTERACTION_TYPE_LABELS[t]}
            </button>
          );
        })}
        {value.type && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_CONTACT_LOG)}
            className="text-fg-subtle hover:text-fg ml-1"
            aria-label="Limpar registro de contato"
            title="Limpar"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {value.type && (
        <div className="flex flex-wrap items-center gap-1 pl-1">
          {value.type === 'OTHER' && (
            <input
              type="text"
              value={value.customLabel}
              maxLength={60}
              onChange={(e) => onChange({ ...value, customLabel: e.target.value })}
              placeholder="Qual tipo?"
              className="border-border bg-bg text-fg mr-1 rounded-md border px-2 py-0.5 text-[11px] focus:outline-none"
            />
          )}
          <span className="text-fg-subtle mr-1 text-[11px]">Resultado:</span>
          {outcomes.map((o) => (
            <button
              key={o.key}
              type="button"
              aria-pressed={value.outcome === o.key}
              onClick={() => onChange({ ...value, outcome: o.key })}
              className={chip(value.outcome === o.key)}
            >
              {o.label}
            </button>
          ))}
          {askFollowUp && (
            <label className="text-fg-muted ml-2 inline-flex items-center gap-1 text-[11px]">
              Retornar em
              <input
                type="date"
                value={value.followUpDate}
                onChange={(e) => onChange({ ...value, followUpDate: e.target.value })}
                className="border-border bg-bg text-fg rounded-md border px-1.5 py-0.5 text-[11px] focus:outline-none"
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

/** Selo discreto no comentario que tem registro de contato. */
export function ContactLogBadge({ interaction }: { interaction: CardInteractionDto }) {
  const Icon = ICONS[interaction.type] ?? Tag;
  const done = interactionOutcome(interaction.type, interaction.outcome)?.done ?? false;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
        done ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700'
      }`}
      title="Registro de contato"
    >
      <Icon size={10} />
      {contactLogLabel(interaction.type, interaction.outcome, interaction.customLabel)}
    </span>
  );
}
