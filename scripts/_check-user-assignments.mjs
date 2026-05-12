// Cruza tasks de um user no JSON Ummense com items no KTask e atribui
// quem deveria ter assignee == user mas está sem dono.
//
// Uso: TARGET=maciana node scripts/_check-user-assignments.mjs
// Slugs aceitos: anna, maciana, dhyo, fernanda, nicchon, thiago, carol, leila

import fs from 'node:fs';

const API = 'https://api.ktask.agenciakharis.com.br/api/v1';
const APPLY = process.env.APPLY !== '0';
const TARGET = (process.env.TARGET || 'anna').toLowerCase();

const USERS = {
  anna: { ktaskId: 'cmodbh8wn000fmk6z3npyb38a', names: ['Anna Catarina Fonseca', 'Anna Catarina'] },
  maciana: { ktaskId: 'cmodbh8xa000lmk6za9bw9x2e', names: ['Maciana Ferreira Silva', 'Maciana Ferreira', 'Maciana'] },
  dhyovaine: { ktaskId: 'cmodbh8vm0003mk6zt77g38jz', names: ['Dhyovaine', 'Dhyovaine '] },
  fernanda: { ktaskId: 'cmodbh8vt0006mk6zhcxhzta7', names: ['Fernanda Biazatti', 'Fernanda'] },
  nicchon: { ktaskId: 'cmod1pix00000o2aup3a6l23h', names: ['Nicchon Sanchez', 'Nicchon'] },
  thiago: { ktaskId: 'cmodbh8w30009mk6z7s00hewy', names: ['Thiago Bueno', 'Thiago'] },
  carol: { ktaskId: 'cmodbh8wy000imk6zoceq0123', names: ['Carol - Aliança Francesa Assunção', 'Carol'] },
  leila: { ktaskId: 'cmodbh8we000cmk6z7k3for30', names: ['Leila Oliveira', 'Leila'] },
};

const user = USERS[TARGET];
if (!user) {
  console.error('TARGET inválido. Opções:', Object.keys(USERS).join(', '));
  process.exit(1);
}

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
    if (r.status === 429 && i < retries) { await sleep((i + 1) * 8000); continue; }
    if ([502, 503, 504].includes(r.status) && i < retries) { await sleep(10000); continue; }
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`${r.status} ${ep}`);
    return r.json();
  }
}

const norm = (s) => (s ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const data = JSON.parse(fs.readFileSync('C:/Users/NoteBook1/Downloads/ummense-tasks-extraction (4).json', 'utf-8'));

await login();

console.log(`Target: ${TARGET} (${user.names[0]}) ID=${user.ktaskId}`);

const byTicket = new Map();
for (const arr of Object.values(data)) {
  if (!Array.isArray(arr)) continue;
  for (const c of arr) {
    for (const t of c.tasks ?? []) {
      if (user.names.includes(t.userName)) {
        if (!byTicket.has(c.ticket)) byTicket.set(c.ticket, []);
        byTicket.get(c.ticket).push(t.name);
      }
    }
  }
}
const totalTasks = [...byTicket.values()].reduce((s, a) => s + a.length, 0);
console.log(`JSON: ${totalTasks} tasks em ${byTicket.size} cards`);

let okJa = 0, fixados = 0, outroUser = 0, naoEncontrado = 0, falhas = 0;
let i = 0;
for (const [ticket, texts] of byTicket) {
  i++;
  if (i % 25 === 0) {
    console.log(`  ${i}/${byTicket.size} — fixados=${fixados} já=${okJa} outro=${outroUser} 429=${falhas}`);
  }
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
      const cur = found.assignee?.id ?? found.assigneeId ?? null;
      if (cur === user.ktaskId) { okJa++; continue; }
      if (cur) { outroUser++; continue; }
      if (APPLY) {
        try {
          await api(`/checklists/items/${found.id}`, {
            method: 'PATCH', body: JSON.stringify({ assigneeId: user.ktaskId }),
          });
          fixados++;
        } catch { falhas++; }
        await sleep(350); // slower pra nao competir com import
      }
    }
  } catch { falhas++; }
  await sleep(200);
}

console.log('\n========== RESUMO ==========');
console.log(`Já atribuídos:                ${okJa}`);
console.log(`Fixados agora:                ${fixados}`);
console.log(`Atribuídos a outro user:      ${outroUser}`);
console.log(`Item/card não encontrado:     ${naoEncontrado}`);
console.log(`Falhas:                       ${falhas}`);
console.log(`\nRerodar pra completar: TARGET=${TARGET} node scripts/_check-user-assignments.mjs`);
