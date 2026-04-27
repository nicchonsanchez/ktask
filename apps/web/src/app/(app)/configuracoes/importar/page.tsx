'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, FileUp, Loader2, Upload } from 'lucide-react';

import { ApiError } from '@/lib/api-client';
import { importUmmenseFlow, type ImportReport } from '@/lib/queries/importer';

/**
 * Pagina de importacao de fluxo Ummense (admin only).
 *
 * Fluxo:
 *   1. User upa o arquivo .csv (que e na verdade JSON-array-of-arrays)
 *   2. Botao "Pre-visualizar" roda dryRun pra ver quantos cards serao
 *      criados / pulados sem persistir
 *   3. Botao "Importar" roda de verdade — idempotente via shortCode
 */
export default function ImportarPage() {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [boardName, setBoardName] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const text = await f.text();
    setCsv(text);
    setReport(null);
    setError(null);
  }

  const mut = useMutation({
    mutationFn: (dryRun: boolean) =>
      importUmmenseFlow({
        csv,
        boardName: boardName.trim() || undefined,
        dryRun,
      }),
    onSuccess: (r) => {
      setReport(r);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Erro ao importar.');
      setReport(null);
    },
  });

  const canRun = csv.length > 50 && !mut.isPending;

  return (
    <div className="container mx-auto max-w-3xl py-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Importar fluxo do Ummense</h1>
        <p className="text-fg-muted mt-1 text-sm">
          Faça upload do arquivo .csv exportado do Ummense (na verdade um JSON de arrays). Apenas
          OWNER/ADMIN. Idempotente: re-importar não duplica.
        </p>
      </header>

      <section className="border-border bg-bg flex flex-col gap-4 rounded-md border p-5 shadow-sm">
        <div>
          <label className="text-fg-muted mb-1.5 block text-[12px] font-medium">
            Arquivo do fluxo (.csv exportado do Ummense)
          </label>
          <label className="border-border hover:border-border-strong bg-bg-muted/30 flex cursor-pointer items-center gap-3 rounded-md border border-dashed p-4 text-sm transition-colors">
            <FileUp size={20} className="text-fg-muted" />
            <div className="flex-1">
              {fileName ? (
                <>
                  <p className="text-fg font-medium">{fileName}</p>
                  <p className="text-fg-muted text-[11px]">
                    {(csv.length / 1024).toFixed(1)} KB · clique pra trocar
                  </p>
                </>
              ) : (
                <>
                  <p className="text-fg-muted">Clique pra selecionar arquivo</p>
                  <p className="text-fg-subtle text-[11px]">.csv exportado do Ummense</p>
                </>
              )}
            </div>
            <input
              type="file"
              accept=".csv,application/json"
              onChange={onFile}
              className="hidden"
            />
          </label>
        </div>

        <div>
          <label className="text-fg-muted mb-1.5 block text-[12px] font-medium">
            Nome do board (opcional)
          </label>
          <input
            value={boardName}
            onChange={(e) => setBoardName(e.target.value)}
            placeholder="Se vazio, usa o nome do fluxo do CSV"
            className="border-border bg-bg w-full rounded-md border px-3 py-2 text-sm focus:outline-none"
          />
          <p className="text-fg-subtle mt-1 text-[11px]">
            Se o board não existir, é criado automaticamente.
          </p>
        </div>

        <div className="border-border flex gap-2 border-t pt-3">
          <button
            type="button"
            onClick={() => mut.mutate(true)}
            disabled={!canRun}
            className="border-border hover:bg-bg-muted text-fg inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mut.isPending && mut.variables === true && (
              <Loader2 size={13} className="animate-spin" />
            )}
            Pré-visualizar
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm('Importar de verdade? Cards criados não podem ser desfeitos em massa.')) {
                mut.mutate(false);
              }
            }}
            disabled={!canRun}
            className="bg-primary text-primary-fg hover:bg-primary-hover ml-auto inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mut.isPending && mut.variables === false && (
              <Loader2 size={13} className="animate-spin" />
            )}
            <Upload size={13} />
            Importar
          </button>
        </div>
      </section>

      {error && (
        <div className="border-danger bg-danger-subtle/40 mt-4 flex items-start gap-2 rounded-md border-l-2 px-4 py-3">
          <AlertCircle size={16} className="text-danger mt-0.5 shrink-0" />
          <div>
            <p className="text-danger text-sm font-medium">Erro</p>
            <p className="text-fg-muted mt-0.5 text-xs">{error}</p>
          </div>
        </div>
      )}

      {report && <ReportView report={report} />}
    </div>
  );
}

function ReportView({ report }: { report: ImportReport }) {
  return (
    <div
      className={`mt-4 flex flex-col gap-3 rounded-md border-l-2 px-4 py-4 ${
        report.dryRun
          ? 'border-warning bg-warning-subtle/30'
          : 'border-success bg-success-subtle/30'
      }`}
    >
      <div className="flex items-center gap-2">
        {report.dryRun ? (
          <AlertCircle size={16} className="text-warning" />
        ) : (
          <CheckCircle2 size={16} className="text-success" />
        )}
        <p className="text-fg text-sm font-semibold">
          {report.dryRun ? 'Pré-visualização' : 'Importação concluída'}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Stat label="Linhas no CSV" value={report.totalRows} />
        <Stat label={report.dryRun ? 'A criar' : 'Criados'} value={report.created} highlight />
        <Stat label="Pulados" value={report.skipped} muted />
        <Stat label="Erros" value={report.errors.length} danger={report.errors.length > 0} />
        {!report.dryRun && (
          <>
            <Stat label="Listas criadas" value={report.createdLists} />
            <Stat label="Tags criadas" value={report.createdLabels} />
            <Stat label="Contatos criados" value={report.createdContacts} />
          </>
        )}
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
    </div>
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
    <div className={`bg-bg/50 border-border/40 flex flex-col gap-0.5 rounded border px-2 py-1.5`}>
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
