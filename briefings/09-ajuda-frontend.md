# Briefing — Central de Ajuda (implementação frontend)

> **Como usar:** cole este briefing num chat novo de Claude com acesso a este repositório. Fase 0 (Inventário) primeiro; aguarda aprovação antes de produzir.

---

## Contexto rápido do projeto

KTask. Monorepo NestJS + Next.js 15 (App Router) + Tailwind. Em produção em `ktask.agenciakharis.com.br`. Multi-tenant. Já existe pasta `apps/web/public/tutorial-para-clientes/` com prints e talvez markdown — esta pasta pode ser absorvida ou aproveitada como ponto de partida.

---

## Objetivo desta sessão

Implementar a **Central de Ajuda** do KTask — estrutura frontend pública que serve **operadores internos** (time Kharis) e **clientes externos** (quem recebe link de aprovação). Inspiração nas centrais do Ummense e do Trello: busca + categorias + tutorial por feature.

**Audiência do conteúdo final**: usuários finais (operador + cliente). Tom didático, sem jargão técnico de dev.

**Audiência deste briefing**: dev que vai implementar (frontend puro).

**Entregáveis técnicos** (sem conteúdo dos tutoriais — isso é o briefing 11):

- Rota `/ajuda` (hub principal) + sub-rotas por categoria
- Layout consistente (header simples, sidebar de categorias, conteúdo central, footer)
- Busca client-side (Fuse.js) sobre títulos/tags dos tutoriais
- Renderização de Markdown (preferir MDX se já houver no projeto; senão `react-markdown`)
- Estrutura de pastas pra conteúdo em Markdown (preparada pro briefing 11 popular)
- Banner condicional: se user logado, mostra "você está autenticado — voltar pra app" no topo
- Link pro formulário de suporte (`/ajuda/suporte`) — backend é o briefing 10

**Estrutura de rotas alvo:**

```
/ajuda                    Hub com busca + grid de categorias + link rápido pra suporte
/ajuda/comecar            Primeiros passos
/ajuda/quadros            Criar, configurar, arquivar quadros
/ajuda/cards              Criar, mover, anexos, sub-cards, comentar
/ajuda/aprovacoes         Fluxo cliente, REVIEWER, link público
/ajuda/automacoes         Triggers, conditions, actions
/ajuda/crm                Contatos, empresas, vincular usuário
/ajuda/importacao         Importer Ummense
/ajuda/configuracoes      Perfil, equipe, integrações
/ajuda/suporte            FAQ + formulário (backend no briefing 10)
/ajuda/[categoria]/[slug] Tutorial individual
```

**Restrições**:

- Sem emojis no UI/código.
- Rotas **públicas** (sem auth). Operador logado vê banner discreto no topo "voltar pra app".
- Mobile-first (cliente externo provavelmente abre no celular).
- Performance: SSG/ISR onde possível (conteúdo é estático).
- SEO: cada tutorial com metadata própria (title, description, OG image). Sitemap automático.
- Acessibilidade: heading hierarchy correta, alt em prints, contraste OK.
- Cores e tipografia: usar o design system existente (`@ktask/ui`, Tailwind tokens já definidos).

---

## Fase 0 — Inventário forçado

### Leituras obrigatórias

1. [apps/web/src/app/(app)/](<../apps/web/src/app/(app)/>) — estrutura atual de rotas autenticadas (não copia, só entende padrão)
2. [apps/web/src/app/](../apps/web/src/app/) — ver se já há rotas públicas, route groups, layouts
3. [apps/web/public/tutorial-para-clientes/](../apps/web/public/tutorial-para-clientes/) — ver o que já existe (prints, conteúdo, organização)
4. [apps/web/package.json](../apps/web/package.json) — confirmar versões de Next.js, MDX (se houver), Fuse.js (provavelmente não tem ainda)
5. [packages/ui/](../packages/ui/) — componentes compartilhados disponíveis (Button, Card, Input, etc)
6. [tarefas-md/07-design-system.md](../tarefas-md/07-design-system.md) — tokens, paleta, tipografia
7. [docs/architecture.md](../docs/architecture.md) — entender o que é o KTask pra escrever pitch de abertura

### Exploração estruturada

- Listar route groups existentes em `apps/web/src/app/` (`(app)`, `(auth)`, `demo`, etc) — entender padrão.
- Mapear componentes de layout reutilizáveis em `packages/ui/` e `apps/web/src/components/`.
- Verificar se `next-mdx-remote` ou `@next/mdx` já está instalado. Se não, decidir entre instalar MDX ou usar `react-markdown`.
- Conferir o que tem em `apps/web/public/tutorial-para-clientes/` — pode ser que já exista uma estrutura ou só prints soltos.
- Identificar como o tema dark/light é resolvido (usar `next-themes` se já configurado).

### Saída da Fase 0

```
## Inventário (Fase 0)

### Estrutura atual do apps/web
- Route groups: ...
- Layout root: ...
- Tema dark/light: configurado via ... ou não configurado
- next-themes presente: sim/não

### Conteúdo em tutorial-para-clientes/
- Arquivos: ...
- Estrutura: prints soltos / markdown / outra
- Decisão sobre absorver: mover pra apps/web/content/ajuda/ ou manter onde está

### Componentes disponíveis (packages/ui)
- Button, Card, Input, ... (lista)

### Decisão sobre rendering de Markdown
- Stack proposto: MDX / react-markdown / outro
- Justificativa: ...

### Decisão sobre busca client-side
- Stack: Fuse.js (recomendado pela leveza) / outro

### Estrutura de pastas pra conteúdo (proposta)
apps/web/content/ajuda/
  ├── _meta.json (índice global: lista de categorias + tutoriais com metadata)
  ├── comecar/
  │   ├── 01-criar-conta.md
  │   └── 02-criar-primeiro-quadro.md
  ├── quadros/
  ├── cards/
  └── ...

### Rotas a criar
- /ajuda — hub
- /ajuda/[categoria] — lista da categoria
- /ajuda/[categoria]/[slug] — tutorial individual
- /ajuda/suporte — placeholder pro formulário (briefing 10)

### Tutoriais placeholder (vão ser populados no briefing 11)
- 12-15 arquivos .md vazios com frontmatter mínimo (title, category, order, slug)

### Coisas que vou DEIXAR DE FORA
- Conteúdo dos tutoriais (briefing 11)
- Backend do formulário (briefing 10)
- Vídeos (futuro)
- ...

**Aguardo aprovação ou correção antes de implementar.**
```

---

## Fase 1 — Produção

Após aprovação:

### 1. Estrutura de pastas

```
apps/web/
├── content/ajuda/                  (conteúdo Markdown — populado no briefing 11)
│   ├── _meta.json                  (lista de categorias + tutoriais com metadata)
│   ├── comecar/
│   ├── quadros/
│   ├── cards/
│   ├── aprovacoes/
│   ├── automacoes/
│   ├── crm/
│   ├── importacao/
│   └── configuracoes/
├── src/app/ajuda/
│   ├── layout.tsx                  (layout comum: header simples, sidebar, footer)
│   ├── page.tsx                    (hub: busca + grid de categorias + CTA suporte)
│   ├── [categoria]/
│   │   ├── page.tsx                (lista tutoriais da categoria)
│   │   └── [slug]/page.tsx         (tutorial individual)
│   └── suporte/page.tsx            (placeholder pro briefing 10)
├── src/lib/ajuda/
│   ├── content.ts                  (lê _meta.json + .md, gera índice tipado)
│   ├── search.ts                   (Fuse.js index, função de busca)
│   └── types.ts                    (Tutorial, Categoria, etc)
└── src/components/ajuda/
    ├── help-header.tsx
    ├── help-sidebar.tsx
    ├── help-search.tsx             (autocomplete client-side)
    ├── help-categoria-card.tsx
    ├── help-tutorial-card.tsx
    ├── help-logged-banner.tsx      (banner condicional pra user logado)
    └── help-breadcrumb.tsx
```

### 2. Formato dos arquivos .md (frontmatter mínimo)

```markdown
---
title: Como criar um quadro
description: Aprenda a criar e configurar seu primeiro quadro no KTask
category: quadros
slug: criar-quadro
order: 1
tags: [quadro, novo, primeiro-passo]
updatedAt: 2026-05-13
---

# Conteúdo do tutorial aqui (markdown)
```

### 3. Página `/ajuda` (hub)

- Hero curto com título "Central de Ajuda" e busca destacada
- Banner condicional pra usuário logado
- Grid de categorias (8 cards: Começar, Quadros, Cards, Aprovações, Automações, CRM, Importação, Configurações)
- CTA inferior: "Não achou o que procura? Fale com a gente" → link `/ajuda/suporte`

### 4. Página `/ajuda/[categoria]`

- Breadcrumb: Ajuda > Categoria
- Título da categoria
- Lista de tutoriais (cards com title + description + tempo de leitura estimado)
- Sidebar com outras categorias (navegação rápida)

### 5. Página `/ajuda/[categoria]/[slug]`

- Breadcrumb: Ajuda > Categoria > Tutorial
- Heading do tutorial + metadata (atualizado em X)
- Conteúdo renderizado do Markdown (com prose styling do Tailwind)
- "Esse artigo foi útil?" feedback simples (👍 / 👎) — opcional, pode ser placeholder
- "Próximo tutorial" e "Anterior" no fim
- Sidebar com TOC do próprio tutorial + outros tutoriais da categoria

### 6. Busca

- Fuse.js client-side com keys `title`, `description`, `tags`, `content` (texto plano extraído)
- Autocomplete debounced (200ms)
- Resultados mostram: categoria + tutorial + snippet onde casou
- Atalho `/` global focado na busca

### 7. Banner pra logado

Detecta auth via cookie (se tiver cookie `accessToken` ou similar). Mostra discretamente:

```
Você está logado no KTask. [Voltar pra app →]
```

Sem bloquear navegação na ajuda.

### 8. SEO + metadata

- Cada rota tem `generateMetadata()` retornando title + description vindos do frontmatter
- Sitemap automático via `apps/web/src/app/sitemap.ts` (ou adicionar entrada nele se já existe)
- `robots.txt` libera `/ajuda/*`

### 9. Tutoriais placeholder

Criar **12-15 arquivos .md vazios** seguindo a lista priorizada abaixo, cada um só com frontmatter + heading + "(conteúdo em breve)". O briefing 11 popula.

**Lista priorizada:**

1. `comecar/01-primeiros-passos.md`
2. `comecar/02-criar-conta-aceitar-convite.md`
3. `quadros/01-criar-quadro.md`
4. `quadros/02-configurar-colunas.md`
5. `cards/01-criar-card.md`
6. `cards/02-mover-arrastar.md`
7. `cards/03-anexos-comentarios.md`
8. `cards/04-sub-cards-familia.md`
9. `aprovacoes/01-pedir-aprovacao-cliente.md`
10. `aprovacoes/02-link-publico-cliente.md`
11. `automacoes/01-conceito-geral.md`
12. `automacoes/02-criar-primeira-automacao.md`
13. `crm/01-contatos-e-empresas.md`
14. `importacao/01-importar-do-ummense.md`
15. `configuracoes/01-perfil-e-equipe.md`

---

## Fase 2 — Auto-auditoria

1. **Rotas funcionam?** `/ajuda` carrega? Sub-rotas idem? 404 em slug inexistente?
2. **Busca funcional?** Digitar termo retorna resultados? Atalho `/` foca input?
3. **Markdown renderiza?** Headings, listas, prints (img tags) corretos?
4. **Banner condicional?** Mostra pra logado, esconde pra não-logado?
5. **Mobile-first?** Navegação por hamburguer? Sidebar vira drawer?
6. **SEO?** `generateMetadata` populando title/description? Sitemap inclui?
7. **Sem emojis no UI/código** confirmado.
8. **Typecheck + lint verde.**
9. **Entrega**:

```
## Resumo da entrega

- Rotas criadas: /ajuda + N subrotas
- Componentes: lista
- Tutoriais placeholder criados: 15/15 com frontmatter mínimo
- Stack Markdown: MDX / react-markdown
- Stack busca: Fuse.js (X kB)
- Build size impact: +Y kB
- Inferências sem confirmação: [lista]
- Sugestões de follow-up: [feedback útil/não-útil persistido em DB? Algolia se volume crescer? etc]
```

---

## Notas gerais

- Sem emojis no UI/código.
- Não usa `class-validator` se o projeto usa `nestjs-zod`; confere convenção.
- Não modifica conteúdo dos tutoriais (placeholder só).
- Mobile-first.
- Em dúvida, pergunte.
