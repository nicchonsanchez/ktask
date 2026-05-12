// Idempotente: re-cruza tasks da Anna do JSON com KTask e atribui ela
// nos items sem assignee. Rodar várias vezes se 429.

import fs from 'node:fs';

const API = 'https://api.ktask.agenciakharis.com.br/api/v1';
const APPLY = process.env.APPLY !== '0'; // default APPLY=1

const env = {};
for (const line of fs.readFileSync('.env.ops', 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

let TOKEN;
async function login() {
  const r = await fetch(API + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.KTASK_BOT_EMAIL, password: env.KTASK_BOT_PASSWORD }),
  });
  TOKEN = (await r.json()).accessToken;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(ep, opts = {}, retries = 4) {
  for (let i = 0; i <= retries; i++) {
    const r = await fetch(API + ep, {
      ...opts,
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
    });
    if (r.status === 401) { await login(); continue; }
    if (r.status === 429 && i < retries) { await sleep((i + 1) * 5000); continue; }
    if ([502, 503, 504].includes(r.status) && i < retries) { await sleep(8000); continue; }
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`${r.status} ${ep}`);
    return r.json();
  }
}

const norm = (s) => (s ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const data = JSON.parse(fs.readFileSync('C:/Users/NoteBook1/Downloads/ummense-tasks-extraction (4).json', 'utf-8'));
const ANNA_NAMES = ['Anna Catarina Fonseca', 'Anna Catarina'];
const ANNA_ID = 'cmodbh8wn000fmk6z3npyb38a';

await login();

const annaByTicket = new Map();
for (const arr of Object.values(data)) {
  if (!Array.isArray(arr)) continue;
  for (const c of arr) {
    for (const t of c.tasks ?? []) {
      if (ANNA_NAMES.includes(t.userName)) {
        if (!annaByTicket.has(c.ticket)) annaByTicket.set(c.ticket, []);
        annaByTicket.get(c.ticket).push(t.name);
      }
    }
  }
}
console.log(`Anna no JSON: ${[...annaByTicket.values()].reduce((s, a) => s + a.length, 0)} tasks em ${annaByTicket.size} cards`);

let okJa = 0, fixados = 0, otherUser = 0, naoEncontrado = 0, falhas = 0;
let i = 0;
for (const [ticket, texts] of annaByTicket) {
  i++;
  if (i % 25 === 0) console.log(`  ${i}/${annaByTicket.size} — fixados=${fixados} já=${okJa} 429=${falhas}`);
  try {
    const ref = await api('/cards/by-code/' + encodeURIComponent(ticket));
    if (!ref?.id) { naoEncontrado += texts.length; continue; }
    const detail = await api('/cards/' + ref.id);
    const checklist = (detail?.checklists ?? []).find((cl) => norm(cl.title) === 'tarefas');
    const items = checklist?.items ?? [];
    const byText = new Map(items.map((it) => [norm(it.text), it]));
    for (const text of texts) {
      const found = byText.get(norm(text));
      if (!found) { naoEncontrado++; continue; }
      const curAssignee = found.assignee?.id ?? found.assigneeId ?? null;
      if (curAssignee === ANNA_ID) { okJa++; continue; }
      if (curAssignee && curAssignee !== ANNA_ID) { otherUser++; continue; }
      // Sem assignee — fix
      if (APPLY) {
        try {
          await api(`/checklists/items/${found.id}`, {
            method: 'PATCH', body: JSON.stringify({ assigneeId: ANNA_ID }),
          });
          fixados++;
        } catch (e) {
          falhas++;
        }
        await sleep(200);
      }
    }
  } catch (e) {
    falhas++;
  }
  await sleep(80);
}

console.log('\n========== RESUMO ==========');
console.log(`Já atribuídos à Anna:    ${okJa}`);
console.log(`Fixados agora:           ${fixados}`);
console.log(`Atribuídos a outro user: ${otherUser}`);
console.log(`Item/card não encontrado: ${naoEncontrado}`);
console.log(`Falhas (429/erro):       ${falhas}`);
console.log(`\nRerodar pra zerar falhas: node scripts/_check-anna-assignments.mjs`);
