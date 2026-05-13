#!/usr/bin/env node
// Importa as tasks dos 2 cards recém-criados (shortCode #48 e #49)
// que estavam ausentes na migração inicial. Lê do JSON delta original.

import fs from 'node:fs';

const API = 'https://api.ktask.agenciakharis.com.br/api/v1';
const SOURCE = 'C:/Users/NoteBook1/Downloads/ummense-tasks-extraction-delta.json';

// Mapeamento ticket Ummense → id KTask (cards recém-criados)
const MAP = {
  '20240610000998': 'cmp3j0tgb000bqh074e3b28nt', // PARÓQUIA.SITE - SANTO DO DIA
  '20241004001820': 'cmp3j0tzk000fqh0795uhladl', // CARD PERMANENTE | Atualização de plugins
};

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
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(ep, opts = {}) {
  const r = await fetch(API + ep, {
    ...opts,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${r.status} ${ep}: ${t.slice(0, 300)}`);
  }
  await sleep(1200);
  return r.json();
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

await login();
const data = JSON.parse(fs.readFileSync(SOURCE, 'utf-8'));

// Acha entries dos 2 tickets em qualquer board
const targets = [];
for (const [board, arr] of Object.entries(data)) {
  if (!Array.isArray(arr)) continue;
  for (const c of arr) {
    if (MAP[c.ticket]) targets.push({ ...c, _board: board, _cardId: MAP[c.ticket] });
  }
}
console.log(`[scan] encontrei ${targets.length} card(s) alvo no delta JSON`);

const stats = { created: 0, done: 0, errors: [] };
for (const c of targets) {
  console.log(`\n→ ${c.ticket} "${c.name}" (board=${c._board}, tasks=${c.tasks?.length ?? 0})`);
  // cria checklist Tarefas
  const checklist = await api('/checklists', {
    method: 'POST', body: JSON.stringify({ cardId: c._cardId, title: 'Tarefas' }),
  });
  console.log(`  [checklist] id=${checklist.id}`);
  const sorted = [...(c.tasks ?? [])].sort((a, b) => (a.positionProject ?? 0) - (b.positionProject ?? 0));
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
      stats.created++;
      console.log(`    [+] ${t.name?.slice(0, 60)}`);
      if (t.completedAt) {
        await api(`/checklists/items/${item.id}`, {
          method: 'PATCH', body: JSON.stringify({ isDone: true }),
        });
        stats.done++;
      }
    } catch (e) {
      stats.errors.push({ ticket: c.ticket, text: t.name?.slice(0, 60), err: e.message.slice(0, 200) });
      console.error(`    [err] ${t.name?.slice(0, 60)}: ${e.message.slice(0, 100)}`);
    }
  }
}

console.log('\n===== RESULTADO =====');
console.log('Tasks criadas:', stats.created);
console.log('Marcadas done:', stats.done);
console.log('Erros:        ', stats.errors.length);
if (stats.errors.length) console.log(JSON.stringify(stats.errors, null, 2));
