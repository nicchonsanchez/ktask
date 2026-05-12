#!/usr/bin/env node
// Doc 49: backfill via SQL direto. Le JSON, gera UPDATE statements
// matchando por (shortCode + text) e produz um arquivo .sql que aplico
// via ssh/psql.

import fs from 'node:fs';
import path from 'node:path';

const OUT_SQL = path.join(import.meta.dirname, '_backfill-recurrence.sql');

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

function findLatestJson() {
  const dir = 'C:/Users/NoteBook1/Downloads';
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^ummense-tasks-extraction.*\.json$/.test(f))
    .map((f) => ({ name: f, path: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (files.length === 0) throw new Error('Nenhum JSON em Downloads.');
  return files[0];
}

const src = findLatestJson();
console.log(`[json] ${src.name}`);
const data = JSON.parse(fs.readFileSync(src.path, 'utf-8'));

const updates = [];
const escSql = (s) => s.replace(/'/g, "''");

for (const cards of Object.values(data)) {
  if (!Array.isArray(cards)) continue;
  for (const card of cards) {
    if (!Array.isArray(card.tasks)) continue;
    for (const task of card.tasks) {
      const rec = mapRecurrence(task.repeat);
      if (!rec) continue;
      const text = (task.name || '').slice(0, 500).trim();
      if (!text) continue;
      updates.push({ ticket: card.ticket, text, rec });
    }
  }
}
console.log(`[scan] ${updates.length} tasks com recurrence`);

const lines = [
  '-- Doc 49: backfill recurrence em ChecklistItems via match (shortCode + text)',
  `-- Total esperado: ${updates.length} updates`,
  'BEGIN;',
  '',
];

for (const u of updates) {
  const jsonLit = JSON.stringify(u.rec).replace(/'/g, "''");
  lines.push(
    `UPDATE "ChecklistItem" SET "recurrence" = '${jsonLit}'::jsonb ` +
      `WHERE "checklistId" IN (SELECT id FROM "Checklist" WHERE "cardId" IN (` +
      `SELECT id FROM "Card" WHERE "shortCode" = '${escSql(u.ticket)}')) ` +
      `AND lower(trim("text")) = lower('${escSql(u.text)}') ` +
      `AND "recurrence" IS NULL;`,
  );
}

lines.push(
  '',
  '-- Sanity',
  'SELECT COUNT(*) AS items_com_recurrence FROM "ChecklistItem" WHERE "recurrence" IS NOT NULL;',
  '',
  'COMMIT;',
);

fs.writeFileSync(OUT_SQL, lines.join('\n'), 'utf-8');
console.log(`[out] ${OUT_SQL} (${updates.length} statements)`);
