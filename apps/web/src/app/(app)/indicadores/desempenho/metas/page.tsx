'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
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

/**
 * Doc 52 (Fase 4, D10) — gestao das metas (Dono/Admin). So metricas de
 * resultado (nada facil de inflar). Mudar o alvo vale a partir do periodo
 * atual; periodos passados continuam medidos contra o alvo da epoca.
 */

const selectCls =
  'border-border bg-bg text-fg rounded-md border px-2 py-1 text-xs focus:outline-none';
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
        <Loader2 size={20} className="text-fg-muted animate-spin" />
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
    <div className="container flex flex-col gap-5 py-5">
      <div className="flex flex-col gap-1">
        <Link
          href="/indicadores/desempenho"
          className="text-fg-muted hover:text-fg inline-flex w-fit items-center gap-1 text-xs"
        >
          <ArrowLeft size={12} /> Desempenho da equipe
        </Link>
        <h2 className="text-fg text-base font-semibold">Metas</h2>
        <p className="text-fg-muted max-w-3xl text-xs">
          Metas sobre resultados (contatos, reuniões, propostas, avanços e fechamentos). O progresso
          usa os mesmos números do relatório. Mudar o alvo vale a partir do período atual; os
          períodos anteriores continuam comparados com o alvo que valia na época.
        </p>
      </div>

      {/* Nova meta */}
      <section className="border-border/60 bg-bg flex flex-col gap-3 rounded-lg border p-4">
        <h3 className="text-fg text-sm font-semibold">Nova meta</h3>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input
            aria-label="Nome da meta"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome (ex.: Contatos da semana)"
            className={`${selectCls} w-56`}
          />
          <select
            aria-label="Métrica"
            value={metric}
            onChange={(e) => setMetric(e.target.value as GoalMetric)}
            className={selectCls}
          >
            {GOAL_METRICS.map((m) => (
              <option key={m} value={m}>
                {GOAL_METRIC_LABELS[m]}
              </option>
            ))}
          </select>
          <select
            aria-label="Alcance"
            value={scopeType}
            onChange={(e) => {
              setScopeType(e.target.value as GoalScopeType);
              setScopeId('');
            }}
            className={selectCls}
          >
            {(Object.keys(SCOPE_LABELS) as GoalScopeType[]).map((s) => (
              <option key={s} value={s}>
                {SCOPE_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            aria-label="Quem/qual"
            value={scopeId}
            onChange={(e) => setScopeId(e.target.value)}
            className={`${selectCls} max-w-[200px]`}
          >
            <option value="">Selecione…</option>
            {scopeOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Período"
            value={period}
            onChange={(e) => setPeriod(e.target.value as GoalPeriod)}
            className={selectCls}
          >
            {(Object.keys(GOAL_PERIOD_LABELS) as GoalPeriod[]).map((p) => (
              <option key={p} value={p}>
                {GOAL_PERIOD_LABELS[p]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1">
            Alvo
            <input
              aria-label="Alvo"
              type="number"
              min={1}
              max={100000}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className={`${selectCls} w-20`}
            />
          </label>
          <Button
            size="sm"
            disabled={!canCreate || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Plus size={13} />
            )}
            Criar meta
          </Button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </section>

      {/* Lista */}
      {goalsQ.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 size={18} className="text-fg-muted animate-spin" />
        </div>
      ) : goalsQ.isError || !goalsQ.data ? (
        <p className="text-fg-muted text-sm">Não foi possível carregar as metas.</p>
      ) : goalsQ.data.length === 0 ? (
        <p className="text-fg-muted text-sm">Nenhuma meta criada ainda.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
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
    <li className={`flex flex-col gap-2 ${goal.isActive ? '' : 'opacity-60'}`}>
      <GoalProgressCard goal={goal} />
      <div className="flex flex-wrap items-center gap-2 px-1 text-xs">
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={goal.isActive}
            onChange={(e) => mut.mutate({ isActive: e.target.checked })}
          />
          Ativa
        </label>
        <label className="flex items-center gap-1">
          Alvo
          <input
            aria-label={`Alvo de ${goal.name}`}
            type="number"
            min={1}
            max={100000}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className={`${selectCls} w-20`}
          />
        </label>
        {Number(target) !== goal.target && Number(target) >= 1 && (
          <button
            type="button"
            onClick={() => mut.mutate({ target: Number(target) })}
            className="text-primary hover:underline"
          >
            Salvar alvo
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="text-fg-muted ml-auto hover:text-red-500"
          aria-label={`Remover ${goal.name}`}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </li>
  );
}
