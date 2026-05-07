#!/usr/bin/env node
// Doc 39+: import em lote dos 21 CSVs Ummense via API.
// Uso: TOKEN=<jwt> node scripts/import-ummense-batch.mjs

import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.ktask.agenciakharis.com.br/api/v1';
const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error('Env TOKEN obrigatorio.');
  process.exit(1);
}

// Mapping CSV name -> KTask userId.
const MEMBER_MAP = {
  Dhyovaine: 'cmodbh8vm0003mk6zt77g38jz',
  Fernanda: 'cmodbh8vt0006mk6zhcxhzta7',
  Nicchon: 'cmod1pix00000o2aup3a6l23h',
  Thiago: 'cmodbh8w30009mk6z7s00hewy',
  'Anna Catarina': 'cmodbh8wn000fmk6z3npyb38a',
  'Maciana Ferreira': 'cmodbh8xa000lmk6za9bw9x2e',
  'Carol - Aliança Francesa': 'cmodbh8wy000imk6zoceq0123',
  Leila: 'cmodbh8we000cmk6z7k3for30',
};

// Board com `|` literal no nome — renomear pra evitar confusao com multi-fluxo.
const BOARD_RENAME = {
  'Executivo de contas | FÁBIO MACHADO': 'Executivo de contas - Fábio Machado',
};

const DOWNLOADS = 'C:/Users/NoteBook1/Downloads/';
const CUTOFF = new Date('2026-05-06T18:00:00').getTime();

const files = fs
  .readdirSync(DOWNLOADS)
  .filter((f) => f.startsWith('flow_projects_'))
  .filter((f) => fs.statSync(path.join(DOWNLOADS, f)).mtimeMs >= CUTOFF)
  .map((f) => path.join(DOWNLOADS, f));

console.log(`Arquivos pra processar: ${files.length}`);

async function api(endpoint, options = {}) {
  const res = await fetch(`${API}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    throw Object.assign(new Error(`${res.status} ${res.statusText}: ${typeof body === 'object' ? body?.message : body}`), { status: res.status, body });
  }
  return body;
}

function detectPrimaryBoard(csv) {
  try {
    const parsed = JSON.parse(csv);
    const fluxosCount = new Map();
    for (const row of parsed.slice(1)) {
      const fluxos = (row[2] ?? '').trim();
      if (!fluxos || fluxos.includes('|')) continue;
      fluxosCount.set(fluxos, (fluxosCount.get(fluxos) ?? 0) + 1);
    }
    const sorted = [...fluxosCount.entries()].sort((a, b) => b[1] - a[1]);
    if (sorted[0]) return sorted[0][0];
    // Fallback: nome multi-fluxo (ex: "Executivo de contas | FÁBIO MACHADO")
    const allFluxos = new Set();
    for (const row of parsed.slice(1)) {
      const f = (row[2] ?? '').trim();
      if (f) allFluxos.add(f);
    }
    if (allFluxos.size === 1) {
      return [...allFluxos][0];
    }
    return null;
  } catch {
    return null;
  }
}

function isEmpty(csv) {
  try {
    const parsed = JSON.parse(csv);
    return parsed.length <= 1 || (parsed.length === 2 && !parsed[1].some((c) => c));
  } catch {
    return true;
  }
}

// ====== Execucao ======

const summary = {
  totalFiles: files.length,
  skipped: [],
  results: [],
  totals: { created: 0, linked: 0, skippedCards: 0, errors: 0, annotations: 0, formResponses: 0 },
};

for (let i = 0; i < files.length; i++) {
  const filePath = files[i];
  const fileName = path.basename(filePath);
  const csv = fs.readFileSync(filePath, 'utf-8');

  console.log(`\n[${i + 1}/${files.length}] ${fileName}`);

  if (isEmpty(csv)) {
    console.log(`  -> VAZIO, pulando`);
    summary.skipped.push({ file: fileName, reason: 'vazio' });
    continue;
  }

  let detectedBoard = detectPrimaryBoard(csv);
  if (!detectedBoard) {
    console.log(`  -> nao consegui detectar board, pulando`);
    summary.skipped.push({ file: fileName, reason: 'board indeterminado' });
    continue;
  }
  // Aplica rename se aplicavel
  const boardName = BOARD_RENAME[detectedBoard] ?? detectedBoard;
  if (boardName !== detectedBoard) {
    console.log(`  -> board "${detectedBoard}" renomeado pra "${boardName}"`);
  }

  // Preview pra pegar lista de members + lists desta CSV
  let preview;
  try {
    preview = await api('/admin/import/ummense-flow/preview', {
      method: 'POST',
      body: JSON.stringify({ csv }),
    });
  } catch (err) {
    console.log(`  ERRO preview: ${err.message}`);
    summary.results.push({ file: fileName, board: boardName, error: `preview: ${err.message}` });
    continue;
  }

  // Monta members mapping (ids fixos do meu MEMBER_MAP, fallback null)
  const members = {};
  for (const m of preview.members) {
    members[m.sourceName] = MEMBER_MAP[m.sourceName] ?? null;
  }
  // Lista membros nao mapeados (warning)
  const unmapped = preview.members.filter((m) => !MEMBER_MAP[m.sourceName]);
  if (unmapped.length > 0) {
    console.log(`  AVISO: ${unmapped.length} membros sem mapping: ${unmapped.map((m) => m.sourceName).join(', ')}`);
  }

  // Lista mapping: cria nova pra cada coluna do CSV.
  const lists = {};
  for (const l of preview.lists) {
    lists[l.sourceName] = { type: 'create', name: l.sourceName };
  }

  console.log(`  preview: ${preview.totalRows} cards, ${preview.members.length} membros, ${preview.lists.length} listas -> board "${boardName}"`);

  try {
    const t0 = Date.now();
    const report = await api('/admin/import/ummense-flow/execute', {
      method: 'POST',
      body: JSON.stringify({ csv, createBoardName: boardName, members, lists }),
    });
    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`  OK em ${dur}s: criados=${report.created} linked=${report.linkedToFlow} pulados=${report.skipped} erros=${report.errors.length} anotacoes=${report.importedAnnotations} forms=${report.importedFormResponses}`);
    summary.results.push({ file: fileName, board: boardName, report });
    summary.totals.created += report.created;
    summary.totals.linked += report.linkedToFlow;
    summary.totals.skippedCards += report.skipped;
    summary.totals.errors += report.errors.length;
    summary.totals.annotations += report.importedAnnotations;
    summary.totals.formResponses += report.importedFormResponses;
    if (report.errors.length > 0) {
      console.log(`  Erros detalhados:`);
      for (const e of report.errors.slice(0, 3)) {
        console.log(`    - row ${e.row} "${e.cardName}": ${e.reason}`);
      }
      if (report.errors.length > 3) console.log(`    ...mais ${report.errors.length - 3}`);
    }
  } catch (err) {
    console.log(`  ERRO execute: ${err.message}`);
    summary.results.push({ file: fileName, board: boardName, error: `execute: ${err.message}` });
  }
}

console.log('\n========== RELATORIO FINAL ==========');
console.log(`Arquivos processados: ${files.length - summary.skipped.length}/${files.length}`);
console.log(`Pulados: ${summary.skipped.length}`);
for (const s of summary.skipped) console.log(`  - ${s.file}: ${s.reason}`);
console.log(`\nTotais:`);
console.log(`  Cards criados:    ${summary.totals.created}`);
console.log(`  Cards linkados:   ${summary.totals.linked} (multi-fluxo)`);
console.log(`  Cards pulados:    ${summary.totals.skippedCards}`);
console.log(`  Erros:            ${summary.totals.errors}`);
console.log(`  Anotacoes -> com: ${summary.totals.annotations}`);
console.log(`  Forms -> coment:  ${summary.totals.formResponses}`);

// Salva relatorio detalhado em JSON
const reportPath = path.join(process.cwd(), 'tarefas-md', `39-import-report-${Date.now()}.json`);
fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
console.log(`\nRelatorio detalhado salvo em: ${reportPath}`);
