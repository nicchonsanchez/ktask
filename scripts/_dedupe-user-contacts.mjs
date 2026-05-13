#!/usr/bin/env node
// Doc 50 — script one-time: pra cada Contact da Org cujo email/phone
// bate com um User, faz auto-vincular via /contacts/:id/link-user.
// Reporta o que fez sem deletar nada (regra conservadora — usuário decide
// depois se quer remover o Contact original).
//
// Caso típico: Maciana existe como User E como Contact (sobra do import
// Ummense). Esse script linka os dois.
//
// Edge case: Contact tipo COMPANY (erro de cadastro, ex: Maciana hoje).
// Linkar uma COMPANY a um User não faz sentido — vamos:
//   - Reportar como "skipped: COMPANY type (revise manualmente)"
//   - NÃO mexer (segurança)
//
// Modo dry-run: `--dry-run` só lista. Sem flag, aplica.

import fs from 'node:fs';

const API = 'https://api.ktask.agenciakharis.com.br/api/v1';
const DRY_RUN = process.argv.includes('--dry-run');

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
  if (!r.ok) throw new Error('login: ' + r.status);
  TOKEN = (await r.json()).accessToken;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(ep, opts = {}) {
  const r = await fetch(API + ep, {
    ...opts,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${r.status} ${ep}: ${t.slice(0, 300)}`);
  }
  await sleep(500);
  return r.json();
}

await login();

console.log(`[mode] ${DRY_RUN ? 'DRY RUN (apenas lista)' : 'APPLY'}`);

// 1. Lista todos os Contacts (sem vínculo ainda)
const all = await api('/contacts?linkStatus=unlinked');
console.log(`[scan] ${all.length} Contacts sem vínculo`);

// 2. Pra cada um, busca sugestões (= Users que casam por email/phone).
// O serviço já tem o endpoint de sugestões DO USER pro contato, mas o
// que queremos é o contrário (pro contato → user). Vamos usar o
// `userMatch` do detalhe — já é calculado pelo backend.
const candidates = [];
let scanned = 0;
for (const c of all) {
  scanned++;
  if (scanned % 50 === 0) console.log(`  [scan ${scanned}/${all.length}]`);
  // getOne traz userMatch
  const detail = await api(`/contacts/${c.id}`);
  if (detail.userMatch?.id) {
    candidates.push({
      contactId: c.id,
      contactName: c.name,
      contactType: c.type,
      contactEmail: c.email,
      contactPhone: c.phone,
      userId: detail.userMatch.id,
      userName: detail.userMatch.name,
    });
  }
}
console.log(`[match] ${candidates.length} candidato(s) com userMatch`);

const results = { linked: [], skippedCompany: [], errors: [] };

for (const cand of candidates) {
  if (cand.contactType === 'COMPANY') {
    console.log(`  [skip:COMPANY] "${cand.contactName}" (tipo errado, revise manualmente)`);
    results.skippedCompany.push(cand);
    continue;
  }
  if (DRY_RUN) {
    console.log(`  [would-link] "${cand.contactName}" → User "${cand.userName}"`);
    results.linked.push({ ...cand, applied: false });
    continue;
  }
  try {
    await api(`/contacts/${cand.contactId}/link-user`, {
      method: 'POST',
      body: JSON.stringify({ userId: cand.userId }),
    });
    console.log(`  [linked] "${cand.contactName}" → User "${cand.userName}"`);
    results.linked.push({ ...cand, applied: true });
  } catch (e) {
    console.error(`  [err] "${cand.contactName}": ${e.message.slice(0, 150)}`);
    results.errors.push({ ...cand, err: e.message.slice(0, 200) });
  }
}

console.log('\n===== RESULTADO =====');
console.log('Linked:               ', results.linked.length);
console.log('Skipped (tipo COMPANY):', results.skippedCompany.length);
console.log('Erros:                ', results.errors.length);
fs.writeFileSync(`tarefas-md/dedupe-user-contacts-${Date.now()}.json`, JSON.stringify(results, null, 2));
console.log('\nRelatório salvo em tarefas-md/dedupe-user-contacts-*.json');
if (results.skippedCompany.length > 0) {
  console.log('\n⚠ Contacts tipo COMPANY com nome de pessoa (ex: Maciana):');
  for (const s of results.skippedCompany) {
    console.log(`  - "${s.contactName}" (id=${s.contactId}) → User ${s.userName}`);
    console.log(`    Sugestão: muda type pra PERSON via UI e rode novamente, OU vincula manualmente.`);
  }
}
