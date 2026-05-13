#!/usr/bin/env node
// Cria os 2 cards ausentes detectados pelo audit-cards-vs-csv:
//   - PARÓQUIA.SITE - SANTO DO DIA
//   - CARD PERMANENTE | Atualização de plugins
// Ambos em Tecnologia / Backlog.
//
// Via POST /cards (shortCode auto-gerado, perde ticket Ummense original).

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
async function api(ep, opts = {}) {
  const r = await fetch(API + ep, {
    ...opts,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${r.status} ${ep}: ${t.slice(0, 300)}`);
  }
  return r.json();
}

await login();

// 1. Descobre boardId do "Tecnologia"
const boards = await api('/boards');
const tec = boards.find((b) => b.name?.toLowerCase() === 'tecnologia');
if (!tec) {
  console.error('Boards disponíveis:', boards.map((b) => b.name));
  throw new Error('Board "Tecnologia" não encontrado');
}
console.log(`[board] Tecnologia = ${tec.id}`);

// 2. Lista listas, acha "Backlog"
const detail = await api('/boards/' + tec.id);
const lists = detail.lists ?? [];
const backlog = lists.find((l) => l.name?.toLowerCase() === 'backlog');
if (!backlog) {
  console.error('Listas:', lists.map((l) => l.name));
  throw new Error('Lista "Backlog" não encontrada em Tecnologia');
}
console.log(`[list] Backlog = ${backlog.id}`);

// 3. Cria os 2 cards
const toCreate = [
  { title: 'PARÓQUIA.SITE - SANTO DO DIA', ummenseTicket: '20240610000998' },
  { title: 'CARD PERMANENTE | Atualização de plugins', ummenseTicket: '20241004001820' },
];

const results = [];
for (const c of toCreate) {
  // Confere se não foi criado entre a auditoria e agora (manualmente, etc).
  const dup = await fetch(`${API}/cards?boardId=${tec.id}`, {
    headers: { Authorization: 'Bearer ' + TOKEN },
  }).then((r) => r.json()).catch(() => null);
  const already = Array.isArray(dup) ? dup.find((x) => x.title === c.title) : null;
  if (already) {
    console.log(`[skip] "${c.title}" já existe com shortCode #${already.shortCode} (id=${already.id})`);
    results.push({ ...c, action: 'skipped', existingId: already.id, existingShortCode: already.shortCode });
    continue;
  }

  const created = await api('/cards', {
    method: 'POST',
    body: JSON.stringify({
      listId: backlog.id,
      title: c.title,
      description: `Card migrado do Ummense (ticket original: ${c.ummenseTicket}). Estava ausente na migração inicial — detectado via audit-cards-vs-csv em ${new Date().toISOString().slice(0, 10)}.`,
    }),
  });
  console.log(`[ok] criado "${c.title}": id=${created.id}, shortCode=#${created.shortCode}`);
  results.push({ ...c, action: 'created', newId: created.id, newShortCode: created.shortCode });
}

console.log('\n===== RESULTADO =====');
console.log(JSON.stringify(results, null, 2));
