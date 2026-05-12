import fs from 'node:fs';
import { execSync } from 'node:child_process';

const SSH_KEY = `${process.env.HOME}/.ssh/ktask-deploy`;
const SSH_HOST = 'root@178.104.220.28';

const sshCmd = `ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no ${SSH_HOST} "docker exec ktask-postgres psql -U ktask -d ktask -At -c \\"SELECT c.\\\\\\"shortCode\\\\\\" || '|' || LOWER(TRIM(it.text)) FROM \\\\\\"Card\\\\\\" c JOIN \\\\\\"Checklist\\\\\\" cl ON cl.\\\\\\"cardId\\\\\\" = c.id AND LOWER(cl.title) = 'tarefas' JOIN \\\\\\"ChecklistItem\\\\\\" it ON it.\\\\\\"checklistId\\\\\\" = cl.id\\""`;
const raw = execSync(sshCmd, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, shell: 'bash' });
const existing = new Set(raw.split('\n').filter(Boolean));

const norm = (s) =>
  (s ?? '').toString().slice(0, 500).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const F = JSON.parse(
  fs.readFileSync('C:/Users/NoteBook1/Downloads/ummense-tasks-extraction (4).json', 'utf-8'),
);

let totalJson = 0, jsonInBank = 0, jsonMissing = 0;
const missingSamples = [];
for (const arr of Object.values(F)) {
  if (!Array.isArray(arr)) continue;
  for (const c of arr) {
    for (const t of c.tasks ?? []) {
      totalJson++;
      const key = `${c.ticket}|${norm(t.name)}`;
      if (existing.has(key)) jsonInBank++;
      else {
        jsonMissing++;
        if (missingSamples.length < 5) missingSamples.push({ ticket: c.ticket, text: t.name.slice(0, 60) });
      }
    }
  }
}

console.log('━'.repeat(60));
console.log('VALIDAÇÃO DO DELTA');
console.log('━'.repeat(60));
console.log(`Items no banco (total):          ${existing.size}`);
console.log(`Tasks no JSON (total):           ${totalJson}`);
console.log(`JSON match no banco (já importado): ${jsonInBank}  ← está OK`);
console.log(`JSON sem match (= tamanho delta):   ${jsonMissing}  ← vai pro delta`);
console.log(`Items banco sem match no JSON:   ${existing.size - jsonInBank}`);
console.log(`  └ itens criados manualmente, CSV import antigo, ou edições pós-import`);
console.log('━'.repeat(60));
console.log(`Amostra delta (não no banco):`);
for (const m of missingSamples) console.log(`  • ${m.ticket}  "${m.text}"`);
