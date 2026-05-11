#!/usr/bin/env node
// Reconstroi as relacoes parent-child dos cards a partir dos CSVs originais
// do Ummense (col 15 "Cards Filhos"). Gera um SQL pra ser aplicado no DB.
//
// Por que CSV e nao API/JSON:
//   - O CSV exportado do Ummense traz Cards Filhos como string pipe-separada.
//     E a unica fonte cross-flow confiavel.
//   - O importer.service.ts ja usa esse mesmo dado, mas so dentro do mesmo
//     fluxo de import (perde relacoes entre fluxos diferentes).
//
// Output: scripts/ops/_rebuild-family.sql (UPDATE batched).
//         scripts/ops/_rebuild-family-report.json (relatorio).
//
// Uso:
//   node scripts/ops/rebuild-card-family-from-csvs.mjs
//   (le todos os flow_projects_*.csv mais recentes de C:/Users/NoteBook1/Downloads)

import fs from 'node:fs';
import path from 'node:path';

const DOWNLOADS = 'C:/Users/NoteBook1/Downloads';
const OUT_SQL = path.join(import.meta.dirname, '_rebuild-family.sql');
const OUT_REPORT = path.join(import.meta.dirname, '_rebuild-family-report.json');

// Mesmos indexes do importer.service.ts
const COL = {
  nome: 0,
  identificador: 1,
  fluxos: 2,
  cardsFilhos: 15,
};

// 1. Lista todos os flow_projects_*.csv ordenados por timestamp (no nome)
const files = fs
  .readdirSync(DOWNLOADS)
  .filter((f) => /^flow_projects_\d+\.csv$/.test(f))
  .map((f) => ({
    name: f,
    ts: Number(f.match(/_(\d+)\.csv$/)[1]),
    path: path.join(DOWNLOADS, f),
  }))
  .sort((a, b) => b.ts - a.ts); // mais recente primeiro

console.log(`[csv] ${files.length} arquivos encontrados`);

// 2. Parseia cada CSV e agrupa por fluxo, mantendo so o mais recente por fluxo
const flowsByName = new Map(); // flowName -> { ts, rows, source }
for (const f of files) {
  let raw;
  try {
    raw = fs.readFileSync(f.path, 'utf-8');
  } catch (e) {
    console.warn(`[skip] ${f.name}: ${e.message}`);
    continue;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.warn(`[skip] ${f.name}: nao e JSON (${e.message})`);
    continue;
  }
  if (!Array.isArray(parsed) || parsed.length < 2) continue;
  const header = parsed[0];
  if (header[COL.nome] !== 'Nome' || header[COL.identificador] !== 'Identificador') {
    console.warn(`[skip] ${f.name}: header inesperado`);
    continue;
  }
  const rows = parsed.slice(1);
  if (rows.length === 0) continue;
  // Nome do fluxo = primeiro segmento de "Fluxos" (split por |) do row 1
  const flowName = (rows[0][COL.fluxos] || '').split('|')[0].trim();
  if (!flowName) continue;
  if (!flowsByName.has(flowName) || flowsByName.get(flowName).ts < f.ts) {
    flowsByName.set(flowName, { ts: f.ts, rows, source: f.name });
  }
}

console.log(`[csv] ${flowsByName.size} fluxos unicos (mais recente por fluxo)`);
for (const [name, info] of flowsByName) {
  console.log(`  ${name}: ${info.rows.length} cards (${info.source})`);
}

// 3. Constroi mapa GLOBAL name -> shortCode (cross-flow)
//    com deteccao de ambiguidade (mesmo nome em fluxos diferentes ou
//    duplicatas dentro do mesmo fluxo)
const nameToShortCode = new Map();
const ambiguousNames = new Set();
const shortCodeToName = new Map();

for (const [, info] of flowsByName) {
  for (const row of info.rows) {
    const sc = (row[COL.identificador] || '').trim();
    const name = (row[COL.nome] || '').trim();
    if (!sc || !name) continue;
    shortCodeToName.set(sc, name);
    if (nameToShortCode.has(name) && nameToShortCode.get(name) !== sc) {
      ambiguousNames.add(name);
    } else if (!nameToShortCode.has(name)) {
      nameToShortCode.set(name, sc);
    }
  }
}

console.log(`[map] ${nameToShortCode.size} nomes unicos, ${ambiguousNames.size} ambiguos`);

// 4. Pra cada row, parseia Cards Filhos e emite pares (parent, child) por shortCode
const pairs = []; // { parentSc, childSc, childName, parentName, parentFlow }
const stats = {
  totalRowsWithChildren: 0,
  totalChildEntries: 0,
  selfRefs: 0,
  ambiguous: 0,
  notFound: 0,
  resolved: 0,
};
const notFoundSamples = []; // pra relatorio
const ambiguousSamples = [];

for (const [flowName, info] of flowsByName) {
  for (const row of info.rows) {
    const parentSc = (row[COL.identificador] || '').trim();
    const parentName = (row[COL.nome] || '').trim();
    const childrenRaw = (row[COL.cardsFilhos] || '').trim();
    if (!parentSc || !childrenRaw) continue;
    stats.totalRowsWithChildren++;

    const childrenNames = childrenRaw
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const childName of childrenNames) {
      stats.totalChildEntries++;
      if (childName === parentName) {
        stats.selfRefs++;
        continue;
      }
      if (ambiguousNames.has(childName)) {
        stats.ambiguous++;
        if (ambiguousSamples.length < 20) {
          ambiguousSamples.push({ parentName, childName, parentFlow: flowName });
        }
        continue;
      }
      const childSc = nameToShortCode.get(childName);
      if (!childSc) {
        stats.notFound++;
        if (notFoundSamples.length < 20) {
          notFoundSamples.push({ parentName, childName, parentFlow: flowName });
        }
        continue;
      }
      if (childSc === parentSc) {
        stats.selfRefs++;
        continue;
      }
      stats.resolved++;
      pairs.push({ parentSc, childSc, childName, parentName, parentFlow: flowName });
    }
  }
}

console.log(`[pairs] ${stats.resolved} resolvidos, ${stats.selfRefs} self-refs, ${stats.ambiguous} ambiguos, ${stats.notFound} nao encontrados`);

// 5. Deduplica pares (mesmo child pode aparecer como filho de varios pais
//    cross-flow — adotamos o primeiro encontrado e logamos o conflito)
const childToParent = new Map(); // childSc -> parentSc
const conflicts = []; // child com >= 2 pais candidatos
for (const p of pairs) {
  if (childToParent.has(p.childSc)) {
    const existing = childToParent.get(p.childSc);
    if (existing !== p.parentSc) {
      conflicts.push({
        childSc: p.childSc,
        childName: p.childName,
        candidates: [existing, p.parentSc],
      });
    }
  } else {
    childToParent.set(p.childSc, p.parentSc);
  }
}

console.log(`[final] ${childToParent.size} relacoes parent-child unicas, ${conflicts.length} conflitos`);

// 6. Gera SQL de UPDATE (1 statement por child usando subquery)
const lines = [
  '-- Re-estabelecimento das relacoes pai-filho dos cards a partir dos CSVs do Ummense',
  '-- Gerado por scripts/ops/rebuild-card-family-from-csvs.mjs',
  `-- ${childToParent.size} updates esperados`,
  '',
  'BEGIN;',
  '',
  '-- Zera todos parentCardId antes (idempotente — sera repovoado abaixo)',
  'UPDATE "Card" SET "parentCardId" = NULL WHERE "parentCardId" IS NOT NULL;',
  '',
];

for (const [childSc, parentSc] of childToParent) {
  lines.push(
    `UPDATE "Card" SET "parentCardId" = (SELECT id FROM "Card" WHERE "shortCode" = '${parentSc}' LIMIT 1) WHERE "shortCode" = '${childSc}';`,
  );
}

lines.push('', '-- Verificacao final', 'SELECT COUNT(*) AS relacoes_aplicadas FROM "Card" WHERE "parentCardId" IS NOT NULL;', '', 'COMMIT;', '');

fs.writeFileSync(OUT_SQL, lines.join('\n'), 'utf-8');
console.log(`[out] SQL gerado em ${OUT_SQL}`);

// 7. Relatorio JSON pra inspecao
const report = {
  filesProcessed: files.length,
  uniqueFlows: flowsByName.size,
  flowsBreakdown: Array.from(flowsByName.entries()).map(([name, info]) => ({
    flow: name,
    cards: info.rows.length,
    source: info.source,
  })),
  uniqueNames: nameToShortCode.size,
  ambiguousNamesCount: ambiguousNames.size,
  pairStats: stats,
  uniqueRelations: childToParent.size,
  conflicts,
  ambiguousSamples,
  notFoundSamples,
};
fs.writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2), 'utf-8');
console.log(`[out] Relatorio em ${OUT_REPORT}`);
