'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, MessageSquare, CheckSquare, Paperclip, ShieldCheck, Lock } from 'lucide-react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { UserAvatar } from '@/components/user-avatar';
import type { CardListItem } from '@/lib/queries/boards';
import { CARD_COLOR_BG, isCardColor } from './card-color-config';
import { STATUS_LABEL, STATUS_VISUAL } from './status-config';

/**
 * Format pra o chip do mini-card. Inclui horario quando o dueDate tem
 * hora definida (!= 00:00). Sem hora: "14 mai". Com hora: "14 mai 14:30".
 */
function formatDueChip(iso: string): string {
  const d = new Date(iso);
  const dateLabel = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  if (!hasTime) return dateLabel;
  const timeLabel = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${dateLabel} ${timeLabel}`;
}

function dueState(iso: string | null): {
  show: boolean;
  classes: string;
  label?: string;
} {
  if (!iso) return { show: false, classes: '' };
  const due = new Date(iso);
  const now = new Date();

  // Sem horario (00:00) → compara em dias-de-calendario. Card so vira
  // "atrasado" depois que o dia INTEIRO passa, nao logo apos 00:00.
  // Com horario → compara em ms reais; tarefa de hoje 14h vira atrasada
  // apos as 14h, nao no dia seguinte.
  const hasTime = due.getHours() !== 0 || due.getMinutes() !== 0;

  if (hasTime) {
    if (due.getTime() < now.getTime())
      return { show: true, classes: 'text-danger font-semibold', label: undefined };
    // Mesmo dia + ainda nao passou: amarelo "Hoje"
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const days = Math.round((dueDay - today) / 86_400_000);
    if (days === 0) return { show: true, classes: 'text-warning font-semibold', label: 'Hoje' };
    if (days <= 3) return { show: true, classes: 'text-warning', label: undefined };
    return { show: true, classes: 'text-fg-muted', label: undefined };
  }

  // Sem hora: por DIA-DE-CALENDARIO (legado)
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((dueDay - today) / 86_400_000);
  if (days < 0) return { show: true, classes: 'text-danger font-semibold', label: undefined };
  if (days === 0) return { show: true, classes: 'text-warning font-semibold', label: 'Hoje' };
  if (days <= 3) return { show: true, classes: 'text-warning', label: undefined };
  return { show: true, classes: 'text-fg-muted', label: undefined };
}

export function CardItem({ card }: { card: CardListItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });
  const router = useRouter();
  const params = useSearchParams();
  const routeParams = useParams<{ boardId: string }>();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  function openCard() {
    const next = new URLSearchParams(params.toString());
    next.set('card', card.id);
    router.push(`/b/${routeParams.boardId}?${next.toString()}`, { scroll: false });
  }

  const bgClass = isCardColor(card.cardColor) ? CARD_COLOR_BG[card.cardColor] : 'bg-bg';
  const flagHex = flagHexFor(card.flagColor);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // Só abre modal se o pointer não estava arrastando
        // (dnd-kit já filtra via activationConstraint distance:6)
        if ((e.target as HTMLElement).closest('[data-no-modal]')) return;
        openCard();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openCard();
        }
      }}
      role="button"
      tabIndex={0}
      className={`${bgClass} relative cursor-pointer rounded-lg p-3 text-left shadow-[0_1px_2px_rgba(15,15,20,0.06)] ring-1 ring-black/[0.05] transition-all hover:shadow-[0_2px_8px_rgba(15,15,20,0.08)] hover:ring-black/[0.08] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4)] dark:ring-white/[0.06] dark:hover:shadow-[0_2px_8px_rgba(0,0,0,0.5)] dark:hover:ring-white/[0.1] ${
        card.status === 'CANCELED' ? 'opacity-60 hover:opacity-100' : ''
      }`}
    >
      {flagHex && (
        <span
          aria-hidden
          title="Card sinalizado pela automação"
          className="absolute inset-x-0 top-0 h-1 rounded-t-lg"
          style={{ backgroundColor: flagHex }}
        />
      )}
      <CardInner card={card} />
    </div>
  );
}

export function CardOverlay({ card }: { card: CardListItem }) {
  const bgClass = isCardColor(card.cardColor) ? CARD_COLOR_BG[card.cardColor] : 'bg-bg';
  const flagHex = flagHexFor(card.flagColor);
  return (
    <div
      className={`${bgClass} relative cursor-grabbing rounded-lg p-3 shadow-[0_8px_24px_rgba(15,15,20,0.18)] ring-1 ring-black/10 dark:shadow-[0_8px_24px_rgba(0,0,0,0.6)] dark:ring-white/10`}
    >
      {flagHex && (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-1 rounded-t-lg"
          style={{ backgroundColor: flagHex }}
        />
      )}
      <CardInner card={card} />
    </div>
  );
}

/** Mapeia o flagColor armazenado no card pro hex de exibicao. */
function flagHexFor(color: string | null): string | null {
  switch (color) {
    case 'orange':
      return '#F97316';
    case 'yellow':
      return '#EAB308';
    case 'pink':
      return '#EC4899';
    case 'red':
      return '#EF4444';
    default:
      return null;
  }
}

function CardInner({ card }: { card: CardListItem }) {
  const hasLabels = card.labels.length > 0;
  const due = dueState(card.dueDate);
  const hasCover = Boolean(card.coverImageUrl);
  const hasCounters =
    card._count.comments > 0 || card._count.checklists > 0 || card._count.attachments > 0;
  const hasPendingApproval = card._count.approvals > 0;
  const hasMembers = card.members.length > 0;
  const hasMetaRow = due.show || hasCounters || hasPendingApproval;

  return (
    <div className="relative flex flex-col gap-2.5">
      {/* Badge de status no canto sup-direito quando nao-ACTIVE.
          Variante SUTIL (bg-{cor}-subtle + icone colorido), tamanho
          reduzido (size-5) — operador apontou que solido grande
          competia com o titulo do card. */}
      {card.status !== 'ACTIVE' && (
        <span
          className={`absolute right-0 top-0 z-10 inline-flex size-5 items-center justify-center rounded shadow-sm ${STATUS_VISUAL[card.status].bgClass} ${STATUS_VISUAL[card.status].textClass}`}
          title={`Status: ${STATUS_LABEL[card.status]}`}
          aria-label={`Status: ${STATUS_LABEL[card.status]}`}
        >
          {(() => {
            const SIcon = STATUS_VISUAL[card.status].icon;
            return <SIcon size={11} strokeWidth={2.25} />;
          })()}
        </span>
      )}

      {/* Capa (se houver). Etiquetas viram pills abaixo do titulo. */}
      {hasCover && (
        <div className="-mx-3 -mt-3 flex flex-col overflow-hidden rounded-t-lg">
          <div className="bg-bg-muted relative h-24 w-full overflow-hidden">
            <img
              src={card.coverImageUrl as string}
              alt=""
              className="size-full object-cover"
              loading="lazy"
            />
          </div>
        </div>
      )}

      {/* Título — destaque máximo. shortCode fica só no modal pra não
          poluir o mini (especialmente IDs longos importados do Ummense).
          pr-7 quando ha badge de status nao-ACTIVE pra evitar texto
          colidir com o badge no canto sup-direito. */}
      <p
        className={`text-fg line-clamp-3 text-sm font-medium leading-snug ${
          card.status !== 'ACTIVE' ? 'pr-7' : ''
        }`}
      >
        {card.privacy === 'TEAM_ONLY' && (
          <Lock
            size={11}
            className="text-fg-muted mr-1 inline-block align-baseline"
            aria-label="Card privado — só líder e equipe"
          />
        )}
        {card.title}
      </p>

      {/* Etiquetas como pills coloridas — nome legivel, cor da etiqueta como
          fundo. Wrapping natural quando ha varias. */}
      {hasLabels && (
        <div className="flex flex-wrap gap-1">
          {card.labels.map((l) => (
            <span
              key={l.label.id}
              className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none text-white"
              style={{ backgroundColor: l.label.color }}
              title={l.label.name}
            >
              {l.label.name}
            </span>
          ))}
        </div>
      )}

      {/* Meta row (prazo + contadores) — discreta, só aparece se há algo */}
      {hasMetaRow && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          {due.show && card.dueDate && (
            <span className={`inline-flex items-center gap-1 ${due.classes}`}>
              <Calendar size={11} />
              {due.label ?? formatDueChip(card.dueDate)}
            </span>
          )}

          {hasPendingApproval && (
            <span
              className="bg-warning-subtle text-warning border-warning/40 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-medium"
              title="Aprovação pendente"
            >
              <ShieldCheck size={11} />
              Aprovação
            </span>
          )}

          {card._count.comments > 0 && (
            <span
              className="text-fg-muted inline-flex items-center gap-1"
              title={`${card._count.comments} comentário(s)`}
            >
              <MessageSquare size={11} />
              {card._count.comments}
            </span>
          )}

          {card._count.checklists > 0 && (
            <span
              className="text-fg-muted inline-flex items-center gap-1"
              title={`${card._count.checklists} checklist(s)`}
            >
              <CheckSquare size={11} />
              {card._count.checklists}
            </span>
          )}

          {card._count.attachments > 0 && (
            <span
              className="text-fg-muted inline-flex items-center gap-1"
              title={`${card._count.attachments} anexo(s)`}
            >
              <Paperclip size={11} />
              {card._count.attachments}
            </span>
          )}
        </div>
      )}

      {/* Avatares — última linha, alinhados à direita pra equilíbrio visual.
          Se houver líder, ele fica à ESQUERDA dos demais, com mesmo tamanho
          mas com ring violet pra distinção. Outros membros empilhados à direita. */}
      {hasMembers && (
        <div className="flex items-center justify-end gap-2 pt-0.5">
          {(() => {
            const lead = card.leadId ? card.members.find((m) => m.user.id === card.leadId) : null;
            const others = card.members.filter((m) => m.user.id !== lead?.user.id).slice(0, 3);
            const overflow = card.members.length - others.length - (lead ? 1 : 0);
            return (
              <>
                {lead && (
                  <UserAvatar
                    name={lead.user.name}
                    userId={lead.user.id}
                    avatarUrl={lead.user.avatarUrl}
                    size="sm"
                    title={`${lead.user.name} (líder)`}
                    className="ring-primary ring-offset-bg-subtle ring-2 ring-offset-1"
                  />
                )}
                {others.length > 0 && (
                  <div className="flex -space-x-1.5">
                    {others.map((m) => (
                      <UserAvatar
                        key={m.user.id}
                        name={m.user.name}
                        userId={m.user.id}
                        avatarUrl={m.user.avatarUrl}
                        size="sm"
                        stacked
                      />
                    ))}
                    {overflow > 0 && (
                      <span className="border-bg bg-bg-muted text-fg-muted inline-flex size-6 shrink-0 select-none items-center justify-center rounded-full border-2 text-[10px] font-semibold">
                        +{overflow}
                      </span>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
