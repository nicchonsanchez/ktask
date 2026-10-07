'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  PhoneCall,
  Plus,
  Shapes,
  Trash2,
  Wand2,
} from 'lucide-react';
import { Button, buttonVariants } from '@ktask/ui';
import {
  canViewPerformanceReport,
  CONCLUSION_CATEGORIES,
  PERFORMANCE_AREA_LABELS,
  PERFORMANCE_AREAS,
  PERFORMANCE_COLUMN_CATEGORY_LABELS,
  PerformanceColumnCategorySchema,
  type PerformanceArea,
  type PerformanceBoardConfigDto,
  type PerformanceColumnCategory,
  type PerformanceColumnConfig,
  type PerformanceConfigLevel,
  type TransitionOverride,
} from '@ktask/contracts';

import { api, ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { performanceQueries, saveBoardPerformanceConfig } from '@/lib/queries/performance';
import { useNotify } from '@/components/ui/dialogs';
import { startOfZonedDay } from '@/lib/performance-period';
import { Spinner } from '@/components/performance/ui';

/**
 * Doc 52 (D8) — "Configuração dos relatórios": tela central por fluxo.
 * Nivel basico = coluna(s) de finalizado; avancado = ordem do funil,
 * transferencias, excecoes. NAO altera o quadro (nem a coluna "Finalizado"
 * operacional) — so a interpretacao usada no relatorio. Salvar = versao nova.
 */

const LEVEL_LABEL: Record<PerformanceConfigLevel, string> = {
  NONE: 'Não configurado',
  BASIC: 'Finalizado definido',
  FULL: 'Funil completo',
};
const LEVEL_CLS: Record<PerformanceConfigLevel, string> = {
  NONE: 'text-fg-muted bg-bg-muted',
  BASIC: 'text-sky-700 bg-sky-500/10 dark:text-sky-400',
  FULL: 'text-emerald-700 bg-emerald-500/10 dark:text-emerald-400',
};
const LEVEL_DOT: Record<PerformanceConfigLevel, string> = {
  NONE: 'bg-fg-subtle',
  BASIC: 'bg-sky-500',
  FULL: 'bg-emerald-500',
};
const CLASS_LABELS: Record<TransitionOverride['movementClass'], string> = {
  AVANCO: 'Avanço',
  RETROCESSO: 'Retrocesso',
  TRANSFERENCIA: 'Transferência',
  CONCLUSAO: 'Conclusão',
  NEUTRA: 'Neutra',
};
const STATUS_LABEL = {
  ACTIVE: '',
  ARCHIVED: 'arquivada',
  TRASHED: 'na lixeira',
  HISTORY_ONLY: 'removida',
} as const;

const selectCls =
  'border-border bg-bg text-fg h-8 rounded-lg border px-2.5 text-xs transition-colors hover:border-border-strong focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(iso),
  );

export default function ConfiguracaoRelatoriosPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = searchParams.get('fluxo');

  const orgQ = useQuery({
    queryKey: ['org', 'current'],
    queryFn: () => api.get<{ myRole: string; timezone?: string }>('/api/v1/organizations/current'),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
  const allowed = canViewPerformanceReport(orgQ.data?.myRole);
  const listQ = useQuery({ ...performanceQueries.configList(), enabled: allowed });

  const select = (boardId: string | null) =>
    router.replace(boardId ? `${pathname}?fluxo=${boardId}` : pathname, { scroll: false });

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

  return (
    <div className="container flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/indicadores/desempenho"
          className="text-fg-muted hover:text-fg inline-flex w-fit items-center gap-1 text-xs font-medium"
        >
          <ArrowLeft size={14} /> Desempenho da equipe
        </Link>
        <h2 className="text-fg text-xl font-semibold tracking-tight">
          Configuração dos relatórios
        </h2>
        <p className="text-fg-muted max-w-3xl text-sm">
          Para cada fluxo, escolha qual coluna representa &quot;finalizado&quot; nas análises. Isso
          não altera o quadro: nomes, colunas e a coluna Finalizado do Kanban continuam iguais. Na
          configuração avançada você define a ordem do funil para medir avanços e retrocessos.
        </p>
      </div>

      {listQ.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : listQ.isError || !listQ.data ? (
        <p className="text-fg-muted text-sm">Não foi possível carregar os fluxos.</p>
      ) : (
        <>
          <LevelSummary items={listQ.data.map((b) => b.level)} />
          <ul className="flex flex-col gap-2">
            {listQ.data.map((b) => {
              const open = selected === b.board.id;
              return (
                <li
                  key={b.board.id}
                  className={`bg-bg overflow-hidden rounded-xl border transition-shadow ${
                    open ? 'border-primary/40 shadow-md' : 'border-border/70 hover:shadow-sm'
                  }`}
                >
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => select(open ? null : b.board.id)}
                    className="hover:bg-bg-subtle/60 flex w-full items-center gap-3 px-4 py-3.5 text-left"
                  >
                    <span
                      aria-hidden
                      className="inline-block size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: b.board.color ?? '#888' }}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-fg truncate text-sm font-medium">{b.board.name}</span>
                      <span className="text-fg-muted flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                        {b.area && (
                          <span className="inline-flex items-center gap-1">
                            <Shapes size={12} /> {PERFORMANCE_AREA_LABELS[b.area]}
                          </span>
                        )}
                        {b.contactLoggingEnabled && (
                          <span className="inline-flex items-center gap-1">
                            <PhoneCall size={12} /> Registro de contato
                          </span>
                        )}
                        {b.conclusionLists.length > 0 && (
                          <span className="hidden max-w-[360px] items-center gap-1 truncate sm:inline-flex">
                            <CheckCircle2 size={12} className="shrink-0" />
                            <span className="truncate">
                              Finalizado: {b.conclusionLists.map((l) => l.name).join(', ')}
                            </span>
                          </span>
                        )}
                      </span>
                    </span>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${LEVEL_CLS[b.level]}`}
                    >
                      <span className={`size-1.5 rounded-full ${LEVEL_DOT[b.level]}`} />
                      {LEVEL_LABEL[b.level]}
                    </span>
                    {open ? (
                      <ChevronDown size={16} className="text-fg-muted shrink-0" />
                    ) : (
                      <ChevronRight size={16} className="text-fg-muted shrink-0" />
                    )}
                  </button>
                  {open && (
                    <BoardEditor
                      boardId={b.board.id}
                      timeZone={orgQ.data?.timezone || 'America/Sao_Paulo'}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

type ColState = Record<string, PerformanceColumnConfig>;

function toState(cfg: PerformanceBoardConfigDto): ColState {
  const s: ColState = {};
  for (const l of cfg.lists)
    s[l.id] = { listId: l.id, category: null, progressOrder: null, counted: true };
  for (const c of cfg.currentVersion?.columns ?? []) if (s[c.listId]) s[c.listId] = { ...c };
  return s;
}

function BoardEditor({ boardId, timeZone }: { boardId: string; timeZone: string }) {
  const qc = useQueryClient();
  const notify = useNotify();
  const q = useQuery(performanceQueries.configBoard(boardId));
  const [cols, setCols] = useState<ColState>({});
  const [overrides, setOverrides] = useState<TransitionOverride[]>([]);
  const [area, setArea] = useState<PerformanceArea | ''>('');
  const [contactLogging, setContactLogging] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const [vigencia, setVigencia] = useState<'now' | 'since'>('now');
  const [since, setSince] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!q.data) return;
    setCols(toState(q.data));
    setOverrides(q.data.currentVersion?.transitionOverrides ?? []);
    setArea(q.data.area ?? '');
    setContactLogging(q.data.contactLoggingEnabled);
    setAdvanced((q.data.currentVersion?.columns ?? []).some((c) => c.progressOrder !== null));
    // Primeira configuracao: sugere valer desde o inicio do historico.
    const first = !q.data.currentVersion && q.data.historyStartsAt;
    setVigencia(first ? 'since' : 'now');
    setSince(first ? q.data.historyStartsAt!.slice(0, 10) : '');
  }, [q.data]);

  const mut = useMutation({
    mutationFn: () =>
      saveBoardPerformanceConfig(boardId, {
        area: area || null,
        contactLoggingEnabled: contactLogging,
        columns: Object.values(cols),
        transitionOverrides: overrides,
        effectiveFrom:
          vigencia === 'since' && since
            ? startOfZonedDay(since, timeZone).toISOString()
            : undefined,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      setError(null);
      setNote('');
      void qc.invalidateQueries({ queryKey: ['performance'] });
      notify.success('Configuração salva. O relatório já usa a nova classificação.');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Erro ao salvar.'),
  });

  const lists = q.data?.lists ?? [];
  const active = useMemo(() => lists.filter((l) => l.status === 'ACTIVE'), [lists]);
  const old = useMemo(() => lists.filter((l) => l.status !== 'ACTIVE'), [lists]);

  if (q.isLoading) {
    return (
      <div className="border-border/60 flex justify-center border-t py-8">
        <Spinner />
      </div>
    );
  }
  if (q.isError || !q.data)
    return <p className="text-fg-muted px-4 pb-4 text-xs">Não foi possível carregar.</p>;

  const setCol = (id: string, patch: Partial<PerformanceColumnConfig>) =>
    setCols((s) => ({ ...s, [id]: { ...s[id]!, ...patch } }));

  const finalValue = (c?: PerformanceColumnConfig) =>
    c?.category && CONCLUSION_CATEGORIES.includes(c.category) ? c.category : '';

  function suggestOrder() {
    setCols((s) => {
      const next = { ...s };
      let order = 1;
      for (const l of active) {
        const c = next[l.id]!;
        const isFinal = !!c.category && CONCLUSION_CATEGORIES.includes(c.category);
        next[l.id] = {
          ...c,
          category: c.category ?? (l.isBacklog ? 'ENTRADA' : 'EM_ANDAMENTO'),
          progressOrder:
            c.category === 'FLUXO_PARALELO' ? null : isFinal ? c.progressOrder : order++,
        };
      }
      return next;
    });
  }

  const renderRow = (l: PerformanceBoardConfigDto['lists'][number]) => {
    const c = cols[l.id];
    if (!c) return null;
    return (
      <tr key={l.id} className="hover:bg-bg-subtle/60">
        <td className="py-2 pl-3 pr-2">
          <span className="text-fg font-medium">{l.name}</span>
          {l.status !== 'ACTIVE' && (
            <span className="text-fg-subtle ml-1">({STATUS_LABEL[l.status]})</span>
          )}
          {l.isFinalList && (
            <span className="bg-bg-muted text-fg-muted ml-2 rounded px-1.5 py-0.5 text-[10px]">
              Finalizado do Kanban
            </span>
          )}
        </td>
        <td className="px-2">
          <select
            aria-label={`Finalizado: ${l.name}`}
            value={finalValue(c)}
            onChange={(e) => {
              const v = e.target.value as PerformanceColumnCategory | '';
              setCol(l.id, {
                category: v || (finalValue(c) ? null : c.category),
              });
            }}
            className={selectCls}
          >
            <option value="">—</option>
            <option value="CONCLUSAO_POSITIVA">Finalizado (positivo)</option>
            <option value="CONCLUSAO_NEGATIVA">Finalizado (negativo)</option>
          </select>
        </td>
        {advanced && (
          <>
            <td className="px-2">
              <select
                aria-label={`Categoria: ${l.name}`}
                value={c.category ?? ''}
                onChange={(e) =>
                  setCol(l.id, {
                    category: e.target.value
                      ? PerformanceColumnCategorySchema.parse(e.target.value)
                      : null,
                  })
                }
                className={selectCls}
              >
                <option value="">—</option>
                {PerformanceColumnCategorySchema.options.map((k) => (
                  <option key={k} value={k}>
                    {PERFORMANCE_COLUMN_CATEGORY_LABELS[k]}
                  </option>
                ))}
              </select>
            </td>
            <td className="px-2">
              <input
                aria-label={`Ordem: ${l.name}`}
                type="number"
                min={0}
                max={1000}
                value={c.progressOrder ?? ''}
                onChange={(e) =>
                  setCol(l.id, {
                    progressOrder:
                      e.target.value === ''
                        ? null
                        : Math.max(0, Math.min(1000, Number(e.target.value))),
                  })
                }
                className={`${selectCls} w-16`}
              />
            </td>
            <td className="px-2 text-center">
              <input
                aria-label={`Contabilizar: ${l.name}`}
                type="checkbox"
                checked={c.counted}
                onChange={(e) => setCol(l.id, { counted: e.target.checked })}
              />
            </td>
            <td className="px-2 text-center">
              <input
                aria-label={`Reunião agendada: ${l.name}`}
                title="Entrar nesta coluna conta como reunião agendada"
                type="checkbox"
                checked={c.meetingScheduled === true}
                onChange={(e) => setCol(l.id, { meetingScheduled: e.target.checked || undefined })}
              />
            </td>
          </>
        )}
      </tr>
    );
  };

  const allForOverrides = [...active, ...old];

  return (
    <div className="border-border/60 flex flex-col gap-6 border-t px-4 py-5 sm:px-6">
      <div className="grid gap-3 text-xs md:grid-cols-3">
        <label className="border-border/70 flex flex-col gap-2 rounded-xl border p-3">
          <span className="text-fg font-medium">Área</span>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value as PerformanceArea | '')}
            className={selectCls}
          >
            <option value="">—</option>
            {PERFORMANCE_AREAS.map((a) => (
              <option key={a} value={a}>
                {PERFORMANCE_AREA_LABELS[a]}
              </option>
            ))}
          </select>
        </label>
        <OptionCard
          checked={contactLogging}
          onChange={setContactLogging}
          title="Registro de contato nos cards deste fluxo"
          description="Mostra botões opcionais (Ligação, WhatsApp, E-mail, Reunião, Proposta...) na caixa de comentário dos cards deste fluxo. Nos outros fluxos nada muda."
        />
        <OptionCard
          checked={advanced}
          onChange={setAdvanced}
          title="Configuração avançada (ordem do funil, transferências)"
          description="Define a ordem das colunas para medir avanços, retrocessos e transferências."
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-fg text-sm font-semibold">Colunas do fluxo</p>
          {advanced && (
            <button
              type="button"
              onClick={suggestOrder}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
              title="Preenche a ordem pela posição das colunas. Não define finalizado."
            >
              <Wand2 size={14} /> Sugerir ordem
            </button>
          )}
        </div>

        <div className="border-border/70 overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[480px] text-xs">
            <thead className="bg-bg-subtle text-fg-muted border-border/60 border-b text-left text-[11px] uppercase tracking-wide">
              <tr>
                <th className="py-2.5 pl-3 pr-2 font-semibold">Coluna</th>
                <th className="px-2 font-semibold">Finalizado nas análises</th>
                {advanced && (
                  <>
                    <th className="px-2 font-semibold">Categoria</th>
                    <th className="px-2 font-semibold">Ordem</th>
                    <th className="px-2 text-center font-semibold">Contabilizar</th>
                    <th className="px-2 text-center font-semibold">Reunião agendada</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-border/50 divide-y">{active.map(renderRow)}</tbody>
            {old.length > 0 && (
              <tbody>
                <tr>
                  <td colSpan={advanced ? 6 : 2} className="border-border/50 border-t px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => setShowOld((v) => !v)}
                      className="text-fg-muted hover:text-fg inline-flex items-center gap-1 font-medium"
                    >
                      {showOld ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      Colunas antigas que aparecem no histórico ({old.length})
                    </button>
                  </td>
                </tr>
                {showOld && old.map(renderRow)}
              </tbody>
            )}
          </table>
        </div>
      </div>

      {advanced && (
        <div className="flex flex-col gap-2 text-xs">
          <p className="text-fg text-sm font-semibold">Exceções de transição</p>
          <p className="text-fg-muted">
            Para caminhos que fogem da ordem (ex.: Finalizado → Marketing como Transferência).
          </p>
          {overrides.map((o, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select
                value={o.fromListId}
                onChange={(e) =>
                  setOverrides((s) =>
                    s.map((x, j) => (j === i ? { ...x, fromListId: e.target.value } : x)),
                  )
                }
                className={selectCls}
                aria-label="De"
              >
                {allForOverrides.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <span className="text-fg-muted">→</span>
              <select
                value={o.toListId}
                onChange={(e) =>
                  setOverrides((s) =>
                    s.map((x, j) => (j === i ? { ...x, toListId: e.target.value } : x)),
                  )
                }
                className={selectCls}
                aria-label="Para"
              >
                {allForOverrides.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <span className="text-fg-muted">=</span>
              <select
                value={o.movementClass}
                onChange={(e) =>
                  setOverrides((s) =>
                    s.map((x, j) =>
                      j === i
                        ? {
                            ...x,
                            movementClass: e.target.value as TransitionOverride['movementClass'],
                          }
                        : x,
                    ),
                  )
                }
                className={selectCls}
                aria-label="Classificação"
              >
                {Object.entries(CLASS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setOverrides((s) => s.filter((_, j) => j !== i))}
                className="text-fg-muted hover:text-red-500"
                aria-label="Remover exceção"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {allForOverrides.length >= 2 && (
            <button
              type="button"
              onClick={() =>
                setOverrides((s) => [
                  ...s,
                  {
                    fromListId: allForOverrides[0]!.id,
                    toListId: allForOverrides[1]!.id,
                    movementClass: 'TRANSFERENCIA',
                  },
                ])
              }
              className="text-primary inline-flex w-fit items-center gap-1 hover:underline"
            >
              <Plus size={12} /> Adicionar exceção
            </button>
          )}
        </div>
      )}

      <div className="bg-bg-subtle flex flex-col gap-3 rounded-xl p-4 text-xs">
        <p className="text-fg text-sm font-semibold">Vale a partir de</p>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={vigencia === 'now'} onChange={() => setVigencia('now')} />
          Agora (o histórico anterior mantém a classificação que tinha)
        </label>
        <label className="flex flex-wrap items-center gap-1.5">
          <input
            type="radio"
            checked={vigencia === 'since'}
            onChange={() => setVigencia('since')}
          />
          Desde
          <input
            type="date"
            value={since}
            onChange={(e) => {
              setSince(e.target.value);
              setVigencia('since');
            }}
            className={selectCls}
          />
          <span className="text-fg-muted">
            (reclassifica o histórico a partir dessa data — fica registrado)
          </span>
        </label>
        <input
          type="text"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Observação desta versão (opcional)"
          className={`${selectCls} max-w-md`}
        />
        {error && (
          <p className="rounded-lg bg-red-500/10 p-2.5 text-red-600 dark:text-red-400">{error}</p>
        )}
        <div>
          <Button
            size="md"
            onClick={() => mut.mutate()}
            disabled={mut.isPending || (vigencia === 'since' && !since)}
          >
            {mut.isPending && <Loader2 size={13} className="mr-1 animate-spin" />}
            Salvar configuração
          </Button>
        </div>
      </div>

      {q.data.versions.length > 0 && (
        <div className="flex flex-col gap-2 text-xs">
          <p className="text-fg text-sm font-semibold">Histórico de versões</p>
          <ul className="border-border/70 text-fg-muted ml-1 flex flex-col gap-2 border-l pl-4">
            {q.data.versions.map((v) => (
              <li key={v.id} className="relative">
                <span
                  aria-hidden
                  className="bg-primary/70 ring-bg absolute -left-[21px] top-1 size-2 rounded-full ring-4"
                />
                Vale desde {fmtDate(v.effectiveFrom)} · salva em {fmtDate(v.createdAt)} por{' '}
                {v.createdBy?.name ?? '—'}
                {v.note ? ` · ${v.note}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function OptionCard({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
        checked ? 'border-primary/40 bg-primary/5' : 'border-border/70 hover:bg-bg-subtle'
      }`}
    >
      <input
        type="checkbox"
        className="accent-primary mt-0.5 size-4 shrink-0"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex flex-col gap-1">
        <span className="text-fg font-medium">{title}</span>
        <span className="text-fg-muted leading-snug">{description}</span>
      </span>
    </label>
  );
}

function LevelSummary({ items }: { items: PerformanceConfigLevel[] }) {
  const count = (l: PerformanceConfigLevel) => items.filter((x) => x === l).length;
  return (
    <div className="flex flex-wrap gap-2">
      {(['FULL', 'BASIC', 'NONE'] as const).map((l) => (
        <span
          key={l}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${LEVEL_CLS[l]}`}
        >
          <span className={`size-1.5 rounded-full ${LEVEL_DOT[l]}`} />
          {LEVEL_LABEL[l]}: <span className="tabular-nums">{count(l)}</span>
        </span>
      ))}
    </div>
  );
}
