'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Play,
  Upload,
  X,
} from 'lucide-react';

import { ApiError } from '@/lib/api-client';
import { orgMembersQuery } from '@/lib/queries/cards';
import {
  executeImport,
  previewImport,
  type ImportPreviewResult,
  type ImportReport,
  type ListMappingTarget,
} from '@/lib/queries/importer';

/**
 * Doc 39+: Importer em lote. Aceita N CSVs do Ummense de uma vez,
 * agrega os nomes de membros (geralmente <10 nomes pra dezenas de
 * arquivos), permite mapear cada um 1x, e executa todos em serie
 * usando o V2 wizard endpoint.
 *
 * Listas sao auto-resolvidas como "criar nova" pra simplificar — board
 * vai ter as colunas do Ummense replicadas com nomes originais.
 *
 * Nome do board: pre-preenchido com o valor mais comum de "Fluxos"
 * sem `|` (cards single-board). User pode ajustar antes de executar.
 */

interface FileEntry {
  file: File;
  csv: string;
  preview: ImportPreviewResult | null;
  /** Nome detectado mais comum de "Fluxos" (sem `|`). */
  detectedBoard: string;
  /** Nome final escolhido pra criar o board. */
  boardName: string;
  /** Status na execucao. */
  status: 'pending' | 'previewing' | 'ready' | 'preview-error' | 'executing' | 'done' | 'error';
  error: string | null;
  report: ImportReport | null;
}

export default function ImportarLotePage() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  // Mapping global de membros: nome do CSV -> userId | null. Compartilhado
  // entre todos os arquivos do lote.
  const [memberMapping, setMemberMapping] = useState<Record<string, string | null>>({});
  const [isExecuting, setIsExecuting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const membersQ = useQuery(orgMembersQuery);

  // Agregacao dos nomes unicos vindos das previews. Conta em quantos
  // CSVs aparece cada nome (info pro user).
  const aggregatedMembers = useMemo(() => {
    const map = new Map<
      string,
      { name: string; appearsInCsvs: number; suggestedUserId: string | null }
    >();
    for (const f of files) {
      if (!f.preview) continue;
      for (const m of f.preview.members) {
        const existing = map.get(m.sourceName);
        if (existing) {
          existing.appearsInCsvs++;
        } else {
          map.set(m.sourceName, {
            name: m.sourceName,
            appearsInCsvs: 1,
            // Auto-aplica candidato com score >=0.7 como sugestao
            suggestedUserId: m.score >= 0.7 ? (m.candidate?.id ?? null) : null,
          });
        }
      }
    }
    return [...map.values()].sort((a, b) => b.appearsInCsvs - a.appearsInCsvs);
  }, [files]);

  const allReady = files.length > 0 && files.every((f) => f.status === 'ready');
  const totalCards = files.reduce((sum, f) => sum + (f.preview?.totalRows ?? 0), 0);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setGlobalError(null);
    const newEntries: FileEntry[] = [];
    for (const file of Array.from(list)) {
      const csv = await file.text();
      newEntries.push({
        file,
        csv,
        preview: null,
        detectedBoard: '',
        boardName: '',
        status: 'pending',
        error: null,
        report: null,
      });
    }
    setFiles((prev) => [...prev, ...newEntries]);
    // Dispara preview de cada arquivo em paralelo. Atualiza state por
    // arquivo conforme termina.
    const startIndex = files.length;
    newEntries.forEach((entry, i) => {
      const idx = startIndex + i;
      previewOne(idx, entry.csv);
    });
  }

  async function previewOne(idx: number, csv: string) {
    setFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, status: 'previewing' } : f)));
    try {
      const preview = await previewImport({ csv });
      // Detecta board name mais comum sem `|`. Fallback: detectedBoardName.
      const fluxosCounts = new Map<string, number>();
      try {
        const parsed = JSON.parse(csv) as string[][];
        for (const row of parsed.slice(1)) {
          const fluxos = (row[2] ?? '').trim();
          if (!fluxos || fluxos.includes('|')) continue;
          fluxosCounts.set(fluxos, (fluxosCounts.get(fluxos) ?? 0) + 1);
        }
      } catch {
        // Ignora — usa fallback abaixo.
      }
      const sortedFluxos = [...fluxosCounts.entries()].sort((a, b) => b[1] - a[1]);
      const detectedBoard = sortedFluxos[0]?.[0] ?? preview.detectedBoardName;
      setFiles((prev) =>
        prev.map((f, i) =>
          i === idx
            ? {
                ...f,
                preview,
                detectedBoard,
                boardName: detectedBoard,
                status: 'ready',
              }
            : f,
        ),
      );
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Erro ao processar CSV.';
      setFiles((prev) =>
        prev.map((f, i) => (i === idx ? { ...f, status: 'preview-error', error: msg } : f)),
      );
    }
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateBoardName(idx: number, name: string) {
    setFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, boardName: name } : f)));
  }

  function setMemberMapping_(name: string, userId: string | null) {
    setMemberMapping((prev) => ({ ...prev, [name]: userId }));
  }

  async function executeAll() {
    if (!allReady) return;
    setIsExecuting(true);
    setGlobalError(null);

    // Resolve mapping final: o que user escolheu OU sugestao automatica
    // (score >=0.7) OU null (ignore).
    const finalMembers: Record<string, string | null> = {};
    for (const m of aggregatedMembers) {
      const explicit = memberMapping[m.name];
      finalMembers[m.name] = explicit !== undefined ? explicit : m.suggestedUserId;
    }

    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      if (f.status === 'done') continue;
      setFiles((prev) =>
        prev.map((x, idx) => (idx === i ? { ...x, status: 'executing', error: null } : x)),
      );
      try {
        // Listas: auto-resolve "criar nova" pra cada lista do CSV.
        const lists: Record<string, ListMappingTarget> = {};
        for (const l of f.preview!.lists) {
          lists[l.sourceName] = { type: 'create', name: l.sourceName };
        }
        // Filtra membros que ESTE CSV usa (subset do mapping global).
        const csvMembers: Record<string, string | null> = {};
        for (const m of f.preview!.members) {
          if (m.sourceName in finalMembers) {
            csvMembers[m.sourceName] = finalMembers[m.sourceName] ?? null;
          }
        }
        const report = await executeImport({
          csv: f.csv,
          createBoardName: f.boardName,
          members: csvMembers,
          lists,
        });
        setFiles((prev) =>
          prev.map((x, idx) => (idx === i ? { ...x, status: 'done', report } : x)),
        );
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : 'Erro ao executar import.';
        setFiles((prev) =>
          prev.map((x, idx) => (idx === i ? { ...x, status: 'error', error: msg } : x)),
        );
        // Continua pros proximos — nao bloqueia o lote por causa de 1
        // arquivo. User ve o erro e pode reexecutar so esse depois.
      }
    }

    setIsExecuting(false);
  }

  const totals = useMemo(() => {
    let created = 0;
    let linked = 0;
    let skipped = 0;
    let errors = 0;
    let annotations = 0;
    let formResponses = 0;
    let warnings = 0;
    for (const f of files) {
      if (!f.report) continue;
      created += f.report.created;
      linked += f.report.linkedToFlow;
      skipped += f.report.skipped;
      errors += f.report.errors.length;
      annotations += f.report.importedAnnotations;
      formResponses += f.report.importedFormResponses;
      warnings += f.report.warnings.length;
    }
    return { created, linked, skipped, errors, annotations, formResponses, warnings };
  }, [files]);

  const allDone =
    files.length > 0 && files.every((f) => f.status === 'done' || f.status === 'error');

  return (
    <div className="container mx-auto max-w-4xl py-6">
      <header className="mb-6">
        <Link
          href="/configuracoes/importar"
          className="text-fg-muted hover:text-fg mb-2 inline-flex items-center gap-1 text-xs"
        >
          <ArrowLeft size={12} /> Importar (1 arquivo)
        </Link>
        <h1 className="text-xl font-semibold">Importar Ummense em lote</h1>
        <p className="text-fg-muted mt-1 text-sm">
          Carrega N arquivos de uma vez. Mapeie cada nome de membro 1x — o sistema reaproveita o
          mapeamento em todos os CSVs. Cards multi-fluxo (presentes em 2+ boards no Ummense) são
          deduplicados automaticamente via shortCode.
        </p>
      </header>

      {/* Etapa 1: upload */}
      <section className="border-border bg-bg mb-6 rounded-md border p-4">
        <h2 className="text-fg mb-3 text-sm font-semibold">1. Selecione os arquivos</h2>
        <label className="border-border bg-bg-muted/30 hover:bg-bg-muted flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed p-6 text-center transition-colors">
          <Upload size={20} className="text-fg-muted" />
          <span className="text-sm font-medium">Clique pra escolher CSVs</span>
          <span className="text-fg-muted text-xs">ou arraste e solte</span>
          <input
            type="file"
            multiple
            accept=".csv"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
            disabled={isExecuting}
          />
        </label>

        {files.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1.5">
            {files.map((f, idx) => (
              <FileRow
                key={idx}
                entry={f}
                onRemove={() => removeFile(idx)}
                onBoardNameChange={(name) => updateBoardName(idx, name)}
                disabled={isExecuting}
              />
            ))}
          </ul>
        )}

        {files.length > 0 && (
          <p className="text-fg-muted mt-3 text-xs">
            {files.length} arquivo{files.length > 1 ? 's' : ''} · {totalCards} card
            {totalCards !== 1 ? 's' : ''} no total
          </p>
        )}
      </section>

      {/* Etapa 2: mapeamento de membros */}
      {aggregatedMembers.length > 0 && (
        <section className="border-border bg-bg mb-6 rounded-md border p-4">
          <h2 className="text-fg mb-1 text-sm font-semibold">2. Mapeie os membros</h2>
          <p className="text-fg-muted mb-3 text-xs">
            {aggregatedMembers.length} nome{aggregatedMembers.length > 1 ? 's' : ''} únicos
            mencionados como líder ou equipe. Sugestões automáticas (✓) aplicadas pra matches com
            score &gt;= 70%.
          </p>
          <ul className="flex flex-col gap-1.5">
            {aggregatedMembers.map((m) => {
              const value = memberMapping[m.name] ?? m.suggestedUserId ?? '';
              const isExplicit = memberMapping[m.name] !== undefined;
              const matched = Boolean(value);
              return (
                <li
                  key={m.name}
                  className="border-border/60 bg-bg-muted/20 flex flex-wrap items-center gap-2 rounded-md border p-2"
                >
                  <span className="flex-1 text-sm">
                    <span className="font-medium">{m.name}</span>
                    <span className="text-fg-muted ml-1.5 text-[11px]">
                      em {m.appearsInCsvs} CSV{m.appearsInCsvs > 1 ? 's' : ''}
                    </span>
                  </span>
                  {!isExplicit && matched && (
                    <span className="text-success text-[10px] font-medium">✓ sugerido</span>
                  )}
                  <select
                    value={value || ''}
                    onChange={(e) => setMemberMapping_(m.name, e.target.value || null)}
                    disabled={isExecuting}
                    className="border-border bg-bg w-64 rounded border px-2 py-1 text-xs"
                  >
                    <option value="">Ignorar (sem mapeamento)</option>
                    {(membersQ.data ?? []).map((u) => (
                      <option key={u.userId} value={u.userId}>
                        {u.user.name} ({u.user.email})
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
          <p className="text-fg-subtle mt-2 text-[11px]">
            Membros mapeados como &quot;Ignorar&quot; viram leadId = você (o importador) com warning
            no relatório.
          </p>
        </section>
      )}

      {/* Etapa 3: executar */}
      {files.length > 0 && (
        <section className="border-border bg-bg sticky bottom-4 mb-4 rounded-md border p-4 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs">
              {allDone ? (
                <span className="text-success font-medium">
                  <CheckCircle2 size={13} className="mr-1 inline" />
                  Concluído: {totals.created} criados, {totals.linked} vinculados, {totals.errors}{' '}
                  erros
                </span>
              ) : isExecuting ? (
                <span className="text-fg-muted">
                  <Loader2 size={13} className="mr-1 inline animate-spin" />
                  Executando…
                </span>
              ) : allReady ? (
                <span className="text-fg">
                  Tudo pronto — {totalCards} cards em {files.length} arquivos serão importados.
                </span>
              ) : (
                <span className="text-fg-muted">Aguardando preview de todos os arquivos…</span>
              )}
            </div>
            <button
              type="button"
              onClick={executeAll}
              disabled={!allReady || isExecuting || allDone}
              className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isExecuting ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              {isExecuting ? 'Executando…' : 'Importar tudo'}
            </button>
          </div>

          {globalError && (
            <p className="bg-danger-subtle text-danger mt-2 rounded px-2 py-1 text-xs">
              {globalError}
            </p>
          )}
        </section>
      )}

      {/* Relatório consolidado */}
      {allDone && (
        <section className="border-border bg-bg mb-6 rounded-md border p-4">
          <h2 className="text-fg mb-3 text-sm font-semibold">Relatório consolidado</h2>
          <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <Stat label="Criados" value={totals.created} highlight />
            <Stat label="Vinculados (multi-fluxo)" value={totals.linked} highlight />
            <Stat label="Pulados" value={totals.skipped} muted />
            <Stat label="Erros" value={totals.errors} danger={totals.errors > 0} />
            <Stat label="Anotações importadas" value={totals.annotations} />
            <Stat label="Respostas de form" value={totals.formResponses} />
            <Stat label="Avisos" value={totals.warnings} muted />
          </dl>
          <details className="mt-3 text-xs">
            <summary className="text-fg-muted cursor-pointer font-medium">
              Detalhes por arquivo
            </summary>
            <ul className="mt-2 flex flex-col gap-1">
              {files.map((f, idx) => (
                <li key={idx} className="border-border/60 bg-bg-muted/20 rounded border p-2">
                  <span className="font-medium">{f.file.name}</span>
                  <span className="text-fg-muted ml-2">→ {f.boardName}</span>
                  {f.report && (
                    <span className="text-fg-muted ml-2">
                      · {f.report.created} criados, {f.report.linkedToFlow} vinculados
                      {f.report.errors.length > 0 && (
                        <span className="text-danger"> · {f.report.errors.length} erros</span>
                      )}
                    </span>
                  )}
                  {f.error && <span className="text-danger ml-2">· {f.error}</span>}
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </div>
  );
}

function FileRow({
  entry,
  onRemove,
  onBoardNameChange,
  disabled,
}: {
  entry: FileEntry;
  onRemove: () => void;
  onBoardNameChange: (name: string) => void;
  disabled: boolean;
}) {
  return (
    <li className="border-border/60 bg-bg-muted/30 flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
      <FileText size={14} className="text-fg-muted shrink-0" />
      <span className="min-w-0 flex-1 truncate font-medium">{entry.file.name}</span>
      <StatusBadge status={entry.status} />
      {entry.preview && (
        <>
          <span className="text-fg-muted text-[11px]">→ board:</span>
          <input
            type="text"
            value={entry.boardName}
            onChange={(e) => onBoardNameChange(e.target.value)}
            disabled={disabled}
            className="border-border bg-bg w-40 rounded border px-2 py-0.5 text-xs"
          />
          <span className="text-fg-muted text-[11px]">{entry.preview.totalRows} cards</span>
        </>
      )}
      {entry.error && (
        <span className="text-danger inline-flex items-center gap-1 text-[11px]">
          <AlertCircle size={11} />
          {entry.error}
        </span>
      )}
      {!disabled && (
        <button
          type="button"
          onClick={onRemove}
          className="text-fg-muted hover:text-danger rounded p-1"
          aria-label="Remover"
        >
          <X size={13} />
        </button>
      )}
    </li>
  );
}

function StatusBadge({ status }: { status: FileEntry['status'] }) {
  const map: Record<FileEntry['status'], { label: string; cls: string; icon?: React.ReactNode }> = {
    pending: { label: 'Aguardando', cls: 'bg-bg-muted text-fg-muted' },
    previewing: {
      label: 'Lendo…',
      cls: 'bg-bg-muted text-fg-muted',
      icon: <Loader2 size={9} className="animate-spin" />,
    },
    ready: { label: 'Pronto', cls: 'bg-success-subtle text-success' },
    'preview-error': { label: 'Erro', cls: 'bg-danger-subtle text-danger' },
    executing: {
      label: 'Importando…',
      cls: 'bg-primary-subtle text-primary',
      icon: <Loader2 size={9} className="animate-spin" />,
    },
    done: { label: 'Concluído', cls: 'bg-success-subtle text-success' },
    error: { label: 'Erro', cls: 'bg-danger-subtle text-danger' },
  };
  const v = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${v.cls}`}
    >
      {v.icon}
      {v.label}
    </span>
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
  const cls = danger
    ? 'border-danger/40 bg-danger-subtle/30'
    : highlight
      ? 'border-primary/30 bg-primary-subtle/30'
      : muted
        ? 'border-border/40 bg-bg-muted/20'
        : 'border-border/60 bg-bg-muted/40';
  return (
    <div className={`rounded-md border p-2 ${cls}`}>
      <dt className="text-fg-muted text-[10px] uppercase tracking-wide">{label}</dt>
      <dd className="text-fg mt-0.5 text-base font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
