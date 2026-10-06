#!/usr/bin/env node
// Doc 52 (Fase 4, secao 12.1): cria as 6 metas de EXEMPLO do Comercial,
// calibradas no ritmo real do "Relações Institucionais Kharis" (jul-set/2026).
// O Lucas ajusta alvos, desativa ou remove depois pela tela de Metas.
//
// Idempotente: pula metas que ja existem com o mesmo nome.
// Passa pela API (mesmas validacoes da tela). Requer Dono/Admin.
//
// Uso:
//   API_URL=https://api.ktask.agenciakharis.com.br/api/v1 \
//   EMAIL=<dono-ou-admin> PASSWORD=<senha> \
//   node scripts/ops/seed-metas-exemplo.mjs [--dry-run]
//
// Variaveis opcionais: USER_NAME (default "FABIO MACHADO"),
// BOARD_NAME (default "Relações Institucionais Kharis").

const API = process.env.API_URL || 'http://localhost:4000/api/v1';
const USER_NAME = (process.env.USER_NAME || 'FABIO MACHADO').toLowerCase();
const BOARD_NAME = (process.env.BOARD_NAME || 'Relações Institucionais Kharis').toLowerCase();
const DRY = process.argv.includes('--dry-run');

let TOKEN = process.env.TOKEN || '';

async function api(path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  const text = await r.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!r.ok)
    throw new Error(`${opts.method || 'GET'} ${path} -> ${r.status} ${text.slice(0, 300)}`);
  return body;
}

async function main() {
  if (!TOKEN) {
    if (!process.env.EMAIL || !process.env.PASSWORD) {
      throw new Error('Informe TOKEN ou EMAIL + PASSWORD (Dono/Admin).');
    }
    const login = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: process.env.EMAIL, password: process.env.PASSWORD }),
    });
    TOKEN = login.accessToken;
  }

  const members = await api('/organizations/members');
  const person = members.find((m) => m.user.name.toLowerCase() === USER_NAME);
  if (!person) throw new Error(`Pessoa "${USER_NAME}" nao encontrada na organizacao.`);

  const boards = await api('/boards');
  const board = boards.find((b) => b.name.toLowerCase() === BOARD_NAME);
  if (!board) throw new Error(`Fluxo "${BOARD_NAME}" nao encontrado.`);

  const goals = [
    {
      name: 'Contatos realizados (exemplo)',
      metric: 'CONTACTS_DONE',
      scopeType: 'USER',
      scopeId: person.user.id,
      period: 'WEEK',
      target: 40,
    },
    {
      name: 'Reuniões agendadas (exemplo)',
      metric: 'MEETINGS_SCHEDULED',
      scopeType: 'USER',
      scopeId: person.user.id,
      period: 'WEEK',
      target: 2,
    },
    {
      name: 'Reuniões realizadas (exemplo)',
      metric: 'MEETINGS_HELD',
      scopeType: 'USER',
      scopeId: person.user.id,
      period: 'MONTH',
      target: 6,
    },
    {
      name: 'Propostas enviadas (exemplo)',
      metric: 'PROPOSALS_SENT',
      scopeType: 'USER',
      scopeId: person.user.id,
      period: 'MONTH',
      target: 6,
    },
    {
      name: 'Avanços no funil (exemplo)',
      metric: 'ADVANCES',
      scopeType: 'BOARD',
      scopeId: board.id,
      period: 'WEEK',
      target: 12,
    },
    {
      name: 'Fechamentos (exemplo)',
      metric: 'COMPLETIONS',
      scopeType: 'BOARD',
      scopeId: board.id,
      period: 'MONTH',
      target: 3,
    },
  ];

  const existing = new Set((await api('/performance/goals')).map((g) => g.name));
  for (const g of goals) {
    if (existing.has(g.name)) {
      console.log(`= ja existe: ${g.name}`);
      continue;
    }
    if (DRY) {
      console.log(`~ criaria: ${g.name} (${g.metric}, alvo ${g.target})`);
      continue;
    }
    await api('/performance/goals', { method: 'POST', body: JSON.stringify(g) });
    console.log(`+ criada: ${g.name}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
