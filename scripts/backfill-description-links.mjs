#!/usr/bin/env node
// Backfill: detecta URLs em text nodes do Card.description (ProseMirror)
// e adiciona marks `link`. Roda direto no banco prod via SSH+psql.
//
// Lógica idempotente:
//   - so altera text nodes SEM marks (ou com marks que nao incluem 'link')
//   - URL pattern: http(s)://... ou www....
//   - text node com URL no meio é quebrado em [antes][URL com mark][depois]
//
// Uso:
//   DRY_RUN=1 node scripts/backfill-description-links.mjs   # so loga
//   node scripts/backfill-description-links.mjs              # aplica
//
// Pre-requisito: PG_HOST/PG_USER/PG_DB env OU --tunnel pra rodar via SSH.

import fs from 'node:fs';
import { execSync } from 'node:child_process';

const DRY_RUN = process.env.DRY_RUN === '1';

const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;

/**
 * Re-processa nodes inline pra detectar URLs em text nodes sem marks.
 * Retorna novo array de nodes (idempotente: mantem text node intacto se
 * nao tem URL OU se ja tem mark `link`).
 */
function relinkInlineNodes(nodes) {
  if (!Array.isArray(nodes)) return nodes;
  const out = [];
  let changed = false;
  for (const node of nodes) {
    if (!node || node.type !== 'text' || typeof node.text !== 'string') {
      out.push(node);
      continue;
    }
    const hasLinkMark = Array.isArray(node.marks) && node.marks.some((m) => m?.type === 'link');
    if (hasLinkMark) {
      out.push(node);
      continue;
    }
    const text = node.text;
    URL_RE.lastIndex = 0;
    if (!URL_RE.test(text)) {
      out.push(node);
      continue;
    }
    URL_RE.lastIndex = 0;
    let last = 0;
    let m;
    while ((m = URL_RE.exec(text)) !== null) {
      if (m.index > last) {
        const before = text.slice(last, m.index);
        out.push({ ...node, text: before });
      }
      const url = m[1];
      const href = url.startsWith('http') ? url : `https://${url}`;
      out.push({
        ...node,
        text: url,
        marks: [
          ...(Array.isArray(node.marks) ? node.marks : []),
          { type: 'link', attrs: { href, target: '_blank', rel: 'noopener noreferrer nofollow' } },
        ],
      });
      last = URL_RE.lastIndex;
      changed = true;
    }
    if (last < text.length) {
      const tail = text.slice(last);
      out.push({ ...node, text: tail });
    }
  }
  return changed ? out : nodes;
}

/** Walk recursivo no ProseMirror doc, aplicando relink em todo paragraph/heading/etc. */
function walkAndRelink(node) {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node.content)) {
    if (node.content.length > 0 && node.content[0]?.type === 'text') {
      // É um block com inline content
      const relinked = relinkInlineNodes(node.content);
      if (relinked !== node.content) {
        return { ...node, content: relinked };
      }
      return node;
    }
    // Block container — recurse
    const newContent = node.content.map(walkAndRelink);
    const anyChanged = newContent.some((n, i) => n !== node.content[i]);
    return anyChanged ? { ...node, content: newContent } : node;
  }
  return node;
}

// ============ DB IO via SSH ============

const SSH_KEY = process.env.HOME ? `${process.env.HOME}/.ssh/ktask-deploy` : 'C:/Users/NoteBook1/.ssh/ktask-deploy';

function ssh(cmd) {
  return execSync(
    `ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no root@178.104.220.28 ${JSON.stringify(cmd)}`,
    { encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024, shell: 'bash' },
  );
}

function pgQuery(sql) {
  const escaped = sql.replace(/"/g, '\\"').replace(/\$/g, '\\$');
  return ssh(`docker exec ktask-postgres psql -U ktask -d ktask -At -c "${escaped}"`);
}

// =========== MAIN ===========

console.log(`[mode] ${DRY_RUN ? 'DRY RUN' : 'LIVE — vai escrever no banco'}`);

// 1) Lista cards com URL na descricao (filtro em SQL pra reduzir scope)
console.log('[load] buscando cards com URL na descricao...');
const out = pgQuery(
  `SELECT id, description::text FROM "Card" WHERE description::text ~* '(https?://|www\\.)' AND description IS NOT NULL`,
);
const lines = out.split('\n').filter((l) => l.trim() && l.includes('|'));
console.log(`[load] ${lines.length} cards candidatos`);

let processed = 0, changed = 0, errors = 0;
const updates = []; // { id, json }

for (const line of lines) {
  const sepIdx = line.indexOf('|');
  if (sepIdx === -1) continue;
  const id = line.slice(0, sepIdx).trim();
  const descRaw = line.slice(sepIdx + 1);
  let desc;
  try { desc = JSON.parse(descRaw); } catch (e) { errors++; continue; }

  const updated = walkAndRelink(desc);
  processed++;
  if (updated === desc) continue;
  changed++;

  if (DRY_RUN && changed <= 3) {
    console.log(`[diff] card ${id}:`);
    console.log('  BEFORE:', JSON.stringify(desc).slice(0, 200));
    console.log('  AFTER: ', JSON.stringify(updated).slice(0, 200));
  }

  if (!DRY_RUN) updates.push({ id, json: JSON.stringify(updated) });
}

if (!DRY_RUN && updates.length > 0) {
  // Gera 1 arquivo SQL com todos os UPDATEs, copia pra VM e roda dentro do container.
  console.log(`[apply] gerando arquivo SQL com ${updates.length} UPDATEs...`);
  const sqlLines = updates.map(
    ({ id, json }) =>
      `UPDATE "Card" SET description = $$${json}$$::jsonb WHERE id = '${id}';`,
  );
  const sql = sqlLines.join('\n');
  const tmpLocal = `/tmp/backfill-${Date.now()}.sql`;
  fs.writeFileSync(tmpLocal.replace('/tmp/', 'C:/Users/NoteBook1/AppData/Local/Temp/'), sql);
  const remotePath = `/tmp/backfill-${Date.now()}.sql`;

  console.log('[apply] enviando pra VM...');
  execSync(
    `scp -i "${SSH_KEY}" -o StrictHostKeyChecking=no "${tmpLocal.replace('/tmp/', 'C:/Users/NoteBook1/AppData/Local/Temp/')}" root@178.104.220.28:${remotePath}`,
    { encoding: 'utf-8', shell: 'bash' },
  );
  console.log('[apply] executando psql -f...');
  const result = ssh(`docker cp ${remotePath} ktask-postgres:${remotePath} && docker exec ktask-postgres psql -U ktask -d ktask -f ${remotePath} && rm ${remotePath}`);
  const okMatches = (result.match(/UPDATE 1/g) || []).length;
  console.log(`[apply] ${okMatches} UPDATE 1 confirmados`);
  changed = okMatches;
}

console.log(`\nProcessados: ${processed} cards`);
console.log(`Mudados:    ${changed}`);
console.log(`Erros:      ${errors}`);
