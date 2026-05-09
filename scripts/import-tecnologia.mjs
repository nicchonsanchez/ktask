#!/usr/bin/env node
// One-shot: cria board "Tecnologia" do template JSON + importa cards do CSV.
// Nao apaga nada de outros boards. Roda so se Tecnologia ainda nao existir.
//
// Uso: TOKEN=<jwt> node scripts/import-tecnologia.mjs

import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.ktask.agenciakharis.com.br/api/v1';
const TOKEN = process.env.TOKEN;
if (!TOKEN) { console.error('Env TOKEN obrigatorio.'); process.exit(1); }

const DOWNLOADS = 'C:/Users/NoteBook1/Downloads/';
const TARGET = 'Tecnologia';

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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function api(ep, opts = {}, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = await fetch(API + ep, {
      ...opts,
      headers: {
        Authorization: 'Bearer ' + TOKEN,
        'Content-Type': 'application/json',
        ...(opts.headers ?? {}),
      },
    });
    const t = await r.text();
    let b; try { b = t ? JSON.parse(t) : null; } catch { b = t; }
    if (r.status === 429 && attempt < retries) {
      await sleep([1000, 3000, 8000][attempt]);
      continue;
    }
    if (!r.ok) throw new Error(r.status + ' ' + (opts.method || 'GET') + ' ' + ep + ': ' + (typeof b === 'object' ? b?.message : b));
    await sleep(180);
    return b;
  }
}

function findTemplate() {
  // Pega o JSON com timestamp mais recente cujo name === TARGET
  const files = fs.readdirSync(DOWNLOADS).filter(f => /^flow_2026050[78]/.test(f) && f.endsWith('.json'));
  const matches = [];
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(DOWNLOADS, f), 'utf-8'));
    if (d.name === TARGET) matches.push({ file: f, tpl: d });
  }
  matches.sort((a, b) => a.file.localeCompare(b.file));
  return matches[matches.length - 1] ?? null;
}

function findCsv() {
  const files = fs.readdirSync(DOWNLOADS).filter(f => /^flow_projects_/.test(f) && f.endsWith('.csv'));
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(DOWNLOADS, f), 'utf-8'));
    if (data.length < 2) continue;
    // Primeira linha que tem "Tecnologia" puro como board
    for (let i = 1; i < data.length; i++) {
      if (data[i]?.[2] === TARGET) return { file: f, rows: data.length };
    }
  }
  return null;
}

function log(...a) { console.log(...a); }

async function main() {
  // Verifica se ja existe
  const boards = await api('/boards');
  if (boards.find(b => b.name === TARGET && !b.isArchived)) {
    log('Board "' + TARGET + '" ja existe. Aborta.');
    process.exit(1);
  }

  // ===== FASE 2: cria board do template =====
  const tplInfo = findTemplate();
  if (!tplInfo) {
    log('Template nao encontrado em ' + DOWNLOADS);
    process.exit(1);
  }
  log('Template: ' + tplInfo.file);
  log('Colunas: ' + tplInfo.tpl.columns.length);

  const newBoard = await api('/boards', {
    method: 'POST',
    body: JSON.stringify({ name: TARGET, description: null }),
  });
  log('Board criado: ' + newBoard.id);

  const detail = await api('/boards/' + newBoard.id);
  for (const dl of detail.lists || []) {
    await api('/lists/' + dl.id, { method: 'PATCH', body: JSON.stringify({ isArchived: true }) });
  }
  log('Defaults arquivadas: ' + (detail.lists || []).length);

  let pos = 1024;
  for (const col of tplInfo.tpl.columns) {
    const created = await api('/lists', {
      method: 'POST',
      body: JSON.stringify({ name: col.name, boardId: newBoard.id }),
    });
    await api('/lists/' + created.id, {
      method: 'PATCH',
      body: JSON.stringify({
        position: pos,
        isFinalList: col.isFinalList,
        isBacklog: col.isBacklog,
      }),
    });
    log('  + ' + col.name + ' @ ' + pos + (col.isFinalList ? ' [FINAL]' : '') + (col.isBacklog ? ' [BACKLOG]' : ''));
    pos += 1024;
  }

  // ===== FASE 3: importa CSV =====
  const csvInfo = findCsv();
  if (!csvInfo) {
    log('CSV de Tecnologia nao encontrado, pulando import de cards.');
    return;
  }
  log('\nCSV: ' + csvInfo.file + ' (' + csvInfo.rows + ' rows)');

  const csvContent = fs.readFileSync(path.join(DOWNLOADS, csvInfo.file), 'utf-8');

  // Preview pra pegar membros e listas detectadas
  const preview = await api('/admin/import/ummense-flow/preview', {
    method: 'POST',
    body: JSON.stringify({ csv: csvContent, boardId: newBoard.id }),
  });
  log('  preview: ' + (preview.totalRows ?? 0) + ' cards');

  // Mapeia members
  const members = {};
  for (const m of preview.members || []) {
    const candidate = m.candidate?.id ?? MEMBER_MAP[m.name] ?? null;
    if (candidate) members[m.name] = { type: 'existing', userId: candidate };
  }

  // Mapeia listas — cria as que faltarem
  const lists = {};
  for (const l of preview.lists || []) {
    if (l.candidate?.id) {
      lists[l.name] = { type: 'existing', listId: l.candidate.id, completedAtPolicy: 'preserve' };
    } else {
      lists[l.name] = { type: 'create', completedAtPolicy: 'preserve' };
    }
  }

  const start = Date.now();
  const result = await api('/admin/import/ummense-flow', {
    method: 'POST',
    body: JSON.stringify({
      csv: csvContent,
      boardId: newBoard.id,
      members,
      lists,
      labels: {},
      contacts: {},
      dryRun: false,
    }),
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log(`  OK em ${elapsed}s: criados=${result.created} linked=${result.linkedToFlow} pulados=${result.skipped} anotacoes=${result.importedAnnotations}`);
  if (result.warnings?.length) log('  warnings: ' + result.warnings.length);
  if (result.errors?.length) log('  ERROS: ' + result.errors.length);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
