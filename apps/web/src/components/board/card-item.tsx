'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, MessageSquare, CheckSquare, Paperclip, ShieldCheck, Lock } from 'lucide-react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { UserAvatar } from '@/components/user-avatar';
import type { CardListItem } from '@/lib/queries/boards';
import { PRIORITY_LABEL, PRIORITY_COLOR, PRIORITY_SHAPE } from './priority-config';

function dueState(iso: string | null): {
  show: boolean;
  classes: string;
  label?: string;
} {
  if (!iso) return { show: false, classes: '' };
  // Compara em DIAS DE CALENDÁRIO no fuso local (não em ms).
  // O due-date-picker salva sempre 00:00 do dia local; sem normalizar
  // pra dia-de-calendário, qualquer hora depois das 00:00 cairia em
  // "vencido" mesmo sendo hoje.
  const due = new Date(iso);
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((dueDay - today) / 86_400_000);
  // Vencido: mostra a DATA em vermelho semibold (não label "Vencido"),
  // assim o usuário enxerga há quanto tempo passou.
  if (days < 0) return { show: true, classes: 'text-danger font-semibold', label: undefined };
  // Hoje: amarelo com label explícita — urgência sem ser pânico vermelho.
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
  const priorityColor = PRIORITY_COLOR[card.priority];
  const priorityShape = PRIORITY_SHAPE[card.priority];
  const hasPriorityBar = priorityShape === 'stripe' && priorityColor !== null;
  const hasPriorityDiamond = priorityShape === 'diamond' && priorityColor !== null;
  const hasCover = Boolean(card.coverImageUrl);
  const hasCounters =
    card._count.comments > 0 || card._count.checklists > 0 || card._count.attachments > 0;
  const hasPendingApproval = card._count.approvals > 0;
  const hasMembers = card.members.length > 0;
  const hasMetaRow = due.show || hasCounters || hasPendingApproval;

  return (
    <div className="relative flex flex-col gap-2.5">
      {/* URGENT: losango no canto sup-direito sobreposto ao card.
          Forma diferente da stripe — sinalizador robusto a daltonismo. */}
      {hasPriorityDiamond && (
        <span
          aria-label="Prioridade: Urgente"
          title="Urgente"
          className="absolute -right-1 -top-1 z-10 size-3.5 rotate-45 border-[1.5px] shadow-sm"
          style={{
            borderColor: priorityColor as string,
            backgroundColor: `${priorityColor}33`, // alpha 0.2
          }}
        />
      )}

      {/* Topo do card: capa (se houver) + barra de prioridade.
          Etiquetas saem daqui — viram pills logo abaixo do titulo (mais
          legivel e sem competir com a sinalizacao de prioridade). */}
      {(hasCover || hasPriorityBar) && (
        <div className="-mx-3 -mt-3 flex flex-col overflow-hidden rounded-t-lg">
          {hasCover && (
            <div className="bg-bg-muted relative h-24 w-full overflow-hidden">
              <img
                src={card.coverImageUrl as string}
                alt=""
                className="size-full object-cover"
                loading="lazy"
              />
            </div>
          )}
          {hasPriorityBar && (
            <div
              className="h-2"
              style={{ backgroundColor: priorityColor as string }}
              title={`Prioridade: ${PRIORITY_LABEL[card.priority]}`}
            />
          )}
        </div>
      )}

      {/* Título — destaque máximo. shortCode fica só no modal pra não
          poluir o mini (especialmente IDs longos importados do Ummense). */}
      <p className="text-fg line-clamp-3 text-sm font-medium leading-snug">
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
              {due.label ??
                new Date(card.dueDate).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'short',
                })}
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
