# ADR 0002 — Multi-tenant via `organizationId` (shared schema)

- **Status**: Accepted
- **Data**: 2026-04-23
- **Decisores**: Nicchon (operador único)
- **Tags**: multi-tenant, banco, segurança

## Contexto

O KTask nasceu como ferramenta interna da Kharis (uma única organização real em produção hoje), mas o horizonte declarado é virar SaaS multi-empresa em algum momento — sem data e sem compromisso, mas suficientemente provável pra evitar refactor invasivo de schema depois.

Citação direta de [tarefas-md/00-visao-geral.md](../../tarefas-md/00-visao-geral.md#L11): "multi-tenant desde o dia zero (`organizationId` em tudo) porque o custo é baixo e evita refactor futuro".

A pergunta arquitetural concreta foi: **como isolar tenants no banco?** Três famílias clássicas existem:

1. **Shared schema** — uma só base, uma só schema, coluna `organizationId` em cada modelo de tenant.
2. **Schema-per-tenant** — uma só base, schema Postgres por tenant (ex: `tenant_kharis`, `tenant_acme`).
3. **Database-per-tenant** — uma base por tenant.

Evidência no repo:

- [apps/api/prisma/schema.prisma](../../apps/api/prisma/schema.prisma) declara `organizationId String` explicitamente em **16 modelos** (Membership, Invitation, Session, Board, Label, Contact, Automation, AutomationRun, Activity, Attachment, MessageTemplate, OrgImportMapping, ChecklistTemplate, etc). Modelos-filhos (Card, List, Comment, Checklist, ChecklistItem) herdam o tenant via FK pra Board/Org.
- Total de 35 modelos no schema; o conjunto com `organizationId` direto cobre todas as entidades top-level tenant-scoped.
- [tarefas-md/05-stack-e-arquitetura.md](../../tarefas-md/05-stack-e-arquitetura.md) descreve `TenantContextMiddleware`, `BoardRoleGuard` e prevê adoção futura de Row-Level Security (RLS) do Postgres como defesa em profundidade.
- Commit inicial do schema: `e44c703 feat(phase-0): bootstrap monorepo` (2026-04-23) — o `organizationId` já estava lá desde o primeiro commit.

## Decisão

O isolamento entre organizações é feito por **shared schema com coluna `organizationId`** em todas as entidades top-level. Aplicação garante o filtro via middleware (`TenantContextMiddleware`) + guards (`OrgGuard`, `BoardRoleGuard`). Services **nunca** confiam em `organizationId` vindo de body/query — sempre do contexto autenticado.

## Alternativas consideradas

### Alternativa A: Shared schema com `organizationId` (escolhida)

- Pros: schema único é trivial de migrar, indexar e operar; custo de infra fixo (um banco, um pool de conexões); analytics cross-org possíveis no futuro; Prisma trata todos os modelos uniformemente.
- Contras: vazamento de dados entre tenants exige bug na aplicação — não há barreira física no banco; `WHERE organizationId = ?` precisa estar em **todas** as queries (responsabilidade do guard/middleware).
- Evidência: descrita em `tarefas-md/00` linha 11 e `tarefas-md/05` seção "Tenant isolation".

### Alternativa B: Schema-per-tenant (Postgres `SCHEMA`)

- Pros: isolamento mais forte (uma query mal escrita não vaza dados de outro tenant); permite RLS nativo do Postgres por schema; clientes enterprise podem pedir "meu schema isolado".
- Contras: migrations precisam rodar N vezes (uma por schema); Prisma não suporta multi-schema dinâmico bem (cada schema vira um datasource); custo operacional sobe linearmente com tenants.
- Evidência: padrão da indústria pra SaaS B2B, sem debate registrado explicitamente nos docs do KTask. Doc 05 menciona apenas RLS dentro do shared schema, não schema-per-tenant.

### Alternativa C: Database-per-tenant

- Pros: isolamento máximo (zero risco de vazamento via aplicação); permite backup/restore por cliente; útil pra compliance pesado (LGPD enterprise, HIPAA).
- Contras: custo alto (cada tenant = uma instância ou pelo menos uma database gerenciada); operação complexa (migrations distribuídas, monitoring × N, pool de conexões fragmentado); inviável pra uso interno e pra SaaS de PMEs com ticket baixo.
- Evidência: padrão da indústria, sem debate registrado nos docs do KTask.

### Alternativa D: Single-tenant (sem `organizationId`)

- Pros: schema mais simples agora; menos JOINs.
- Contras: viraria refactor invasivo quando (e se) o SaaS sair; mesmo no uso interno, a Kharis tem subgrupos que se beneficiam do conceito de "Org" (separar dados por unidade).
- Evidência: descartada explicitamente em `tarefas-md/00` linha 11 com o argumento "custo é baixo e evita refactor futuro".

## Consequências

### Positivas

- Adicionar uma nova organização é `INSERT INTO Organization` + criar `Membership` — não há provisionamento de schema/database.
- Migrations Prisma são únicas e atômicas — um `prisma migrate deploy` cobre todos os tenants.
- Indexação composta (`@@index([organizationId, ...])`) é trivial e cobre os filtros de tenant.
- O middleware `TenantContextMiddleware` centraliza o filtro — services individuais não duplicam lógica de "qual org sou eu".

### Negativas / trade-offs aceitos

- O isolamento depende **inteiramente da aplicação**. Um bug em um service (ex: esquecer `WHERE organizationId = ctx.orgId` numa query crua) vaza dados entre tenants. Compensado parcialmente por: (a) o guard injeta `ctx.tenant` antes do service rodar; (b) services recebem `@CurrentOrg()` por decorator e sempre filtram.
- O modelo `CardPresence` (ver ADR 0003) e outras tabelas-filhas dependem do parent (Card, Board) ter o `organizationId` correto. A integridade depende de FKs, não de denormalização.
- Sem isolamento físico, clientes enterprise futuros que exigirem "meu banco" precisarão de um track separado (não suportado pelo schema atual).

### Neutras / observações

- O doc `tarefas-md/05` prevê **Row-Level Security (RLS)** do Postgres como defesa em profundidade futura: `SET app.current_org = ...` no início de cada transação via Prisma middleware. Isso transforma o vazamento por bug em erro do banco. Ainda não implementado.
- A migração pra schema-per-tenant é viável tecnicamente caso o cenário SaaS exija (`pg_dump --schema=...`), mas é trabalho não-trivial — não é "flip a switch".

## Notas

- Schema: [apps/api/prisma/schema.prisma](../../apps/api/prisma/schema.prisma).
- Doc de produto: [tarefas-md/00-visao-geral.md](../../tarefas-md/00-visao-geral.md).
- Doc de arquitetura: [tarefas-md/05-stack-e-arquitetura.md](../../tarefas-md/05-stack-e-arquitetura.md) (seção "Tenant isolation").
- Decisão originária do commit `e44c703` (2026-04-23).
