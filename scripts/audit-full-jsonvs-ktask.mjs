#!/usr/bin/env node
// Auditoria FULL da migração Ummense → KTask.
//
// Compara o JSON ORIGINAL de 10k tarefas com o estado atual do KTask.
// Verifica por card e por task:
//   - Existência de card (shortCode = ticket Ummense)
//   - Existência de cada task (match por texto normalizado no card)
//   - Divergência em assigneeId / dueDate / priority / isDone / recurrence
//   - Extras (items no KTask sem match no JSON)
//
// Estratégia: 1 snapshot SQL via SSH traz todos os items de uma vez
// (rápido, ~1min) → compara em memória → faz PATCH só em divergências
// usando regra conservadora (só preenche campos VAZIOS no KTask).
//
// Modo `--apply=true` (default agora) aplica patches.
// State em tarefas-md/full-audit-state.json (suporta resume).
// Relatório final em tarefas-md/full-audit-report.json.

import fs from 'node:fs';
import { execSync } from 'node:child_process';

const API = 'https://api.ktask.agenciakharis.com.br/api/v1';
const SSH_KEY = `${process.env.HOME}/.ssh/ktask-deploy`;
const SSH_HOST = 'root@178.104.220.28';
const SOURCE = 'C:/Users/NoteBook1/Downloads/ummense-tasks-extraction (4).json';
const STATE_PATH = 'tarefas-md/full-audit-state.json';
const REPORT_PATH = 'tarefas-md/full-audit-report.json';
const OPERATOR_PHONE = '5531993767301';
const APPLY = !process.argv.includes('--dry-run');

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
    await sleep(700);
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
function mapRecurrence(repeat) {
  if (!repeat) return null;
  const PERIOD = { days: 'DAILY', weeks: 'WEEKLY', months: 'MONTHLY', years: 'YEARLY' };
  if (typeof repeat === 'string') {
    const freq = PERIOD[repeat];
    return freq ? { freq, interval: 1 } : null;
  }
  if (typeof repeat === 'object' && repeat.period) {
    const freq = PERIOD[repeat.period];
    if (!freq) return null;
    const interval = Math.max(1, Number(repeat.interval) || 1);
    const out = { freq, interval };
    if (Array.isArray(repeat.repeatDays) && repeat.repeatDays.length > 0 && freq === 'WEEKLY') {
      out.weekdays = repeat.repeatDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    }
    return out;
  }
  return null;
}
const norm = (s) => (s ?? '').toString().slice(0, 500).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ====== STEP 1: snapshot SQL ======
// Passa SQL via stdin pra evitar escape hell de double-quotes (que
// se comportava diferente em Git Bash vs bash linux quando o script
// rodava detached via PowerShell).
console.log('[step 1] snapshot SQL via SSH...');
const SQL = `SELECT c."shortCode" || '|' || ci.id || '|' ||
  COALESCE(ci."assigneeId", '') || '|' ||
  COALESCE(to_char(ci."dueDate" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '') || '|' ||
  COALESCE(ci.priority::text, '') || '|' ||
  ci."isDone"::text || '|' ||
  COALESCE(ci.recurrence::text, '') || '|' ||
  LOWER(TRIM(ci.text))
FROM "Card" c
JOIN "Checklist" cl ON cl."cardId" = c.id AND LOWER(cl.title) = 'tarefas'
JOIN "ChecklistItem" ci ON ci."checklistId" = cl.id;`;
const sshCmd = `ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no ${SSH_HOST} 'docker exec -i ktask-postgres psql -U ktask -d ktask -At -X'`;
const BASH = fs.existsSync('C:/Program Files/Git/bin/bash.exe')
  ? 'C:/Program Files/Git/bin/bash.exe'
  : 'bash';
const raw = execSync(sshCmd, { input: SQL, encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024, shell: BASH });
const rows = raw.split('\n').filter(Boolean);
console.log(`  ${rows.length} items no banco`);

// Index: byShortCode[code] = [{id, assigneeId, dueDate, priority, isDone, recurrence, textNorm}]
const byShortCode = new Map();
const allItemIds = new Set();
for (const r of rows) {
  const parts = r.split('|');
  if (parts.length < 8) continue;
  const [shortCode, id, assigneeId, dueDate, priority, isDone, recurrenceStr, ...rest] = parts;
  // text pode conter '|' — junta o resto
  const textNorm = rest.join('|');
  let recurrence = null;
  if (recurrenceStr) {
    try { recurrence = JSON.parse(recurrenceStr); } catch {}
  }
  const item = {
    id,
    assigneeId: assigneeId || null,
    dueDate: dueDate || null,
    priority: priority || null,
    isDone: isDone === 't',
    recurrence,
    textNorm,
  };
  if (!byShortCode.has(shortCode)) byShortCode.set(shortCode, []);
  byShortCode.get(shortCode).push(item);
  allItemIds.add(id);
}
console.log(`  ${byShortCode.size} cards distintos`);

// ====== STEP 2: carrega JSON ======
console.log('[step 2] carregando JSON original...');
const data = JSON.parse(fs.readFileSync(SOURCE, 'utf-8'));
let totalCardsJson = 0, totalTasksJson = 0;
for (const arr of Object.values(data)) {
  if (!Array.isArray(arr)) continue;
  totalCardsJson += arr.length;
  for (const c of arr) totalTasksJson += c.tasks?.length ?? 0;
}
console.log(`  ${totalCardsJson} cards · ${totalTasksJson} tasks`);

// ====== STEP 3: state ======
function loadState() {
  if (fs.existsSync(STATE_PATH)) {
    try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')); } catch {}
  }
  return {
    startedAt: new Date().toISOString(),
    finishedAt: null,
    processedKeys: [], // chaves "ticket|index" das tasks JSON processadas
    cardsAusentes: [],
    tasksAusentes: [],
    divergencias: [], // { ticket, itemId, text, field, expected, actual, patched: bool }
    errors: [],
    matchedItemIds: [], // ids do KTask que tiveram match
    runs: 0,
  };
}
function saveState(s) { s.lastUpdated = new Date().toISOString(); fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2)); }
const state = loadState();
state.runs++;
const processedSet = new Set(state.processedKeys);
const matchedItems = new Set(state.matchedItemIds);
console.log(`[state] run #${state.runs}, ${processedSet.size} chaves já processadas`);

if (state.runs === 1) {
  await sendWhats(`[KTask full-audit] iniciando. ${totalCardsJson} cards / ${totalTasksJson} tasks. Apply=${APPLY}`);
}

await login();
saveState(state);

// ====== STEP 4: comparação ======
let processed = 0;
for (const [board, arr] of Object.entries(data)) {
  if (!Array.isArray(arr)) continue;
  for (const card of arr) {
    const items = byShortCode.get(card.ticket);
    if (!items) {
      // só registra uma vez
      if (!state.cardsAusentes.find((x) => x.ticket === card.ticket)) {
        state.cardsAusentes.push({ ticket: card.ticket, name: card.name, board });
      }
      // marca todas as tasks como processadas (não há item pra comparar)
      for (let i = 0; i < (card.tasks?.length ?? 0); i++) {
        processedSet.add(`${card.ticket}|${i}`);
      }
      continue;
    }

    for (let i = 0; i < (card.tasks?.length ?? 0); i++) {
      const key = `${card.ticket}|${i}`;
      if (processedSet.has(key)) continue;
      const t = card.tasks[i];
      processed++;
      if (processed % 200 === 0) {
        console.log(`  [${processedSet.size + processed}/${totalTasksJson}] divergencias=${state.divergencias.length} patched=${state.divergencias.filter(d => d.patched).length} cardsAusentes=${state.cardsAusentes.length}`);
        state.processedKeys = [...processedSet, ...Array.from({ length: 0 }, () => null)]; // placeholder
        state.processedKeys = [...processedSet];
        state.matchedItemIds = [...matchedItems];
        saveState(state);
      }

      const target = norm(t.name);
      const ktaskItem = items.find((it) => it.textNorm === target);
      if (!ktaskItem) {
        state.tasksAusentes.push({ ticket: card.ticket, cardName: card.name, text: t.name });
        processedSet.add(key);
        continue;
      }
      matchedItems.add(ktaskItem.id);

      const expected = {
        assigneeId: resolveAssignee(t.userName),
        dueDate: t.dueDate ? toIso(t.dueDate) : null,
        priority: mapPriority(t.priority),
        isDone: !!t.completedAt,
        recurrence: mapRecurrence(t.repeat),
      };

      const divs = [];
      // assigneeId: divergência se JSON tem valor E KTask não, OU se diferentes
      if (expected.assigneeId && expected.assigneeId !== ktaskItem.assigneeId) {
        divs.push({ field: 'assigneeId', expected: expected.assigneeId, actual: ktaskItem.assigneeId });
      }
      // dueDate
      if (expected.dueDate && expected.dueDate !== ktaskItem.dueDate) {
        divs.push({ field: 'dueDate', expected: expected.dueDate, actual: ktaskItem.dueDate });
      }
      // priority
      if (expected.priority && expected.priority !== ktaskItem.priority) {
        divs.push({ field: 'priority', expected: expected.priority, actual: ktaskItem.priority });
      }
      // isDone: só vai de false→true
      if (expected.isDone && !ktaskItem.isDone) {
        divs.push({ field: 'isDone', expected: true, actual: false });
      }
      // recurrence: compara JSON shallow
      const expRecStr = expected.recurrence ? JSON.stringify(expected.recurrence) : null;
      const actRecStr = ktaskItem.recurrence ? JSON.stringify(ktaskItem.recurrence) : null;
      if (expRecStr && expRecStr !== actRecStr) {
        divs.push({ field: 'recurrence', expected: expected.recurrence, actual: ktaskItem.recurrence });
      }

      if (divs.length === 0) {
        processedSet.add(key);
        continue;
      }

      // Decide patch (regra conservadora: só preenche vazios)
      const patch = {};
      for (const d of divs) {
        if (d.field === 'assigneeId' && !ktaskItem.assigneeId) patch.assigneeId = d.expected;
        if (d.field === 'dueDate' && !ktaskItem.dueDate) patch.dueDate = d.expected;
        if (d.field === 'priority' && !ktaskItem.priority) patch.priority = d.expected;
        if (d.field === 'isDone' && !ktaskItem.isDone && d.expected === true) patch.isDone = true;
        if (d.field === 'recurrence' && !ktaskItem.recurrence) patch.recurrence = d.expected;
      }

      let patched = false;
      if (APPLY && Object.keys(patch).length > 0) {
        try {
          await api(`/checklists/items/${ktaskItem.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
          patched = true;
          // atualiza em memória pra não re-patchar em re-runs
          for (const k of Object.keys(patch)) ktaskItem[k] = patch[k];
        } catch (e) {
          state.errors.push({ ticket: card.ticket, itemId: ktaskItem.id, text: t.name?.slice(0, 60), err: e.message.slice(0, 200) });
        }
      }

      for (const d of divs) {
        state.divergencias.push({
          ticket: card.ticket,
          itemId: ktaskItem.id,
          text: t.name?.slice(0, 80),
          field: d.field,
          expected: d.expected,
          actual: d.actual,
          patched: patched && patch[d.field] !== undefined,
        });
      }
      processedSet.add(key);
    }
  }
}

state.processedKeys = [...processedSet];
state.matchedItemIds = [...matchedItems];

// ====== STEP 5: extras ======
const extras = [];
for (const [shortCode, items] of byShortCode) {
  for (const it of items) {
    if (!matchedItems.has(it.id)) extras.push({ ticket: shortCode, itemId: it.id, text: it.textNorm.slice(0, 80) });
  }
}

state.finishedAt = new Date().toISOString();
saveState(state);

// Counts
const counts = { assigneeId: 0, dueDate: 0, priority: 0, isDone: 0, recurrence: 0 };
const patched = { assigneeId: 0, dueDate: 0, priority: 0, isDone: 0, recurrence: 0 };
for (const d of state.divergencias) {
  counts[d.field] = (counts[d.field] ?? 0) + 1;
  if (d.patched) patched[d.field] = (patched[d.field] ?? 0) + 1;
}

const report = {
  startedAt: state.startedAt,
  finishedAt: state.finishedAt,
  totalCardsJson, totalTasksJson,
  cardsAusentes: state.cardsAusentes,
  tasksAusentes: state.tasksAusentes.length,
  tasksAusentesSample: state.tasksAusentes.slice(0, 50),
  divergenciasTotal: state.divergencias.length,
  divergenciasByField: counts,
  patchesApplied: patched,
  extras: extras.length,
  extrasSample: extras.slice(0, 50),
  errors: state.errors.length,
  errorList: state.errors,
  apply: APPLY,
  runs: state.runs,
};
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

console.log('\n========== RELATÓRIO ==========');
console.log('Cards ausentes no KTask:    ', state.cardsAusentes.length);
console.log('Tasks ausentes no KTask:    ', state.tasksAusentes.length);
console.log('Divergências:               ', state.divergencias.length);
for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}  (patched: ${patched[k]})`);
console.log('Extras (no KTask, sem JSON):', extras.length);
console.log('Erros:                      ', state.errors.length);
console.log('Relatório:                  ', REPORT_PATH);

await sendWhats(
  `[KTask full-audit] CONCLUÍDO (apply=${APPLY})\n` +
    `Cards ausentes: ${state.cardsAusentes.length}\n` +
    `Tasks ausentes: ${state.tasksAusentes.length}\n` +
    `Divergências: ${state.divergencias.length}\n` +
    `  assignee: ${counts.assigneeId} (patched ${patched.assigneeId})\n` +
    `  dueDate: ${counts.dueDate} (${patched.dueDate})\n` +
    `  priority: ${counts.priority} (${patched.priority})\n` +
    `  isDone: ${counts.isDone} (${patched.isDone})\n` +
    `  recurrence: ${counts.recurrence} (${patched.recurrence})\n` +
    `Extras: ${extras.length}\n` +
    `Erros: ${state.errors.length}\n\nRelatório: ${REPORT_PATH}`,
);
