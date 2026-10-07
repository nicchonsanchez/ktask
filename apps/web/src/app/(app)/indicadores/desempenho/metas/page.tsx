'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowLeft, Loader2, Plus, Target, Trash2 } from 'lucide-react';
import { Button } from '@ktask/ui';
import {
  canViewPerformanceReport,
  GOAL_METRIC_LABELS,
  GOAL_METRICS,
  GOAL_PERIOD_LABELS,
  PERFORMANCE_AREA_LABELS,
  PERFORMANCE_AREAS,
  type GoalDto,
  type GoalMetric,
  type GoalPeriod,
  type GoalScopeType,
} from '@ktask/contracts';

import { api, ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { boardsQueries } from '@/lib/queries/boards';
import { orgMembersQuery } from '@/lib/queries/cards';
import { createGoal, deleteGoal, goalsQuery, updateGoal } from '@/lib/queries/performance';
import { useConfirm, useNotify } from '@/components/ui/dialogs';
import { GoalProgressCard } from '@/components/performance/goals';
import {
  EmptyState,
  fieldCls,
  Panel,
  SectionHeading,
  Segmented,
  Spinner,
} from '@/components/performance/ui';

/**
 * Doc 52 (Fase 4, D10) — gestao das metas (Dono/Admin). So metricas de
 * resultado (nada facil de inflar). Mudar o alvo vale a partir do periodo
 * atual; periodos passados continuam medidos contra o alvo da epoca.
 */

const SCOPE_LABELS: Record<GoalScopeType, string> = {
  USER: 'Pessoa',
  AREA: 'Área',
  BOARD: 'Fluxo',
};

export default function MetasPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const notify = useNotify();
  const confirm = useConfirm();

  const orgQ = useQuery({
    queryKey: ['org', 'current'],
    queryFn: () => api.get<{ myRole: string }>('/api/v1/organizations/current'),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
  const allowed = canViewPerformanceReport(orgQ.data?.myRole);
  const goalsQ = useQuery({ ...goalsQuery(), enabled: allowed });
  const membersQ = useQuery({ ...orgMembersQuery, enabled: allowed });
  const boardsQ = useQuery({ ...boardsQueries.all(), enabled: allowed });

  const [name, setName] = useState('');
  const [metric, setMetric] = useState<GoalMetric>('CONTACTS_DONE');
  const [scopeType, setScopeType] = useState<GoalScopeType>('USER');
  const [scopeId, setScopeId] = useState('');
  const [period, setPeriod] = useState<GoalPeriod>('WEEK');
  const [target, setTarget] = useState('10');
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['performance', 'goals'] });
  const createMut = useMutation({
    mutationFn: () =>
      createGoal({ name: name.trim(), metric, scopeType, scopeId, period, target: Number(target) }),
    onSuccess: () => {
      setError(null);
      setName('');
      void invalidate();
      notify.success('Meta criada.');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Erro ao criar meta.'),
  });

  if (orgQ.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="container py-10">
        <p className="text-fg-muted text-sm">Disponível apenas para Dono e Administrador.</p>
      </div>
    );
  }

  const scopeOptions: Array<{ id: string; name: string }> =
    scopeType === 'USER'
      ? (membersQ.data ?? [])
          .map((m) => ({ id: m.user.id, name: m.user.name }))
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      : scopeType === 'AREA'
        ? PERFORMANCE_AREAS.map((a) => ({ id: a, name: PERFORMANCE_AREA_LABELS[a] }))
        : (boardsQ.data ?? []).map((b) => ({ id: b.id, name: b.name }));

  const canCreate = name.trim().length > 0 && !!scopeId && Number(target) >= 1;

  return (
    <div className="container flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/indicadores/desempenho"
          className="text-fg-muted hover:text-fg inline-flex w-fit items-center gap-1 text-xs font-medium"
        >
          <ArrowLeft size={14} /> Desempenho da equipe
        </Link>
        <h2 className="text-fg text-xl font-semibold tracking-tight">Metas</h2>
        <p className="text-fg-muted max-w-3xl text-sm">
          Metas sobre resultados (contatos, reuniões, propostas, avanços e fechamentos). O progresso
          usa os mesmos números do relatório. Mudar o alvo vale a partir do período atual; os
          períodos anteriores continuam comparados com o alvo que valia na época.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Nova meta */}
        <Panel
          title="Nova meta"
          icon={<Plus size={14} />}
          className="lg:sticky lg:top-[160px]"
          bodyClassName="flex flex-col gap-4"
        >
          <Field label="Nome">
            <input
              aria-label="Nome da meta"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome (ex.: Contatos da semana)"
              className={`${fieldCls} w-full`}
            />
          </Field>
          <Field label="Métrica">
            <select
              aria-label="Métrica"
              value={metric}
              onChange={(e) => setMetric(e.target.value as GoalMetric)}
              className={`${fieldCls} w-full`}
            >
              {GOAL_METRICS.map((m) => (
                <option key={m} value={m}>
                  {GOAL_METRIC_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Alcance">
            <Segmented
              ariaLabel="Alcance"
              value={scopeType}
              onChange={(v) => {
                setScopeType(v);
                setScopeId('');
              }}
              options={(Object.keys(SCOPE_LABELS) as GoalScopeType[]).map((k) => ({
                key: k,
                label: SCOPE_LABELS[k],
              }))}
            />
            <select
              aria-label="Quem/qual"
              value={scopeId}
              onChange={(e) => setScopeId(e.target.value)}
              className={`${fieldCls} mt-2 w-full`}
            >
              <option value="">Selecione…</option>
              {scopeOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-3">
            <Field label="Período">
              <Segmented
                ariaLabel="Período"
                value={period}
                onChange={setPeriod}
                options={(Object.keys(GOAL_PERIOD_LABELS) as GoalPeriod[]).map((k) => ({
                  key: k,
                  label: GOAL_PERIOD_LABELS[k],
                }))}
              />
            </Field>
            <Field label="Alvo">
              <input
                aria-label="Alvo"
                type="number"
                min={1}
                max={100000}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className={`${fieldCls} w-full tabular-nums`}
              />
            </Field>
          </div>
          {error && (
            <p className="rounded-lg bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <Button
            className="w-full"
            disabled={!canCreate || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            Criar meta
          </Button>
        </Panel>

        {/* Lista */}
        <section className="flex min-w-0 flex-col gap-3">
          <SectionHeading
            description={
              goalsQ.data && goalsQ.data.length > 0
                ? `${goalsQ.data.filter((g) => g.isActive).length} ativa(s) de ${goalsQ.data.length}`
                : undefined
            }
          >
            Metas cadastradas
          </SectionHeading>
          {goalsQ.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : goalsQ.isError || !goalsQ.data ? (
            <p className="text-fg-muted text-sm">Não foi possível carregar as metas.</p>
          ) : goalsQ.data.length === 0 ? (
            <div className="border-border rounded-xl border border-dashed">
              <EmptyState icon={<Target size={16} />} title="Nenhuma meta criada ainda." />
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {goalsQ.data.map((g) => (
                <GoalRow
                  key={g.id}
                  goal={g}
                  onChanged={invalidate}
                  onDelete={async () => {
                    const ok = await confirm({
                      title: 'Remover meta?',
                      description: `"${g.name}" deixa de aparecer no painel.`,
                      confirmLabel: 'Remover',
                    });
                    if (!ok) return;
                    await deleteGoal(g.id);
                    void invalidate();
                  }}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-fg text-xs font-medium">{label}</span>
      {children}
    </div>
  );
}

function GoalRow({
  goal,
  onChanged,
  onDelete,
}: {
  goal: GoalDto;
  onChanged: () => void;
  onDelete: () => void;
}) {
  const notify = useNotify();
  const [target, setTarget] = useState(String(goal.target));
  const mut = useMutation({
    mutationFn: (body: { isActive?: boolean; target?: number }) => updateGoal(goal.id, body),
    onSuccess: () => onChanged(),
    onError: (err) => notify.error(err instanceof ApiError ? err.message : 'Erro ao salvar.'),
  });
  return (
    <li
      className={`border-border/70 bg-bg flex flex-col overflow-hidden rounded-xl border shadow-sm ${goal.isActive ? '' : 'opacity-60'}`}
    >
      <GoalProgressCard goal={goal} className="rounded-none border-0" />
      <div className="border-border/60 bg-bg-subtle flex flex-wrap items-center gap-3 border-t px-4 py-2.5 text-xs">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="accent-primary size-4"
            checked={goal.isActive}
            onChange={(e) => mut.mutate({ isActive: e.target.checked })}
          />
          Ativa
        </label>
        <label className="flex items-center gap-1.5">
          Alvo
          <input
            aria-label={`Alvo de ${goal.name}`}
            type="number"
            min={1}
            max={100000}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className={`${fieldCls} h-8 w-20 tabular-nums`}
          />
        </label>
        {Number(target) !== goal.target && Number(target) >= 1 && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => mut.mutate({ target: Number(target) })}
          >
            Salvar alvo
          </Button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="text-fg-muted ml-auto grid size-8 place-items-center rounded-lg hover:bg-red-500/10 hover:text-red-500"
          aria-label={`Remover ${goal.name}`}
          title="Remover meta"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
}
