#!/usr/bin/env node
// Cronograma final dos 13 cards (caminho B - sem overlap, com pausas):
//   - Sequencia cronologica por horario do ultimo commit
//   - Pausas naturais (sono 8h, almoco 1h, jantar 1h)
//   - 33h15min trabalhadas em 2 dias e 5h (11/05 22:23 -> 14/05 03:38)
//   - Ponto fixo: #64 termina 14/05 03:38 (= ultimo commit real)
//
// Faz 2 coisas:
//   1. Gera scripts/move-history-tecnologia-v2.sql com:
//      - UPDATE Activity (3 moves/card) com novos timestamps
//      - UPDATE Card.createdAt = "A fazer" timestamp
//      - UPDATE Card.completedAt = "Finalizado" timestamp
//   2. Cria 13 TimeEntries via POST /time-entries (manual, source=TIMER)
//      attribuidas ao user Nicchon
//
// Uso: node scripts/seed-tecnologia-cards-timer.mjs

import fs from 'node:fs';

const API = 'https://api.ktask.agenciakharis.com.br/api/v1';
const SQL_OUT = 'scripts/move-history-tecnologia-v2.sql';
const NICCHON_USER_ID = 'cmod1pix00000o2aup3a6l23h'; // do MEMBER_MAP

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let TOKEN = process.env.TOKEN;
async function login() {
  if (TOKEN) return;
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
  if (!r.ok) throw new Error('login: ' + r.status);
  TOKEN = (await r.json()).accessToken;
}

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
    let b;
    try { b = t ? JSON.parse(t) : null; } catch { b = t; }
    if (r.status === 429 && attempt < retries) {
      await sleep([1000, 3000, 8000][attempt]);
      continue;
    }
    if (!r.ok) {
      throw new Error(`${r.status} ${opts.method || 'GET'} ${ep}: ${typeof b === 'object' ? b?.message : b}`);
    }
    await sleep(120);
    return b;
  }
}

// Cronograma V3 (freela noturno): sem jantar, almoco de 10min, 2 sonos de 8h.
// Span: 12/05 02:03 -> 14/05 03:38 (~49h35), 33h15 trabalhadas.
const SCHEDULE = [
  { shortCode: '73', durMin: 60,  aFazer: '2026-05-12T01:58:00-03:00', emAndamento: '2026-05-12T02:03:00-03:00', finalizado: '2026-05-12T03:03:00-03:00' },
  // sono 12/05 03:03 -> 11:03 (8h)
  { shortCode: '66', durMin: 240, aFazer: '2026-05-12T10:58:00-03:00', emAndamento: '2026-05-12T11:03:00-03:00', finalizado: '2026-05-12T15:03:00-03:00' },
  // almoco 12/05 15:03 -> 15:13 (10min)
  { shortCode: '67', durMin: 120, aFazer: '2026-05-12T15:08:00-03:00', emAndamento: '2026-05-12T15:13:00-03:00', finalizado: '2026-05-12T17:13:00-03:00' },
  { shortCode: '72', durMin: 30,  aFazer: '2026-05-12T17:08:00-03:00', emAndamento: '2026-05-12T17:13:00-03:00', finalizado: '2026-05-12T17:43:00-03:00' },
  { shortCode: '70', durMin: 120, aFazer: '2026-05-12T17:38:00-03:00', emAndamento: '2026-05-12T17:43:00-03:00', finalizado: '2026-05-12T19:43:00-03:00' },
  { shortCode: '71', durMin: 45,  aFazer: '2026-05-12T19:38:00-03:00', emAndamento: '2026-05-12T19:43:00-03:00', finalizado: '2026-05-12T20:28:00-03:00' },
  { shortCode: '68', durMin: 240, aFazer: '2026-05-12T20:23:00-03:00', emAndamento: '2026-05-12T20:28:00-03:00', finalizado: '2026-05-13T00:28:00-03:00' },
  { shortCode: '69', durMin: 180, aFazer: '2026-05-13T00:23:00-03:00', emAndamento: '2026-05-13T00:28:00-03:00', finalizado: '2026-05-13T03:28:00-03:00' },
  // sono 13/05 03:28 -> 11:28 (8h) + almoco 11:28 -> 11:38 (10min)
  { shortCode: '65', durMin: 300, aFazer: '2026-05-13T11:33:00-03:00', emAndamento: '2026-05-13T11:38:00-03:00', finalizado: '2026-05-13T16:38:00-03:00' },
  { shortCode: '61', durMin: 240, aFazer: '2026-05-13T16:33:00-03:00', emAndamento: '2026-05-13T16:38:00-03:00', finalizado: '2026-05-13T20:38:00-03:00' },
  { shortCode: '62', durMin: 150, aFazer: '2026-05-13T20:33:00-03:00', emAndamento: '2026-05-13T20:38:00-03:00', finalizado: '2026-05-13T23:08:00-03:00' },
  { shortCode: '63', durMin: 180, aFazer: '2026-05-13T23:03:00-03:00', emAndamento: '2026-05-13T23:08:00-03:00', finalizado: '2026-05-14T02:08:00-03:00' },
  { shortCode: '64', durMin: 90,  aFazer: '2026-05-14T02:03:00-03:00', emAndamento: '2026-05-14T02:08:00-03:00', finalizado: '2026-05-14T03:38:00-03:00' },
];

const TARGET_BOARD = 'Tecnologia';
const LIST_NAMES = {
  afazer: 'A fazer',
  emandamento: 'Em andamento',
  finalizado: 'Finalizado',
};

function fmtPg(iso) {
  return `'${new Date(iso).toISOString()}'`;
}

async function main() {
  await login();

  // 1. Descobre boardId e listIds
  const boards = await api('/boards');
  const board = boards.find((b) => b.name === TARGET_BOARD);
  if (!board) throw new Error(`Board "${TARGET_BOARD}" nao encontrado`);

  const detail = await api('/boards/' + board.id);
  const findList = (name) => detail.lists.find((l) => l.name === name);
  const lists = {
    afazer: findList(LIST_NAMES.afazer),
    emandamento: findList(LIST_NAMES.emandamento),
    finalizado: findList(LIST_NAMES.finalizado),
  };
  for (const [k, l] of Object.entries(lists)) {
    if (!l) throw new Error(`Lista "${LIST_NAMES[k]}" nao encontrada`);
  }
  console.log(`[list] A fazer = ${lists.afazer.id}`);
  console.log(`[list] Em andamento = ${lists.emandamento.id}`);
  console.log(`[list] Finalizado = ${lists.finalizado.id}\n`);

  // 2. Indexa cards do board por shortCode
  const byCode = new Map();
  for (const l of detail.lists) {
    for (const c of l.cards ?? []) {
      if (c.shortCode) byCode.set(String(c.shortCode), c);
    }
  }

  // 3. Gera SQL pra atualizar timestamps das Activities + Card.createdAt/completedAt
  const sqlLines = [];
  sqlLines.push('-- Cronograma V2: cards Tecnologia (#61..#73)');
  sqlLines.push('-- Caminho B: sequencial sem overlap, pausas naturais inseridas');
  sqlLines.push('-- Gerado em ' + new Date().toISOString());
  sqlLines.push('BEGIN;');
  sqlLines.push('');

  const created = [];
  for (const s of SCHEDULE) {
    const card = byCode.get(s.shortCode);
    if (!card) {
      console.log(`[skip] card #${s.shortCode} nao encontrado`);
      continue;
    }

    sqlLines.push(`-- #${s.shortCode}: ${card.title}`);
    sqlLines.push(`UPDATE "Activity" SET "createdAt" = ${fmtPg(s.aFazer)} WHERE "cardId" = '${card.id}' AND type = 'CARD_MOVED' AND payload->>'toListId' = '${lists.afazer.id}';`);
    sqlLines.push(`UPDATE "Activity" SET "createdAt" = ${fmtPg(s.emAndamento)} WHERE "cardId" = '${card.id}' AND type = 'CARD_MOVED' AND payload->>'toListId' = '${lists.emandamento.id}';`);
    sqlLines.push(`UPDATE "Activity" SET "createdAt" = ${fmtPg(s.finalizado)} WHERE "cardId" = '${card.id}' AND type = 'CARD_MOVED' AND payload->>'toListId' = '${lists.finalizado.id}';`);
    sqlLines.push(`UPDATE "Card" SET "createdAt" = ${fmtPg(s.aFazer)}, "completedAt" = ${fmtPg(s.finalizado)} WHERE id = '${card.id}';`);
    sqlLines.push('');

    created.push({ shortCode: s.shortCode, cardId: card.id, ...s });
  }

  sqlLines.push('COMMIT;');
  fs.writeFileSync(SQL_OUT, sqlLines.join('\n'));
  console.log(`SQL gerado em: ${SQL_OUT}\n`);

  // 4. Deleta TimeEntries pre-existentes do user Nicchon em cada card
  console.log('Limpando TimeEntries existentes:');
  for (const c of created) {
    try {
      const entries = await api(`/cards/${c.cardId}/time`);
      const minhas = (Array.isArray(entries) ? entries : []).filter(
        (e) => e.userId === NICCHON_USER_ID,
      );
      for (const e of minhas) {
        await api(`/time-entries/${e.id}`, { method: 'DELETE' });
      }
      if (minhas.length > 0) {
        console.log(`  [del] #${c.shortCode}: ${minhas.length} entry(s) removida(s)`);
      }
    } catch (e) {
      console.error(`  [erro del] #${c.shortCode}: ${e.message}`);
    }
  }
  console.log('');

  // 5. Cria TimeEntries novas via API
  console.log('Criando TimeEntries:');
  for (const c of created) {
    try {
      const entry = await api('/time-entries', {
        method: 'POST',
        body: JSON.stringify({
          cardId: c.cardId,
          userId: NICCHON_USER_ID,
          startedAt: new Date(c.emAndamento).toISOString(),
          endedAt: new Date(c.finalizado).toISOString(),
          note: `Trabalho registrado retroativo (${c.durMin}min)`,
        }),
      });
      console.log(`  [ok] #${c.shortCode}: TimeEntry ${entry.id} (${c.durMin}min)`);
    } catch (e) {
      console.error(`  [erro] #${c.shortCode}: ${e.message}`);
    }
  }

  console.log('\nProximo: rodar o SQL via scripts/ops/_apply-move-history-v2.py');
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
