#!/usr/bin/env node
// Audita TODOS os tickets exportados nos CSVs flow_projects_*.csv do
// Ummense contra o KTask. Pra cada ticket, faz GET /cards/by-code/:ticket
// e identifica os ausentes. Suporta resume via state file.
//
// Output:
//   - tarefas-md/audit-cards-state.json (state, atualizado a cada 25)
//   - tarefas-md/audit-cards-missing.json (relatório final)
//
// Ao terminar, manda WhatsApp pro operador via Evolution API.
//
// Uso: node scripts/audit-cards-vs-csv.mjs

import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.ktask.agenciakharis.com.br/api/v1';
const CSV_DIR = 'C:/Users/NoteBook1/Downloads';
const STATE_PATH = 'tarefas-md/audit-cards-state.json';
const REPORT_PATH = 'tarefas-md/audit-cards-missing.json';
const OPERATOR_PHONE = '5531993767301';

// ===== ENV =====
function readEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const opsEnv = readEnv('.env.ops');
const apiEnv = readEnv('apps/api/.env');
const EVO_URL = apiEnv.EVOLUTION_DEFAULT_URL;
const EVO_KEY = apiEnv.EVOLUTION_DEFAULT_API_KEY;
const EVO_INSTANCE = apiEnv.EVOLUTION_DEFAULT_INSTANCE;

// ===== AUTH =====
let TOKEN;
async function login() {
  const r = await fetch(API + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: opsEnv.KTASK_BOT_EMAIL, password: opsEnv.KTASK_BOT_PASSWORD }),
  });
  if (!r.ok) throw new Error('login: ' + r.status);
  TOKEN = (await r.json()).accessToken;
  console.log('[auth] OK');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(ep, retries = 4) {
  for (let i = 0; i <= retries; i++) {
    const r = await fetch(API + ep, {
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    });
    if (r.status === 401) { await login(); continue; }
    if (r.status === 429 && i < retries) { await sleep((i + 1) * 6000); continue; }
    if ([502, 503, 504].includes(r.status) && i < retries) { await sleep(10000); continue; }
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`${r.status} ${ep}: ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }
}

async function sendWhats(text) {
  if (!EVO_URL || !EVO_KEY || !EVO_INSTANCE) {
    console.warn('[whats] config Evolution ausente, pulando');
    return false;
  }
  try {
    const r = await fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
      body: JSON.stringify({ number: OPERATOR_PHONE, text }),
    });
    if (!r.ok) { console.warn('[whats]', r.status, (await r.text()).slice(0, 200)); return false; }
    console.log('[whats] OK:', text.slice(0, 80));
    return true;
  } catch (e) {
    console.warn('[whats] erro:', e.message);
    return false;
  }
}

// ===== CSVs → ticket list (dedup) =====
function loadTickets() {
  const files = fs
    .readdirSync(CSV_DIR)
    .filter((f) => f.startsWith('flow_projects_') && f.endsWith('.csv'))
    .sort();
  const map = new Map();
  let totalRows = 0;
  for (const f of files) {
    const raw = fs.readFileSync(path.join(CSV_DIR, f), 'utf-8');
    let data;
    try { data = JSON.parse(raw); } catch { continue; }
    if (!Array.isArray(data) || data.length < 2) continue;
    const header = data[0];
    const idxNome = header.indexOf('Nome');
    const idxId = header.indexOf('Identificador');
    const idxFluxo = header.indexOf('Fluxos');
    const idxCol = header.indexOf('Coluna atual');
    for (const row of data.slice(1)) {
      totalRows++;
      const ticket = String(row[idxId] ?? '').trim();
      if (!ticket) continue;
      // last-wins: arquivos mais recentes (sort asc) sobrescrevem com info atualizada
      map.set(ticket, {
        ticket,
        name: row[idxNome],
        board: row[idxFluxo],
        column: row[idxCol],
        sourceCsv: f,
      });
    }
  }
  const list = [...map.values()].sort((a, b) => a.ticket.localeCompare(b.ticket));
  console.log(`[csv] ${files.length} arquivos · ${totalRows} linhas · ${list.length} tickets únicos`);
  return list;
}

// ===== STATE =====
function loadState() {
  if (fs.existsSync(STATE_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
    } catch {}
  }
  return {
    startedAt: new Date().toISOString(),
    lastUpdated: null,
    finishedAt: null,
    checkedTickets: [],
    missing: [], // [{ticket,name,board,column,sourceCsv}]
    foundCount: 0,
    errors: [],
    runs: 0,
  };
}
function saveState(s) {
  s.lastUpdated = new Date().toISOString();
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

// ===== MAIN =====
const tickets = loadTickets();
const state = loadState();
state.runs++;
const checkedSet = new Set(state.checkedTickets);
const pending = tickets.filter((t) => !checkedSet.has(t.ticket));
console.log(`[state] run #${state.runs}. já checados=${checkedSet.size}, pendentes=${pending.length}`);

if (state.runs === 1) {
  await sendWhats(`[KTask audit] iniciando. ${tickets.length} tickets dos CSVs vs KTask. ETA ~${Math.round((tickets.length * 1.3) / 60)}min.`);
}

await login();
saveState(state);

for (let i = 0; i < pending.length; i++) {
  const t = pending[i];
  try {
    const ref = await api('/cards/by-code/' + encodeURIComponent(t.ticket));
    if (ref?.id) {
      state.foundCount++;
    } else {
      state.missing.push(t);
    }
    state.checkedTickets.push(t.ticket);
  } catch (e) {
    state.errors.push({ ticket: t.ticket, err: e.message.slice(0, 200) });
  }
  await sleep(1200);
  if ((i + 1) % 25 === 0) {
    const checked = state.checkedTickets.length;
    console.log(`  [${checked}/${tickets.length}] found=${state.foundCount} missing=${state.missing.length} err=${state.errors.length}`);
    saveState(state);
  }
}

state.finishedAt = new Date().toISOString();
saveState(state);

// ===== REPORT =====
const report = {
  startedAt: state.startedAt,
  finishedAt: state.finishedAt,
  totalTicketsCsv: tickets.length,
  totalChecked: state.checkedTickets.length,
  foundInKtask: state.foundCount,
  missingInKtask: state.missing.length,
  errors: state.errors.length,
  runs: state.runs,
  missing: state.missing,
  errorList: state.errors,
};
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

console.log('\n========== RELATÓRIO ==========');
console.log('CSVs (tickets únicos):     ', tickets.length);
console.log('Existem no KTask:          ', state.foundCount);
console.log('AUSENTES no KTask:         ', state.missing.length);
console.log('Erros:                     ', state.errors.length);
console.log('Relatório salvo em:        ', REPORT_PATH);

// Resumo por board pros ausentes
const byBoard = {};
for (const m of state.missing) {
  const k = m.board || '(sem board)';
  byBoard[k] = (byBoard[k] ?? 0) + 1;
}
let breakdown = Object.entries(byBoard)
  .sort(([, a], [, b]) => b - a)
  .map(([b, n]) => `  ${b}: ${n}`)
  .join('\n');

await sendWhats(
  `[KTask audit] CONCLUÍDO\n` +
    `Tickets CSVs: ${tickets.length}\n` +
    `Encontrados no KTask: ${state.foundCount}\n` +
    `AUSENTES: ${state.missing.length}\n` +
    `Erros: ${state.errors.length}\n` +
    `Runs (resume): ${state.runs}\n\n` +
    `Ausentes por board:\n${breakdown || '(nenhum)'}\n\n` +
    `Relatório completo: ${REPORT_PATH}`,
);
