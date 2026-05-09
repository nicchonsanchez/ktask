'use client';

import Link from 'next/link';
import { Calendar, FileText, Layout, ListTodo } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { updateChecklistItem } from '@/lib/queries/cards';
import { meQueries, updateStandaloneTask, type MeTask } from '@/lib/queries/me';
import { UserAvatar } from '@/components/user-avatar';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Linha de tarefa da home (TarefaRow).
 *
 * Layout (alinhado ao print do Ummense):
 *   [borda colorida] [checkbox] nome — link card · prazo (cor) · descrição? · avatar · ›
 *
 * - Borda esquerda colorida indica urgência da seção (vermelha = atrasada,
 *   amarela = hoje, sem cor = próximas/sem data)
 * - Click no checkbox: marca como done (otimista, invalida /me/tasks)
 * - Click no nome / linha em si: abre o card pai com `?card=<id>` no board
 */

type Variant = 'overdue' | 'today' | 'next7' | 'noDate';

const BORDER_COLOR: Record<Variant, string> = {
  overdue: 'bg-danger',
  today: 'bg-warning',
  next7: 'bg-warning/50',
  noDate: 'bg-border',
};

const DUE_TEXT: Record<Variant, string> = {
  overdue: 'text-danger font-semibold',
  today: 'text-warning font-semibold',
  next7: 'text-warning',
  noDate: 'text-fg-subtle',
};

export function TarefaRow({
  task,
  variant,
  readOnly,
}: {
  task: MeTask;
  variant: Variant;
  readOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const toggleMut = useMutation({
    mutationFn: async () => {
      if (task.kind === 'standalone') {
        await updateStandaloneTask(task.id, { isDone: !task.isDone });
      } else {
        await updateChecklistItem(task.id, { isDone: !task.isDone });
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: meQueries.tasks().queryKey });
      const prev = queryClient.getQueryData(meQueries.tasks().queryKey);
      // Otimista: remove da lista (a tarefa "concluída" some das 4 listas
      // porque todas filtram isDone=false no backend).
      queryClient.setQueryData(meQueries.tasks().queryKey, (old: unknown) => {
        if (!old || typeof old !== 'object') return old;
        const groups = old as Record<string, MeTask[]>;
        const next: Record<string, MeTask[]> = {};
        for (const k of Object.keys(groups)) {
          next[k] = (groups[k] ?? []).filter((t) => t.id !== task.id);
        }
        return next;
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(meQueries.tasks().queryKey, ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: meQueries.tasks().queryKey });
    },
  });

  const isStandalone = task.kind === 'standalone';
  const cardHref = isStandalone
    ? null
    : `/b/${task.checklist.card.boardId}?card=${task.checklist.card.id}`;
  const dueLabel = formatDueDate(task.dueDate);
  const cardTitle = isStandalone ? null : task.checklist.card.title;
  const cardListName = isStandalone ? null : task.checklist.card.list.name;

  return (
    <div className="border-border/50 group/row hover:bg-bg-subtle/50 relative flex items-center gap-2 border-b py-2 pl-3 pr-2 transition-colors last:border-b-0 sm:gap-3 sm:pl-4 sm:pr-3">
      {/* Borda esquerda colorida */}
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${BORDER_COLOR[variant]}`} />

      {/* Checkbox redondo */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (readOnly) return;
          toggleMut.mutate();
        }}
        disabled={toggleMut.isPending || readOnly}
        aria-label={
          readOnly
            ? 'Visualização — não é possível alterar tarefas de outro membro'
            : task.isDone
              ? 'Desmarcar tarefa'
              : 'Marcar tarefa como concluída'
        }
        title={readOnly ? 'Modo visualização' : undefined}
        className={`border-border-strong focus-visible:ring-primary inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 ${
          readOnly ? 'cursor-not-allowed opacity-60' : 'hover:border-success'
        }`}
      >
        {task.isDone && <span aria-hidden className="bg-success size-2.5 rounded-full" />}
      </button>

      {/* Nome da tarefa (uppercase como no Ummense) */}
      {cardHref ? (
        <Link
          href={cardHref}
          className="hover:text-primary min-w-0 flex-1 truncate text-[13px] font-medium uppercase tracking-wide"
          title={task.text}
        >
          {task.text}
        </Link>
      ) : (
        <span
          className="text-fg min-w-0 flex-1 truncate text-[13px] font-medium uppercase tracking-wide"
          title={task.text}
        >
          {task.text}
        </span>
      )}

      {/* Card pai (só pra checklist) ou label "Pessoal" (pra standalone) */}
      {cardHref && cardTitle ? (
        <Link
          href={cardHref}
          className="text-fg-muted hover:text-fg hidden min-w-0 max-w-[40%] items-center gap-1 truncate text-[12px] sm:flex"
          title={`${cardTitle} · ${cardListName}`}
        >
          <Layout size={11} className="shrink-0" />
          <span className="truncate">{cardTitle}</span>
        </Link>
      ) : (
        <span
          className="text-fg-muted hidden shrink-0 items-center gap-1 text-[12px] italic sm:inline-flex"
          title="Tarefa pessoal (sem card)"
        >
          <ListTodo size={11} />
          <span>Pessoal</span>
        </span>
      )}

      {/* Prazo */}
      {dueLabel && (
        <span
          className={`hidden shrink-0 items-center gap-1 text-[11px] sm:inline-flex ${DUE_TEXT[variant]}`}
          title={task.dueDate ?? undefined}
        >
          <Calendar size={11} />
          {dueLabel}
        </span>
      )}

      {/* Descrição/notas — só ícone se houver futuramente */}
      <span className="text-fg-subtle hidden sm:inline" aria-hidden>
        <FileText size={12} />
      </span>

      {/* Avatar do assignee (se for o user logado, mostra ele) */}
      {task.assigneeId && user && task.assigneeId === user.id && (
        <UserAvatar name={user.name} userId={user.id} avatarUrl={user.avatarUrl} size="sm" />
      )}

      {/* Seta de expandir só pra checklist (standalone não tem destino) */}
      {cardHref && (
        <Link
          href={cardHref}
          className="text-fg-muted hover:text-fg shrink-0 transition-colors"
          aria-label={`Abrir card ${cardTitle}`}
        >
          <ChevronRight />
        </Link>
      )}
    </div>
  );
}

function ChevronRight() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function formatDueDate(iso: string | null): string | null {
  if (!iso) return null;
  const due = new Date(iso);
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((dueDay - today) / 86_400_000);
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Amanhã';
  if (days === -1) return 'Ontem';
  return due.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
