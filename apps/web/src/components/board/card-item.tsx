'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, Calendar, MessageSquare, CheckSquare, Paperclip } from 'lucide-react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { UserAvatar } from '@/components/user-avatar';
import type { CardListItem } from '@/lib/queries/boards';

// Prioridade segue princípio de **de-emphasis** (§0.1 doc 20):
// - MEDIUM (default): NÃO renderiza chip — médio = padrão, não merece destaque
// - LOW: chip discreto neutro
// - HIGH/URGENT: chip colorido pra chamar atenção
const PRIORITY_COLOR: Record<Exclude<CardListItem['priority'], 'MEDIUM'>, string> = {
  LOW: 'bg-bg-emphasis text-fg-muted',
  HIGH: 'bg-warning-subtle text-warning',
  URGENT: 'bg-danger-subtle text-danger',
};

const PRIORITY_LABEL: Record<Exclude<CardListItem['priority'], 'MEDIUM'>, string> = {
  LOW: 'Baixa',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

function dueState(iso: string | null): {
  show: boolean;
  classes: string;
  label?: string;
} {
  if (!iso) return { show: false, classes: '' };
  const ms = new Date(iso).getTime() - Date.now();
  const days = ms / 86_400_000;
  // Vencido: mostra a DATA em vermelho semibold (não label "Vencido"),
  // assim o usuário enxerga há quanto tempo passou.
  if (days < 0) return { show: true, classes: 'text-danger font-semibold', label: undefined };
  // Hoje: amarelo com label explícita — urgência sem ser pânico vermelho.
  if (days < 1) return { show: true, classes: 'text-warning font-semibold', label: 'Hoje' };
  if (days < 3) return { show: true, classes: 'text-warning', label: undefined };
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
      className="bg-bg cursor-pointer rounded-lg p-3 text-left shadow-[0_1px_2px_rgba(15,15,20,0.06)] ring-1 ring-black/[0.05] transition-shadow hover:shadow-[0_2px_8px_rgba(15,15,20,0.08)] hover:ring-black/[0.08] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4)] dark:ring-white/[0.06] dark:hover:shadow-[0_2px_8px_rgba(0,0,0,0.5)] dark:hover:ring-white/[0.1]"
    >
      <CardInner card={card} />
    </div>
  );
}

export function CardOverlay({ card }: { card: CardListItem }) {
  return (
    <div className="bg-bg cursor-grabbing rounded-lg p-3 shadow-[0_8px_24px_rgba(15,15,20,0.18)] ring-1 ring-black/10 dark:shadow-[0_8px_24px_rgba(0,0,0,0.6)] dark:ring-white/10">
      <CardInner card={card} />
    </div>
  );
}

function CardInner({ card }: { card: CardListItem }) {
  const hasLabels = card.labels.length > 0;
  const due = dueState(card.dueDate);
  const showPriorityChip = card.priority !== 'MEDIUM';
  const hasCounters =
    card._count.comments > 0 || card._count.checklists > 0 || card._count.attachments > 0;
  const hasMembers = card.members.length > 0;
  const hasMetaRow = due.show || hasCounters;

  return (
    <div className="flex flex-col gap-2.5">
      {hasLabels && (
        <div className="-mx-3 -mt-3 flex h-1 overflow-hidden rounded-t-lg">
          {card.labels.map((l) => (
            <div
              key={l.label.id}
              className="flex-1"
              style={{ backgroundColor: l.label.color }}
              title={l.label.name}
            />
          ))}
        </div>
      )}

      {/* Linha 1: chip de prioridade (só HIGH/URGENT/LOW) — fica no topo
          quando existe pra dar contexto antes do título */}
      {showPriorityChip && (
        <span
          className={`inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_COLOR[card.priority as Exclude<CardListItem['priority'], 'MEDIUM'>]}`}
        >
          {card.priority === 'URGENT' && <AlertTriangle size={9} />}
          {PRIORITY_LABEL[card.priority as Exclude<CardListItem['priority'], 'MEDIUM'>]}
        </span>
      )}

      {/* Título — destaque máximo */}
      <p className="text-fg line-clamp-3 text-sm font-medium leading-snug">{card.title}</p>

      {/* Meta row (prazo + contadores) — discreta, só aparece se há algo */}
      {hasMetaRow && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          {due.show && card.dueDate && (
            <span className={`inline-flex items-center gap-1 ${due.classes}`}>
              <Calendar size={11} />
              {due.label ??
                new Date(card.dueDate).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'short',
                })}
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

      {/* Avatares — última linha, alinhados à direita pra equilíbrio visual */}
      {hasMembers && (
        <div className="flex justify-end -space-x-1.5 pt-0.5">
          {card.members.slice(0, 4).map((m) => (
            <UserAvatar
              key={m.user.id}
              name={m.user.name}
              userId={m.user.id}
              avatarUrl={m.user.avatarUrl}
              size="sm"
              stacked
            />
          ))}
          {card.members.length > 4 && (
            <span className="border-bg bg-bg-muted text-fg-muted inline-flex size-6 shrink-0 select-none items-center justify-center rounded-full border-2 text-[10px] font-semibold">
              +{card.members.length - 4}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
