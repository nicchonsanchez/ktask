#!/usr/bin/env node
// Doc 42: Sincroniza Card.status dos cards ja importados, lendo
// os CSVs originais do Ummense (col 6 "Status"). Necessario porque
// a migration so backfillou COMPLETED a partir de completedAt — cards
// que vieram com status='waiting' ou 'canceled' ficaram como ACTIVE.
//
// Uso: TOKEN=<jwt> node scripts/sync-card-status-from-csv.mjs

import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.ktask.agenciakharis.com.br/api/v1';
const TOKEN = process.env.TOKEN;
if (!TOKEN) { console.error('Env TOKEN obrigatorio.'); process.exit(1); }

const DOWNLOADS = 'C:/Users/NoteBook1/Downloads/';
const CUTOFF = new Date('2026-05-06T18:00:00').getTime();

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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
    let b; try { b = t ? JSON.parse(t) : null; } catch { b = t; }
    if (r.status === 429 && attempt < retries) {
      await sleep([1000, 3000, 10000][attempt]);
      continue;
    }
    if (!r.ok) throw new Error(r.status + ' ' + (opts.method || 'GET') + ' ' + ep + ': ' + (typeof b === 'object' ? b?.message : b));
    await sleep(200);
    return b;
  }
}

function mapStatus(csvStatus) {
  const v = (csvStatus ?? '').trim();
  if (v === 'completed') return 'COMPLETED';
  if (v === 'waiting') return 'WAITING';
  if (v === 'canceled') return 'CANCELED';
  return 'ACTIVE';
}

(async () => {
  // Le todos os CSVs de hoje a noite
  const files = fs.readdirSync(DOWNLOADS)
    .filter(f => f.startsWith('flow_projects_'))
    .filter(f => fs.statSync(path.join(DOWNLOADS, f)).mtimeMs >= CUTOFF);

  // Constroi mapping shortCode -> statusEsperado
  const desired = new Map();
  for (const f of files) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(DOWNLOADS, f), 'utf-8'));
      for (const row of d.slice(1)) {
        const shortCode = (row[1] ?? '').toString().trim();
        const status = mapStatus(row[6]);
        if (shortCode) desired.set(shortCode, status);
      }
    } catch (e) {}
  }
  console.log('CSVs lidos: ' + files.length);
  console.log('ShortCodes mapeados: ' + desired.size);

  // Lista todos os boards e cards atuais com paginacao manual via boards/lists
  // Estrategia: itera boards -> board detail -> lists -> cards.
  const boards = await api('/boards');
  console.log('Boards no KTask: ' + boards.length);

  const counts = { ACTIVE: 0, COMPLETED: 0, WAITING: 0, CANCELED: 0, unchanged: 0, missing: 0, errors: 0 };
  const updates = []; // { cardId, from, to }

  for (const b of boards) {
    let detail;
    try { detail = await api('/boards/' + b.id); }
    catch (e) { console.log('SKIP board ' + b.name + ': ' + e.message); continue; }
    for (const list of detail.lists) {
      for (const card of (list.cards || [])) {
        const sc = card.shortCode;
        if (!sc) { counts.missing++; continue; }
        const target = desired.get(sc);
        if (!target) { counts.missing++; continue; }
        if (card.status === target) { counts.unchanged++; continue; }
        updates.push({ cardId: card.id, shortCode: sc, from: card.status, to: target, title: card.title });
      }
    }
  }

  console.log('\nMudancas a aplicar: ' + updates.length);
  console.log('Sem mudanca: ' + counts.unchanged);
  console.log('Sem shortCode/sem CSV: ' + counts.missing);

  // Distribuicao por target status
  const byTarget = updates.reduce((acc, u) => { acc[u.to] = (acc[u.to] ?? 0) + 1; return acc; }, {});
  console.log('Por status alvo:', byTarget);

  if (updates.length === 0) {
    console.log('\nNada a fazer.');
    return;
  }

  console.log('\nAplicando...');
  let applied = 0;
  for (const u of updates) {
    try {
      await api('/cards/' + u.cardId, {
        method: 'PATCH',
        body: JSON.stringify({ status: u.to }),
      });
      applied++;
      counts[u.to]++;
      if (applied % 50 === 0) console.log('  ' + applied + '/' + updates.length + '...');
    } catch (e) {
      counts.errors++;
      console.log('  ERRO #' + u.shortCode + ' "' + u.title + '": ' + e.message);
    }
  }

  console.log('\n========== RELATORIO ==========');
  console.log('Total processado: ' + applied + '/' + updates.length);
  console.log('  ACTIVE -> WAITING:   ' + (counts.WAITING || 0));
  console.log('  ACTIVE -> CANCELED:  ' + (counts.CANCELED || 0));
  console.log('  outros:              ' + (counts.ACTIVE + counts.COMPLETED || 0));
  console.log('  Erros: ' + counts.errors);
})().catch(e => { console.error('FATAL: ' + e.message); process.exit(1); });
