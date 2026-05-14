# Briefing — README.md da raiz do projeto

> **Como usar:** cole este briefing inteiro num chat novo de Claude (sem histórico do KTask) com acesso a este repositório. O Claude vai começar pela Fase 0 (Inventário) e pedir tua aprovação antes de produzir o entregável final.

---

## Contexto rápido do projeto

Você está dentro do repositório do **KTask** — sistema interno de gestão de tarefas da agência **Kharis**, inspirado em Ummense (funcional) e Trello (UX). Stack:

- **Monorepo** pnpm + Turborepo: `apps/api` (NestJS 11) + `apps/web` (Next.js 15) + `packages/*`
- **Banco**: Postgres 16 via Prisma 6
- **Real-time**: Socket.IO + Redis adapter
- **Jobs**: BullMQ
- **Multi-tenant** desde início (`organizationId` em tudo)
- **Produção**: Hetzner VM (`178.104.220.28`), domínio `ktask.agenciakharis.com.br`, Caddy + Docker, CI/CD via GitHub Actions (`.github/workflows/`)
- **Fase atual**: uso interno (não-SaaS ainda)

Documentação de produto vive em [tarefas-md/](../tarefas-md/) — 50 docs, um por feature (00–10 são fundamentos, 11+ são features).

---

## Objetivo desta sessão

Gerar um `README.md` na raiz do repositório que sirva como **porta de entrada** pra qualquer dev que clone o repo pela primeira vez.

**Audiência**: dev novo no projeto (interno ou contratado futuro) — assume que sabe JavaScript/TypeScript moderno e está confortável com Docker, mas **não** conhece o KTask.

**Entregável**:

- Arquivo: `README.md` (na raiz, `c:/xampp/htdocs/Kharis/sistema-gestao-de-tarefas/README.md`)
- Formato: Markdown puro (sem extensões exóticas).
- Tamanho aproximado: 200–400 linhas, lido em ~5–10 minutos.

**Restrições**:

- **Sem emojis** (regra explícita do KTask).
- Sem floreio comercial. Tom técnico direto.
- Sem promessas vagas ("escalável", "robusto"). Fatos verificáveis.
- Não inventar features que não existem.
- Não documentar features parcialmente implementadas como se fossem completas — sinalizar estado real.

---

## Fase 0 — Inventário forçado (FAÇA ISSO PRIMEIRO)

**Antes de escrever qualquer linha do README**, mapeie o que existe no repo. Os pontos de partida obrigatórios:

### Leituras obrigatórias

Leia (não delegue, leia você mesmo) os seguintes arquivos como contexto base:

1. [package.json](../package.json) — workspaces, scripts top-level
2. [pnpm-workspace.yaml](../pnpm-workspace.yaml) — estrutura de packages
3. [turbo.json](../turbo.json) — pipelines do Turborepo
4. [tarefas-md/README.md](../tarefas-md/README.md) — índice de planejamento (não é README de projeto, mas tem TL;DR útil)
5. [tarefas-md/00-visao-geral.md](../tarefas-md/00-visao-geral.md) — visão de produto
6. [tarefas-md/05-stack-e-arquitetura.md](../tarefas-md/05-stack-e-arquitetura.md) — decisões técnicas
7. [tarefas-md/10-deploy-producao.md](../tarefas-md/10-deploy-producao.md) — deploy real (Hetzner)
8. [docker-compose.yml](../docker-compose.yml) — serviços locais (se existir; senão `infra/`)
9. [apps/api/package.json](../apps/api/package.json) — scripts e dependências da API
10. [apps/web/package.json](../apps/web/package.json) — scripts e dependências do Web
11. [.env.example](../.env.example) ou similar — variáveis de ambiente esperadas
12. [.github/workflows/](../github/workflows/) — listar arquivos pra entender CI/CD
13. [.gitignore](../.gitignore) — entender o que NÃO está versionado (env, etc)

### Exploração estruturada

Use `Glob` + `Grep` (ou `Agent(subagent_type=Explore)` se preciso):

- **Módulos do API**: lista cada pasta em `apps/api/src/modules/` — cada uma é uma área de negócio.
- **Rotas do Web**: lista cada pasta em `apps/web/src/app/(app)/` — cada uma é uma feature visível.
- **Pacotes compartilhados**: lista cada pasta em `packages/` se existir.
- **Scripts**: lista o que tem em `scripts/` — operações ad-hoc úteis (importer, watchdog, etc).
- **Configurações ENV**: faça um grep por `process.env.` no api pra catalogar as variáveis que o sistema precisa.

### Saída da Fase 0

Apresente ao usuário uma lista enumerada com TUDO que você encontrou. Formato esperado:

```
## Inventário (Fase 0)

### Stack (verificado nos package.json + lockfiles)
- Front-end: Next.js {versão exata}, React {versão}, ...
- Back-end: NestJS {versão}, Prisma {versão}, ...
- Infra: Docker, ...

### Estrutura do monorepo
- apps/api — ...
- apps/web — ...
- packages/<nome> — propósito
- scripts/ — ...
- ...

### Módulos do API (apps/api/src/modules/)
1. auth — ...
2. cards — ...
3. ...
(liste TODOS)

### Rotas do Web visíveis (apps/web/src/app/(app)/)
1. /quadros — ...
2. /contatos — ...
3. ...

### Variáveis de ambiente necessárias
- DATABASE_URL — ...
- REDIS_URL — ...
- ...

### CI/CD identificados (.github/workflows/)
- CI: ...
- Deploy: ...

### Scripts ad-hoc úteis (scripts/)
- ...

### Decisões arquiteturais que valem registro
- Multi-tenant via organizationId
- CardPresence pra multi-fluxo
- ...

### Coisas que vou DEIXAR DE FORA (e por quê)
- Documentação de cada feature individual (vai pra docs específicas, não README)
- Detalhes de runbook (vão pra docs/runbooks/)
- ...

**Aguardo aprovação ou correção antes de produzir o README final.**
```

NÃO escreva o README ainda. Aguarde "ok, prossegue" ou correções.

---

## Fase 1 — Produção do README

Após aprovação da Fase 0, gere o `README.md` com a seguinte estrutura:

### 1. Título + 1-linha de pitch

```markdown
# KTask

Sistema de gestão de tarefas da Kharis. Kanban multi-fluxo com automações, aprovações por cliente e integração WhatsApp via Evolution API.
```

### 2. Status do projeto

Tabela curta:

- Estado: Em produção (uso interno)
- Versão: pega do package.json
- Último deploy: link pra GitHub Actions
- Cobertura de testes: se tiver dado, senão omita

### 3. Stack

Tabela enxuta: camada → tech → versão. Sem prosa.

### 4. Estrutura do monorepo

Árvore mostrando pastas principais com 1 linha de descrição cada:

```
.
├── apps/
│   ├── api/        # NestJS — backend, jobs, websockets
│   └── web/        # Next.js 15 — interface
├── packages/
│   └── ...
├── scripts/        # operações ad-hoc (importer, audit, watchdogs)
├── briefings/      # prompts pra gerar documentação técnica
├── tarefas-md/     # planejamento de features
└── docs/           # documentação técnica (se existir; senão omitir)
```

### 5. Pré-requisitos

Liste exato: Node X.Y, pnpm Z, Docker, Postgres (se for rodar fora do Docker), etc. Não chuta versões — pega do `engines` em package.json ou do CI.

### 6. Setup local

Comandos exatos em ordem. Idealmente um quickstart em <5 comandos:

```bash
git clone ...
cd ...
cp .env.example .env  # editar com credenciais locais
docker compose up -d  # se aplicável
pnpm install
pnpm dev              # ou os scripts certos
```

### 7. Variáveis de ambiente

Tabela: nome, obrigatória sim/não, descrição, exemplo. Tira do que você inventariou na Fase 0.

### 8. Scripts úteis

`pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint`, etc. Pega do package.json. Pula scripts internos do turbo.

### 9. Documentação adicional

Pointers (não copy-paste):

- Planejamento de produto → [tarefas-md/](tarefas-md/)
- Documentação técnica → [docs/](docs/) (se existir)
- Briefings pra gerar mais docs → [briefings/](briefings/)
- Schema do banco → [apps/api/prisma/schema.prisma](apps/api/prisma/schema.prisma)

### 10. Deploy

Resumo de 3-5 linhas: "Push em `main` dispara `.github/workflows/deploy.yml`. Build no runner, image vai pra GHCR, deploy via SSH no Hetzner. Migrations Prisma rodam no startup do container." Link pra `tarefas-md/10-deploy-producao.md` pra detalhes.

### 11. Contribuindo

Curto: convenções de commit, branch model (main only? feature branches?), code review. Se não tiver CONTRIBUTING.md, gere uma seção mínima com o que dá pra inferir do git log + hooks (husky/lint-staged).

### 12. Licença / contato

Privado (interno Kharis). Contato: time de dev.

---

## Fase 2 — Auto-auditoria (FAÇA ISSO ANTES DE ENCERRAR)

Antes de declarar pronto:

1. **Cobertura**: percorra o inventário aprovado da Fase 0. Cada módulo, cada rota, cada variável crítica está mencionada ou intencionalmente fora de escopo? Se algo do inventário sumiu sem justificativa, volte e corrija.

2. **Verificação de comandos**: cada comando de setup que você escreveu (`pnpm install`, `docker compose up`, etc) — confira contra `package.json` e `docker-compose.yml`. Se inventou, marque.

3. **Honestidade do estado**:
   - Listou TODAS as afirmações no README que não vieram de leitura direta?
   - Sinalizou features parciais como tal?

4. **Entrega**: ao final, na mensagem pro user, inclua:

```
## Resumo da entrega

- Arquivo gerado: README.md (raiz)
- Linhas: ~XXX
- Itens do inventário cobertos: X/Y
- Inferências sem confirmação direta: [lista, ou "nenhuma"]
- Limitações conhecidas: [lista, ou "nenhuma"]
- Sugestões de follow-up: [ex: "criar .env.example se não existe", "atualizar CONTRIBUTING.md"]
```

---

## Notas gerais

- Sem emojis no arquivo final.
- Sem floreio comercial.
- Datas: ISO `YYYY-MM-DD`.
- Identificadores de código: nomes reais (`Contact.userId`, não "campo de vínculo de usuário").
- Em dúvida sobre escopo durante Fase 1, pergunte. Não chute.
- O README é **a porta de entrada** — se um dev novo abrir e tiver que ir pro Slack perguntar 5 coisas, falhou. Otimize pra ele se virar sozinho até o `pnpm dev` rodar.
