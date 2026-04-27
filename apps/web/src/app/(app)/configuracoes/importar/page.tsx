'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileUp,
  Loader2,
  Sparkles,
  Upload,
} from 'lucide-react';

import { ApiError } from '@/lib/api-client';
import { boardsQueries } from '@/lib/queries/boards';
import { orgMembersQuery } from '@/lib/queries/cards';
import {
  executeImport,
  previewImport,
  type ImportPreviewResult,
  type ImportReport,
  type ListMappingTarget,
} from '@/lib/queries/importer';

type Step = 1 | 2 | 3;

interface WizardState {
  csv: string;
  fileName: string | null;
  /** 'existing' (lista) ou 'new' (criar) */
  boardChoice: { type: 'existing'; boardId: string } | { type: 'new'; name: string } | null;
  preview: ImportPreviewResult | null;
  /** sourceName -> userId | null (ignore) */
  members: Record<string, string | null>;
  /** sourceName -> ListMappingTarget */
  lists: Record<string, ListMappingTarget>;
  report: ImportReport | null;
  error: string | null;
}

/**
 * Wizard 3-step de importacao Ummense (doc 28).
 *
 *   Step 1: arquivo + board destino (existente ou criar novo)
 *   Step 2: mapeamento de membros + colunas com fuzzy match pre-aplicado
 *   Step 3: confirmacao + execucao + relatorio
 */
export default function ImportarPage() {
  const [step, setStep] = useState<Step>(1);
  const [state, setState] = useState<WizardState>({
    csv: '',
    fileName: null,
    boardChoice: null,
    preview: null,
    members: {},
    lists: {},
    report: null,
    error: null,
  });

  function update(patch: Partial<WizardState>) {
    setState((s) => ({ ...s, ...patch }));
  }

  return (
    <div className="container mx-auto max-w-3xl py-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Importar fluxo do Ummense</h1>
        <p className="text-fg-muted mt-1 text-sm">
          Wizard de 3 passos. Mapeia manualmente membros e colunas pra evitar duplicação ou perda de
          líderes. Idempotente: re-importar não duplica.
        </p>
      </header>

      <Stepper current={step} />

      {step === 1 && <Step1 state={state} update={update} onNext={() => setStep(2)} />}
      {step === 2 && (
        <Step2 state={state} update={update} onBack={() => setStep(1)} onNext={() => setStep(3)} />
      )}
      {step === 3 && (
        <Step3
          state={state}
          update={update}
          onBack={() => setStep(2)}
          onRestart={() => {
            setStep(1);
            setState({
              csv: '',
              fileName: null,
              boardChoice: null,
              preview: null,
              members: {},
              lists: {},
              report: null,
              error: null,
            });
          }}
        />
      )}
    </div>
  );
}

function Stepper({ current }: { current: Step }) {
  const labels = ['Arquivo + destino', 'Mapeamento', 'Confirmar'];
  return (
    <div className="border-border bg-bg-muted/20 mb-6 flex items-center gap-2 rounded-md border p-2 text-xs">
      {labels.map((label, i) => {
        const n = (i + 1) as Step;
        const active = n === current;
        const done = n < current;
        return (
          <div key={n} className="flex flex-1 items-center gap-2">
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                done
                  ? 'bg-success text-success-fg'
                  : active
                    ? 'bg-primary text-primary-fg'
                    : 'bg-bg-emphasis text-fg-muted'
              }`}
            >
              {done ? <CheckCircle2 size={12} /> : n}
            </span>
            <span
              className={`truncate ${active ? 'text-fg font-medium' : done ? 'text-fg-muted' : 'text-fg-subtle'}`}
            >
              {label}
            </span>
            {n < 3 && <span className="bg-border/60 h-px flex-1" />}
          </div>
        );
      })}
    </div>
  );
}

// ==================================================
// Step 1: Arquivo + destino
// ==================================================
function Step1({
  state,
  update,
  onNext,
}: {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  onNext: () => void;
}) {
  const boardsQ = useQuery({ ...boardsQueries.all() });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    update({ csv: text, fileName: f.name, error: null });
  }

  function setBoardChoice(choice: WizardState['boardChoice']) {
    update({ boardChoice: choice });
  }

  const canNext =
    state.csv.length > 50 &&
    state.boardChoice !== null &&
    (state.boardChoice.type === 'existing' || state.boardChoice.name.trim().length > 0);

  return (
    <section className="border-border bg-bg flex flex-col gap-4 rounded-md border p-5 shadow-sm">
      <div>
        <label className="text-fg-muted mb-1.5 block text-[12px] font-medium">
          Arquivo do fluxo (.csv exportado do Ummense)
        </label>
        <label className="border-border hover:border-border-strong bg-bg-muted/30 flex cursor-pointer items-center gap-3 rounded-md border border-dashed p-4 text-sm transition-colors">
          <FileUp size={20} className="text-fg-muted" />
          <div className="flex-1">
            {state.fileName ? (
              <>
                <p className="text-fg font-medium">{state.fileName}</p>
                <p className="text-fg-muted text-[11px]">
                  {(state.csv.length / 1024).toFixed(1)} KB · clique pra trocar
                </p>
              </>
            ) : (
              <>
                <p className="text-fg-muted">Clique pra selecionar arquivo</p>
                <p className="text-fg-subtle text-[11px]">.csv exportado do Ummense</p>
              </>
            )}
          </div>
          <input type="file" accept=".csv,application/json" onChange={onFile} className="hidden" />
        </label>
      </div>

      <div>
        <label className="text-fg-muted mb-1.5 block text-[12px] font-medium">Board destino</label>
        <div className="flex flex-col gap-2">
          <label className="border-border hover:bg-bg-muted/30 flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm">
            <input
              type="radio"
              name="board-choice"
              checked={state.boardChoice?.type === 'existing'}
              onChange={() =>
                setBoardChoice({
                  type: 'existing',
                  boardId: boardsQ.data?.[0]?.id ?? '',
                })
              }
            />
            <span className="flex-1">Board existente:</span>
            <select
              disabled={state.boardChoice?.type !== 'existing'}
              value={state.boardChoice?.type === 'existing' ? state.boardChoice.boardId : ''}
              onChange={(e) => setBoardChoice({ type: 'existing', boardId: e.target.value })}
              className="border-border bg-bg w-56 rounded-md border px-2 py-1 text-xs disabled:opacity-50"
            >
              <option value="">Selecione…</option>
              {(boardsQ.data ?? [])
                .filter((b) => !b.isArchived)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="border-border hover:bg-bg-muted/30 flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm">
            <input
              type="radio"
              name="board-choice"
              checked={state.boardChoice?.type === 'new'}
              onChange={() => setBoardChoice({ type: 'new', name: '' })}
            />
            <span className="flex-1">Criar novo board:</span>
            <input
              type="text"
              disabled={state.boardChoice?.type !== 'new'}
              value={state.boardChoice?.type === 'new' ? state.boardChoice.name : ''}
              onChange={(e) => setBoardChoice({ type: 'new', name: e.target.value })}
              placeholder="Nome do novo board"
              className="border-border bg-bg w-56 rounded-md border px-2 py-1 text-xs disabled:opacity-50"
            />
          </label>
        </div>
        <p className="text-fg-subtle mt-1 text-[11px]">
          Se vazio em "novo board", usa o nome do fluxo do CSV.
        </p>
      </div>

      <div className="border-border flex justify-end border-t pt-3">
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          Próximo
          <ArrowRight size={13} />
        </button>
      </div>
    </section>
  );
}

// ==================================================
// Step 2: Mapeamento
// ==================================================
function Step2({
  state,
  update,
  onBack,
  onNext,
}: {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const previewMut = useMutation({
    mutationFn: () =>
      previewImport({
        csv: state.csv,
        boardId: state.boardChoice?.type === 'existing' ? state.boardChoice.boardId : undefined,
      }),
    onSuccess: (preview) => {
      // Pre-popular members + lists com sugestoes
      const members: Record<string, string | null> = {};
      for (const m of preview.members) {
        members[m.sourceName] = m.candidate?.id ?? null;
      }
      const lists: Record<string, ListMappingTarget> = {};
      for (const l of preview.lists) {
        lists[l.sourceName] = l.candidate
          ? { type: 'existing', listId: l.candidate.id }
          : { type: 'create', name: l.sourceName };
      }
      update({ preview, members, lists, error: null });
    },
    onError: (err) => {
      update({ error: err instanceof ApiError ? err.message : 'Erro ao analisar arquivo.' });
    },
  });

  const membersQ = useQuery({ ...orgMembersQuery });
  const orgUsers = useMemo(
    () => (membersQ.data ?? []).map((m) => ({ id: m.userId, name: m.user.name })),
    [membersQ.data],
  );

  const boardListsQ = useQuery({
    ...boardsQueries.detail(
      state.boardChoice?.type === 'existing' ? state.boardChoice.boardId : '',
    ),
    enabled: state.boardChoice?.type === 'existing',
  });
  const boardLists = useMemo(
    () => (boardListsQ.data?.lists ?? []).map((l) => ({ id: l.id, name: l.name })),
    [boardListsQ.data],
  );

  // Dispara preview na 1a renderizacao se ainda nao tem
  if (!state.preview && !previewMut.isPending && !previewMut.isError) {
    previewMut.mutate();
  }

  if (previewMut.isPending || (!state.preview && !state.error)) {
    return (
      <section className="border-border bg-bg flex items-center gap-2 rounded-md border p-6 text-sm">
        <Loader2 size={14} className="animate-spin" />
        Analisando arquivo e detectando entidades…
      </section>
    );
  }

  if (state.error) {
    return (
      <section className="border-danger bg-danger-subtle/30 flex flex-col gap-3 rounded-md border-l-2 p-4">
        <div className="flex items-start gap-2">
          <AlertCircle size={16} className="text-danger mt-0.5 shrink-0" />
          <div>
            <p className="text-fg text-sm font-medium">Não foi possível analisar o arquivo</p>
            <p className="text-fg-muted mt-1 text-xs">{state.error}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="text-primary self-start text-xs hover:underline"
        >
          Voltar e trocar arquivo
        </button>
      </section>
    );
  }

  if (!state.preview) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="border-border bg-bg flex flex-col gap-1 rounded-md border p-3 text-xs">
        <p className="text-fg">
          <span className="font-medium">{state.preview.totalRows}</span> cards no arquivo,{' '}
          <span className="font-medium">{state.preview.members.length}</span> membros únicos,{' '}
          <span className="font-medium">{state.preview.lists.length}</span> colunas únicas
          detectados.
        </p>
        {state.preview.warnings.map((w, i) => (
          <p key={i} className="text-warning flex items-start gap-1">
            <AlertCircle size={11} className="mt-0.5 shrink-0" />
            {w}
          </p>
        ))}
      </div>

      {/* Membros */}
      <div className="border-border bg-bg flex flex-col gap-2 rounded-md border p-4">
        <h3 className="text-fg text-sm font-semibold">
          Membros no arquivo ({state.preview.members.length})
        </h3>
        <p className="text-fg-subtle text-[11px]">
          Cada nome do CSV foi pré-mapeado por similaridade.{' '}
          <Sparkles size={10} className="inline" /> = match alto.
        </p>
        <ul className="mt-1 flex flex-col gap-1.5">
          {state.preview.members.map((m) => (
            <li key={m.sourceName} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="flex items-center gap-1.5 text-sm">
                {m.score >= 0.85 && <Sparkles size={11} className="text-success shrink-0" />}
                <span className="truncate">{m.sourceName}</span>
              </div>
              <ArrowRight size={11} className="text-fg-subtle" />
              <select
                value={state.members[m.sourceName] ?? ''}
                onChange={(e) =>
                  update({
                    members: {
                      ...state.members,
                      [m.sourceName]: e.target.value || null,
                    },
                  })
                }
                className="border-border bg-bg rounded-md border px-2 py-1 text-xs"
              >
                <option value="">⊘ Ignorar este nome</option>
                {orgUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </div>

      {/* Colunas */}
      <div className="border-border bg-bg flex flex-col gap-2 rounded-md border p-4">
        <h3 className="text-fg text-sm font-semibold">
          Colunas no arquivo ({state.preview.lists.length})
        </h3>
        <p className="text-fg-subtle text-[11px]">
          Cada coluna do CSV vira lista no board destino. Pode reutilizar lista existente, criar
          nova ou ignorar.
        </p>
        <ul className="mt-1 flex flex-col gap-1.5">
          {state.preview.lists.map((l) => {
            const target = state.lists[l.sourceName];
            return (
              <li key={l.sourceName} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="flex items-center gap-1.5 text-sm">
                  {l.score >= 0.85 && <Sparkles size={11} className="text-success shrink-0" />}
                  <span className="truncate">{l.sourceName}</span>
                </div>
                <ArrowRight size={11} className="text-fg-subtle" />
                <select
                  value={
                    target?.type === 'existing'
                      ? `existing:${target.listId}`
                      : target?.type === 'create'
                        ? 'create'
                        : 'ignore'
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    let next: ListMappingTarget;
                    if (v === 'create') next = { type: 'create', name: l.sourceName };
                    else if (v === 'ignore') next = { type: 'ignore' };
                    else next = { type: 'existing', listId: v.replace('existing:', '') };
                    update({ lists: { ...state.lists, [l.sourceName]: next } });
                  }}
                  className="border-border bg-bg rounded-md border px-2 py-1 text-xs"
                >
                  <option value="create">⊕ Criar nova lista "{l.sourceName}"</option>
                  <option value="ignore">⊘ Ignorar (cards desta coluna)</option>
                  {boardLists.length > 0 && (
                    <optgroup label="Existentes">
                      {boardLists.map((bl) => (
                        <option key={bl.id} value={`existing:${bl.id}`}>
                          {bl.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-border flex items-center justify-between border-t pt-3">
        <button
          type="button"
          onClick={onBack}
          className="border-border hover:bg-bg-muted text-fg inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm"
        >
          <ArrowLeft size={13} />
          Voltar
        </button>
        <button
          type="button"
          onClick={onNext}
          className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium"
        >
          Próximo
          <ArrowRight size={13} />
        </button>
      </div>
    </section>
  );
}

// ==================================================
// Step 3: Confirmar
// ==================================================
function Step3({
  state,
  update,
  onBack,
  onRestart,
}: {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  onBack: () => void;
  onRestart: () => void;
}) {
  const executeMut = useMutation({
    mutationFn: () =>
      executeImport({
        csv: state.csv,
        boardId: state.boardChoice?.type === 'existing' ? state.boardChoice.boardId : undefined,
        createBoardName: state.boardChoice?.type === 'new' ? state.boardChoice.name : undefined,
        members: state.members,
        lists: state.lists,
      }),
    onSuccess: (report) => update({ report, error: null }),
    onError: (err) =>
      update({ error: err instanceof ApiError ? err.message : 'Erro ao importar.' }),
  });

  if (state.report) return <FinalReport report={state.report} onRestart={onRestart} />;

  // Resumo
  const ignoredMembers = Object.values(state.members).filter((v) => v === null).length;
  const newLists = Object.values(state.lists).filter((t) => t.type === 'create').length;
  const ignoredLists = Object.values(state.lists).filter((t) => t.type === 'ignore').length;

  return (
    <section className="border-border bg-bg flex flex-col gap-4 rounded-md border p-5">
      <h2 className="text-fg text-base font-semibold">Confirmar importação</h2>

      <ul className="flex flex-col gap-1.5 text-sm">
        <li>
          ✓ <span className="font-medium">{state.preview?.totalRows ?? 0}</span> cards a criar
        </li>
        <li>
          ✓ <span className="font-medium">{newLists}</span> listas novas serão criadas
        </li>
        <li>
          ✓ <span className="font-medium">{Object.keys(state.members).length}</span> mapeamentos de
          membros confirmados
        </li>
        {ignoredMembers > 0 && (
          <li className="text-warning">
            ✗ <span className="font-medium">{ignoredMembers}</span> nomes ignorados (cards podem
            ficar sem esses membros)
          </li>
        )}
        {ignoredLists > 0 && (
          <li className="text-warning">
            ✗ <span className="font-medium">{ignoredLists}</span> colunas ignoradas (cards delas não
            importam)
          </li>
        )}
        <li className="text-fg-subtle text-[11px]">
          ✓ Mapeamentos confirmados serão lembrados pra próximas importações
        </li>
      </ul>

      {state.error && (
        <p className="bg-danger-subtle text-danger rounded px-2 py-1 text-xs">{state.error}</p>
      )}

      <div className="border-border flex items-center justify-between border-t pt-3">
        <button
          type="button"
          onClick={onBack}
          disabled={executeMut.isPending}
          className="border-border hover:bg-bg-muted text-fg inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          <ArrowLeft size={13} />
          Voltar
        </button>
        <button
          type="button"
          onClick={() => executeMut.mutate()}
          disabled={executeMut.isPending}
          className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          {executeMut.isPending && <Loader2 size={13} className="animate-spin" />}
          <Upload size={13} />
          Importar de verdade
        </button>
      </div>
    </section>
  );
}

function FinalReport({ report, onRestart }: { report: ImportReport; onRestart: () => void }) {
  return (
    <section className="border-success bg-success-subtle/30 flex flex-col gap-3 rounded-md border-l-2 p-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={18} className="text-success" />
        <h2 className="text-fg text-base font-semibold">Importação concluída</h2>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Stat label="Linhas no CSV" value={report.totalRows} />
        <Stat label="Criados" value={report.created} highlight />
        <Stat label="Pulados" value={report.skipped} muted />
        <Stat label="Erros" value={report.errors.length} danger={report.errors.length > 0} />
        <Stat label="Listas criadas" value={report.createdLists} />
        <Stat label="Tags criadas" value={report.createdLabels} />
        <Stat label="Contatos criados" value={report.createdContacts} />
      </dl>

      {report.warnings.length > 0 && (
        <details className="text-xs">
          <summary className="text-fg-muted cursor-pointer font-medium">
            Avisos ({report.warnings.length})
          </summary>
          <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto pl-1">
            {report.warnings.map((w, i) => (
              <li key={i} className="text-fg-muted text-[11px]">
                · {w}
              </li>
            ))}
          </ul>
        </details>
      )}

      {report.errors.length > 0 && (
        <details className="text-xs" open>
          <summary className="text-danger cursor-pointer font-medium">
            Erros ({report.errors.length})
          </summary>
          <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto pl-1">
            {report.errors.map((e, i) => (
              <li key={i} className="text-fg-muted text-[11px]">
                <span className="text-fg font-mono">linha {e.row}</span> ·{' '}
                <span className="text-fg">{e.cardName}</span> ·{' '}
                <span className="text-danger">{e.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="border-border flex justify-end border-t pt-3">
        <button
          type="button"
          onClick={onRestart}
          className="border-border hover:bg-bg-muted text-fg inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm"
        >
          Importar outro fluxo
        </button>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  highlight,
  muted,
  danger,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  muted?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="bg-bg/50 border-border/40 flex flex-col gap-0.5 rounded border px-2 py-1.5">
      <dt className="text-fg-muted text-[10px] uppercase">{label}</dt>
      <dd
        className={`text-base font-semibold ${
          highlight ? 'text-success' : danger ? 'text-danger' : muted ? 'text-fg-muted' : 'text-fg'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
