#!/usr/bin/env node
// Lista as colunas (lists) do board Tecnologia. Ad-hoc.

import fs from 'node:fs';

const API = 'https://api.ktask.agenciakharis.com.br/api/v1';
const env = {};
for (const line of fs.readFileSync('.env.ops', 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const r = await fetch(API + '/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: env.KTASK_BOT_EMAIL, password: env.KTASK_BOT_PASSWORD }),
});
const TOKEN = (await r.json()).accessToken;

const boards = await fetch(API + '/boards', {
  headers: { Authorization: 'Bearer ' + TOKEN },
}).then((r) => r.json());
const tec = boards.find((b) => b.name === 'Tecnologia');

const detail = await fetch(API + '/boards/' + tec.id, {
  headers: { Authorization: 'Bearer ' + TOKEN },
}).then((r) => r.json());

console.log(`Board "Tecnologia" (${tec.id}) tem ${detail.lists.length} listas:\n`);
for (const l of detail.lists) {
  console.log(
    `  [${l.id}] ${l.name}${l.isBacklog ? ' (BACKLOG)' : ''}${l.isFinalList ? ' (FINAL)' : ''}${l.isArchived ? ' (ARCHIVED)' : ''} — ${l.cards?.length ?? 0} cards`,
  );
}
