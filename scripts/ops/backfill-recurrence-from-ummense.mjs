#!/usr/bin/env node
// Doc 49: backfill de recurrence em ChecklistItems ja importados.
//
// Strategy: pega o JSON de extracao do Ummense (mais recente em Downloads),
// pra cada task com 'repeat' encontra o ChecklistItem correspondente no
// KTask via (cardShortCode + texto da task) e da PATCH /checklists/items/:id
// com a recurrence convertida.
//
// Idempotente: se o item ja tem recurrence configurada, pula. Re-run seguro.
// Logs em scripts/ops/_backfill-recurrence-report.json.
//
// Uso:
//   node scripts/ops/backfill-recurrence-from-ummense.mjs
//   (credenciais em .env.ops, mesmo formato do importer)

import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.ktask.agenciakharis.com.br/api/v1';
const REPORT_PATH = path.join(import.meta.dirname, '_backfill-recurrence-report.json');

function loadEnv() {
  const envPath = '.env.ops';
  if (!fs.existsSync(envPath)) return {};
  const txt = fs.readFileSync(envPath, 'utf-8');
  const out = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = loadEnv();
const EMAIL = process.env.KTASK_BOT_EMAIL ?? env.KTASK_BOT_EMAIL;
const PASSWORD = process.env.KTASK_BOT_PASSWORD ?? env.KTASK_BOT_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('Credenciais KTASK_BOT_EMAIL/PASSWORD nao encontradas em .env.ops ou env.');
  process.exit(1);
}

let TOKEN = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login() {
  const r = await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) throw new Error('Login falhou: ' + r.status);
  const b = await r.json();
  TOKEN = b.accessToken;
  console.log('[auth] login OK');
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
    try {
      b = t ? JSON.parse(t) : null;
    } catch {
      b = t;
    }
    if (r.status === 401 && TOKEN) {
      await login();
      continue;
    }
    if (r.status === 429 && attempt < retries) {
      await sleep([1000, 3000, 8000][attempt]);
      continue;
    }
    if (!r.ok) {
      const msg = typeof b === 'object' ? b?.message ?? JSON.stringify(b) : b;
      throw new Error(`${r.status} ${opts.method || 'GET'} ${ep}: ${msg}`);
    }
    await sleep(120);
    return b;
  }
}

// Mesma conversao do importer
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

// 1. Encontra o JSON mais recente de extracao de tasks
function findLatestExtractionJson() {
  const dir = 'C:/Users/NoteBook1/Downloads';
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^ummense-tasks-extraction.*\.json$/.test(f))
    .map((f) => ({ name: f, path: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (files.length === 0) throw new Error('Nenhum JSON de extracao encontrado em Downloads.');
  return files[0];
}

async function main() {
  await login();

  const src = findLatestExtractionJson();
  console.log(`[json] usando ${src.name}`);
  const data = JSON.parse(fs.readFileSync(src.path, 'utf-8'));

  // Estrutura do JSON: { [flowName]: [ { ticket, name, tasks: [...] }, ... ] }
  // Coleta todas as tasks com repeat != null
  const candidates = []; // { cardTicket, taskText, repeat, recurrence }
  for (const [flowName, cards] of Object.entries(data)) {
    if (!Array.isArray(cards)) continue;
    for (const card of cards) {
      if (!Array.isArray(card.tasks)) continue;
      for (const task of card.tasks) {
        const rec = mapRecurrence(task.repeat);
        if (!rec) continue;
        const text = (task.name || '').slice(0, 500).trim();
        if (!text) continue;
        candidates.push({
          flow: flowName,
          cardTicket: card.ticket,
          cardName: card.name,
          taskText: text,
          repeat: task.repeat,
          recurrence: rec,
        });
      }
    }
  }
  console.log(`[scan] ${candidates.length} tasks com 'repeat' no JSON`);

  const stats = {
    candidates: candidates.length,
    cardsNotFound: 0,
    itemsNotFound: 0,
    alreadyHadRecurrence: 0,
    updated: 0,
    errors: [],
  };

  // Agrupa por card pra fazer 1 GET por card e nao N
  const byCard = new Map();
  for (const c of candidates) {
    if (!byCard.has(c.cardTicket)) byCard.set(c.cardTicket, []);
    byCard.get(c.cardTicket).push(c);
  }
  console.log(`[scan] em ${byCard.size} cards distintos`);

  let processed = 0;
  for (const [ticket, list] of byCard) {
    processed++;
    try {
      const cards = await api(`/search?q=${encodeURIComponent(ticket)}`);
      const ktaskCard = Array.isArray(cards.cards)
        ? cards.cards.find((c) => c.shortCode === ticket)
        : null;
      if (!ktaskCard) {
        stats.cardsNotFound += list.length;
        continue;
      }
      const detail = await api(`/cards/${ktaskCard.id}`);
      const allItems = (detail.checklists ?? []).flatMap((cl) =>
        (cl.items ?? []).map((it) => ({ ...it, checklistTitle: cl.title })),
      );
      for (const cand of list) {
        const item = allItems.find(
          (it) => (it.text || '').trim().toLowerCase() === cand.taskText.toLowerCase(),
        );
        if (!item) {
          stats.itemsNotFound++;
          continue;
        }
        if (item.recurrence) {
          stats.alreadyHadRecurrence++;
          continue;
        }
        try {
          await api(`/checklists/items/${item.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ recurrence: cand.recurrence }),
          });
          stats.updated++;
          process.stdout.write('.');
        } catch (e) {
          stats.errors.push({ ticket, text: cand.taskText, error: e.message.slice(0, 200) });
        }
      }
    } catch (e) {
      stats.errors.push({ ticket, error: e.message.slice(0, 200) });
    }
    if (processed % 25 === 0) console.log(`\n[progress] ${processed}/${byCard.size} cards`);
  }

  console.log(`\n========== FIM ==========`);
  console.log(JSON.stringify(stats, null, 2));
  fs.writeFileSync(REPORT_PATH, JSON.stringify(stats, null, 2), 'utf-8');
  console.log(`Relatorio em ${REPORT_PATH}`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
