#!/usr/bin/env node
// Cria 13 cards no board Tecnologia / Backlog representando o trabalho
// dos commits de 13 e 14/05/2026.
//
// Cada card:
//   - title: "KTask | <descricao>"
//   - description: escopo + commits + perido (markdown simples)
//   - listId: Backlog do board Tecnologia (descoberto via /boards)
//   - status: COMPLETED (forca registro de completedAt)
//   - completedAt: horario do ULTIMO commit do agrupamento (override via PATCH)
//   - checklist: itens auxiliares quando faz sentido (marcados como done)
//
// LIMITACAO: a API nao permite override de createdAt. Cada card sai com
// createdAt = now(). O horario real do PRIMEIRO commit (inicio do trabalho)
// fica registrado na descricao do card.
//
// Idempotente: pula card cujo titulo ja existe no board.
//
// Uso:
//   node scripts/seed-tecnologia-cards-commits.mjs
//   (autentica via .env.ops -> KTASK_BOT_EMAIL + KTASK_BOT_PASSWORD)
//
// Ou:
//   TOKEN=<jwt> node scripts/seed-tecnologia-cards-commits.mjs

import fs from 'node:fs';

const API = 'https://api.ktask.agenciakharis.com.br/api/v1';
const TARGET_BOARD = 'Tecnologia';
const TARGET_LIST = 'Backlog';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let TOKEN = process.env.TOKEN;

async function login() {
  if (TOKEN) return;
  if (!fs.existsSync('.env.ops')) {
    throw new Error('Sem TOKEN nem .env.ops — informe credenciais.');
  }
  const env = {};
  for (const line of fs.readFileSync('.env.ops', 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  const r = await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: env.KTASK_BOT_EMAIL,
      password: env.KTASK_BOT_PASSWORD,
    }),
  });
  if (!r.ok) throw new Error('login: ' + r.status);
  TOKEN = (await r.json()).accessToken;
}

async function api(ep, opts = {}, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = await fetch(API + ep, {
      ...opts,
      headers: {
        Authorization: 'Bearer ' + TOKEN,
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
      await sleep([1000, 3000, 8000][attempt]);
      continue;
    }
    if (!r.ok) {
      throw new Error(
        `${r.status} ${opts.method || 'GET'} ${ep}: ${typeof b === 'object' ? b?.message : b}`,
      );
    }
    await sleep(150);
    return b;
  }
}

// ---------------------------------------------------------------------------
// Os 13 cards
// ---------------------------------------------------------------------------
//
// Períodos em -03:00 (BRT). first = horário do 1º commit do agrupamento
// (vai na descrição); last = horário do último commit (vira completedAt
// real via PATCH).
//
const CARDS = [
  {
    title: 'KTask | Central de Ajuda — estrutura e busca',
    first: '2026-05-14T00:44:00-03:00',
    last: '2026-05-14T02:59:00-03:00',
    commits: ['4d7a748', 'c7e83d4'],
    summary:
      'Rotas /ajuda, hub + 8 categorias + tutorial individual + busca Fuse.js + sitemap + robots, banner condicional pra usuário logado, 15 tutoriais placeholder.',
    checklist: [
      'Rotas /ajuda, /ajuda/[categoria], /ajuda/[categoria]/[slug] (SSG)',
      'Layout próprio com header, sidebar (drawer mobile), footer',
      'Busca client-side Fuse.js + atalho "/" e Cmd/Ctrl+K',
      '8 categorias no _meta.json (Começar, Quadros, Cards, Aprovações, Automações, CRM, Importação, Configurações)',
      '15 tutoriais placeholder com frontmatter completo',
      'Sitemap.xml exclusivo /ajuda/* + robots.txt liberando só /ajuda',
      'Banner condicional pra usuário logado via bootstrapSession()',
      'gitignore para service workers do Serwist',
    ],
  },
  {
    title: 'KTask | Central de Ajuda — formulário de suporte (cria card no board Suporte)',
    first: '2026-05-14T03:00:00-03:00',
    last: '2026-05-14T03:00:00-03:00',
    commits: ['510d181'],
    summary:
      'Página /ajuda/suporte com FAQ + formulário que cria card automaticamente no board Suporte (backend NestJS + frontend).',
    checklist: [
      'Endpoint público para criação de ticket de suporte',
      'Componente SupportForm (validação + envio)',
      'Componente SupportFaq (acordeão com perguntas)',
      'Integração com board Suporte (cria card programaticamente)',
    ],
  },
  {
    title: 'KTask | Central de Ajuda — conteúdo dos 15 tutoriais',
    first: '2026-05-14T03:02:00-03:00',
    last: '2026-05-14T03:02:00-03:00',
    commits: ['24da8b4'],
    summary:
      'Texto real de todos os 15 tutoriais (substitui os placeholders). Tom didático, com prints, FAQ no fim de cada um, "Quem pode fazer" e "Tempo estimado".',
    checklist: [
      'comecar/01-primeiros-passos',
      'comecar/02-criar-conta-aceitar-convite',
      'quadros/01-criar-quadro',
      'quadros/02-configurar-colunas',
      'cards/01-criar-card',
      'cards/02-mover-arrastar',
      'cards/03-anexos-comentarios',
      'cards/04-sub-cards-familia',
      'aprovacoes/01-pedir-aprovacao-cliente',
      'aprovacoes/02-link-publico-cliente',
      'automacoes/01-conceito-geral',
      'automacoes/02-criar-primeira-automacao',
      'crm/01-contatos-e-empresas',
      'importacao/01-importar-do-ummense',
      'configuracoes/01-perfil-e-equipe',
    ],
  },
  {
    title: 'KTask | Central de Ajuda — polimento UI/UX + SEO',
    first: '2026-05-14T03:01:00-03:00',
    last: '2026-05-14T03:38:00-03:00',
    commits: ['60f15d1', '83d636c', 'fa350a4'],
    summary:
      'Logo wordmark KTask (em vez do placeholder), search dialog em Radix puro (corrige top negativo herdado do wrapper @ktask/ui), OG cards + Twitter cards com branding por rota, fix de jargão técnico no _meta.json, fix de frontmatter quebrado em cards/01-criar-card.md.',
    checklist: [
      'Logo: lockup-wordmark com par dark/light igual ao Topbar do app',
      'Search dialog: Radix puro (fim do translate-y-1/2 herdado)',
      'Search dialog: max-height + atalhos no empty state',
      'Search trigger centralizado (mx-auto)',
      'OG/Twitter cards próprios por rota (hub, categoria, tutorial, suporte)',
      'Title absolute no hub (sem duplicar "Ajuda")',
      'OG image padrão = /opengraph-image (mesmo do KTask)',
      '_meta.json sem jargão ("REVIEWER" → "revisores", "triggers" → "gatilhos")',
      'Fix frontmatter quebrado em cards/01-criar-card.md (404 silencioso)',
    ],
  },
  {
    title: 'KTask | Documentação técnica do KTask (8 entregáveis)',
    first: '2026-05-13T20:59:00-03:00',
    last: '2026-05-13T23:19:00-03:00',
    commits: [
      '86f6447', // postmortem
      'b5dba01', // onboarding
      'bb7676a', // briefings 01-08
      'a45bba4', // README
      'f08b5ee', // ADRs
      '4a9e418', // runbooks
      'abaf9aa', // data-model
      '13e638c', // swagger/api
      '0bd196f', // architecture
      '2207635', // briefings 09-11 (extra)
    ],
    summary:
      'Documentação técnica completa do KTask via briefings 01-08: README factual, 5 ADRs iniciais, 5 runbooks de incidente, diagramas Mermaid do schema, visão C4 nível 1+2, docs da API (swagger só em dev), onboarding 30/60/90 dias, primeiro post-mortem real + template + política. Acrescido dos briefings 09-11 (Central de Ajuda).',
    checklist: [
      'README raiz factual gerado via briefing 01',
      'Estrutura de ADR + 5 decisões arquiteturais iniciais',
      '5 runbooks pros incidentes mais prováveis em produção',
      'Diagramas Mermaid do schema (geral + por subsistema)',
      'Swagger /docs só em dev + @ApiOperation nos endpoints',
      'Visão de arquitetura C4 (nível 1 + 2) em 1 página',
      'Checklist 30/60/90 dias para dev novo',
      'Postmortem caso real (CARROSSEL CANNES) + template + política',
      'Briefings 09-11 (Central de Ajuda)',
    ],
  },
  {
    title: 'KTask | Tutorial para clientes (PDF/site estático) — polimento final',
    first: '2026-05-13T00:08:00-03:00',
    last: '2026-05-13T13:00:00-03:00',
    commits: [
      'cc1290f',
      'a7af02c',
      '1b2d497',
      'd63f360',
      'e10721c',
      'd9decd7',
      'eae001d',
      '14f2d7e',
      '5bf1351',
      '2959845',
    ],
    summary:
      'Polimento final do tutorial-para-clientes/ (site estático + PDF). Capa, sumário, layout (imagens verticais sem esticar nem quebrar em 2 páginas), paths absolutos, prints da seção 4.3 (Reprovar), lockup KTask com halo, app-icon + wordmark transparentes, OG/Twitter tags, description.',
    checklist: [
      'Capa polida + sumário com sub-itens',
      'Paths absolutos para imagens',
      'Imagens verticais sem esticar (prints WhatsApp)',
      'Imagens verticais sem quebrar em 2 páginas no PDF',
      'PDF impresso idêntico ao site',
      'Lockup KTask com halo (em vez do quadrado branco)',
      'App-icon + wordmark com fundo transparente',
      'Prints da seção 4.3 (Reprovar) adicionados',
      'OG + Twitter tags + description',
      'Checklist de prints (já completos) removido + CSS morto limpo',
    ],
  },
  {
    title: 'KTask | Recuperação de senha — fluxo completo (email + WhatsApp + admin)',
    first: '2026-05-13T12:19:00-03:00',
    last: '2026-05-13T13:31:00-03:00',
    commits: ['1ff8815', '3a14960', 'b1410c9'],
    summary:
      'Fluxo de recuperação de senha em três frentes: redefinição via WhatsApp (além do email), forcePasswordReset do admin agora envia link de fato, 2 caminhos pra redefinição em /membros + UI de esqueci-senha.',
    checklist: [
      'Redefinição via WhatsApp (auth)',
      'forcePasswordReset envia link real (email + whatsapp)',
      '2 caminhos pra redefinição na tela de admin/membros',
      'UI de "esqueci-senha" finalizada',
    ],
  },
  {
    title: 'KTask | CRM — vínculo Contact ↔ User ↔ Empresa com identidade unificada',
    first: '2026-05-13T00:58:00-03:00',
    last: '2026-05-13T21:05:00-03:00',
    commits: ['f54322b', '35669c7', 'f2b431a', 'd15f617'],
    summary:
      'Vínculo 1:1 Contact ↔ User: quando um contato CRM também é membro da org, identidade (nome, email, telefone, foto) passa a ser herdada read-only do User. Plus: vinculação pessoa→empresa, auto-link no card, soft-delete limpa userId + backfill.',
    checklist: [
      'FK 1:1 Contact ↔ User (vínculo opcional)',
      'User vinculado vira fonte de verdade visual (read-only)',
      'Atalho "create" para vincular',
      'Vinculação pessoa → empresa',
      'Auto-link no card quando criar com contato',
      'Soft-delete limpa userId + backfill nos contatos existentes',
    ],
  },
  {
    title: 'KTask | Card — unificação dos caminhos de criação (helper createCardWithPresence)',
    first: '2026-05-13T01:32:00-03:00',
    last: '2026-05-13T22:53:00-03:00',
    commits: ['7def45f', 'b132c54', '324ab29', 'd2fd556', '63a7289'],
    summary:
      'Helper createCardWithPresence centraliza a criação de card (manual, copy, sub-card via automation) garantindo: shortCode + Card + CardPresence numa transação. Resolve postmortem CARROSSEL CANNES (9 cards invisíveis no kanban). Plus: dispara CARD_ENTERED também na criação + "tornar filho de" no modal.',
    checklist: [
      '"Tornar filho de" no modal do card + layout',
      'createChild gera shortCode + cria CardPresence',
      'copy() e automation CREATE_CHILD_CARD criam CardPresence',
      'Dispara CARD_ENTERED também na criação',
      'Refactor: centraliza tudo via helper createCardWithPresence',
    ],
  },
  {
    title: 'KTask | Importação Ummense — reconciliação final (10617 tasks)',
    first: '2026-05-13T00:59:00-03:00',
    last: '2026-05-13T15:14:00-03:00',
    commits: ['0168f87', '8144e41', 'baed556'],
    summary:
      'Reconciliação final da importação Ummense: auditoria CSV vs KTask, criação dos 2 cards faltantes, retry dos 3 erros 500 + reconcile etapa 2, audit full do JSON Ummense (10617 tasks) com dedupe one-time.',
    checklist: [
      'Auditoria CSV vs KTask',
      'Criação dos 2 cards faltantes',
      'Retry dos 3 erros 500',
      'Reconcile etapa 2',
      'Audit full do JSON Ummense (10617 tasks)',
      'Dedupe one-time',
    ],
  },
  {
    title: 'KTask | Quadros arquivados visíveis em /quadros + desarquivar',
    first: '2026-05-13T15:34:00-03:00',
    last: '2026-05-13T15:34:00-03:00',
    commits: ['7238574'],
    summary:
      'Exibir quadros arquivados na própria tela /quadros (sessão separada) com botão de desarquivar.',
    checklist: [
      'Sessão "Quadros arquivados" na tela /quadros',
      'Botão "Desarquivar"',
    ],
  },
  {
    title: 'KTask | Aprovações — templates de mensagem WhatsApp + default',
    first: '2026-05-13T14:36:00-03:00',
    last: '2026-05-13T14:44:00-03:00',
    commits: ['a5042d0', 'b5fa392'],
    summary:
      'Templates pré-definidos de mensagem no diálogo de pedir aprovação + ajuste no texto default que vai no WhatsApp pra deixar a intenção mais clara.',
    checklist: [
      'Mensagem default do WhatsApp com mais clareza',
      'Templates de mensagem no diálogo de pedir aprovação',
    ],
  },
  {
    title: 'KTask | Ops — backup diário + prune automático no deploy',
    first: '2026-05-13T00:43:00-03:00',
    last: '2026-05-13T00:43:00-03:00',
    commits: ['8498227'],
    summary:
      'Backup automático diário do banco com prune automático integrado ao pipeline de deploy.',
    checklist: [
      'Backup diário automático',
      'Prune automático no pipeline de deploy',
    ],
  },
];

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function buildDescription(c) {
  const lines = [];
  lines.push(c.summary);
  lines.push('');
  lines.push(`**Trabalho iniciado em:** ${fmtDate(c.first)}`);
  lines.push(`**Trabalho concluído em:** ${fmtDate(c.last)}`);
  lines.push('');
  lines.push('**Commits:**');
  for (const sha of c.commits) {
    lines.push(`- \`${sha}\``);
  }
  return lines.join('\n');
}

async function main() {
  await login();

  // 1. Descobre boardId do Tecnologia
  const boards = await api('/boards');
  const board = boards.find((b) => b.name?.toLowerCase() === TARGET_BOARD.toLowerCase());
  if (!board) {
    console.error('Boards disponíveis:', boards.map((b) => b.name));
    throw new Error(`Board "${TARGET_BOARD}" não encontrado`);
  }
  console.log(`[board] ${TARGET_BOARD} = ${board.id}`);

  // 2. Descobre listId do Backlog
  const detail = await api('/boards/' + board.id);
  const lists = detail.lists ?? [];
  const backlog = lists.find((l) => l.name?.toLowerCase() === TARGET_LIST.toLowerCase());
  if (!backlog) {
    console.error('Listas:', lists.map((l) => l.name));
    throw new Error(`Lista "${TARGET_LIST}" não encontrada em ${TARGET_BOARD}`);
  }
  console.log(`[list] ${TARGET_LIST} = ${backlog.id}\n`);

  // 3. Lista cards existentes pra skip por título — vem do próprio detail
  //    do board (lists[].cards[]). Não há endpoint /cards?boardId.
  const existingTitles = new Set();
  for (const l of detail.lists ?? []) {
    for (const c of l.cards ?? []) existingTitles.add(c.title);
  }
  console.log(`[exist] ${existingTitles.size} cards já no board\n`);

  // 4. Cria cada card
  const results = [];
  for (const c of CARDS) {
    if (existingTitles.has(c.title)) {
      console.log(`[skip] já existe: "${c.title}"`);
      results.push({ title: c.title, action: 'skipped' });
      continue;
    }

    // 4a. POST /cards
    const created = await api('/cards', {
      method: 'POST',
      body: JSON.stringify({
        listId: backlog.id,
        title: c.title,
        description: buildDescription(c),
      }),
    });
    console.log(`[ok] criado #${created.shortCode}: "${c.title}"`);

    // 4b. PATCH: status COMPLETED (seta completedAt=now)
    await api(`/cards/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'COMPLETED' }),
    });

    // 4c. PATCH: override completedAt pro horário real do último commit
    await api(`/cards/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ completedAt: new Date(c.last).toISOString() }),
    });

    // 4d. Cria checklist + items (todos marcados como done)
    if (c.checklist?.length) {
      const checklist = await api('/checklists', {
        method: 'POST',
        body: JSON.stringify({ cardId: created.id, title: 'Entregáveis' }),
      });
      for (const item of c.checklist) {
        const it = await api(`/checklists/${checklist.id}/items`, {
          method: 'POST',
          body: JSON.stringify({ text: item, assigneeId: null }),
        });
        await api(`/checklists/items/${it.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isDone: true }),
        });
      }
      console.log(`       + checklist "Entregáveis" com ${c.checklist.length} itens (done)`);
    }

    results.push({
      title: c.title,
      action: 'created',
      cardId: created.id,
      shortCode: created.shortCode,
      completedAt: c.last,
    });
  }

  // Resumo
  console.log('\n===== RESUMO =====');
  console.log(JSON.stringify(results, null, 2));
  const ok = results.filter((r) => r.action === 'created').length;
  const skipped = results.filter((r) => r.action === 'skipped').length;
  console.log(`\nCriados: ${ok} | Pulados: ${skipped} | Total: ${CARDS.length}`);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
