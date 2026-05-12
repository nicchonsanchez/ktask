// Gera ummense-tasks-extraction-delta.json com SO as tasks que ainda
// faltam importar (cruzando snapshot SQL do banco com o JSON completo).
//
// Uso: node scripts/_make-delta-json.mjs

import fs from 'node:fs';
import { execSync } from 'node:child_process';

const SSH_KEY = `${process.env.HOME}/.ssh/ktask-deploy`;
const SSH_HOST = 'root@178.104.220.28';
const SOURCE = 'C:/Users/NoteBook1/Downloads/ummense-tasks-extraction (4).json';
const TARGET = 'C:/Users/NoteBook1/Downloads/ummense-tasks-extraction-delta.json';

// 1. Snapshot SQL
console.log('[1/3] Baixando snapshot do banco...');
const sshCmd = `ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no ${SSH_HOST} "docker exec ktask-postgres psql -U ktask -d ktask -At -c \\"SELECT c.\\\\\\"shortCode\\\\\\" || '|' || LOWER(TRIM(it.text)) FROM \\\\\\"Card\\\\\\" c JOIN \\\\\\"Checklist\\\\\\" cl ON cl.\\\\\\"cardId\\\\\\" = c.id AND LOWER(cl.title) = 'tarefas' JOIN \\\\\\"ChecklistItem\\\\\\" it ON it.\\\\\\"checklistId\\\\\\" = cl.id\\""`;
const raw = execSync(sshCmd, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, shell: 'bash' });
const existing = new Set(raw.split('\n').filter(Boolean));
console.log(`    ${existing.size} items existentes`);

// 2. Diff. Importer trunca text a 500 chars antes de salvar — pra match
// fair, comparamos JSON.text também truncado a 500.
const norm = (s) => (s ?? '').toString().slice(0, 500).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const data = JSON.parse(fs.readFileSync(SOURCE, 'utf-8'));
const delta = {};
let totalJson = 0, totalDelta = 0, cardsDelta = 0;
for (const [board, arr] of Object.entries(data)) {
  if (!Array.isArray(arr)) { delta[board] = arr; continue; }
  delta[board] = [];
  for (const c of arr) {
    const newTasks = (c.tasks ?? []).filter((t) => {
      totalJson++;
      return !existing.has(`${c.ticket}|${norm(t.name)}`);
    });
    if (newTasks.length > 0) {
      delta[board].push({ ...c, tasks: newTasks });
      totalDelta += newTasks.length;
      cardsDelta++;
    }
  }
}

// 3. Salva
fs.writeFileSync(TARGET, JSON.stringify(delta, null, 2));
console.log(`[2/3] JSON delta gravado: ${TARGET}`);
console.log(`[3/3] Resumo:`);
console.log(`  JSON original: ${totalJson} tasks`);
console.log(`  Delta:         ${totalDelta} tasks faltantes em ${cardsDelta} cards`);
console.log(`  Cobertura ja: ${((1 - totalDelta / totalJson) * 100).toFixed(1)}%`);

// Breakdown por board
console.log(`\nDelta por board:`);
for (const [b, arr] of Object.entries(delta)) {
  if (!Array.isArray(arr) || arr.length === 0) continue;
  const tasks = arr.reduce((s, c) => s + c.tasks.length, 0);
  console.log(`  ${b.padEnd(40)} ${arr.length} cards · ${tasks} tasks`);
}
