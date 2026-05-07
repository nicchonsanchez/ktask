#!/usr/bin/env node
// Doc 42: Reset completo do KTask alinhado aos templates Ummense.
//
// FASE 1: Apaga TODOS os boards exceto "Tecnologia" (delete-all cascade)
// FASE 2: Cria boards a partir dos JSONs de template, com colunas na
//         ordem certa e flags isFinalList/isBacklog corretos
// FASE 3: Importa cards de cada CSV pro board correspondente, mapeando
//         lists por nome (existing) em vez de criar novas
//
// Uso: TOKEN=<jwt> node scripts/nuke-and-reimport.mjs

import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.ktask.agenciakharis.com.br/api/v1';
const TOKEN = process.env.TOKEN;
if (!TOKEN) { console.error('Env TOKEN obrigatorio.'); process.exit(1); }

const DOWNLOADS = 'C:/Users/NoteBook1/Downloads/';
const PRESERVE = new Set(['Tecnologia']); // Nao apagar
const CSV_CUTOFF = new Date('2026-05-06T18:00:00').getTime();

// 8 usuarios mapeados pra Org KTask (do membersAdmin)
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

const BOARD_RENAMES = {
  // Sanitiza nomes com '|' que confundem com multi-fluxo
  'Executivo de contas | FÁBIO MACHADO': 'Executivo de contas - Fábio Machado',
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

const norm = (s) => (s ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

function loadTemplates() {
  const files = fs.readdirSync(DOWNLOADS).filter(f => /^flow_2026050[67]/.test(f) && f.endsWith('.json'));
  const map = new Map();
  for (const f of files) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(DOWNLOADS, f), 'utf-8'));
      const name = d.name;
      if (!name) continue;
      const cols = (d.columns || [])
        .filter(c => c.name && c.name.trim()) // ignora colunas com nome vazio (caso Gestao Interna)
        .slice()
        .sort((a, b) => a.position - b.position)
        .map(c => ({
          name: c.name,
          isFinalList: c.is_final === 1,
          isBacklog: c.is_backlog === 1,
          description: c.description ?? null,
        }));
      const finalName = BOARD_RENAMES[name] ?? name;
      map.set(finalName, { name: finalName, color: d.color, columns: cols });
    } catch (e) {}
  }
  return map;
}

function loadCsvs() {
  const files = fs.readdirSync(DOWNLOADS)
    .filter(f => f.startsWith('flow_projects_'))
    .filter(f => fs.statSync(path.join(DOWNLOADS, f)).mtimeMs >= CSV_CUTOFF);
  return files.map(f => ({
    file: f,
    csv: fs.readFileSync(path.join(DOWNLOADS, f), 'utf-8'),
  }));
}

function detectBoardFromCsv(csv) {
  try {
    const parsed = JSON.parse(csv);
    const counts = new Map();
    for (const row of parsed.slice(1)) {
      const fluxos = (row[2] ?? '').trim();
      if (!fluxos || fluxos.includes('|')) continue;
      counts.set(fluxos, (counts.get(fluxos) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (sorted[0]) return sorted[0][0];
    // Fallback: nome unico (mesmo com '|')
    const all = new Set();
    for (const row of parsed.slice(1)) {
      const f = (row[2] ?? '').trim();
      if (f) all.add(f);
    }
    if (all.size === 1) return [...all][0];
    return null;
  } catch { return null; }
}

function isCsvEmpty(csv) {
  try {
    const parsed = JSON.parse(csv);
    return parsed.length <= 1 || (parsed.length === 2 && !parsed[1].some((c) => c));
  } catch { return true; }
}

(async () => {
  const log = (...args) => console.log(...args);
  const sep = (msg) => log('\n========== ' + msg + ' ==========');

  // ================ FASE 1: NUKE ================
  sep('FASE 1: APAGA BOARDS (exceto Tecnologia)');
  const initialBoards = await api('/boards');
  log('Total atual: ' + initialBoards.length);
  let deleted = 0;
  for (const b of initialBoards) {
    if (PRESERVE.has(b.name)) {
      log('  PRESERVANDO: ' + b.name);
      continue;
    }
    try {
      await api('/boards/' + b.id + '/delete', {
        method: 'POST',
        body: JSON.stringify({ strategy: 'delete-all' }),
      });
      log('  DELETADO: ' + b.name);
      deleted++;
    } catch (e) {
      log('  ERRO ao deletar ' + b.name + ': ' + e.message);
    }
  }
  log('\nBoards deletados: ' + deleted);

  // ================ FASE 2: CRIA BOARDS DOS TEMPLATES ================
  sep('FASE 2: CRIA BOARDS A PARTIR DOS TEMPLATES');
  const templates = loadTemplates();
  log('Templates carregados: ' + templates.size);

  const createdBoards = new Map(); // name -> { id, lists: [{ id, name, position, isFinal, isBacklog }] }

  for (const [name, tpl] of templates) {
    if (PRESERVE.has(name)) {
      log('  SKIP ' + name + ' (preservado)');
      continue;
    }
    try {
      log('\n[' + name + '] (' + tpl.columns.length + ' colunas)');
      const newBoard = await api('/boards', {
        method: 'POST',
        body: JSON.stringify({ name, description: null }),
      });
      log('  Board ID: ' + newBoard.id);

      // Pega listas default (3 listas auto-criadas: A Fazer, Fazendo, Concluído)
      const detail = await api('/boards/' + newBoard.id);
      const defaults = detail.lists || [];
      log('  Default lists: ' + defaults.map(l => l.name).join(', '));

      // Cria as colunas do template em ordem
      // Estrategia: arquivar defaults primeiro pra ficarem fora do caminho.
      for (const dl of defaults) {
        try {
          await api('/lists/' + dl.id, { method: 'PATCH', body: JSON.stringify({ isArchived: true }) });
        } catch (e) {
          log('  WARN arquivar default ' + dl.name + ': ' + e.message);
        }
      }

      const newLists = [];
      let pos = 1024;
      for (const col of tpl.columns) {
        try {
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
          const flagInfo = [col.isFinalList ? 'FINAL' : null, col.isBacklog ? 'BACKLOG' : null].filter(Boolean).join(',');
          log('  + ' + col.name + ' @ ' + pos + (flagInfo ? ' [' + flagInfo + ']' : ''));
          newLists.push({ id: created.id, name: col.name, position: pos, isFinalList: col.isFinalList, isBacklog: col.isBacklog });
          pos += 1024;
        } catch (e) {
          log('  ERRO ao criar coluna ' + col.name + ': ' + e.message);
        }
      }
      createdBoards.set(name, { id: newBoard.id, lists: newLists });
    } catch (e) {
      log('  FATAL ' + name + ': ' + e.message);
    }
  }
  log('\nBoards criados: ' + createdBoards.size);

  // ================ FASE 3: IMPORTA CARDS DOS CSVs ================
  sep('FASE 3: IMPORTA CARDS DOS CSVs');
  const csvs = loadCsvs();
  log('CSVs encontrados: ' + csvs.length);

  const results = [];
  for (const { file, csv } of csvs) {
    log('\n[' + file + ']');
    if (isCsvEmpty(csv)) {
      log('  VAZIO, pula');
      continue;
    }
    const detectedRaw = detectBoardFromCsv(csv);
    if (!detectedRaw) {
      log('  Nao consegui detectar board, pula');
      continue;
    }
    const boardName = BOARD_RENAMES[detectedRaw] ?? detectedRaw;
    log('  Detectado: "' + detectedRaw + '"' + (boardName !== detectedRaw ? ' -> "' + boardName + '"' : ''));

    const boardData = createdBoards.get(boardName);
    if (!boardData) {
      log('  Board nao encontrado entre os criados, pula');
      results.push({ file, board: boardName, error: 'board nao encontrado' });
      continue;
    }

    // Preview pra pegar a lista de columns/members do CSV
    let preview;
    try {
      preview = await api('/admin/import/ummense-flow/preview', {
        method: 'POST',
        body: JSON.stringify({ csv, boardId: boardData.id }),
      });
    } catch (e) {
      log('  ERRO preview: ' + e.message);
      results.push({ file, board: boardName, error: 'preview: ' + e.message });
      continue;
    }
    log('  preview: ' + preview.totalRows + ' cards, ' + preview.members.length + ' membros, ' + preview.lists.length + ' colunas no CSV');

    // Members mapping
    const members = {};
    for (const m of preview.members) members[m.sourceName] = MEMBER_MAP[m.sourceName] ?? null;

    // Lists mapping: tenta match por nome com listas EXISTENTES; senao cria nova
    const lists = {};
    for (const pl of preview.lists) {
      const matched = boardData.lists.find(l => norm(l.name) === norm(pl.sourceName));
      if (matched) {
        lists[pl.sourceName] = { type: 'existing', listId: matched.id };
      } else {
        // Cria nova ao final do board
        lists[pl.sourceName] = { type: 'create', name: pl.sourceName };
      }
    }

    try {
      const t0 = Date.now();
      const report = await api('/admin/import/ummense-flow/execute', {
        method: 'POST',
        body: JSON.stringify({ csv, boardId: boardData.id, members, lists }),
      });
      const dur = ((Date.now() - t0) / 1000).toFixed(1);
      log('  OK em ' + dur + 's: criados=' + report.created + ' linked=' + report.linkedToFlow + ' pulados=' + report.skipped + ' anotacoes=' + report.importedAnnotations);
      results.push({ file, board: boardName, report });
    } catch (e) {
      log('  ERRO execute: ' + e.message);
      results.push({ file, board: boardName, error: 'execute: ' + e.message });
    }
  }

  // ================ RELATORIO ================
  sep('RELATORIO FINAL');
  const totals = { created: 0, linked: 0, errors: 0, annotations: 0 };
  for (const r of results) {
    if (r.report) {
      totals.created += r.report.created;
      totals.linked += r.report.linkedToFlow;
      totals.errors += r.report.errors.length;
      totals.annotations += r.report.importedAnnotations;
    } else if (r.error) {
      totals.errors++;
    }
  }
  log('Boards criados:  ' + createdBoards.size);
  log('CSVs importados: ' + results.filter(r => r.report).length + '/' + csvs.length);
  log('Cards criados:   ' + totals.created);
  log('Cards linkados:  ' + totals.linked);
  log('Anotacoes:       ' + totals.annotations);
  log('Erros:           ' + totals.errors);

  const reportFile = path.join(process.cwd(), 'tarefas-md', '42-nuke-reimport-' + Date.now() + '.json');
  fs.writeFileSync(reportFile, JSON.stringify({ deleted, createdBoards: [...createdBoards.keys()], results, totals }, null, 2));
  log('\nRelatorio detalhado: ' + reportFile);
})().catch(e => { console.error('FATAL: ' + e.message); console.error(e.stack); process.exit(1); });
