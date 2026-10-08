'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Kanban,
  ListChecks,
  Loader2,
  Send,
  Target,
  User as UserIcon,
  Users,
} from 'lucide-react';
import { Button } from '@ktask/ui';
import {
  RESPONSIBILITY_CATEGORY_HINTS,
  RESPONSIBILITY_CATEGORY_LABELS,
  type ResponsibilityCategory,
  type ResponsibilityTransferResultDto,
} from '@ktask/contracts';

import { ApiError } from '@/lib/api-client';
import { membersAdminQueries, transferResponsibilities } from '@/lib/queries/members-admin';
import { membersQueries } from '@/lib/queries/members';
import { useConfirm } from '@/components/ui/dialogs';
import { UserAvatar } from '@/components/user-avatar';

/**
 * Doc 55 — aba "Responsabilidades" do modal do membro: mostra o que esta
 * pendente com a pessoa e transfere (de uma vez) para quem assume.
 * Historico (comentarios, horas, concluidos, desempenho) nao muda.
 */

const ICONS: Record<ResponsibilityCategory, React.ComponentType<{ size?: number }>> = {
  cardsLead: UserIcon,
  cardsMember: Users,
  checklistItems: ListChecks,
  tasks: CheckCircle2,
  approvalsToReview: ClipboardCheck,
  approvalsRequested: Send,
  boards: Kanban,
  automations: Bot,
};

export function MemberResponsibilitiesTab({
  member,
  canEdit,
}: {
  member: { id: string; name: string };
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const previewQ = useQuery({ ...membersAdminQueries.responsibilities(member.id), retry: false });
  const membersQ = useQuery(membersQueries.all());

  const [toUserId, setToUserId] = useState('');
  const [selected, setSelected] = useState<Set<ResponsibilityCategory>>(new Set());
  const [result, setResult] = useState<ResponsibilityTransferResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Marca por padrao tudo que tem pendencia.
  const withItems = useMemo(
    () => (previewQ.data?.categories ?? []).filter((c) => c.count > 0).map((c) => c.key),
    [previewQ.data],
  );
  useEffect(() => {
    setSelected(new Set(withItems));
  }, [withItems]);

  const targets = (membersQ.data ?? [])
    .filter((m) => m.user.id !== member.id)
    .sort((a, b) => a.user.name.localeCompare(b.user.name, 'pt-BR'));
  const target = targets.find((m) => m.user.id === toUserId)?.user ?? null;

  const mut = useMutation({
    mutationFn: () => transferResponsibilities(member.id, { toUserId, categories: [...selected] }),
    onSuccess: (res) => {
      setResult(res);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'members'] });
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Erro ao transferir. Nada foi alterado.'),
  });

  if (previewQ.isLoading) {
    return (
      <div className="text-fg-muted flex items-center gap-2 py-8 text-sm">
        <Loader2 size={14} className="animate-spin" /> Levantando pendências…
      </div>
    );
  }
  if (previewQ.isError || !previewQ.data) {
    return (
      <p className="text-fg-muted flex items-center gap-2 text-sm">
        <AlertCircle size={14} className="text-warning" />
        {previewQ.error instanceof ApiError && previewQ.error.status === 403
          ? 'Apenas Dono ou Administrador pode ver e transferir responsabilidades.'
          : 'Não foi possível carregar as pendências.'}
      </p>
    );
  }

  const preview = previewQ.data;
  const total = preview.categories.reduce((a, c) => a + c.count, 0);

  if (result) {
    const lines = preview.categories.filter((c) => result.counts[c.key] > 0);
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-lg bg-emerald-500/10 p-4">
          <CheckCircle2
            size={18}
            className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
          />
          <div className="flex flex-col gap-1 text-sm">
            <p className="text-fg font-medium">
              Responsabilidades transferidas para {result.to.name}.
            </p>
            <p className="text-fg-muted text-xs">
              {result.to.name} recebeu uma notificação com o resumo. Cada card alterado registra a
              transferência no histórico.
            </p>
          </div>
        </div>
        {lines.length > 0 && (
          <ul className="border-border/60 divide-border/40 divide-y rounded-lg border text-sm">
            {lines.map((c) => (
              <li key={c.key} className="flex items-center justify-between px-3 py-2">
                <span className="text-fg-muted">{RESPONSIBILITY_CATEGORY_LABELS[c.key]}</span>
                <span className="text-fg font-semibold tabular-nums">{result.counts[c.key]}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-fg-muted text-xs">
          Se {result.from.name} não faz mais parte da equipe, suspenda o acesso na aba Segurança ou
          remova da organização na lista de membros.
        </p>
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setResult(null);
              setToUserId('');
              void previewQ.refetch();
            }}
          >
            Ver pendências de novo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-fg-muted text-xs">
        Quando alguém sai e outra pessoa assume, transfira de uma vez o que está{' '}
        <strong className="text-fg">pendente</strong> com {preview.user.name}. Comentários,
        histórico, horas lançadas, tarefas concluídas e os números do Desempenho continuam com quem
        fez.
      </p>

      {total === 0 ? (
        <div className="border-border flex items-center gap-3 rounded-lg border border-dashed p-4">
          <CheckCircle2 size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="text-fg text-sm">{preview.user.name} não tem pendências para transferir.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {preview.categories
            .filter((c) => c.count > 0)
            .map((c) => {
              const Icon = ICONS[c.key];
              const disabled = c.count === 0 || !canEdit;
              const checked = selected.has(c.key);
              return (
                <li key={c.key}>
                  <label
                    className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                      c.count === 0
                        ? 'border-border/40 opacity-50'
                        : checked
                          ? 'border-primary/40 bg-primary-subtle/40 cursor-pointer'
                          : 'border-border/70 hover:bg-bg-muted/40 cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-primary mt-1 size-4 shrink-0"
                      disabled={disabled}
                      checked={checked && c.count > 0}
                      onChange={(e) =>
                        setSelected((s) => {
                          const next = new Set(s);
                          if (e.target.checked) next.add(c.key);
                          else next.delete(c.key);
                          return next;
                        })
                      }
                    />
                    <span className="text-fg-muted mt-0.5 shrink-0">
                      <Icon size={15} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-fg text-sm font-medium">
                          {RESPONSIBILITY_CATEGORY_LABELS[c.key]}
                        </span>
                        <span className="text-fg text-sm font-semibold tabular-nums">
                          {c.count}
                        </span>
                      </span>
                      {c.count > 0 && (
                        <>
                          <span className="text-fg-muted text-[11px]">
                            {RESPONSIBILITY_CATEGORY_HINTS[c.key]}
                          </span>
                          <ul className="text-fg-muted flex flex-col gap-0.5 text-[11px]">
                            {c.samples.map((s) => (
                              <li key={s.id} className="truncate">
                                <span className="text-fg">{s.label}</span>
                                {s.context ? ` · ${s.context}` : ''}
                              </li>
                            ))}
                            {c.count > c.samples.length && (
                              <li className="text-fg-subtle">
                                e mais {c.count - c.samples.length}
                              </li>
                            )}
                          </ul>
                        </>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
        </ul>
      )}

      {total > 0 && preview.categories.some((c) => c.count === 0) && (
        <p className="text-fg-subtle text-[11px]">
          Nada pendente em:{' '}
          {preview.categories
            .filter((c) => c.count === 0)
            .map((c) => RESPONSIBILITY_CATEGORY_LABELS[c.key].toLowerCase())
            .join(', ')}
          .
        </p>
      )}

      {preview.personalGoals.length > 0 && (
        <div className="bg-warning-subtle/50 flex items-start gap-2 rounded-lg p-3 text-xs">
          <Target size={14} className="text-warning mt-0.5 shrink-0" />
          <p className="text-fg">
            Metas individuais de {preview.user.name} não são transferidas (os números são da
            pessoa): {preview.personalGoals.map((g) => g.name).join(', ')}. Se quiser, crie metas
            iguais para quem assume em Indicadores &gt; Desempenho da equipe &gt; Metas.
          </p>
        </div>
      )}

      {total > 0 && canEdit && (
        <div className="border-border/60 flex flex-col gap-3 border-t pt-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-fg-muted text-[11px] font-medium">Quem assume</span>
            <select
              value={toUserId}
              onChange={(e) => setToUserId(e.target.value)}
              className="border-border bg-bg text-fg h-9 rounded-md border px-3 text-sm focus:outline-none"
            >
              <option value="">Selecione um membro…</option>
              {targets.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name}
                </option>
              ))}
            </select>
          </label>

          {target && (
            <div className="text-fg flex items-center gap-2 text-sm">
              <UserAvatar name={preview.user.name} userId={preview.user.id} size="sm" />
              <span className="truncate">{preview.user.name}</span>
              <ArrowRight size={14} className="text-fg-muted shrink-0" />
              <UserAvatar
                name={target.name}
                userId={target.id}
                avatarUrl={target.avatarUrl}
                size="sm"
              />
              <span className="truncate font-medium">{target.name}</span>
            </div>
          )}

          {error && (
            <p className="bg-danger-subtle text-danger flex items-start gap-1.5 rounded-md p-2 text-xs">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              {error}
            </p>
          )}

          <div>
            <Button
              disabled={!toUserId || selected.size === 0 || mut.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: `Transferir para ${target?.name ?? 'quem assume'}?`,
                  description: `As pendências marcadas de ${preview.user.name} passam para ${
                    target?.name ?? 'quem assume'
                  }. Não há como desfazer automaticamente.`,
                  confirmLabel: 'Transferir',
                });
                if (ok) mut.mutate();
              }}
            >
              {mut.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ArrowRight size={14} />
              )}
              Transferir responsabilidades
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
