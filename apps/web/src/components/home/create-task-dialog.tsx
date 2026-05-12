'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Loader2, User as UserIcon } from 'lucide-react';

import { Button, Dialog, DialogContent, DialogTitle } from '@ktask/ui';
import { ApiError } from '@/lib/api-client';
import { createStandaloneTask, meQueries } from '@/lib/queries/me';
import { orgMembersQuery } from '@/lib/queries/cards';
import { useAuthStore } from '@/stores/auth-store';
import { UserAvatar } from '@/components/user-avatar';
import { useNotify } from '@/components/ui/dialogs';

/** YYYY-MM-DD do dia local (pra <input type=date>). */
function todayLocalISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Dialog para criar uma tarefa standalone (sem vínculo a card) a partir
 * da home pessoal. Default assignee = caller; default prazo = hoje
 * (user troca clicando no campo).
 */
export function CreateTaskDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const notify = useNotify();
  const { user } = useAuthStore();
  const orgMembers = useQuery({ ...orgMembersQuery, enabled: open });

  const [text, setText] = useState('');
  // Default: hoje. User troca clicando no campo. Consistente com o
  // quick-add da home e o add inline do ChecklistBlock.
  const [dueDate, setDueDate] = useState<string>(() => todayLocalISODate());
  const [assigneeId, setAssigneeId] = useState<string>(user?.id ?? '');

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      setText('');
      setDueDate(todayLocalISODate());
      setAssigneeId(user?.id ?? '');
    }
  }, [open, user?.id]);

  const createMut = useMutation({
    mutationFn: () =>
      createStandaloneTask({
        text: text.trim(),
        // input dueDate é YYYY-MM-DD; convertemos pra ISO em meio-dia BRT
        // (assim "hoje" não cai no dia errado por timezone)
        dueDate: dueDate ? new Date(`${dueDate}T12:00:00-03:00`).toISOString() : null,
        // null = sem assignee, '' não acontece (default = user.id)
        assigneeId: assigneeId || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: meQueries.tasks().queryKey });
      queryClient.invalidateQueries({ queryKey: ['me', 'calendar'] });
      onOpenChange(false);
      notify.success('Tarefa criada.');
    },
    onError: (err) => {
      notify.error(err instanceof ApiError ? err.message : 'Erro ao criar tarefa.');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || createMut.isPending) return;
    createMut.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md gap-0 p-0">
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="border-border border-b px-5 py-4">
            <DialogTitle className="text-base">Nova tarefa</DialogTitle>
            <p className="text-fg-muted mt-0.5 text-[12px]">
              Tarefa rápida, sem precisar de um card.
            </p>
          </div>

          <div className="flex flex-col gap-4 px-5 py-4">
            {/* Título */}
            <label className="flex flex-col gap-1.5">
              <span className="text-fg text-[12px] font-semibold">O que precisa ser feito?</span>
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Ex: Ligar para o cliente"
                autoFocus
                maxLength={500}
                className="border-border bg-bg focus-visible:ring-primary rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
              />
            </label>

            {/* Prazo */}
            <label className="flex flex-col gap-1.5">
              <span className="text-fg flex items-center gap-1.5 text-[12px] font-semibold">
                <Calendar size={12} />
                Prazo (opcional)
              </span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="border-border bg-bg focus-visible:ring-primary rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
              />
            </label>

            {/* Atribuir */}
            <label className="flex flex-col gap-1.5">
              <span className="text-fg flex items-center gap-1.5 text-[12px] font-semibold">
                <UserIcon size={12} />
                Atribuir a
              </span>
              {orgMembers.isLoading ? (
                <div className="text-fg-muted flex items-center gap-2 text-[12px]">
                  <Loader2 size={12} className="animate-spin" />
                  Carregando membros…
                </div>
              ) : (
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="border-border bg-bg focus-visible:ring-primary rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
                >
                  {(orgMembers.data ?? []).map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.user.name === user?.name ? `${m.user.name} (você)` : m.user.name}
                    </option>
                  ))}
                </select>
              )}
              {assigneeId && user && assigneeId !== user.id && (
                <span className="text-fg-muted flex items-center gap-1.5 text-[11px]">
                  <UserAvatar
                    name={
                      (orgMembers.data ?? []).find((m) => m.userId === assigneeId)?.user.name ?? ''
                    }
                    userId={assigneeId}
                    avatarUrl={
                      (orgMembers.data ?? []).find((m) => m.userId === assigneeId)?.user
                        .avatarUrl ?? null
                    }
                    size="xs"
                  />
                  Essa tarefa vai pra home dessa pessoa.
                </span>
              )}
            </label>
          </div>

          <div className="border-border bg-bg-subtle flex justify-end gap-2 border-t px-5 py-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={createMut.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={!text.trim() || createMut.isPending}>
              {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Criar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
