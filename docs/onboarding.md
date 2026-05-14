# Onboarding — dev no KTask

Este doc te leva de "nunca vi o repo" até "consigo tocar features sozinho" em aproximadamente 90 dias. Não é contrato: se você chega com expertise em parte da stack, pula. Se precisa de mais tempo numa área, gasta. Conversa frequentemente com o sênior pra calibrar.

Última atualização: 2026-05-13.

---

## Antes de começar

Pré-requisitos do ambiente — todos cobertos com mais detalhe no [README.md](../README.md) raiz:

- **Node.js** `>=22` (ver `.nvmrc`).
- **pnpm** `9.15.0` exato — `corepack enable` resolve.
- **Docker Desktop** com Compose v2.
- **Git** + acesso ao repo `kharis-edu/gestao-de-tarefas` no GitHub.
- **IDE** recomendado: VS Code com extensões Prisma, ESLint, Prettier, Tailwind CSS IntelliSense.
- **SSH para a VM de produção (Hetzner)**: **não no dia 1**. Ver seção [Acesso a produção](#acesso-a-produção).

Setup inicial não está repetido aqui — siga o README e volte. Critério pra fechar a etapa de setup: `pnpm dev` sobe sem erro, você consegue logar em http://localhost:3000 com a conta seed.

---

## Como ler este doc

Quatro ondas de aprofundamento: **Semana 1**, **Dias 1-30**, **Dias 31-60**, **Dias 61-90**. Cada tarefa tem um critério verificável — se você não consegue demonstrar pro sênior que terminou, não terminou.

Áreas avançadas (engine de automações internals, importer Ummense, internals de real-time) ficam marcadas como **fase 2** e ficam pra depois dos 90 dias.

---

## Semana 1 — Sobrevivência

Objetivo: rodar o sistema local, navegar como usuário, fazer o primeiro PR mergeado.

- [ ] **Clone + setup local**. Segue o [README.md](../README.md). Critério: `pnpm dev` sobe sem erro, web em http://localhost:3000 e API em http://localhost:4000/docs respondem.
- [ ] **Login + tour como usuário**. Logue com a conta seed (`desenvolvimento@agenciakharis.com.br` / `ktask123`) e execute em sequência: criar um quadro novo, criar 3 listas, criar 2 cards, comentar num card, subir um anexo, mover card entre listas, arquivar uma lista. Critério: tudo acima feito sem perguntar a ninguém.
- [ ] **Ler [tarefas-md/00-visao-geral.md](../tarefas-md/00-visao-geral.md)** (10min). Pega contexto de produto: público, diferenciais, princípios, nomenclatura pt-BR.
- [ ] **Ler [README.md](../README.md) raiz inteiro**. Não pra decorar — pra saber onde voltar quando bater dúvida de scripts ou env vars.
- [ ] **Sessão 1:1 de 30min com o tech lead** (Nicchon). Formato: pergunta livre. Saia com uma anotação curta do que ficou confuso pra revisitar nas próximas 3 semanas.
- [ ] **Primeiro PR**. Pode ser correção de typo, ajuste de copy, atualização de uma frase em doc, ou um dos itens da seção [Boas-vindas técnicas](#boas-vindas-técnicas). Critério: branch criada, commit no padrão `type(scope): mensagem`, push, PR aberto no GitHub, CI verde, merge. **Foco é completar o ciclo**, não o tamanho da mudança.

**O que você NÃO precisa entender ainda**: engine de automações, modelo de dados profundo, deploy, real-time, importer Ummense.

---

## Dias 1-30 — Operação

Objetivo: contribuir em features pequenas com confiança. Saber a topologia do código.

### Domínio de produto

- [ ] **Ler [tarefas-md/01-requisitos-funcionais.md](../tarefas-md/01-requisitos-funcionais.md)** uma vez. Não decora, só forma mapa mental. Critério: dado um RF aleatório, você consegue dizer em qual módulo do api ele vive.
- [ ] **Ler [tarefas-md/04-fluxos-principais.md](../tarefas-md/04-fluxos-principais.md)**. Critério: você consegue desenhar o fluxo "criar post → solicitar aprovação → cliente aprova → card move pra coluna Aprovado" num quadro branco.
- [ ] **Atravessar o app de ponta a ponta**: crie um quadro tipo "Redes Sociais", crie sub-cards (design, copy) num card pai, marque sub-cards como finalizados, solicite aprovação do card pai, abra o link público de aprovação em uma aba anônima e aprove como se fosse o cliente. Critério: o card pai mudou de coluna automaticamente após a aprovação.

### Domínio técnico — fundação

- [ ] **Ler [tarefas-md/05-stack-e-arquitetura.md](../tarefas-md/05-stack-e-arquitetura.md)**, **com a ressalva** de que o README documenta as "Inconsistências conhecidas" — algumas rotas e módulos diferem.
- [ ] **Ler [docs/data-model/README.md](data-model/README.md) + [er-diagram.md](data-model/er-diagram.md)** com o [apps/api/prisma/schema.prisma](../apps/api/prisma/schema.prisma) aberto ao lado. Critério: explicar em 2min por que `Card.boardId` é legacy e `CardPresence` é fonte de verdade.
- [ ] **Mapear 7 modelos centrais**: `Organization`, `User`, `Membership`, `Board`, `List`, `Card`, `CardPresence`. Critério: desenhar o ER deles de cabeça (FKs, cardinalidades).
- [ ] **Estudar 1 módulo isolado de cabo a rabo**: sugestão `labels` ou `attachments` (4 arquivos cada). Leia controller → service → DTO → módulo. Critério: explicar pro sênior em 5min o fluxo de uma rota (do HTTP até o Prisma e de volta), incluindo onde o `organizationId` entra.

### Domínio técnico — frontend

- [ ] **Estudar uma página simples**: sugestão [/contatos](<../apps/web/src/app/(app)/contatos/page.tsx>). Critério: explicar como ela carrega dados (TanStack Query key), como faz mutation, como invalida o cache após salvar.
- [ ] **Internalizar 3 padrões**:
  - `useQuery` keys: convenção de naming + invalidação por prefixo.
  - `useMutation`: optimistic UI + `onError` rollback.
  - `ApiError` handling: como erros do NestJS chegam ao toast da UI.
- [ ] **Ler [tarefas-md/07-design-system.md](../tarefas-md/07-design-system.md)** rápido. Critério: você sabe onde estão os tokens de cor e que **não se usa emoji** em UI, logs, seeds nem CLI.

### Contribuição

- [ ] **1 issue tamanho P** (ver [Tamanhos de issue](#tamanhos-de-issue)). Implementa, abre PR, recebe code review, merge. Critério: PR mergeado.

### Avaliação aos 30 dias

Conversa com o tech lead:

- O que ficou claro? O que ainda não bateu?
- Quais áreas pegar nas próximas 4 semanas?
- Algum bloqueio cultural ou de processo?

---

## Dias 31-60 — Profundidade

Objetivo: contribuir em features médias. Entender áreas cross-cutting.

### Sistemas críticos

- [ ] **Auth**: ler [apps/api/src/modules/auth/](../apps/api/src/modules/auth/). Entender fluxo JWT access 15min + refresh httpOnly cookie, Passport strategies, interceptor de refresh no client. Critério: explicar o que acontece quando o access token expira no meio de uma sessão.
- [ ] **Real-time**: ler [apps/api/src/modules/realtime/](../apps/api/src/modules/realtime/) + uma página que usa Socket.IO (sugestão: `/b/[boardId]`). Critério: explicar como uma mutation HTTP `cards.move` propaga pra outros clientes na mesma sala `board:{id}`.
- [ ] **Permissões por board**: ler o serviço que resolve `BoardRole` efetivo. Entender o bypass de `OWNER`/`ADMIN`/`GESTOR` (são `ADMIN` implícito em todo quadro da org) e a regra de `Visibility.ORGANIZATION` que dá leitura a `MEMBER`. Critério: dado um usuário + board, prever qual role efetivo ele tem antes de rodar o código.
- [ ] **Multi-tenant**: ler `TenantContextMiddleware` (em `apps/api/src/common/`) e qualquer service. Critério: explicar por que services **nunca** confiam em `organizationId` vindo do body/query.

### Multi-fluxo

- [ ] **Ler [tarefas-md/13-cards-multi-fluxo.md](../tarefas-md/13-cards-multi-fluxo.md) + [ADR-0003](adr/0003-cards-multi-fluxo-cardpresence.md)**.
- [ ] **Exercício prático**: rode `pnpm db:studio`, escolha um card aleatório com mais de uma `CardPresence`, e via Prisma Studio liste todos os boards em que ele aparece. Critério: print/anotação com o `shortCode` do card + lista de boards.

### Contribuição

- [ ] **1 issue tamanho M**, implementação + PR + merge.
- [ ] **OU 1 refactor técnico** identificado pelo time (ex: extrair helper, melhorar tipo, adicionar testes a um service hoje sem cobertura).

### Deploy

- [ ] **Ler [tarefas-md/10-deploy-producao.md](../tarefas-md/10-deploy-producao.md) + [.github/workflows/deploy.yml](../.github/workflows/deploy.yml)**. Critério: explicar o que acontece quando alguém faz push em `main`.
- [ ] **Acompanhar um deploy real do início ao fim** (com Nicchon ao lado). Olhar o workflow no GitHub Actions, observar `wait-ci` → `build` → `deploy` → smoke test. Critério: você sabe onde olhar quando o deploy falha.
- [ ] **Ler 2 runbooks**: [docs/runbooks/01-api-fora-do-ar.md](runbooks/01-api-fora-do-ar.md) e [05-deploy-falhou-rollback.md](runbooks/05-deploy-falhou-rollback.md). Critério: dado o cenário "deploy quebrou e o site está fora", você consegue narrar a primeira hora.

### Acesso a produção (nesta fase)

Ainda **zero acesso SSH**. Você apenas observa o deploy via GitHub Actions e logs de CI. Não pede credencial de VM.

---

## Dias 61-90 — Autonomia

Objetivo: tocar feature grande de ponta a ponta. Começar a entrar no plantão.

### Áreas avançadas

- [ ] **Engine de automações**: ler [tarefas-md/09-engine-automacoes.md](../tarefas-md/09-engine-automacoes.md) + [apps/api/src/modules/automations/](../apps/api/src/modules/automations/). Entender Trigger → Condition → Action, `DELAY` via BullMQ, retry exponencial, `AutomationRun.actionsLog`. Critério: criar uma automação simples pela UI ("quando card move pra lista X, posta comentário Y") e demonstrar que rodou.
- [ ] **BullMQ workers**: ler os processors em `apps/api/src/queues/` (ou equivalente). Critério: explicar como adicionar uma nova fila e um novo processor, e onde o cron de SLA agenda jobs.
- [ ] **Aprovações cliente**: ler [tarefas-md/14-aprovacoes-cliente.md](../tarefas-md/14-aprovacoes-cliente.md) + [apps/api/src/modules/approvals/](../apps/api/src/modules/approvals/). Entender token público em `/aprovar/[token]`, role `REVIEWER`, branching automático. Critério: explicar por que o link público não passa pelo `JwtGuard` e como a autorização é feita então.

### Contribuição

- [ ] **1 feature G** (ver [Tamanhos de issue](#tamanhos-de-issue)). Faz planning numa doc em `tarefas-md/` antes (escopo, etapas, critérios de aceite, riscos). Implementa. Code review. Merge.
- [ ] **OU liderar a resolução de 1 incidente real** com runbook em mãos. O sênior fica ao lado, mas você dirige.

### Acesso a produção (nesta fase)

- **Read-only acompanhado em 3 incidentes ou janelas de manutenção**: o sênior está presente, você executa comandos somente de leitura (`docker ps`, `docker logs <container> --tail 200`, `docker stats`). Você **não** roda comandos que mudam estado.
- Lê todos os runbooks em [docs/runbooks/](runbooks/).
- Roda um restore de backup em ambiente isolado (não-produção) pra entender o procedimento. Critério: você consegue subir uma cópia do dump mais recente em uma instância local e fazer login na cópia.

### Avaliação aos 90 dias

Conversa com o tech lead:

- Pode tocar features G sozinho? Quais áreas ainda dependem de sênior?
- Está confortável de entrar no plantão (sem pânico)?
- Quais lacunas pra próximos 90 dias?

---

## Pós-90 dias — Operação plena

- Pode tocar features G sem supervisão direta (revisão de PR continua).
- Pode pegar plantão de incidentes.
- **SSH em produção**: acesso pode ser concedido individualmente, mas **toda operação destrutiva exige autorização explícita do tech lead, pedida na hora**. Ver [Denylist do projeto](#denylist-do-projeto) abaixo.

---

## Acesso a produção

Resumo da política, válida em todas as fases:

| Fase        | Acesso SSH            | Pode rodar                                                                        |
| ----------- | --------------------- | --------------------------------------------------------------------------------- |
| Dias 1-60   | Nenhum                | Nada na VM. Só GitHub Actions e logs de CI.                                       |
| Dias 61-90  | Read-only acompanhado | `docker ps`, `docker logs`, `docker stats` com sênior presente. Mínimo 3 sessões. |
| Pós-90 dias | Individual            | Comandos não-destrutivos livres. Destrutivos exigem autorização caso a caso.      |

### Denylist do projeto

Coisas que **ninguém faz sozinho**, em qualquer fase, em qualquer projeto Kharis:

- Force-push em `main`, `git reset --hard` em `main`, rebase de commits já publicados.
- `--no-verify`, `--no-gpg-sign` em commits.
- Qualquer SQL/Prisma contra banco de **produção** (`DROP`, `TRUNCATE`, `DELETE` sem `WHERE`, migration que remove coluna).
- `prisma migrate reset`, `db push --accept-data-loss`.
- SSH em VM de produção pra rodar comando destrutivo.
- Apagar `.env*`, `prod.env`, `*.pem`, SSH keys, `Caddyfile`, `docker-compose.prod.yml`, `schema.prisma` (comentar com motivo está OK; apagar nunca).
- `gh secret set/delete`, `gh release create/delete`.
- `npm publish` em qualquer pacote do monorepo.
- Mensagens WhatsApp/email pra terceiros (clientes, leads) sem autorização explícita.

Bateu em qualquer um destes: **pare, avise o tech lead, espere autorização**. Não tem pressa que justifique pular.

---

## Tamanhos de issue

Convenção do time pra calibrar expectativa. Não é rígido — usa pra alinhar prazo e nível de revisão.

| Tamanho | Critério                                                                                        | Prazo típico   | Revisão                                                            |
| ------- | ----------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------ |
| **P**   | 1-2 arquivos, sem migration, sem cross-module                                                   | menos de 1 dia | 1 aprovador                                                        |
| **M**   | múltiplos arquivos no mesmo módulo, talvez 1 migration simples, sem mudança de contrato público | 2-5 dias       | 1 aprovador + smoke test local                                     |
| **G**   | cross-module, migration de schema, mudança de contrato, ou feature nova com UI + API + worker   | 1-3 semanas    | doc de planning em `tarefas-md/` + 1 aprovador + acompanhar deploy |

Se a issue parece P mas você está há 2 dias, pare e converse com o sênior — quase sempre é repriorizar ou pedir ajuda, não "continuar mais um pouco".

---

## Boas-vindas técnicas

Exemplos vivos de "good first issues" — **snapshot 2026-05-13**, podem estar resolvidos quando você ler. Confirme com o tech lead antes de pegar:

1. Atualizar `tarefas-md/05-stack-e-arquitetura.md` com a lista real de módulos da API (existem `admin`, `approvals`, `importer`, `members-admin`, `message-templates`, `me`, `users-view`, `tasks`, `whatsapp`, `push`, `storage`, `contacts` que não constavam no doc).
2. Corrigir referência `/c/[cardId]` → `/c/[code]` no mesmo doc — a rota real usa `shortCode`, não `id`.
3. Adicionar `NEXT_PUBLIC_VAPID_PUBLIC_KEY` em `apps/web/.env.example` (ou remover comentário enganoso do `apps/api/.env.example`).
4. Mover assets soltos da raiz (`kharis-logo*.png`, `logotipo KTask.png`, `og-preview.png`) pra `apps/web/public/` ou `docs/assets/`.
5. Adicionar primeiro spec no `apps/web` (hoje é literalmente `echo 'no tests yet'`). Sugestão: começar por uma função pura em `lib/`.

Outras fontes de primeiras tarefas:

- Issues marcadas como `good first issue` no GitHub (se já existir o label — pergunta ao tech lead).
- TODOs no código (`rg "TODO" apps/`) — escolha um pequeno, valide com o sênior antes de tocar.

---

## Convenções importantes (consultar sempre)

- **Sem emojis** em código, UI, logs, seeds, CLI ou commits. Regra explícita do projeto. Onde precisar de ícone, usar [Lucide](https://lucide.dev).
- **Português brasileiro** nas mensagens de UI e (preferencialmente) nos commits.
- **Commits** no padrão `type(scope): mensagem`. Exemplos: `feat(card): adiciona campo X`, `fix(automation): corrige render de variável vazia`, `chore(deps): atualiza prisma`.
- **PRs descritivos**: o que muda, por quê, screenshot/gif se for UI, plano de teste em uma frase.
- **Antes do PR**: `pnpm lint && pnpm typecheck && pnpm test` verdes localmente.
- **Pre-commit (husky)**: roda `lint-staged`. Se falhar no Windows com "husky command not found", rode `pnpm lint-staged` manualmente antes do `git commit` — **não use `--no-verify`**.
- **Testes pra features novas** mesmo que cobertura geral seja baixa. Não pioramos a média.
- **Migrations** em PR separado quando possível; sempre revisar com cuidado redobrado.
- **Datas em ISO** (`2026-05-13`) em docs e changelogs.

---

## Pessoas-chave

Tabela por papel — preencha conforme os papéis forem ocupados:

| Papel                               | Pessoa      | Quando procurar                                                                 |
| ----------------------------------- | ----------- | ------------------------------------------------------------------------------- |
| Tech lead / arquitetura             | Nicchon     | Decisões de design, autorização de deploy/SSH, mudanças cross-cutting, denylist |
| Backend lead (api, banco, filas)    | (preencher) | Dúvida de Prisma, NestJS, BullMQ, schema                                        |
| Frontend lead (web, design system)  | (preencher) | Dúvida de Next.js, TanStack Query, Tailwind, padrões de página                  |
| Produto / cliente interno principal | (preencher) | Dúvida de prioridade, escopo de feature, comportamento esperado                 |
| Operações / suporte interno         | (preencher) | Reporte de bug do dia a dia, contexto de incidente                              |
| Acessos / credenciais / infra       | Nicchon     | SSH, secrets, AWS, Hetzner, domínios                                            |

---

## Recursos

- **Planejamento de produto**: [tarefas-md/](../tarefas-md/) (mais de 50 docs, indexadas em [tarefas-md/README.md](../tarefas-md/README.md))
- **Docs técnicas**: [docs/](.) — ADRs, data-model, runbooks, postmortems, api
- **Briefings pra gerar docs**: [briefings/](../briefings/) — prompts reutilizáveis pra produzir novas docs
- **Schema do banco**: [apps/api/prisma/schema.prisma](../apps/api/prisma/schema.prisma)
- **Repo no GitHub**: `kharis-edu/gestao-de-tarefas` (privado)
- **Produção**: https://ktask.agenciakharis.com.br + https://api.ktask.agenciakharis.com.br
- **Swagger local**: http://localhost:4000/docs

---

## Não há checklist perfeito

Esse documento é um guia, não contrato. Se você chega já com expertise em parte da stack, pula. Se sente que precisa mais tempo em alguma área, gasta. Se acha que alguma tarefa aqui está desatualizada ou errada, **edite** — esse arquivo evolui com quem chega.
