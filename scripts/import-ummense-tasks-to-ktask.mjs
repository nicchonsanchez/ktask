#!/usr/bin/env node
// Importa tarefas extraidas do Ummense pro KTask. Le o JSON gerado por
// scripts/ummense-extract-tasks.js, faz matching por ticket (shortCode)
// e cria 1 checklist "Tarefas" por card com todas as tarefas dentro.
//
// Uso: TOKEN=<jwt> node scripts/import-ummense-tasks-to-ktask.mjs
// Default le o JSON de C:/Users/NoteBook1/Downloads/ummense-tasks-extraction.json
// (passa um path como 1o argumento se for outro arquivo).
//
// Idempotente: pula cards que ja tem checklist com nome "Tarefas".

import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.ktask.agenciakharis.com.br/api/v1';
const TOKEN = process.env.TOKEN;
if (!TOKEN) { console.error('Env TOKEN obrigatorio.'); process.exit(1); }

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

// Converte data Ummense ("2026-04-08 12:09:17") pra ISO 8601
function toIso(d) {
  if (!d) return null;
  // Ummense usa "YYYY-MM-DD HH:MM:SS" sem timezone — assume BRT
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(d)) {
    return d.replace(' ', 'T') + '-03:00';
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
    if (r.status === 429 && attempt < retries) {
      await sleep([1000, 3000, 8000][attempt]);
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

async function getCardByCode(code) {
  try {
    return await api('/cards/by-code/' + encodeURIComponent(code));
  } catch (e) {
    if (e.message.includes('404')) return null;
    throw e;
  }
}

async function main() {
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

      // 2. Verifica se ja tem checklist "Tarefas" (idempotencia)
      const existingChecklist = (ktaskCard.checklists || []).find(
        (c) => c.title?.toLowerCase() === 'tarefas',
      );
      if (existingChecklist) {
        stats.cardsSkipped++;
        continue;
      }

      // 3. Cria checklist
      try {
        const checklist = await api('/checklists', {
          method: 'POST',
          body: JSON.stringify({ cardId: ktaskCard.id, title: 'Tarefas' }),
        });
        stats.checklistsCreated++;

        // 4. Cria items na ordem (positionProject ASC)
        const sorted = [...card.tasks].sort(
          (a, b) => (a.positionProject ?? 0) - (b.positionProject ?? 0),
        );
        for (const task of sorted) {
          try {
            const item = await api(`/checklists/${checklist.id}/items`, {
              method: 'POST',
              body: JSON.stringify({
                text: task.name?.slice(0, 500) || '(sem nome)',
                assigneeId: resolveAssignee(task.userName),
                dueDate: task.dueDate ? toIso(task.dueDate) : null,
                priority: mapPriority(task.priority),
              }),
            });
            stats.itemsCreated++;

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

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
