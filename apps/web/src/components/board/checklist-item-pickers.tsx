'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Flag, Loader2, UserRoundPlus } from 'lucide-react';

import { UserAvatar } from '@/components/user-avatar';
import { orgMembersQuery, type ChecklistItem, type TaskPriority } from '@/lib/queries/cards';
import { DatePickerPopover } from './due-date-picker';

/**
 * Pickers compactos pra cada campo de um ChecklistItem. Compartilhados
 * entre o card-modal (configurando tarefa real) e o form de automacao
 * (configurando o "molde" que vai criar a tarefa quando a automacao
 * disparar). Mesma UX, mesmo visual.
 *
 * Os 3 sao componentes controlados (value + onChange). Cada um abre seu
 * proprio popover absoluto na pagina. Convencao: na linha onde aparecem,
 * o pai usa `group/item` na classe pra os pickers vazios so aparecerem
 * no hover (igual ao comportamento original do checklist-block).
 */

export const PRIORITY_META: Record<
  TaskPriority,
  { label: string; dotClass: string; borderClass: string; textClass: string }
> = {
  NONE: {
    label: 'Sem prioridade',
    dotClass: 'bg-fg-muted/40',
    borderClass: 'border-transparent',
    textClass: 'text-fg-muted',
  },
  LOW: {
    label: 'Baixa',
    dotClass: 'bg-blue-400',
    borderClass: 'border-blue-400',
    textClass: 'text-blue-500',
  },
  MEDIUM: {
    label: 'Média',
    dotClass: 'bg-amber-400',
    borderClass: 'border-amber-400',
    textClass: 'text-amber-500',
  },
  HIGH: {
    label: 'Alta',
    dotClass: 'bg-orange-500',
    borderClass: 'border-orange-500',
    textClass: 'text-orange-500',
  },
  URGENT: {
    label: 'Urgente',
    dotClass: 'bg-red-500',
    borderClass: 'border-red-500',
    textClass: 'text-red-500',
  },
};

export function formatDueLabel(iso: string): {
  label: string;
  tone: 'past' | 'today' | 'future';
} {
  const raw = new Date(iso);
  const hasTime = raw.getHours() !== 0 || raw.getMinutes() !== 0;
  const timeSuffix = hasTime
    ? ` ${raw.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : '';

  // Comparacao por dia-de-calendario pra decidir o tone (hoje / passado /
  // futuro). Quando o item tem horario, ainda compara o "dia" pra
  // rotular "Hoje" / "Amanha" — mas se o instante exato ja passou,
  // forca tone "past" pra refletir atraso real (ex: hoje 14h depois
  // das 14h).
  const due = new Date(raw.getFullYear(), raw.getMonth(), raw.getDate());
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60_000);
  const dayAfter = new Date(today.getTime() + 2 * 24 * 60 * 60_000);

  const overdueByTime = hasTime && raw.getTime() < Date.now();

  if (due.getTime() === today.getTime()) {
    if (overdueByTime) return { label: `Hoje${timeSuffix}`, tone: 'past' };
    return { label: `Hoje${timeSuffix}`, tone: 'today' };
  }
  if (due.getTime() < today.getTime())
    return { label: `${raw.toLocaleDateString('pt-BR')}${timeSuffix}`, tone: 'past' };
  if (due.getTime() < dayAfter.getTime() && due.getTime() >= tomorrow.getTime())
    return { label: `Amanhã${timeSuffix}`, tone: 'future' };
  return { label: `${raw.toLocaleDateString('pt-BR')}${timeSuffix}`, tone: 'future' };
}

export function ChecklistDueDatePicker({
  dueDate,
  onChange,
  disabled = false,
}: {
  dueDate: string | null;
  onChange: (iso: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const display = dueDate ? formatDueLabel(dueDate) : null;

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title={display ? `Prazo: ${display.label}` : 'Definir prazo'}
        className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] transition-opacity ${
          display
            ? display.tone === 'today'
              ? 'text-emerald-600 dark:text-emerald-400'
              : display.tone === 'past'
                ? 'text-red-500'
                : 'text-fg-muted'
            : 'text-fg-muted hover:text-fg opacity-0 group-hover/item:opacity-100'
        }`}
        aria-label="Definir prazo"
      >
        {display ? (
          <span className="font-medium">{display.label}</span>
        ) : (
          <CalendarDays size={13} />
        )}
      </button>
      {open && (
        <DatePickerPopover
          value={dueDate}
          onCommit={(iso) => {
            onChange(iso);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

export function ChecklistPriorityPicker({
  priority,
  onChange,
  disabled = false,
}: {
  priority: TaskPriority;
  onChange: (p: TaskPriority) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const meta = PRIORITY_META[priority];
  const isSet = priority !== 'NONE';

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title={`Prioridade: ${meta.label}`}
        className={`inline-flex items-center justify-center rounded p-0.5 transition-opacity ${
          isSet
            ? meta.textClass
            : 'text-fg-muted hover:text-fg opacity-0 group-hover/item:opacity-100'
        }`}
        aria-label="Definir prioridade"
      >
        <Flag size={13} fill={isSet ? 'currentColor' : 'none'} />
      </button>
      {open && (
        <div className="border-border bg-bg absolute right-0 top-full z-30 mt-1 flex w-44 flex-col overflow-hidden rounded-md border p-1 shadow-lg">
          {(['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'] as TaskPriority[]).map((p) => {
            const m = PRIORITY_META[p];
            const isCurrent = p === priority;
            return (
              <button
                key={p}
                type="button"
                onClick={() => {
                  onChange(p);
                  setOpen(false);
                }}
                className={`hover:bg-bg-muted flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] ${
                  isCurrent ? 'bg-bg-muted' : ''
                }`}
              >
                <span aria-hidden className={`size-2.5 rounded-full ${m.dotClass}`} />
                <span className="text-fg flex-1">{m.label}</span>
                {isCurrent && <span className="text-primary text-[10px]">atual</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ChecklistAssigneePicker({
  assignee,
  onAssign,
  disabled = false,
  /**
   * Quando true (modo automacao), o popover inclui opcao "Líder do card"
   * acima da lista de membros. Default false (modo card: so membro
   * especifico).
   */
  allowCardLead = false,
  /**
   * Quando allowCardLead=true: se `cardLeadMode` for true, mostra "Líder
   * do card" como selecionado e oculta o avatar. Os callers controlam
   * via `onSetCardLead(true|false)`.
   */
  cardLeadMode = false,
  onSetCardLead,
}: {
  assignee: ChecklistItem['assignee'];
  onAssign: (userId: string | null) => void;
  disabled?: boolean;
  allowCardLead?: boolean;
  cardLeadMode?: boolean;
  onSetCardLead?: (enabled: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const membersQ = useQuery({ ...orgMembersQuery, enabled: open });

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const buttonContent = cardLeadMode ? (
    <span
      className="bg-primary-subtle text-primary flex size-6 items-center justify-center rounded-full text-[10px] font-semibold"
      title="Líder do card"
    >
      LC
    </span>
  ) : assignee ? (
    <UserAvatar
      name={assignee.name}
      userId={assignee.id}
      avatarUrl={assignee.avatarUrl}
      size="sm"
    />
  ) : (
    <span className="bg-bg-muted hover:bg-bg-emphasis flex size-6 items-center justify-center rounded-full">
      <UserRoundPlus size={12} />
    </span>
  );

  const isSet = cardLeadMode || !!assignee;

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className={`inline-flex items-center justify-center rounded-full transition-opacity ${
          isSet
            ? 'opacity-100'
            : 'text-fg-muted hover:text-fg opacity-0 group-hover/item:opacity-100'
        }`}
        title={
          cardLeadMode
            ? 'Responsável: líder do card'
            : assignee
              ? `Responsável: ${assignee.name}`
              : 'Atribuir responsável'
        }
        aria-label="Atribuir responsável"
      >
        {buttonContent}
      </button>
      {open && (
        <div className="border-border bg-bg absolute right-0 top-full z-30 mt-1 flex w-56 flex-col overflow-hidden rounded-md border shadow-lg">
          <div className="border-border/70 px-2 py-1.5">
            <p className="text-fg text-[12px] font-semibold">Responsável</p>
            <p className="text-fg-muted text-[10px]">A pessoa será notificada.</p>
          </div>
          {allowCardLead && onSetCardLead && (
            <button
              type="button"
              onClick={() => {
                onSetCardLead(!cardLeadMode);
                if (!cardLeadMode) onAssign(null); // limpa user especifico
                setOpen(false);
              }}
              className={`hover:bg-bg-muted flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs ${
                cardLeadMode ? 'bg-bg-muted' : ''
              }`}
            >
              <span className="bg-primary-subtle text-primary flex size-6 items-center justify-center rounded-full text-[10px] font-semibold">
                LC
              </span>
              <span className="flex-1 truncate">Líder do card (dinâmico)</span>
              {cardLeadMode && <span className="text-primary text-[10px]">atual</span>}
            </button>
          )}
          <div className="max-h-56 overflow-y-auto py-1">
            {membersQ.isLoading && (
              <div className="flex items-center justify-center py-2">
                <Loader2 size={12} className="text-fg-muted animate-spin" />
              </div>
            )}
            {(membersQ.data ?? []).map((m) => {
              const isCurrent = !cardLeadMode && assignee?.id === m.userId;
              return (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => {
                    if (cardLeadMode && onSetCardLead) onSetCardLead(false);
                    onAssign(isCurrent ? null : m.userId);
                    setOpen(false);
                  }}
                  className={`hover:bg-bg-muted flex w-full items-center gap-2 px-2 py-1 text-left text-xs ${
                    isCurrent ? 'bg-bg-muted' : ''
                  }`}
                >
                  <UserAvatar
                    name={m.user.name}
                    userId={m.user.id}
                    avatarUrl={m.user.avatarUrl}
                    size="sm"
                  />
                  <span className="flex-1 truncate">{m.user.name}</span>
                  {isCurrent && <span className="text-primary text-[10px]">atual</span>}
                </button>
              );
            })}
          </div>
          {(assignee || cardLeadMode) && (
            <button
              type="button"
              onClick={() => {
                onAssign(null);
                if (onSetCardLead) onSetCardLead(false);
                setOpen(false);
              }}
              className="border-border/70 text-fg-muted hover:text-danger border-t px-2 py-1.5 text-left text-[11px]"
            >
              Remover responsável
            </button>
          )}
        </div>
      )}
    </div>
  );
}
