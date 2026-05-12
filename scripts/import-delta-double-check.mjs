#!/usr/bin/env node
// Importer com double-check: pra cada task do delta JSON, GET o card no
// KTask AGORA (estado atual, nao snapshot) e verifica por texto se ja
// existe. Se nao existe → cria. Se existe → anota em "falsos delta"
// (snapshot ficou stale entre delta + import, ou texto sutilmente
// diferente que o norm() emparelhou). Reporta lista pro user revisar.
//
// Uso: node scripts/import-delta-double-check.mjs

import fs from 'node:fs';

const API = 'https://api.ktask.agenciakharis.com.br/api/v1';
const SOURCE = 'C:/Users/NoteBook1/Downloads/ummense-tasks-extraction-delta.json';

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
    await sleep(1200);
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
function resolveAssignee(name) {
  if (!name) return null;
  if (MEMBER_MAP[name]) return MEMBER_MAP[name];
  const first = name.trim().split(/\s+/)[0];
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
const norm = (s) => (s ?? '').toString().slice(0, 500).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

await login();
const data = JSON.parse(fs.readFileSync(SOURCE, 'utf-8'));
let totalCards = 0, totalTasks = 0;
for (const arr of Object.values(data)) {
  if (!Array.isArray(arr)) continue;
  totalCards += arr.length;
  for (const c of arr) totalTasks += c.tasks?.length ?? 0;
}
console.log(`Delta: ${totalCards} cards · ${totalTasks} tasks`);

const stats = {
  cardsProcessed: 0,
  cardsNotFound: [],
  checklistsCreated: 0,
  itemsCreated: 0,
  itemsCompleted: 0,
  itemsAlreadyExisted: [], // <-- LISTA QUE O USER PEDIU
  errors: [],
};

for (const [board, arr] of Object.entries(data)) {
  if (!Array.isArray(arr) || arr.length === 0) continue;
  console.log(`\n=== ${board} (${arr.length} cards) ===`);
  for (const card of arr) {
    stats.cardsProcessed++;
    if (stats.cardsProcessed % 25 === 0) {
      console.log(`  [${stats.cardsProcessed}/${totalCards}] criados=${stats.itemsCreated} ja-existia=${stats.itemsAlreadyExisted.length} err=${stats.errors.length}`);
    }
    try {
      const ref = await api('/cards/by-code/' + encodeURIComponent(card.ticket));
      if (!ref?.id) {
        stats.cardsNotFound.push({ ticket: card.ticket, name: card.name });
        continue;
      }
      const detail = await api('/cards/' + ref.id);
      let checklist = (detail?.checklists ?? []).find((cl) => norm(cl.title) === 'tarefas');
      if (!checklist) {
        checklist = await api('/checklists', {
          method: 'POST', body: JSON.stringify({ cardId: ref.id, title: 'Tarefas' }),
        });
        stats.checklistsCreated++;
      }
      const existingTexts = new Set((checklist.items ?? []).map((i) => norm(i.text)));
      const sorted = [...card.tasks].sort((a, b) => (a.positionProject ?? 0) - (b.positionProject ?? 0));
      for (const t of sorted) {
        const textNorm = norm(t.name);
        if (existingTexts.has(textNorm)) {
          // Já existe no card — anota e pula (não duplica)
          stats.itemsAlreadyExisted.push({
            ticket: card.ticket,
            cardName: card.name,
            text: t.name,
            isDone: !!t.completedAt,
          });
          continue;
        }
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
          existingTexts.add(textNorm);
          if (t.completedAt) {
            await api(`/checklists/items/${item.id}`, {
              method: 'PATCH', body: JSON.stringify({ isDone: true }),
            });
            stats.itemsCompleted++;
          }
        } catch (e) {
          stats.errors.push({ ticket: card.ticket, text: t.name?.slice(0, 60), err: e.message.slice(0, 200) });
        }
      }
    } catch (e) {
      stats.errors.push({ ticket: card.ticket, err: e.message.slice(0, 200) });
    }
  }
}

console.log('\n========== RELATÓRIO ==========');
console.log('Cards processados:                ', stats.cardsProcessed);
console.log('Cards não encontrados:            ', stats.cardsNotFound.length);
console.log('Checklists "Tarefas" novas:       ', stats.checklistsCreated);
console.log('Items criados:                    ', stats.itemsCreated);
console.log('Items marcados done:              ', stats.itemsCompleted);
console.log('Items que já existiam (snapshot stale ou texto sutil): ', stats.itemsAlreadyExisted.length);
console.log('Erros:                            ', stats.errors.length);

const reportPath = `tarefas-md/delta-import-${Date.now()}.json`;
fs.writeFileSync(reportPath, JSON.stringify(stats, null, 2));
console.log('\nRelatório completo salvo em:', reportPath);
if (stats.itemsAlreadyExisted.length > 0) {
  console.log(`\nLista de items que JÁ EXISTIAM (snapshot stale) está no JSON acima — ver campo "itemsAlreadyExisted".`);
}
