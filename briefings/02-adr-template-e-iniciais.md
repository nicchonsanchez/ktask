# Briefing — ADR template + 5 ADRs iniciais

> **Como usar:** cole este briefing inteiro num chat novo de Claude com acesso a este repositório. O Claude executará a Fase 0 (Inventário) e pedirá tua aprovação antes de produzir os entregáveis.

---

## Contexto rápido do projeto

KTask — sistema interno de gestão de tarefas da Kharis. Monorepo pnpm/Turborepo (NestJS 11 + Next.js 15 + Prisma 6 + Postgres 16 + Redis 7 + BullMQ + Socket.IO). Em produção numa Hetzner VM (`ktask.agenciakharis.com.br`), uso interno. Multi-tenant via `organizationId`. Planejamento de produto em [tarefas-md/](../tarefas-md/) (50 docs).

---

## Objetivo desta sessão

Criar uma estrutura de **Architecture Decision Records (ADRs)** pro KTask:

1. **Template** reutilizável pra novas ADRs.
2. **5 ADRs iniciais** documentando decisões arquiteturais importantes já tomadas (registro histórico).

**Audiência**: devs atuais e futuros que precisem entender _por que_ X foi escolhido em vez de Y. ADR não é "como funciona X", é "por que escolhemos X (em vez de Y, Z) num momento específico".

**Entregáveis**:

- `docs/adr/README.md` — índice das ADRs + explicação de como criar nova
- `docs/adr/_TEMPLATE.md` — template (formato Markdown Architecture Decision Record - MADR adaptado)
- `docs/adr/0001-monorepo-pnpm-turborepo.md`
- `docs/adr/0002-multi-tenant-organizationid.md`
- `docs/adr/0003-cards-multi-fluxo-cardpresence.md`
- `docs/adr/0004-deploy-hetzner-vs-aws.md`
- `docs/adr/0005-evolution-api-vs-meta-cloud-api.md`

Formato: Markdown. Cada ADR entre **80 e 150 linhas** (conciso, decisão por decisão).

**Restrições**:

- Sem emojis.
- Tom analítico, sem advocacy. Reconhece trade-offs.
- Datas em ISO `YYYY-MM-DD`. Usa a data da decisão real (procurar no git log) ou marca como `unknown` se não conseguir.
- Não inventar decisões que não foram tomadas. Se não houver evidência clara no código/docs/git, **não cria a ADR**.
- Numeração sequencial (`0001`, `0002`, ...). NUNCA renumerar depois de criada.

---

## Fase 0 — Inventário forçado (FAÇA ISSO PRIMEIRO)

### Leituras obrigatórias

1. [tarefas-md/00-visao-geral.md](../tarefas-md/00-visao-geral.md)
2. [tarefas-md/05-stack-e-arquitetura.md](../tarefas-md/05-stack-e-arquitetura.md)
3. [tarefas-md/08-infra-e-deploy.md](../tarefas-md/08-infra-e-deploy.md) — plano AWS original
4. [tarefas-md/10-deploy-producao.md](../tarefas-md/10-deploy-producao.md) — Hetzner real
5. [tarefas-md/13-cards-multi-fluxo.md](../tarefas-md/13-cards-multi-fluxo.md) — CardPresence
6. [tarefas-md/19-contatos-externos.md](../tarefas-md/19-contatos-externos.md)
7. [tarefas-md/33-automacao-whatsapp-contato.md](../tarefas-md/33-automacao-whatsapp-contato.md)
8. [apps/api/prisma/schema.prisma](../apps/api/prisma/schema.prisma) — pra confirmar que `organizationId` está realmente em todo lugar
9. [package.json](../package.json) + [pnpm-workspace.yaml](../pnpm-workspace.yaml) + [turbo.json](../turbo.json) — pra confirmar monorepo

### Exploração estruturada

- Use `git log --all --oneline | head -100` pra encontrar datas de commits decisivos (criação inicial do projeto, mudança de plano de deploy, introdução do CardPresence, etc).
- Use `Grep` pra confirmar `organizationId` em modelos do Prisma (quantos modelos têm).
- Use `Glob` pra listar `apps/api/src/modules/whatsapp/` e confirmar que Evolution é a integração escolhida.
- Use `Grep` pra confirmar uso de `next.config` / `turbo.json` / `pnpm-workspace.yaml` (justifica decisão monorepo).

### Saída da Fase 0

Liste:

```
## Inventário (Fase 0)

### Decisões arquiteturais com evidência sólida (vão virar ADR)
1. Monorepo pnpm + Turborepo
   - Evidência: pnpm-workspace.yaml, turbo.json, package.json com "packageManager"
   - Alternativas mencionadas em docs: Nx, Lerna, single-repo
   - Data aproximada do commit inicial: YYYY-MM-DD
2. Multi-tenant via organizationId
   - Evidência: schema.prisma — X de Y modelos têm organizationId
   - tarefas-md/00 e 05 mencionam decisão
   - ...
3. ...

### Decisões consideradas mas SEM ADR (justifique)
- [decisão X] — não tem evidência suficiente no repo
- [decisão Y] — é tática, não arquitetural

### Para cada ADR planejada, qual ficou claro:
- Contexto (que problema motivou a decisão)
- Alternativas consideradas (mínimo 2)
- Decisão tomada
- Consequências aceitas (trade-offs)
- Status atual (Accepted / Superseded / Deprecated)

### Coisas que vou DEIXAR DE FORA
- ...

**Aguardo aprovação ou correção antes de produzir os ADRs.**
```

Se algum dos 5 ADRs planejadas no objetivo **não tiver evidência suficiente**, sinalize na Fase 0 e proponha alternativa. Não inventa.

---

## Fase 1 — Produção

Após aprovação, produza nesta ordem:

### 1. `_TEMPLATE.md`

Formato MADR adaptado:

```markdown
# ADR NNNN — Título curto da decisão

- **Status**: Accepted | Proposed | Superseded by ADR-XXXX | Deprecated
- **Data**: YYYY-MM-DD
- **Decisores**: nomes ou papéis (ex: "Nicchon", "time de dev")
- **Tags**: monorepo, banco, deploy, etc

## Contexto

[Qual problema motivou a decisão. O que estava em jogo. Contexto técnico e de negócio relevante.]

## Decisão

[O que foi decidido. Frase curta no presente do indicativo.]

## Alternativas consideradas

### Alternativa A: [nome]

- Pros: ...
- Contras: ...

### Alternativa B: [nome]

- Pros: ...
- Contras: ...

## Consequências

### Positivas

- ...

### Negativas / trade-offs aceitos

- ...

### Neutras / observações

- ...

## Notas

[Links pra docs, RFCs externos, conversas relevantes. Opcional.]
```

### 2. `README.md` (do diretório `docs/adr/`)

Curto:

- O que é ADR
- Quando criar uma nova
- Como numerar (sempre incrementar, nunca renumerar)
- Como marcar uma ADR como superseded
- Tabela com todas as ADRs (número, título, status, tags)

### 3. As 5 ADRs

Cada uma seguindo o template, ~80-150 linhas. Conteúdo esperado:

**0001 — Monorepo pnpm + Turborepo**

- Alternativas: Nx, Lerna, repositórios separados, yarn workspaces
- Decisão: pnpm workspaces + Turborepo
- Procurar evidência no `package.json#packageManager`, `turbo.json`, `tarefas-md/05`

**0002 — Multi-tenant via `organizationId`**

- Alternativas: schema-per-tenant (Postgres), database-per-tenant, single-tenant
- Decisão: shared schema com `organizationId` em todos os modelos relevantes
- Procurar evidência no `schema.prisma` (quantos modelos têm), `tarefas-md/05`

**0003 — Cards multi-fluxo via `CardPresence` (M:N)**

- Alternativas: `Card.boardId` single (modelo original/iteração 1), N:N direto entre Card e List
- Decisão: tabela `CardPresence(cardId, boardId, listId, position, ...)` como source-of-truth do kanban
- Procurar evidência no `schema.prisma` (model `CardPresence`), `tarefas-md/13`

**0004 — Deploy Hetzner VM em vez de AWS**

- Alternativas: AWS App Runner + RDS + ElastiCache (plano original em `tarefas-md/08`), Vercel + serverless, Fly.io
- Decisão: Hetzner VM única com Docker Compose + Caddy
- Procurar evidência em `tarefas-md/10-deploy-producao.md`, `.github/workflows/deploy.yml`, custo (~R$ 34/mês)

**0005 — WhatsApp via Evolution API**

- Alternativas: Meta Cloud API oficial, Twilio, Z-API, Wuzapi
- Decisão: Evolution API (self-hosted)
- Procurar evidência em `apps/api/src/modules/whatsapp/`, `tarefas-md/33`, env vars `EVOLUTION_*`

---

## Fase 2 — Auto-auditoria

Antes de declarar pronto:

1. **Cobertura**: cada ADR aprovada na Fase 0 está produzida? Alguma com evidência fraca foi omitida e listada como sugestão?
2. **Verificação de fatos**: cada "Decisão" cita o arquivo/path onde a evidência está? Cada "Alternativa considerada" é defensável (não inventou opção que ninguém debateu)?
3. **Status realista**: nenhuma ADR está marcada `Accepted` se a decisão na verdade evoluiu (ex: se AWS foi proposto e Hetzner foi adotado, a ADR é sobre Hetzner com nota "supersedes plano original em tarefas-md/08").
4. **Entrega**:

```
## Resumo da entrega

- Arquivos gerados: docs/adr/README.md, docs/adr/_TEMPLATE.md, docs/adr/0001..0005-...md
- ADRs produzidas: 5/5 (ou menor com justificativa)
- Inferências sem confirmação direta: [lista, ou "nenhuma"]
- Datas obtidas via git log vs. marcadas como unknown: [contagem]
- Sugestões de ADRs futuras (decisões que vc viu mas não tinham evidência forte hoje): [lista]
```

---

## Notas gerais

- Sem emojis.
- Tom analítico, não advocacia.
- Linguagem direta: "Decidimos usar X porque Y" — sem "acreditamos que esta é a melhor escolha pois...".
- Cada ADR deve ser legível em isolamento (sem precisar ler outras pra entender).
- ADRs são **imutáveis após Accepted**. Pra mudar a decisão, cria-se uma nova ADR que "supersedes" a antiga (e a antiga muda status pra `Superseded by ADR-XXXX`).
- Em dúvida sobre escopo durante Fase 1, pergunte. Não chute.
