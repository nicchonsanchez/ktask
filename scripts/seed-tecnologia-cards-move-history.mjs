#!/usr/bin/env node
// Move os 13 cards "KTask | ..." (shortCode #61..#73) por 3 colunas:
//   Backlog -> A fazer -> Em andamento -> Finalizado
//
// Cada move via API cria uma Activity tipo CARD_MOVED com createdAt=now().
// Pra simular hist rico real, este script GERA UM .sql que atualiza:
//   - "Activity"."createdAt" das 3 moves de cada card (via cardId + toListId)
//   - "Card"."createdAt" pra coincidir com "A fazer" (start do trabalho)
//
// Voc roda o SQL gerado na VM Hetzner:
//   ssh user@vm
//   psql -U ktask -d ktask -f /tmp/move-history.sql
//
// Hor rios usados (BRT -03:00):
//   Finalizado     = hor rio do  ltimo commit do agrupamento
//   Em andamento   = Finalizado - dura  o estimada da tarefa
//   A fazer        = Em andamento - 5 minutos
//
// Uso: node scripts/seed-tecnologia-cards-move-history.mjs

import fs from 'node:fs';

const API = 'https://api.ktask.agenciakharis.com.br/api/v1';
const SQL_OUT = 'scripts/move-history-tecnologia.sql';

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

// Dura  es estimadas por card (em minutos) -- baseado no escopo
// Tudo em BRT -03:00. finalizado = horario exato do  ltimo commit.
const CARDS = [
  { shortCode: '61', finalizado: '2026-05-14T02:59:00-03:00', duracaoMin: 240 }, // Central Ajuda estrutura - 4h
  { shortCode: '62', finalizado: '2026-05-14T03:00:00-03:00', duracaoMin: 150 }, // Formulario suporte - 2h30
  { shortCode: '63', finalizado: '2026-05-14T03:02:00-03:00', duracaoMin: 180 }, // 15 tutoriais - 3h
  { shortCode: '64', finalizado: '2026-05-14T03:38:00-03:00', duracaoMin: 90 },  // Polimento + SEO - 1h30
  { shortCode: '65', finalizado: '2026-05-13T23:19:00-03:00', duracaoMin: 300 }, // Doc tecnica - 5h
  { shortCode: '66', finalizado: '2026-05-13T13:00:00-03:00', duracaoMin: 240 }, // Tutorial PDF - 4h
  { shortCode: '67', finalizado: '2026-05-13T13:31:00-03:00', duracaoMin: 120 }, // Senha - 2h
  { shortCode: '68', finalizado: '2026-05-13T21:05:00-03:00', duracaoMin: 240 }, // CRM - 4h
  { shortCode: '69', finalizado: '2026-05-13T22:53:00-03:00', duracaoMin: 180 }, // Card unificacao - 3h
  { shortCode: '70', finalizado: '2026-05-13T15:14:00-03:00', duracaoMin: 120 }, // Import Ummense - 2h
  { shortCode: '71', finalizado: '2026-05-13T15:34:00-03:00', duracaoMin: 45 },  // Quadros arquivados - 45min
  { shortCode: '72', finalizado: '2026-05-13T14:44:00-03:00', duracaoMin: 30 },  // Aprovacoes templates - 30min
  { shortCode: '73', finalizado: '2026-05-13T00:43:00-03:00', duracaoMin: 60 },  // Ops backup - 1h
];

const TARGET_BOARD = 'Tecnologia';
const LIST_NAMES = {
  backlog: 'Backlog',
  afazer: 'A fazer',
  emandamento: 'Em andamento',
  finalizado: 'Finalizado',
};

function isoMinus(iso, mins) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - mins);
  return d.toISOString();
}

function fmtPg(iso) {
  // Postgres aceita ISO 8601 direto entre aspas.
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
    backlog: findList(LIST_NAMES.backlog),
    afazer: findList(LIST_NAMES.afazer),
    emandamento: findList(LIST_NAMES.emandamento),
    finalizado: findList(LIST_NAMES.finalizado),
  };
  for (const [k, l] of Object.entries(lists)) {
    if (!l) throw new Error(`Lista "${LIST_NAMES[k]}" nao encontrada`);
    console.log(`[list] ${LIST_NAMES[k]} = ${l.id}`);
  }
  console.log('');

  // 2. Indexa cards do board por shortCode
  const byCode = new Map();
  for (const l of detail.lists) {
    for (const c of l.cards ?? []) {
      if (c.shortCode) byCode.set(String(c.shortCode), c);
    }
  }

  // 3. Pra cada card: 3 moves via API + computa timestamps
  const sqlLines = [];
  sqlLines.push('-- Move history dos 13 cards Tecnologia (#61..#73)');
  sqlLines.push('-- Gerado em ' + new Date().toISOString());
  sqlLines.push('-- Rodar via: psql -U ktask -d ktask -f move-history-tecnologia.sql');
  sqlLines.push('BEGIN;');
  sqlLines.push('');

  const results = [];
  for (const c of CARDS) {
    const card = byCode.get(c.shortCode);
    if (!card) {
      console.log(`[skip] card #${c.shortCode} nao encontrado no board`);
      continue;
    }

    const finalizadoIso = new Date(c.finalizado).toISOString();
    const emAndamentoIso = isoMinus(c.finalizado, c.duracaoMin);
    const aFazerIso = isoMinus(c.finalizado, c.duracaoMin + 5);

    // Confere coluna atual: pode estar em Backlog (caso inicial)
    // ou ja em Finalizado (caso reexecucao parcial). Calcula caminho.
    let currentListId = card.listId;
    const moves = [];

    if (currentListId === lists.backlog.id) {
      moves.push(lists.afazer.id, lists.emandamento.id, lists.finalizado.id);
    } else if (currentListId === lists.afazer.id) {
      moves.push(lists.emandamento.id, lists.finalizado.id);
    } else if (currentListId === lists.emandamento.id) {
      moves.push(lists.finalizado.id);
    } else if (currentListId === lists.finalizado.id) {
      // Ja em Finalizado, presume que os 3 moves ja rolaram em alguma run anterior
      console.log(`[ok] #${c.shortCode} ja em Finalizado, so registra SQL`);
    } else {
      console.log(`[!] #${c.shortCode} em lista inesperada (${currentListId}); tentando rota completa`);
      moves.push(lists.afazer.id, lists.emandamento.id, lists.finalizado.id);
    }

    for (const toListId of moves) {
      await api(`/cards/${card.id}/move`, {
        method: 'PATCH',
        body: JSON.stringify({ toListId, afterCardId: null }),
      });
    }
    if (moves.length > 0) {
      console.log(`[ok] #${c.shortCode}: ${moves.length} move(s) feito(s)`);
    }

    // SQL pra esse card
    sqlLines.push(`-- #${c.shortCode}: ${card.title}`);
    sqlLines.push(`UPDATE "Activity" SET "createdAt" = ${fmtPg(aFazerIso)} WHERE "cardId" = '${card.id}' AND type = 'CARD_MOVED' AND payload->>'toListId' = '${lists.afazer.id}';`);
    sqlLines.push(`UPDATE "Activity" SET "createdAt" = ${fmtPg(emAndamentoIso)} WHERE "cardId" = '${card.id}' AND type = 'CARD_MOVED' AND payload->>'toListId' = '${lists.emandamento.id}';`);
    sqlLines.push(`UPDATE "Activity" SET "createdAt" = ${fmtPg(finalizadoIso)} WHERE "cardId" = '${card.id}' AND type = 'CARD_MOVED' AND payload->>'toListId' = '${lists.finalizado.id}';`);
    sqlLines.push(`UPDATE "Card" SET "createdAt" = ${fmtPg(aFazerIso)} WHERE id = '${card.id}';`);
    sqlLines.push('');

    results.push({
      shortCode: c.shortCode,
      cardId: card.id,
      aFazer: aFazerIso,
      emAndamento: emAndamentoIso,
      finalizado: finalizadoIso,
      duracaoMin: c.duracaoMin,
    });
  }

  sqlLines.push('COMMIT;');
  sqlLines.push('-- FIM. Total: ' + results.length + ' cards atualizados.');
  fs.writeFileSync(SQL_OUT, sqlLines.join('\n'));

  console.log(`\nSQL gerado em: ${SQL_OUT}`);
  console.log('\n===== RESUMO =====');
  for (const r of results) {
    console.log(`  #${r.shortCode} (${r.duracaoMin}min): A fazer ${r.aFazer.slice(0, 16)} | Em andamento ${r.emAndamento.slice(0, 16)} | Finalizado ${r.finalizado.slice(0, 16)}`);
  }
  console.log(`\nProximo passo: copiar ${SQL_OUT} pra VM e rodar com psql.`);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
