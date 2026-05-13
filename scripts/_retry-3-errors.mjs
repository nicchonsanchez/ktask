#!/usr/bin/env node
// Retry dos 3 items que falharam com 500 no import delta double-check.
// Pra cada um: GET card → GET detail → procura "Tarefas" checklist →
//   tenta achar item pelo texto. Se NÃO existe, cria. Se existe e não
//   está done, PATCH isDone=true.

import fs from 'node:fs';

const API = 'https://api.ktask.agenciakharis.com.br/api/v1';

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
    throw new Error(`${r.status} ${ep}: ${t.slice(0, 400)}`);
  }
  await sleep(800);
  return r.json();
}

const MEMBER_MAP = {
  'Maciana Ferreira Silva': 'cmodbh8xa000lmk6za9bw9x2e',
  'Maciana Ferreira': 'cmodbh8xa000lmk6za9bw9x2e',
  'Fernanda Biazatti': 'cmodbh8vt0006mk6zhcxhzta7',
  Fernanda: 'cmodbh8vt0006mk6zhcxhzta7',
};
const norm = (s) => (s ?? '').toString().slice(0, 500).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const toIso = (d) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(d) ? new Date(d.replace(' ', 'T') + '-03:00').toISOString() : d;

const TARGETS = [
  { ticket: '20250527001376', text: 'Aprovar arte', userName: 'Maciana Ferreira Silva', completedAt: '2025-06-11 16:10:35', dueDate: '2025-06-09 00:00:00', priority: 'HIGH' },
  { ticket: '20250821003082', text: 'Fazer briefing', userName: 'Fernanda Biazatti', completedAt: '2025-08-22 11:02:34', dueDate: '2025-08-22 00:00:00', priority: 'HIGH' },
  { ticket: '20251010003516', text: 'Aprovar copy', userName: 'Maciana Ferreira Silva', completedAt: '2025-10-23 15:34:30', dueDate: '2025-10-10 00:00:00', priority: 'HIGH' },
];

await login();

const results = [];
for (const t of TARGETS) {
  console.log(`\n=== ${t.ticket} "${t.text}" ===`);
  try {
    const ref = await api(`/cards/by-code/${encodeURIComponent(t.ticket)}`);
    if (!ref?.id) throw new Error('card not found');
    const detail = await api(`/cards/${ref.id}`);
    const checklist = (detail?.checklists ?? []).find((c) => norm(c.title) === 'tarefas');
    if (!checklist) throw new Error('checklist "Tarefas" não existe no card');
    const existing = (checklist.items ?? []).find((i) => norm(i.text) === norm(t.text));

    if (existing) {
      console.log(`  já existe id=${existing.id} isDone=${existing.isDone}`);
      if (!existing.isDone && t.completedAt) {
        await api(`/checklists/items/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ isDone: true }) });
        console.log(`  → marcado como done`);
        results.push({ ticket: t.ticket, text: t.text, action: 'patched-done', id: existing.id });
      } else {
        results.push({ ticket: t.ticket, text: t.text, action: 'already-ok', id: existing.id });
      }
    } else {
      const item = await api(`/checklists/${checklist.id}/items`, {
        method: 'POST',
        body: JSON.stringify({
          text: t.text,
          assigneeId: MEMBER_MAP[t.userName] ?? null,
          dueDate: t.dueDate ? toIso(t.dueDate) : null,
          priority: t.priority,
        }),
      });
      console.log(`  criado id=${item.id}`);
      if (t.completedAt) {
        await api(`/checklists/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ isDone: true }) });
        console.log(`  → marcado como done`);
      }
      results.push({ ticket: t.ticket, text: t.text, action: 'created', id: item.id });
    }
  } catch (e) {
    console.error(`  [ERRO] ${e.message}`);
    results.push({ ticket: t.ticket, text: t.text, action: 'failed', err: e.message.slice(0, 300) });
  }
}

console.log('\n===== RESULTADO =====');
console.log(JSON.stringify(results, null, 2));
