#!/usr/bin/env node
// Seed de um quadro ficticio "Demo — Site Acme Construcoes" pra
// screenshots de portfolio/divulgacao do KTask.
//
// Tema: Desenvolvimento de site institucional.
// Listas: Briefing -> Design -> Desenvolvimento -> QA/Revisao -> Publicado.
// Membros: Nicchon, Lucas, Fernanda, Dhyovaine, Fabio (match por primeiro
// nome contra GET /organizations/members).
//
// Uso:
//   API_URL=https://api.ktask.agenciakharis.com.br/api/v1 \
//   TOKEN=<jwt-do-owner> \
//   node scripts/seed-demo-board.mjs
//
// (TOKEN: copie de localStorage["ktask:access"] depois de logar como OWNER
// no dominio da ktask.agenciakharis.com.br, ou use refresh via /auth/login
// rodando o script em --auth-mode=login com EMAIL+PASSWORD env vars.)

const API = process.env.API_URL || 'https://api.ktask.agenciakharis.com.br/api/v1';
const BOARD_NAME = process.env.BOARD_NAME || 'Demo — Site Acme Construções';

let TOKEN = process.env.TOKEN;
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;

const TARGET_NAMES = ['Nicchon', 'Lucas', 'Fernanda', 'Dhyovaine', 'Thiago'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(ep, opts = {}, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = await fetch(API + ep, {
      ...opts,
      headers: {
        ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}),
        'Content-Type': 'application/json',
        ...(opts.headers ?? {}),
      },
    });
    const t = await r.text();
    let b;
    try {
      b = t ? JSON.parse(t) : null;
    } catch {
      b = t;
    }
    if (r.status === 429 && attempt < retries) {
      await sleep([1000, 3000][attempt]);
      continue;
    }
    if (!r.ok) {
      const msg = typeof b === 'object' ? b?.message ?? JSON.stringify(b) : b;
      throw new Error(`${r.status} ${opts.method || 'GET'} ${ep}: ${msg}`);
    }
    await sleep(120);
    return b;
  }
}

async function loginIfNeeded() {
  if (TOKEN) return;
  if (!EMAIL || !PASSWORD)
    throw new Error('Sem TOKEN e sem EMAIL/PASSWORD. Defina TOKEN ou EMAIL+PASSWORD.');
  console.log('[auth] login com email/senha…');
  const r = await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Login falhou: ${r.status} ${t}`);
  }
  const body = await r.json();
  TOKEN = body.accessToken;
  if (!TOKEN) throw new Error('Login OK mas sem accessToken na resposta.');
  console.log('[auth] OK');
}

const norm = (s) =>
  (s ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

function pickMember(members, firstName) {
  const target = norm(firstName);
  const matches = members.filter((m) => {
    const first = norm(m.user.name).split(/\s+/)[0];
    return first === target;
  });
  if (matches.length === 0) {
    const fuzzy = members.filter((m) => norm(m.user.name).includes(target));
    if (fuzzy.length === 1) return fuzzy[0];
    if (fuzzy.length === 0)
      throw new Error(`Nenhum membro encontrado pra "${firstName}". Adicione na org primeiro.`);
    throw new Error(
      `Membros ambiguos pra "${firstName}": ${fuzzy.map((m) => m.user.name).join(', ')}.`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `Membros ambiguos pra "${firstName}": ${matches.map((m) => m.user.name).join(', ')}.`,
    );
  }
  return matches[0];
}

// =================== DATA SEED ===================
// Cores de card disponiveis no schema: slate, rose, orange, amber, emerald,
// sky, violet, pink, ou null. Uso pra dar vida visual aos prints.

const LISTS = [
  { name: 'Briefing', isBacklog: false, isFinalList: false },
  { name: 'Design', isBacklog: false, isFinalList: false },
  { name: 'Desenvolvimento', isBacklog: false, isFinalList: false },
  { name: 'QA / Revisão', isBacklog: false, isFinalList: false },
  { name: 'Publicado', isBacklog: false, isFinalList: true },
];

// dias relativos a hoje. Negativo = passado (atrasado), 0 = hoje, positivo = futuro.
function daysFromNow(d) {
  const dt = new Date();
  dt.setHours(12, 0, 0, 0);
  dt.setDate(dt.getDate() + d);
  return dt.toISOString();
}

// Cards: lista, titulo, cor, dueDate (offset em dias), membros (nomes),
// descricao curta, checklist items.
const CARDS = [
  // ----- Briefing -----
  {
    list: 'Briefing',
    title: 'Reunião de discovery com cliente',
    cardColor: 'slate',
    due: -2,
    members: ['Nicchon'],
    description: 'Mapear personas, objetivos do site e arquitetura de informação.',
    checklist: [
      { text: 'Pauta da reunião', done: true, who: 'Nicchon', due: -3 },
      { text: 'Ata + gravação no Drive', done: true, who: 'Nicchon', due: -2 },
      { text: 'Personas validadas pelo cliente', done: false, who: 'Nicchon', due: -1 },
    ],
  },
  {
    list: 'Briefing',
    title: 'Documento de escopo final',
    cardColor: 'slate',
    due: 1,
    members: ['Nicchon', 'Fernanda'],
    description: 'Consolidar páginas, integrações e prazos. Aprovação por escrito do cliente.',
    checklist: [
      { text: 'Lista de páginas e fluxos', done: true, who: 'Nicchon', due: 0 },
      { text: 'Integrações (CRM, WhatsApp, Analytics)', done: false, who: 'Nicchon', due: 1 },
      { text: 'Cronograma de entregas', done: false, who: 'Nicchon', due: 1 },
      { text: 'Assinatura do cliente', done: false, who: 'Nicchon', due: 2 },
    ],
  },

  // ----- Design -----
  {
    list: 'Design',
    title: 'Wireframes de baixa fidelidade',
    cardColor: 'violet',
    due: 0,
    members: ['Fernanda'],
    description: 'Estrutura das 6 páginas principais — sem cor, foco em hierarquia.',
    checklist: [
      { text: 'Home', done: true, who: 'Fernanda', due: -1 },
      { text: 'Sobre / Quem somos', done: true, who: 'Fernanda', due: 0 },
      { text: 'Serviços', done: false, who: 'Fernanda', due: 0 },
      { text: 'Contato', done: false, who: 'Fernanda', due: 1 },
    ],
  },
  {
    list: 'Design',
    title: 'UI Kit + design tokens',
    cardColor: 'violet',
    due: 3,
    members: ['Fernanda'],
    description: 'Tipografia, paleta, espaçamentos e componentes base no Figma.',
    checklist: [
      { text: 'Paleta primária + neutros', done: false, who: 'Fernanda', due: 2 },
      { text: 'Tipografia (display + body)', done: false, who: 'Fernanda', due: 2 },
      { text: 'Botões (primary/secondary/ghost)', done: false, who: 'Fernanda', due: 3 },
      { text: 'Cards e formulários', done: false, who: 'Fernanda', due: 3 },
    ],
  },
  {
    list: 'Design',
    title: 'Hero da home — 3 variações',
    cardColor: 'pink',
    due: 5,
    members: ['Fernanda', 'Nicchon'],
    description: 'Apresentar 3 propostas de hero. Cliente escolhe na quinta.',
    checklist: [
      { text: 'Variação A — foto institucional', done: false, who: 'Fernanda', due: 4 },
      { text: 'Variação B — vídeo loop', done: false, who: 'Fernanda', due: 5 },
      { text: 'Variação C — ilustração', done: false, who: 'Fernanda', due: 5 },
    ],
  },

  // ----- Desenvolvimento -----
  {
    list: 'Desenvolvimento',
    title: 'Setup do projeto Next.js 15 + Tailwind',
    cardColor: 'sky',
    due: -1,
    members: ['Lucas'],
    description: 'Repositório, CI mínimo, deploy preview na Vercel.',
    checklist: [
      { text: 'Criar repo no GitHub (kharis-edu)', done: true, who: 'Lucas', due: -2 },
      { text: 'pnpm + tsconfig + eslint + prettier', done: true, who: 'Lucas', due: -2 },
      { text: 'Deploy preview Vercel', done: true, who: 'Lucas', due: -1 },
      { text: 'Domínio staging configurado', done: true, who: 'Lucas', due: -1 },
    ],
  },
  {
    list: 'Desenvolvimento',
    title: 'Header e Footer (responsivo)',
    cardColor: 'sky',
    due: 0,
    members: ['Lucas', 'Dhyovaine'],
    description: 'Navegação principal com sub-menu e footer com 4 colunas.',
    checklist: [
      { text: 'Markup base + Tailwind', done: true, who: 'Lucas', due: -1 },
      { text: 'Menu mobile (hamburger)', done: false, who: 'Dhyovaine', due: 0 },
      { text: 'Acessibilidade (focus, ARIA)', done: false, who: 'Dhyovaine', due: 1 },
    ],
  },
  {
    list: 'Desenvolvimento',
    title: 'Página de serviços com CMS',
    cardColor: 'sky',
    due: 2,
    members: ['Dhyovaine'],
    description: 'Listagem dinâmica vinda do Sanity. Filtro por categoria no front.',
    checklist: [
      { text: 'Schema do Sanity', done: false, who: 'Dhyovaine', due: 1 },
      { text: 'Query + tipos no Next', done: false, who: 'Dhyovaine', due: 2 },
      { text: 'Componente de listagem + filtro', done: false, who: 'Dhyovaine', due: 2 },
      { text: 'Página de detalhe do serviço', done: false, who: 'Dhyovaine', due: 3 },
    ],
  },
  {
    list: 'Desenvolvimento',
    title: 'Formulário de contato + integração CRM',
    cardColor: 'amber',
    due: 4,
    members: ['Lucas'],
    description: 'Lead chega no RD Station + dispara WhatsApp pro comercial.',
    checklist: [
      { text: 'Validação Zod', done: false, who: 'Lucas', due: 3 },
      { text: 'Integração RD Station (API)', done: false, who: 'Lucas', due: 4 },
      { text: 'Disparo WhatsApp via Evolution', done: false, who: 'Lucas', due: 5 },
      { text: 'Teste end-to-end', done: false, who: 'Thiago', due: 5 },
    ],
  },

  // ----- QA / Revisão -----
  {
    list: 'QA / Revisão',
    title: 'Testes de responsividade',
    cardColor: 'amber',
    due: 0,
    members: ['Thiago'],
    description: 'Mobile (iPhone SE, 12, 14 Pro), tablet (iPad), desktop (1280, 1920).',
    checklist: [
      { text: 'Mobile — iPhone SE', done: true, who: 'Thiago', due: -1 },
      { text: 'Mobile — iPhone 14 Pro', done: false, who: 'Thiago', due: 0 },
      { text: 'Tablet — iPad horizontal', done: false, who: 'Thiago', due: 0 },
      { text: 'Desktop 1920px', done: false, who: 'Thiago', due: 1 },
    ],
  },
  {
    list: 'QA / Revisão',
    title: 'Auditoria de SEO on-page (Lighthouse)',
    cardColor: 'amber',
    due: 1,
    members: ['Thiago', 'Lucas'],
    description: 'Performance, acessibilidade, SEO e best practices ≥ 90.',
    checklist: [
      { text: 'Meta tags e Open Graph', done: false, who: 'Thiago', due: 1 },
      { text: 'Schema.org (LocalBusiness)', done: false, who: 'Thiago', due: 1 },
      { text: 'Sitemap.xml + robots.txt', done: false, who: 'Lucas', due: 2 },
      { text: 'Imagens otimizadas (next/image)', done: false, who: 'Lucas', due: 2 },
    ],
  },

  // ----- Publicado -----
  {
    list: 'Publicado',
    title: 'Ambiente de staging no ar',
    cardColor: 'emerald',
    due: -3,
    complete: true,
    members: ['Lucas', 'Dhyovaine'],
    description: 'staging.acme.com.br online com SSL automático e basic auth.',
    checklist: [
      { text: 'Configurar Caddy', done: true, who: 'Lucas', due: -4 },
      { text: 'Basic auth pro cliente revisar', done: true, who: 'Dhyovaine', due: -3 },
      { text: 'Comunicar URL ao cliente', done: true, who: 'Nicchon', due: -3 },
    ],
  },
];

// =================== MAIN ===================

(async () => {
  const log = (...a) => console.log(...a);
  const sep = (m) => log('\n========== ' + m + ' ==========');

  await loginIfNeeded();

  sep('1. ORG MEMBERS');
  const members = await api('/organizations/members');
  log(`Total na org: ${members.length}`);
  const memberMap = {};
  for (const name of TARGET_NAMES) {
    const m = pickMember(members, name);
    memberMap[name] = { id: m.user.id, name: m.user.name };
    log(`  ${name.padEnd(12)} -> ${m.user.name} (${m.user.id})`);
  }

  sep('2. CRIA BOARD');
  const board = await api('/boards', {
    method: 'POST',
    body: JSON.stringify({
      name: BOARD_NAME,
      description: 'Quadro de exemplo — site institucional para Acme Construções (cliente fictício).',
      visibility: 'ORGANIZATION',
      color: '#0EA5E9',
    }),
  });
  log(`Board criado: ${board.name} (${board.id})`);

  sep('3. AJUSTA LISTAS');
  const detail = await api('/boards/' + board.id);
  for (const dl of detail.lists ?? []) {
    await api('/lists/' + dl.id, {
      method: 'PATCH',
      body: JSON.stringify({ isArchived: true }),
    });
    log(`  arquivada default: ${dl.name}`);
  }

  const listMap = {}; // name -> id
  let pos = 1024;
  for (const l of LISTS) {
    const created = await api('/lists', {
      method: 'POST',
      body: JSON.stringify({ name: l.name, boardId: board.id }),
    });
    await api('/lists/' + created.id, {
      method: 'PATCH',
      body: JSON.stringify({
        position: pos,
        isFinalList: l.isFinalList,
        isBacklog: l.isBacklog,
      }),
    });
    listMap[l.name] = created.id;
    log(`  + ${l.name} @ ${pos}${l.isFinalList ? ' [FINAL]' : ''}`);
    pos += 1024;
  }

  sep('4. ADICIONA MEMBROS AO BOARD');
  for (const name of TARGET_NAMES) {
    const userId = memberMap[name].id;
    try {
      await api('/boards/' + board.id + '/members', {
        method: 'POST',
        body: JSON.stringify({ userId, role: 'EDITOR' }),
      });
      log(`  + ${name} como EDITOR`);
    } catch (e) {
      log(`  WARN ${name}: ${e.message}`);
    }
  }

  sep('5. CRIA CARDS + CHECKLISTS');
  let cardsCreated = 0;
  let itemsCreated = 0;
  for (const c of CARDS) {
    const listId = listMap[c.list];
    if (!listId) {
      log(`  SKIP "${c.title}" — lista "${c.list}" nao existe`);
      continue;
    }
    const card = await api('/cards', {
      method: 'POST',
      body: JSON.stringify({
        listId,
        title: c.title,
        description: c.description ?? null,
        cardColor: c.cardColor ?? null,
        dueDate: c.due != null ? daysFromNow(c.due) : null,
      }),
    });
    cardsCreated++;
    log(`  [${c.list}] "${c.title}" (${card.id})`);

    for (const memberName of c.members ?? []) {
      const userId = memberMap[memberName]?.id;
      if (!userId) continue;
      try {
        await api('/cards/' + card.id + '/members', {
          method: 'POST',
          body: JSON.stringify({ userId }),
        });
      } catch (e) {
        log(`    WARN assign ${memberName}: ${e.message}`);
      }
    }

    if (c.checklist?.length) {
      const cl = await api('/checklists', {
        method: 'POST',
        body: JSON.stringify({ cardId: card.id, title: 'Tarefas' }),
      });
      for (const it of c.checklist) {
        const assigneeId = it.who ? memberMap[it.who]?.id : undefined;
        const created = await api('/checklists/' + cl.id + '/items', {
          method: 'POST',
          body: JSON.stringify({
            text: it.text,
            ...(assigneeId !== undefined ? { assigneeId } : {}),
            ...(it.due != null ? { dueDate: daysFromNow(it.due) } : {}),
          }),
        });
        itemsCreated++;
        if (it.done) {
          await api('/checklists/items/' + created.id, {
            method: 'PATCH',
            body: JSON.stringify({ isDone: true }),
          });
        }
      }
    }

    if (c.complete) {
      try {
        await api('/cards/' + card.id + '/complete', { method: 'POST' });
      } catch (e) {
        log(`    WARN complete: ${e.message}`);
      }
    }
  }

  sep('FIM');
  log(`Board: ${BOARD_NAME}`);
  log(`Cards: ${cardsCreated}`);
  log(`Itens de checklist: ${itemsCreated}`);
  log(`Membros: ${TARGET_NAMES.length}`);
  log(`\nAbra: https://ktask.agenciakharis.com.br/b/${board.id}`);
})().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
