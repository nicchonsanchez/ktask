#!/usr/bin/env node
// Importa tarefas extraidas do Ummense pro KTask. Le o JSON gerado por
// scripts/ummense-extract-tasks.js, faz matching por ticket (shortCode)
// e cria 1 checklist "Tarefas" por card com todas as tarefas dentro.
//
// Uso: node scripts/import-ummense-tasks-to-ktask.mjs [path-do-json]
// Pega credenciais do .env.ops (KTASK_BOT_EMAIL/PASSWORD), faz login
// no inicio e re-loga automaticamente quando recebe 401 (token expirou).
//
// Idempotente: pula cards que ja tem checklist com nome "Tarefas".

import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.ktask.agenciakharis.com.br/api/v1';

// Le credenciais do .env.ops
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
const BOT_EMAIL = process.env.KTASK_BOT_EMAIL ?? env.KTASK_BOT_EMAIL;
const BOT_PASSWORD = process.env.KTASK_BOT_PASSWORD ?? env.KTASK_BOT_PASSWORD;
if (!BOT_EMAIL || !BOT_PASSWORD) {
  console.error('Credenciais nao encontradas. Defina KTASK_BOT_EMAIL e KTASK_BOT_PASSWORD em .env.ops ou no env.');
  process.exit(1);
}

let TOKEN = null;

async function login() {
  const r = await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: BOT_EMAIL, password: BOT_PASSWORD }),
  });
  if (!r.ok) throw new Error('Login falhou: ' + r.status);
  const b = await r.json();
  TOKEN = b.accessToken;
  console.log('[auth] login OK');
}

const INPUT = process.argv[2] || 'C:/Users/NoteBook1/Downloads/ummense-tasks-extraction.json';
if (!fs.existsSync(INPUT)) {
  // tenta variantes com sufixo (1), (2)... que o Chrome adiciona
  const dir = path.dirname(INPUT);
  const base = path.basename(INPUT, '.json');
  const candidates = fs.readdirSync(dir).filter((f) => f.startsWith(base) && f.endsWith('.json'));
  if (candidates.length === 0) {
    console.error('JSON de extracao nao encontrado em', INPUT);
    process.exit(1);
  }
  // pega o mais recente
  candidates.sort((a, b) =>
    fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs,
  );
  console.log('Usando:', candidates[0]);
  process.argv[2] = path.join(dir, candidates[0]);
}

const inputPath = process.argv[2] || INPUT;
const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

// Mapping userId Ummense -> userId KTask por nome (cruza com nomes
// presentes no MEMBER_MAP do nuke-and-reimport.mjs)
const MEMBER_MAP = {
  // chave = primeiro nome (ou nome completo se ambíguo) — match flexivel
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
  // tenta match exato primeiro
  if (MEMBER_MAP[userName]) return MEMBER_MAP[userName];
  // tenta primeiro nome
  const first = userName.trim().split(/\s+/)[0];
  if (MEMBER_MAP[first]) return MEMBER_MAP[first];
  return null;
}

// Mapeia priority do Ummense pro nosso enum
function mapPriority(p) {
  if (!p) return undefined;
  const upper = p.toUpperCase();
  if (['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(upper)) return upper;
  return undefined;
}

// Doc 49: converte campo 'repeat' do Ummense pro shape KTask.
// Ummense entrega 2 formatos:
//   - atalho string: "days" / "weeks" / "months" (= a cada 1 unidade)
//   - objeto custom: { type:"custom", interval:N, period:"days|weeks|months|years",
//                       repeatDays:[0-6], endedAtType:null }
// Retorna null pro KTask se nao for reconhecivel (item nao-recorrente).
function mapRecurrence(repeat) {
  if (!repeat) return null;
  const PERIOD = { days: 'DAILY', weeks: 'WEEKLY', months: 'MONTHLY', years: 'YEARLY' };
  // Atalho string
  if (typeof repeat === 'string') {
    const freq = PERIOD[repeat];
    return freq ? { freq, interval: 1 } : null;
  }
  // Objeto custom
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

// Converte data Ummense ("2026-04-08 12:09:17") pra ISO 8601 UTC com Z.
// Zod .datetime() default rejeita offsets (-03:00), so aceita Z.
function toIso(d) {
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(d)) {
    // Interpreta como BRT (UTC-3) e converte pra UTC
    return new Date(d.replace(' ', 'T') + '-03:00').toISOString();
  }
  return d;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

    // Token expirou: re-loga e tenta de novo (sem consumir retry)
    if (r.status === 401 && TOKEN) {
      console.log('[auth] 401 — re-logando');
      await login();
      continue;
    }
    if (r.status === 429 && attempt < retries) {
      await sleep([1000, 3000, 8000][attempt]);
      continue;
    }
    // Resiliencia a deploys CI/CD em andamento (Caddy retorna 502/503/504
    // enquanto o container API esta reiniciando). Backoff progressivo —
    // espera 5/15/30s pra alinhar com tempo tipico de boot do Nest.
    if ([502, 503, 504].includes(r.status) && attempt < retries) {
      const wait = [5000, 15000, 30000][attempt] ?? 30000;
      console.log(`[net] ${r.status} em ${ep}, esperando ${wait}ms (tentativa ${attempt + 1}/${retries})`);
      await sleep(wait);
      continue;
    }
    if (!r.ok) {
      const msg = typeof b === 'object' ? b?.message : b;
      const fields = b?.errors?.fields ? ' | ' + JSON.stringify(b.errors.fields) : '';
      throw new Error(r.status + ' ' + (opts.method || 'GET') + ' ' + ep + ': ' + msg + fields);
    }
    await sleep(700);
    return b;
  }
}

/**
 * Resolve ticket Ummense -> Card KTask DETALHADO (com checklists).
 * by-code retorna apenas {id,boardId}; precisamos chamar GET /cards/:id
 * pra ter o `checklists` populado e detectar duplicacao.
 *
 * Sem isso, o script crIA uma checklist "Tarefas" nova a cada execucao
 * — bug que afetou 675 cards na 1a leva, corrigido por SQL de
 * consolidacao (scripts/ops/_consolidate-duplicate-checklists.sql).
 */
async function getCardByCode(code) {
  try {
    const ref = await api('/cards/by-code/' + encodeURIComponent(code));
    if (!ref?.id) return null;
    return await api('/cards/' + ref.id);
  } catch (e) {
    if (e.message.includes('404')) return null;
    throw e;
  }
}

async function main() {
  await login();
  const stats = {
    flows: 0,
    cardsTotal: 0,
    cardsMatched: 0,
    cardsNotFound: 0,
    cardsSkipped: 0,
    checklistsCreated: 0,
    itemsCreated: 0,
    itemsCompleted: 0,
    itemsErrors: 0,
    cardsWithErrors: [],
  };

  for (const [flowName, cards] of Object.entries(data)) {
    stats.flows++;
    console.log(`\n=== ${flowName} (${cards.length} cards com tasks) ===`);

    for (const card of cards) {
      stats.cardsTotal++;

      // 1. Match por ticket -> shortCode
      const ktaskCard = await getCardByCode(card.ticket);
      if (!ktaskCard) {
        stats.cardsNotFound++;
        console.warn(`  ! ${card.ticket} ${card.name.slice(0, 50)}: nao encontrado no KTask`);
        continue;
      }
      stats.cardsMatched++;

      // 2. Reutiliza checklist "Tarefas" se ja existe (com items ou nao);
      //    se a anterior tem items na mesma quantidade do JSON, pula.
      let checklist = (ktaskCard.checklists || []).find(
        (c) => c.title?.toLowerCase() === 'tarefas',
      );
      if (checklist && (checklist.items?.length ?? 0) >= card.tasks.length) {
        stats.cardsSkipped++;
        continue;
      }

      try {
        if (!checklist) {
          checklist = await api('/checklists', {
            method: 'POST',
            body: JSON.stringify({ cardId: ktaskCard.id, title: 'Tarefas' }),
          });
          stats.checklistsCreated++;
        }

        // 4. Cria items na ordem (positionProject ASC), pulando os
        // que ja existem (match por texto exato) — evita duplicar em
        // re-runs apos falha parcial.
        const existingTexts = new Set(
          (checklist.items ?? []).map((i) => (i.text || '').trim().toLowerCase()),
        );
        const sorted = [...card.tasks].sort(
          (a, b) => (a.positionProject ?? 0) - (b.positionProject ?? 0),
        );
        for (const task of sorted) {
          const taskText = (task.name || '').slice(0, 500).trim();
          if (existingTexts.has(taskText.toLowerCase())) continue;
          try {
            const recurrence = mapRecurrence(task.repeat);
            const item = await api(`/checklists/${checklist.id}/items`, {
              method: 'POST',
              body: JSON.stringify({
                text: task.name?.slice(0, 500) || '(sem nome)',
                assigneeId: resolveAssignee(task.userName),
                dueDate: task.dueDate ? toIso(task.dueDate) : null,
                priority: mapPriority(task.priority),
                ...(recurrence ? { recurrence } : {}),
              }),
            });
            stats.itemsCreated++;
            if (recurrence) stats.itemsWithRecurrence = (stats.itemsWithRecurrence ?? 0) + 1;

            // Marca como concluído se tinha completedAt
            if (task.completedAt) {
              await api(`/checklists/items/${item.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ isDone: true }),
              });
              stats.itemsCompleted++;
            }
          } catch (e) {
            stats.itemsErrors++;
            console.error(`    err item "${task.name?.slice(0, 30)}": ${e.message.slice(0, 100)}`);
          }
        }
        process.stdout.write('.');
      } catch (e) {
        stats.cardsWithErrors.push({ ticket: card.ticket, name: card.name, error: e.message });
        console.error(`\n  ERR ${card.ticket}: ${e.message.slice(0, 100)}`);
      }
    }
  }

  console.log('\n\n========== RELATORIO ==========');
  console.log('Flows:                ', stats.flows);
  console.log('Cards (total):        ', stats.cardsTotal);
  console.log('  matched:            ', stats.cardsMatched);
  console.log('  not found no KTask: ', stats.cardsNotFound);
  console.log('  skipped (ja tinha): ', stats.cardsSkipped);
  console.log('  com erro:           ', stats.cardsWithErrors.length);
  console.log('Checklists criadas:   ', stats.checklistsCreated);
  console.log('Items criados:        ', stats.itemsCreated);
  console.log('Items marcados done:  ', stats.itemsCompleted);
  console.log('Items com erro:       ', stats.itemsErrors);

  const reportPath = `tarefas-md/ummense-tasks-import-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(stats, null, 2));
  console.log('\nRelatorio salvo:', reportPath);
}

// Auto-restart externo: se main() der throw (ex: 502 esgotou retries
// internos), espera AUTO_RESTART_WAIT_MS e roda de novo. Cada re-run e
// idempotente — dedup-por-texto pula cards/items ja processados, entao
// retomar nao duplica.
//
// AUTO_RESTART_MAX_ATTEMPTS limita o numero de retentativas pra evitar
// loop infinito. Default 50 (suficiente pra qualquer cenario real de
// instabilidade de rede + dezenas de deploys).
const AUTO_RESTART_MAX_ATTEMPTS = Number(process.env.AUTO_RESTART_MAX ?? 50);
const AUTO_RESTART_WAIT_MS = Number(process.env.AUTO_RESTART_WAIT_MS ?? 60_000);

(async () => {
  for (let attempt = 1; attempt <= AUTO_RESTART_MAX_ATTEMPTS; attempt++) {
    try {
      console.log(`\n=== Tentativa ${attempt}/${AUTO_RESTART_MAX_ATTEMPTS} ===`);
      await main();
      console.log('\n✓ Import concluido com sucesso.');
      process.exit(0);
    } catch (e) {
      console.error(`FATAL na tentativa ${attempt}:`, e.message);
      if (attempt >= AUTO_RESTART_MAX_ATTEMPTS) {
        console.error('Max tentativas atingido. Desistindo.');
        process.exit(1);
      }
      console.log(`Esperando ${AUTO_RESTART_WAIT_MS}ms antes de retomar...`);
      await sleep(AUTO_RESTART_WAIT_MS);
      // Reseta token pra forcar re-login (token pode ter expirado durante
      // o down do API).
      TOKEN = null;
    }
  }
})();
