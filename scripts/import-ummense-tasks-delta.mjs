#!/usr/bin/env node
// Importer SMART: cruza items existentes no banco (snapshot SQL) com
// JSON Ummense, processa SO cards com diff. Pula completamente cards
// 100% completos — sem GET desperdiçado.
//
// Uso: node scripts/import-ummense-tasks-delta.mjs

import fs from 'node:fs';
import { execSync } from 'node:child_process';

const API = 'https://api.ktask.agenciakharis.com.br/api/v1';
const SSH_KEY = `${process.env.HOME}/.ssh/ktask-deploy`;
const SSH_HOST = 'root@178.104.220.28';

const env = {};
for (const line of fs.readFileSync('.env.ops', 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

let TOKEN;
async function login() {
  const r = await fetch(API + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.KTASK_BOT_EMAIL, password: env.KTASK_BOT_PASSWORD }),
  });
  if (!r.ok) throw new Error('login: ' + r.status);
  TOKEN = (await r.json()).accessToken;
  console.log('[auth] OK');
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
    if ([502, 503, 504].includes(r.status) && i < retries) { await sleep(10000); continue; }
    if (r.status === 404) return null;
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`${r.status} ${ep}: ${t.slice(0, 200)}`);
    }
    await sleep(1000);
    return r.json();
  }
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
function resolveAssignee(userName) {
  if (!userName) return null;
  if (MEMBER_MAP[userName]) return MEMBER_MAP[userName];
  const first = userName.trim().split(/\s+/)[0];
  return MEMBER_MAP[first] ?? null;
}
function mapPriority(p) {
  if (!p) return undefined;
  const u = p.toUpperCase();
  return ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(u) ? u : undefined;
}
function toIso(d) {
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(d)) {
    return new Date(d.replace(' ', 'T') + '-03:00').toISOString();
  }
  return d;
}
const norm = (s) => (s ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ============ STEP 1: snapshot SQL ============
console.log('[snapshot] baixando items existentes do banco via SSH...');
const sshCmd = `ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no ${SSH_HOST} "docker exec ktask-postgres psql -U ktask -d ktask -At -c \\"SELECT c.\\\\\\"shortCode\\\\\\" || '|' || LOWER(TRIM(it.text)) FROM \\\\\\"Card\\\\\\" c JOIN \\\\\\"Checklist\\\\\\" cl ON cl.\\\\\\"cardId\\\\\\" = c.id AND LOWER(cl.title) = 'tarefas' JOIN \\\\\\"ChecklistItem\\\\\\" it ON it.\\\\\\"checklistId\\\\\\" = cl.id\\""`;
const raw = execSync(sshCmd, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, shell: 'bash' });
const existing = new Set(raw.split('\n').filter(Boolean));
console.log(`[snapshot] ${existing.size} items existentes no banco`);

// ============ STEP 2: diff ============
const data = JSON.parse(fs.readFileSync('C:/Users/NoteBook1/Downloads/ummense-tasks-extraction (4).json', 'utf-8'));
const cardsToProcess = []; // { ticket, name, board, newTasks: [...] }
let totalTasksJson = 0;
let totalNew = 0;
for (const [board, arr] of Object.entries(data)) {
  if (!Array.isArray(arr)) continue;
  for (const c of arr) {
    const newTasks = [];
    for (const t of c.tasks ?? []) {
      totalTasksJson++;
      const key = `${c.ticket}|${norm(t.name)}`;
      if (!existing.has(key)) {
        newTasks.push(t);
        totalNew++;
      }
    }
    if (newTasks.length > 0) cardsToProcess.push({ ticket: c.ticket, name: c.name, board, newTasks });
  }
}
console.log(`[diff] JSON: ${totalTasksJson} tasks. Faltantes: ${totalNew} em ${cardsToProcess.length} cards`);

// ============ STEP 3: processar ============
await login();

const stats = {
  cardsProcessed: 0,
  cardsNotFound: 0,
  checklistsCreated: 0,
  itemsCreated: 0,
  itemsCompleted: 0,
  errors: 0,
};

for (const card of cardsToProcess) {
  stats.cardsProcessed++;
  if (stats.cardsProcessed % 25 === 0) {
    console.log(`  ${stats.cardsProcessed}/${cardsToProcess.length} — items+${stats.itemsCreated} done+${stats.itemsCompleted} err+${stats.errors}`);
  }
  try {
    const ref = await api('/cards/by-code/' + encodeURIComponent(card.ticket));
    if (!ref?.id) { stats.cardsNotFound++; continue; }
    const detail = await api('/cards/' + ref.id);
    let checklist = (detail?.checklists ?? []).find((cl) => norm(cl.title) === 'tarefas');
    if (!checklist) {
      checklist = await api('/checklists', {
        method: 'POST', body: JSON.stringify({ cardId: ref.id, title: 'Tarefas' }),
      });
      stats.checklistsCreated++;
    }
    const sorted = [...card.newTasks].sort((a, b) => (a.positionProject ?? 0) - (b.positionProject ?? 0));
    for (const t of sorted) {
      try {
        const item = await api(`/checklists/${checklist.id}/items`, {
          method: 'POST',
          body: JSON.stringify({
            text: t.name?.slice(0, 500) || '(sem nome)',
            assigneeId: resolveAssignee(t.userName),
            dueDate: t.dueDate ? toIso(t.dueDate) : null,
            priority: mapPriority(t.priority),
          }),
        });
        stats.itemsCreated++;
        if (t.completedAt) {
          await api(`/checklists/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ isDone: true }) });
          stats.itemsCompleted++;
        }
      } catch (e) {
        stats.errors++;
        console.error(`  err "${t.name?.slice(0, 30)}": ${e.message.slice(0, 100)}`);
      }
    }
  } catch (e) {
    stats.errors++;
    console.error(`  card err ${card.ticket}: ${e.message.slice(0, 120)}`);
  }
}

console.log('\n========== RELATORIO ==========');
console.log('Cards processados:        ', stats.cardsProcessed);
console.log('  not found no KTask:     ', stats.cardsNotFound);
console.log('Checklists "Tarefas" novas:', stats.checklistsCreated);
console.log('Items criados:            ', stats.itemsCreated);
console.log('Items marcados done:      ', stats.itemsCompleted);
console.log('Erros:                    ', stats.errors);
fs.writeFileSync(`tarefas-md/delta-import-${Date.now()}.json`, JSON.stringify(stats, null, 2));
