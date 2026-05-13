#!/usr/bin/env node
// Etapa 2 da migração Ummense → KTask: reconciliação de items que JÁ
// existiam no KTask quando o import-delta-double-check rodou. Pra cada
// item do JSON delta, compara com o estado atual no KTask e faz PATCH
// onde houver divergência em assigneeId, dueDate, priority ou isDone.
//
// Otimização: agrupa por card (ticket) pra fazer 1 GET por card em vez
// de 1 GET por item.
//
// State file: tarefas-md/reconcile-state.json (suporta resume).
// Report:     tarefas-md/reconcile-report.json
// Notifica via WhatsApp ao final.

import fs from 'node:fs';

const API = 'https://api.ktask.agenciakharis.com.br/api/v1';
const DELTA_JSON = 'C:/Users/NoteBook1/Downloads/ummense-tasks-extraction-delta.json';
const REPORT_BASE = 'tarefas-md/delta-import-1778629017620.json';
const STATE_PATH = 'tarefas-md/reconcile-state.json';
const REPORT_PATH = 'tarefas-md/reconcile-report.json';
const OPERATOR_PHONE = '5531993767301';

function readEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const ops = readEnv('.env.ops');
const apiEnv = readEnv('apps/api/.env');

let TOKEN;
async function login() {
  const r = await fetch(API + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ops.KTASK_BOT_EMAIL, password: ops.KTASK_BOT_PASSWORD }),
  });
  if (!r.ok) throw new Error('login: ' + r.status);
  TOKEN = (await r.json()).accessToken;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(ep, opts = {}, retries = 4) {
  for (let i = 0; i <= retries; i++) {
    const r = await fetch(API + ep, {
      ...opts,
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
    });
    if (r.status === 401) { await login(); continue; }
    if (r.status === 429 && i < retries) { await sleep((i + 1) * 6000); continue; }
    if ([502, 503, 504].includes(r.status) && i < retries) { await sleep(8000); continue; }
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`${r.status} ${ep}: ${(await r.text()).slice(0, 200)}`);
    await sleep(1000);
    return r.json();
  }
}

async function sendWhats(text) {
  const URL = apiEnv.EVOLUTION_DEFAULT_URL, KEY = apiEnv.EVOLUTION_DEFAULT_API_KEY, INST = apiEnv.EVOLUTION_DEFAULT_INSTANCE;
  if (!URL || !KEY || !INST) return;
  try {
    await fetch(`${URL}/message/sendText/${INST}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ number: OPERATOR_PHONE, text }),
    });
  } catch {}
}

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
function resolveAssignee(name) {
  if (!name) return null;
  if (MEMBER_MAP[name]) return MEMBER_MAP[name];
  return MEMBER_MAP[name.trim().split(/\s+/)[0]] ?? null;
}
function mapPriority(p) {
  if (!p) return null;
  const u = p.toUpperCase();
  return ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(u) ? u : null;
}
function toIso(d) {
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(d)) {
    return new Date(d.replace(' ', 'T') + '-03:00').toISOString();
  }
  return d;
}
const norm = (s) => (s ?? '').toString().slice(0, 500).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ===== Carrega expected do JSON delta, agrupado por ticket =====
const data = JSON.parse(fs.readFileSync(DELTA_JSON, 'utf-8'));
const expectedByTicket = new Map(); // ticket → Map<normText, {assigneeId, dueDate, priority, isDone}>
let totalExpected = 0;
for (const arr of Object.values(data)) {
  if (!Array.isArray(arr)) continue;
  for (const c of arr) {
    const m = new Map();
    for (const t of c.tasks ?? []) {
      m.set(norm(t.name), {
        assigneeId: resolveAssignee(t.userName),
        dueDate: t.dueDate ? toIso(t.dueDate) : null,
        priority: mapPriority(t.priority),
        isDone: !!t.completedAt,
      });
      totalExpected++;
    }
    if (m.size > 0) expectedByTicket.set(c.ticket, m);
  }
}
console.log(`[setup] ${expectedByTicket.size} cards · ${totalExpected} tasks no JSON delta`);

// ===== Filtra apenas tickets que tinham items "já existiam" no relatório =====
const reportBase = JSON.parse(fs.readFileSync(REPORT_BASE, 'utf-8'));
const ticketsToReconcile = new Set();
for (const it of reportBase.itemsAlreadyExisted ?? []) ticketsToReconcile.add(it.ticket);
console.log(`[scope] ${ticketsToReconcile.size} cards têm items 'já existiam' a reconciliar`);

// ===== State =====
function loadState() {
  if (fs.existsSync(STATE_PATH)) {
    try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')); } catch {}
  }
  return {
    startedAt: new Date().toISOString(),
    finishedAt: null,
    processedTickets: [], // tickets concluídos
    patches: [], // [{ticket, itemId, text, changes:{...}}]
    errors: [],
    runs: 0,
  };
}
function saveState(s) {
  s.lastUpdated = new Date().toISOString();
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

const state = loadState();
state.runs++;
const processedSet = new Set(state.processedTickets);
const pending = [...ticketsToReconcile].filter((t) => !processedSet.has(t));
console.log(`[state] run #${state.runs}. processados=${processedSet.size}, pendentes=${pending.length}`);

if (state.runs === 1) {
  await sendWhats(`[KTask reconcile] iniciando. ${ticketsToReconcile.size} cards. ETA ~${Math.round(ticketsToReconcile.size * 3 / 60)}min.`);
}

await login();
saveState(state);

// ===== Loop principal =====
let processed = 0;
for (const ticket of pending) {
  processed++;
  if (processed % 25 === 0) {
    console.log(`  [${processedSet.size + processed}/${ticketsToReconcile.size}] patches=${state.patches.length} err=${state.errors.length}`);
    saveState(state);
  }
  try {
    const ref = await api('/cards/by-code/' + encodeURIComponent(ticket));
    if (!ref?.id) { state.processedTickets.push(ticket); continue; }
    const detail = await api('/cards/' + ref.id);
    const checklist = (detail?.checklists ?? []).find((c) => norm(c.title) === 'tarefas');
    if (!checklist) { state.processedTickets.push(ticket); continue; }
    const expected = expectedByTicket.get(ticket);
    if (!expected) { state.processedTickets.push(ticket); continue; }

    for (const item of checklist.items ?? []) {
      const exp = expected.get(norm(item.text));
      if (!exp) continue; // item KTask que não está no JSON — não toca

      const patch = {};
      // assigneeId: só atualiza se KTask está vazio E JSON tem (não sobrescreve manual)
      if (exp.assigneeId && !item.assigneeId) patch.assigneeId = exp.assigneeId;
      // dueDate: só atualiza se KTask está vazio E JSON tem (não sobrescreve)
      if (exp.dueDate && !item.dueDate) patch.dueDate = exp.dueDate;
      // priority: só atualiza se KTask está vazio E JSON tem
      if (exp.priority && !item.priority) patch.priority = exp.priority;
      // isDone: só marca como done se JSON diz done E KTask diz não-done
      // (não desmarca — evita reverter conclusão manual posterior)
      if (exp.isDone && !item.isDone) patch.isDone = true;

      if (Object.keys(patch).length === 0) continue;

      try {
        await api(`/checklists/items/${item.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
        state.patches.push({ ticket, itemId: item.id, text: item.text.slice(0, 80), changes: patch });
      } catch (e) {
        state.errors.push({ ticket, itemId: item.id, text: item.text.slice(0, 60), err: e.message.slice(0, 200) });
      }
    }
    state.processedTickets.push(ticket);
  } catch (e) {
    state.errors.push({ ticket, err: e.message.slice(0, 200) });
    state.processedTickets.push(ticket); // não tenta de novo no resume
  }
}

state.finishedAt = new Date().toISOString();
saveState(state);

const report = {
  startedAt: state.startedAt,
  finishedAt: state.finishedAt,
  totalCards: ticketsToReconcile.size,
  totalProcessed: state.processedTickets.length,
  totalPatches: state.patches.length,
  errors: state.errors.length,
  runs: state.runs,
  patches: state.patches,
  errorList: state.errors,
};
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

// breakdown por tipo de patch
const counts = { assigneeId: 0, dueDate: 0, priority: 0, isDone: 0 };
for (const p of state.patches) for (const k of Object.keys(p.changes)) counts[k] = (counts[k] ?? 0) + 1;

console.log('\n========== RELATÓRIO ==========');
console.log('Cards processados:', state.processedTickets.length);
console.log('Patches aplicados:', state.patches.length);
for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
console.log('Erros:            ', state.errors.length);
console.log('Relatório:        ', REPORT_PATH);

await sendWhats(
  `[KTask reconcile] CONCLUÍDO\n` +
    `Cards: ${state.processedTickets.length}/${ticketsToReconcile.size}\n` +
    `Patches: ${state.patches.length}\n` +
    `  assignee: ${counts.assigneeId}\n  dueDate: ${counts.dueDate}\n  priority: ${counts.priority}\n  isDone: ${counts.isDone}\n` +
    `Erros: ${state.errors.length}\n\nRelatório: ${REPORT_PATH}`,
);
