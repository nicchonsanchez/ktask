# KTask

Sistema interno de gestão de tarefas e fluxos operacionais da Kharis. Kanban multi-fluxo com automações, aprovações por cliente e integração WhatsApp via Evolution API. Multi-tenant desde o início (`organizationId` em tudo).

---

## Status

| Item                | Valor                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Estado              | Em produção (uso interno na Kharis)                                                       |
| Versão              | `0.0.1` (ver [`package.json`](package.json))                                              |
| Produção            | `https://ktask.agenciakharis.com.br` + `https://api.ktask.agenciakharis.com.br` (Hetzner) |
| Repositório         | `kharis-edu/gestao-de-tarefas` (GitHub, privado)                                          |
| CI / Deploy         | GitHub Actions — [`.github/workflows/`](.github/workflows/)                               |
| Cobertura de testes | Não medida — ver seção [Testes](#testes)                                                  |

---

## Stack

| Camada          | Tecnologia                                               | Versão            |
| --------------- | -------------------------------------------------------- | ----------------- |
| Linguagem       | TypeScript                                               | `^5.7`            |
| Frontend        | Next.js (App Router, Turbopack) + React                  | `^15.1` / `^19`   |
| UI              | Tailwind CSS + Radix Primitives + shadcn base + Lucide   | `^3.4` / vários   |
| Drag & drop     | @dnd-kit                                                 | `^6.3`            |
| Editor de texto | Tiptap (ProseMirror)                                     | `^3.22`           |
| Estado server   | TanStack Query                                           | `^5.62`           |
| Estado cliente  | Zustand                                                  | `^5.0`            |
| Formulários     | react-hook-form + Zod                                    | `^7.54` / `^3.24` |
| PWA             | Serwist                                                  | `^9.5`            |
| Backend         | NestJS                                                   | `^11`             |
| ORM             | Prisma                                                   | `^6.1`            |
| Banco           | PostgreSQL                                               | `16-alpine`       |
| Cache / Pub-Sub | Redis                                                    | `7-alpine`        |
| Filas           | BullMQ                                                   | `^5.34`           |
| Real-time       | Socket.IO + adapter Redis                                | `^4.8`            |
| Storage         | S3-compatible (MinIO em dev, S3/compatível em prod)      | AWS SDK `^3.10`   |
| E-mail          | Nodemailer (Mailpit em dev)                              | `^8`              |
| WhatsApp        | Evolution API (serviço externo, REST + webhook)          | —                 |
| Auth            | JWT access 15min + refresh em cookie httpOnly (Passport) | —                 |
| Push web        | Web Push (VAPID)                                         | `^3.6`            |
| Container       | Docker / Docker Compose                                  | —                 |
| Monorepo        | pnpm workspaces + Turborepo                              | `9.15` / `^2.3`   |

---

## Estrutura do monorepo

```
sistema-gestao-de-tarefas/
├── apps/
│   ├── api/                  NestJS 11 — REST + Socket.IO gateway + workers BullMQ
│   │   ├── src/modules/      30 módulos de negócio (auth, boards, cards, automations, ...)
│   │   ├── prisma/           schema.prisma, migrations, seed.ts
│   │   └── Dockerfile
│   └── web/                  Next.js 15 App Router (Turbopack)
│       ├── src/app/          rotas: (app)/, (auth)/, /aprovar/, /demo/
│       └── Dockerfile
├── packages/
│   ├── contracts/            @ktask/contracts — Zod schemas + DTOs compartilhados (dual ESM/CJS via tsup)
│   ├── ui/                   @ktask/ui — componentes shadcn/Radix compartilhados
│   ├── config-eslint/        config ESLint compartilhada
│   └── config-tsconfig/      tsconfigs base
├── infra/
│   ├── docker-compose.yml         dev: postgres, redis, minio, mailpit
│   ├── docker-compose.prod.yml    prod: web, api, caddy, postgres, redis
│   ├── Caddyfile                  reverse proxy + TLS automático
│   └── prod.env.example
├── scripts/
│   ├── dev.mjs                    orquestrador do `pnpm dev` (ver Setup local)
│   ├── *.mjs                      importadores Ummense, auditorias, watchdogs
│   └── ops/                       backup.sh, setup VM, backfills SQL
├── tarefas-md/                    planejamento de produto (50 docs)
├── briefings/                     prompts pra gerar documentação técnica
└── .github/workflows/             ci.yml + deploy.yml
```

---

## Pré-requisitos

- **Node.js** `>=22` (ver [`.nvmrc`](.nvmrc) e `engines` em [`package.json`](package.json))
- **pnpm** `9.15.0` exato — `corepack enable` cuida disso automaticamente
- **Docker Desktop** com Compose v2 (sobe Postgres, Redis, MinIO, Mailpit)
- Porta `5433` livre (Postgres do KTask usa 5433 pra não colidir com XAMPP/outros Postgres locais)
- Portas `3000`, `4000`, `6379`, `9000`, `9001`, `1025`, `8025` livres

---

## Setup local

```bash
git clone git@github.com:kharis-edu/gestao-de-tarefas.git ktask
cd ktask
pnpm install
pnpm dev
```

O comando `pnpm dev` invoca [`scripts/dev.mjs`](scripts/dev.mjs), que é o **entry point que orquestra tudo**:

1. Verifica se o Docker Desktop está rodando
2. Sobe [`infra/docker-compose.yml`](infra/docker-compose.yml) com `--wait` (espera Postgres/Redis/MinIO/Mailpit ficarem healthy)
3. Copia `.env.example` → `.env` em `apps/api` e `apps/web` se ainda não existirem
4. Aplica migrations pendentes (`prisma migrate dev`, idempotente)
5. Inicia `apps/api` (NestJS watch) + `apps/web` (Next.js Turbopack) em paralelo via Turborepo

`Ctrl+C` encerra web+api; os containers continuam rodando (próximo `pnpm dev` é instantâneo). Para parar tudo: `pnpm infra:down`.

Para popular dados de seed (org "Kharis" + usuário OWNER):

```bash
pnpm db:seed
```

### URLs locais

| Serviço             | URL                                                                  |
| ------------------- | -------------------------------------------------------------------- |
| Web (Next.js)       | http://localhost:3000                                                |
| API (NestJS)        | http://localhost:4000                                                |
| API Swagger         | http://localhost:4000/docs                                           |
| Healthcheck         | http://localhost:4000/healthz                                        |
| Readycheck (DB)     | http://localhost:4000/readyz                                         |
| Postgres            | `localhost:5433` (db `ktask`, user `ktask`, senha `ktask`)           |
| Redis               | `localhost:6379`                                                     |
| Mailpit (SMTP+UI)   | SMTP `localhost:1025` · UI http://localhost:8025                     |
| MinIO API + Console | http://localhost:9000 · http://localhost:9001 (`minio`/`miniominio`) |
| Prisma Studio       | `pnpm db:studio` (porta 5555)                                        |

### Credenciais de seed

- **E-mail**: `desenvolvimento@agenciakharis.com.br`
- **Senha**: `ktask123` — trocar no primeiro login

---

## Variáveis de ambiente

Templates em [`.env.example`](.env.example) (raiz), [`apps/api/.env.example`](apps/api/.env.example) e [`apps/web/.env.example`](apps/web/.env.example). O `scripts/dev.mjs` cria os locais automaticamente no primeiro `pnpm dev`.

### API (`apps/api/.env`)

| Variável                                 | Obrigatória | Descrição                                                                 |
| ---------------------------------------- | ----------- | ------------------------------------------------------------------------- |
| `NODE_ENV`                               | sim         | `development` / `production`                                              |
| `PORT`                                   | sim         | porta da API (default `4000`)                                             |
| `LOG_LEVEL`                              | não         | `debug` / `info` / `warn` / `error`                                       |
| `DATABASE_URL`                           | sim         | string Postgres — em dev: `postgresql://ktask:ktask@localhost:5433/ktask` |
| `REDIS_URL`                              | sim         | `redis://localhost:6379`                                                  |
| `JWT_ACCESS_SECRET`                      | sim         | segredo do access token (`openssl rand -hex 32`)                          |
| `JWT_REFRESH_SECRET`                     | sim         | segredo do refresh token                                                  |
| `JWT_ACCESS_TTL`                         | não         | TTL do access (default `15m`)                                             |
| `JWT_REFRESH_TTL`                        | não         | TTL do refresh com "permanecer logado" (default `90d`)                    |
| `JWT_REFRESH_TTL_SHORT`                  | não         | TTL do refresh sem "permanecer logado" (default `1d`)                     |
| `CORS_ORIGINS`                           | sim         | origens permitidas (CSV)                                                  |
| `APP_URL`                                | sim         | URL pública do web (usada em e-mails, links)                              |
| `S3_ENDPOINT` / `S3_REGION`              | sim         | endpoint S3-compatible                                                    |
| `S3_BUCKET`                              | sim         | bucket de anexos (`ktask-attachments` em dev)                             |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY`        | sim         | credenciais S3                                                            |
| `S3_PUBLIC_URL`                          | sim         | URL pública dos objetos                                                   |
| `EMAIL_FROM`                             | sim         | remetente padrão                                                          |
| `SMTP_HOST` / `SMTP_PORT`                | sim         | servidor SMTP (Mailpit em dev)                                            |
| `SMTP_USER` / `SMTP_PASS`                | não         | auth SMTP (vazio em dev)                                                  |
| `EVOLUTION_DEFAULT_URL`                  | não         | fallback Evolution API; config real fica por Org em `Integration.config`  |
| `EVOLUTION_DEFAULT_API_KEY`              | não         | idem                                                                      |
| `EVOLUTION_DEFAULT_INSTANCE`             | não         | idem                                                                      |
| `OPERATOR_PHONE`                         | não         | telefone do operador para alertas (E.164 sem `+`)                         |
| `INTEGRATION_ENCRYPTION_KEY`             | sim         | 64 chars hex — criptografa segredos de integrações por Org                |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | sim         | par VAPID para Web Push (gerar com `web-push generateVAPIDKeys`)          |
| `VAPID_SUBJECT`                          | sim         | e-mail de contato (`mailto:...`) exigido pelo protocolo VAPID             |
| `SENTRY_DSN`                             | não         | DSN do Sentry (omitir desabilita)                                         |

### Web (`apps/web/.env.local`)

| Variável               | Obrigatória | Descrição                                           |
| ---------------------- | ----------- | --------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`  | sim         | URL da API (em dev: `http://localhost:4000`)        |
| `NEXT_PUBLIC_WS_URL`   | sim         | URL do WebSocket (em dev: `ws://localhost:4000`)    |
| `NEXT_PUBLIC_APP_NAME` | não         | nome do app exibido na UI (default `KTask`)         |
| `NEXT_PUBLIC_APP_URL`  | sim         | URL pública do web (usada em metadata/OG/canonical) |

---

## Scripts úteis

```bash
# Desenvolvimento
pnpm dev                  # orquestrador: docker compose + migrate + web + api
pnpm dev:web-api          # só web + api (sem orquestração, exige infra de pé)
pnpm infra:up             # sobe infra/docker-compose.yml
pnpm infra:down           # derruba a infra
pnpm infra:logs           # streaming dos logs dos containers

# Banco
pnpm db:migrate           # prisma migrate dev (criar/aplicar migrations)
pnpm db:migrate:deploy    # prisma migrate deploy (somente aplicar — usado em prod)
pnpm db:seed              # roda apps/api/prisma/seed.ts
pnpm db:studio            # abre Prisma Studio em :5555

# Qualidade
pnpm lint                 # ESLint em todos os workspaces
pnpm typecheck            # tsc --noEmit em todos os workspaces
pnpm test                 # Jest (ver seção Testes)
pnpm test:e2e             # Jest e2e da API (Supertest)
pnpm format               # Prettier --write
pnpm format:check         # Prettier --check

# Build
pnpm build                # turbo build em tudo
pnpm clean                # limpa dist/.next/.turbo + node_modules
```

Scripts ad-hoc em [`scripts/`](scripts/) — operações de importação do Ummense, auditorias de paridade, watchdogs e backfills SQL. Maior parte é one-off de migração; ver os arquivos para entender escopo de cada um.

---

## Testes

Estado honesto:

- **`apps/api`**: Jest configurado (`apps/api/package.json` → `test`, `test:watch`, `test:cov`, `test:e2e` com Supertest). Existência de specs e cobertura efetiva **não** verificadas neste README — rodar `pnpm --filter @ktask/api test:cov` para medir.
- **`apps/web`**: sem testes. O script `test` é literalmente `echo 'no tests yet'`.
- **`packages/contracts`** e **`packages/ui`**: sem testes (mesmo `echo`).

`pnpm test` na raiz roda Jest em todos os workspaces via Turborepo — atualmente só a API contribui resultados reais.

---

## Documentação adicional

- **Planejamento de produto** — [`tarefas-md/`](tarefas-md/README.md) — 50 docs cobrindo visão, requisitos, modelo de domínio, fluxos, stack, automações, roadmap, design system, deploy.
- **Schema do banco** — [`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma) — fonte de verdade da modelagem.
- **Infra local** — [`infra/README.md`](infra/README.md).
- **Deploy em produção** — [`tarefas-md/10-deploy-producao.md`](tarefas-md/10-deploy-producao.md).
- **Stack e arquitetura** — [`tarefas-md/05-stack-e-arquitetura.md`](tarefas-md/05-stack-e-arquitetura.md) (com a ressalva da seção "Inconsistências conhecidas" abaixo).
- **Briefings para gerar mais docs** — [`briefings/`](briefings/) (prompts reutilizáveis).

---

## Deploy

Push em `main` dispara [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):

1. `wait-ci` espera o workflow CI (`Lint, Typecheck, Test`) passar
2. `build` builda imagens Docker da API e do Web, publica em `ghcr.io/<owner>/ktask-api` e `ktask-web` com tag = SHA do commit + `latest`
3. `deploy` faz `scp` do `docker-compose.prod.yml` + `Caddyfile` para a VM Hetzner, login efêmero no GHCR, `compose pull` + `up`, aguarda healthcheck (60 tentativas × 5s) e roda smoke test HTTPS

Rollback: rerun do workflow via `workflow_dispatch` com `image_tag` = SHA anterior. A VM nunca tem credencial GitHub permanente (token efêmero por deploy). Detalhes operacionais em [`tarefas-md/10-deploy-producao.md`](tarefas-md/10-deploy-producao.md).

---

## Identidade visual

- Cor primária: `#6D28D9` (light) / `#7C3AED` (dark) — violet 700/600
- Accent: `#2EE8B8` (teal)
- Fonte: Inter
- Ícones: Lucide

Sem emojis em UI, logs, seeds ou CLI — regra explícita do projeto. Detalhes em [`tarefas-md/07-design-system.md`](tarefas-md/07-design-system.md).

---

## Contribuindo

Projeto interno; aceita contribuições do time Kharis e prestadores autorizados.

- **Branch model**: trabalho em `main` (interno, ritmo rápido). Branches de feature são bem-vindas mas não obrigatórias.
- **Commits**: estilo curto em pt-BR ou inglês; prefixos `feat(...)`, `fix(...)`, `chore(...)`, `refactor(...)` recomendados (ver `git log` para padrão real do repo).
- **Pré-commit**: [`.husky/`](.husky/) roda `lint-staged` (Prettier nos arquivos staged). Se o hook falhar no Windows com "husky command not found", rodar `pnpm lint-staged` manualmente antes do `git commit`.
- **Antes de abrir PR**: `pnpm lint && pnpm typecheck && pnpm test` devem passar localmente. CI roda os mesmos checks em Postgres+Redis efêmeros.
- **Code review**: ao menos um aprovador para mudanças em `main`. PRs com mudança em `prisma/schema.prisma` precisam atenção redobrada (migrations rodam no startup do container em produção).

---

## Inconsistências conhecidas

Itens detectados ao gerar este README — documentados aqui para evitar surpresas. **Não corrigir junto, são mudanças à parte.**

- **Rotas web**: o doc [`tarefas-md/05-stack-e-arquitetura.md`](tarefas-md/05-stack-e-arquitetura.md) descreve `/b/[boardId]` e `/c/[cardId]`, mas a rota real do card é `/c/[code]` (deep-link por **shortCode**, não por id). Há também `/quadros` (listagem) que não está no doc original.
- **Módulos da API**: o doc 05 prevê módulos `memberships`, `custom-fields`, `activities`, `forms`, `integrations/evolution`, `sla`, `webhooks` — **não existem** no `apps/api/src/modules/`. Em compensação, existem `admin`, `approvals`, `importer`, `members-admin`, `message-templates`, `me`, `users-view`, `tasks`, `whatsapp` (módulo dedicado em vez de `integrations/evolution`), `push`, `storage`, `contacts` que não constavam no doc. O doc 05 está defasado em relação ao código.
- **`NEXT_PUBLIC_VAPID_PUBLIC_KEY`**: o comentário em [`apps/api/.env.example`](apps/api/.env.example) afirma que a chave pública também precisa ir para o `.env` do web sob esse nome, mas a variável **não** está em [`apps/web/.env.example`](apps/web/.env.example). Web Push pode estar usando outra fonte (env injetada no build, fallback no código) — não verificado.
- **`docs/`**: pasta mencionada em alguns briefings não existe no repo.
- **Assets soltos na raiz**: `kharis-logo*.png`, `logotipo KTask.png`, `og-preview.png` versionados no top-level — provavelmente seriam melhor em `apps/web/public/` ou `docs/assets/`.

---

## Licença

Proprietário — Kharis. `UNLICENSED` (uso interno). Todos os direitos reservados.

Contato: time de desenvolvimento da Kharis.
