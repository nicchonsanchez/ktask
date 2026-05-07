#!/usr/bin/env node
// Aplica os templates JSON do Ummense aos boards do KTask:
//  1. Cria board "Pastoralidade & Endomarketing" (sem cards)
//  2. Reordena/renomeia colunas dos 21 boards existentes pra bater com template
//
// Uso: TOKEN=<jwt> node scripts/apply-ummense-templates.mjs

import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.ktask.agenciakharis.com.br/api/v1';
const TOKEN = process.env.TOKEN;
if (!TOKEN) { console.error('Env TOKEN obrigatorio.'); process.exit(1); }

const DOWNLOADS = 'C:/Users/NoteBook1/Downloads/';
// Renomes aplicados durante a importacao — mapping template-name -> ktask-name
const BOARD_RENAMES = {
  'Executivo de contas | FÁBIO MACHADO': 'Executivo de contas - Fábio Machado',
};

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
      // Rate limit — espera progressivo (1s, 3s, 10s)
      const wait = [1000, 3000, 10000][attempt];
      await sleep(wait);
      continue;
    }
    if (!r.ok) throw new Error(r.status + ' ' + (opts.method || 'GET') + ' ' + ep + ': ' + (typeof b === 'object' ? b?.message : b));
    // Throttle base — 250ms entre requests pra nao saturar.
    await sleep(250);
    return b;
  }
}

function loadTemplates() {
  const files = fs.readdirSync(DOWNLOADS).filter(f => /^flow_2026050[67]/.test(f) && f.endsWith('.json'));
  const map = new Map();
  for (const f of files) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(DOWNLOADS, f), 'utf-8'));
      const name = d.name;
      if (!name) continue;
      const cols = (d.columns || []).slice().sort((a, b) => a.position - b.position).map(c => ({
        name: c.name,
        position: c.position,
        isFinal: c.is_final === 1,
        isBacklog: c.is_backlog === 1,
        description: c.description ?? null,
        wipLimit: c.limit_projects ?? null,
      }));
      map.set(name, { name, color: d.color, columns: cols });
    } catch (e) {}
  }
  return map;
}

function norm(s) {
  return (s ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const summary = { reordered: [], renamed: [], created: [], extraLists: [], errors: [] };

(async () => {
  const templates = loadTemplates();
  console.log('Templates carregados: ' + templates.size);

  const boards = await api('/boards');
  console.log('Boards no KTask: ' + boards.length + '\n');

  // ===== 1. Cria "Pastoralidade & Endomarketing" se nao existir =====
  const pastoTpl = templates.get('Pastoralidade & Endomarketing');
  const exists = boards.find(b => norm(b.name) === norm('Pastoralidade & Endomarketing'));
  if (pastoTpl && !exists) {
    console.log('[CRIAR] Board "Pastoralidade & Endomarketing" (' + pastoTpl.columns.length + ' colunas)');
    try {
      const created = await api('/boards', {
        method: 'POST',
        body: JSON.stringify({ name: 'Pastoralidade & Endomarketing', description: null }),
      });
      console.log('  Board criado: ' + created.id);
      // Pega listas default do board (vem com 3 listas A Fazer/Fazendo/Concluido).
      const detail = await api('/boards/' + created.id);
      const defaultLists = detail.lists || [];
      // Cria as colunas do template em ordem.
      // Estrategia simples: arquiva as default e cria as do template.
      for (const dl of defaultLists) {
        try { await api('/lists/' + dl.id, { method: 'PATCH', body: JSON.stringify({ isArchived: true }) }); }
        catch (e) { console.log('  WARN arquivar default: ' + e.message); }
      }
      for (let i = 0; i < pastoTpl.columns.length; i++) {
        const c = pastoTpl.columns[i];
        await api('/lists', {
          method: 'POST',
          body: JSON.stringify({ name: c.name, boardId: created.id }),
        });
        console.log('  + coluna: ' + c.name);
      }
      summary.created.push('Pastoralidade & Endomarketing');
    } catch (e) {
      console.log('  ERRO: ' + e.message);
      summary.errors.push('create: ' + e.message);
    }
  } else if (exists) {
    console.log('[SKIP] "Pastoralidade & Endomarketing" ja existe');
  }

  // ===== 2. Reordena/renomeia colunas dos boards existentes =====
  const refreshedBoards = await api('/boards');

  for (const board of refreshedBoards) {
    // Busca template — primeiro tenta nome exato, depois reverso (rename aplicado)
    let tpl = templates.get(board.name);
    if (!tpl) {
      // Procura template cujo nome (apos rename) bate com o board
      for (const [tplName, t] of templates) {
        const renamed = BOARD_RENAMES[tplName] ?? tplName;
        if (norm(renamed) === norm(board.name)) { tpl = t; break; }
      }
    }
    if (!tpl) continue; // sem template, pula

    console.log('\n[' + board.name + ']');
    let detail;
    try { detail = await api('/boards/' + board.id); }
    catch (e) { summary.errors.push(board.name + ': ' + e.message); continue; }

    const existingLists = (detail.lists || []).filter(l => !l.isArchived);
    // Match: pra cada coluna do template, encontra a lista existente por nome (case-insensitive, sem acentos)
    const matched = new Map(); // tplIdx -> existing list
    const usedListIds = new Set();
    for (let i = 0; i < tpl.columns.length; i++) {
      const tcol = tpl.columns[i];
      const found = existingLists.find(l => !usedListIds.has(l.id) && norm(l.name) === norm(tcol.name));
      if (found) { matched.set(i, found); usedListIds.add(found.id); }
    }

    // Listas existentes que nao tem correspondencia no template
    const orphans = existingLists.filter(l => !usedListIds.has(l.id));
    if (orphans.length > 0) {
      console.log('  Listas extras (sem template, mantidas no fim): ' + orphans.map(l => l.name).join(', '));
      summary.extraLists.push({ board: board.name, lists: orphans.map(l => l.name) });
    }

    // Aplica novo position pras matched (em ordem do template) e depois pras orphans
    let pos = 1024;
    for (let i = 0; i < tpl.columns.length; i++) {
      const list = matched.get(i);
      if (!list) {
        // Cria a lista que falta
        try {
          const tcol = tpl.columns[i];
          const created = await api('/lists', {
            method: 'POST',
            body: JSON.stringify({ name: tcol.name, boardId: board.id }),
          });
          // Set position + flags (isFinalList, isBacklog)
          await api('/lists/' + created.id, {
            method: 'PATCH',
            body: JSON.stringify({
              position: pos,
              isFinalList: tcol.isFinal,
              isBacklog: tcol.isBacklog,
            }),
          });
          const flagInfo = [
            tcol.isFinal ? 'FINAL' : null,
            tcol.isBacklog ? 'BACKLOG' : null,
          ].filter(Boolean).join(',');
          console.log('  + criou coluna: ' + tcol.name + ' @ pos ' + pos + (flagInfo ? ' [' + flagInfo + ']' : ''));
          summary.reordered.push(board.name + ': criou ' + tcol.name);
        } catch (e) {
          console.log('  ERRO ao criar coluna ' + tpl.columns[i].name + ': ' + e.message);
        }
      } else {
        // Reordena, renomeia (se diferir) e aplica flags isFinalList/isBacklog do template
        try {
          const tcol = tpl.columns[i];
          const patches = {
            position: pos,
            isFinalList: tcol.isFinal,
            isBacklog: tcol.isBacklog,
          };
          if (list.name !== tcol.name) {
            patches.name = tcol.name;
            console.log('  ~ renomeia: "' + list.name + '" -> "' + tcol.name + '"');
            summary.renamed.push(board.name + ': "' + list.name + '" -> "' + tcol.name + '"');
          } else {
            const flagInfo = [
              tcol.isFinal ? 'FINAL' : null,
              tcol.isBacklog ? 'BACKLOG' : null,
            ].filter(Boolean).join(',');
            console.log('  = ' + list.name + ' @ pos ' + pos + (flagInfo ? ' [' + flagInfo + ']' : ''));
          }
          await api('/lists/' + list.id, { method: 'PATCH', body: JSON.stringify(patches) });
        } catch (e) {
          console.log('  ERRO ao reordenar ' + list.name + ': ' + e.message);
        }
      }
      pos += 1024;
    }
    // Orphans no fim
    for (const o of orphans) {
      try {
        await api('/lists/' + o.id, { method: 'PATCH', body: JSON.stringify({ position: pos }) });
        pos += 1024;
      } catch (e) {}
    }
    summary.reordered.push(board.name);
  }

  // ===== Relatorio final =====
  console.log('\n========== RELATORIO ==========');
  console.log('Board criado: ' + summary.created.length + (summary.created.length ? ' (' + summary.created.join(', ') + ')' : ''));
  console.log('Boards reordenados: ' + summary.reordered.filter(s => !s.includes(': ')).length);
  console.log('Colunas renomeadas: ' + summary.renamed.length);
  if (summary.renamed.length > 0) for (const r of summary.renamed) console.log('  ' + r);
  console.log('Listas extras (sem match no template, mantidas): ' + summary.extraLists.length);
  for (const e of summary.extraLists) console.log('  ' + e.board + ': ' + e.lists.join(', '));
  console.log('Erros: ' + summary.errors.length);
  for (const e of summary.errors) console.log('  ' + e);
})().catch(e => { console.error('FATAL: ' + e.message); process.exit(1); });
