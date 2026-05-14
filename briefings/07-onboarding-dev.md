# Briefing — Onboarding de dev (checklist 30/60/90 dias)

> **Como usar:** cole este briefing num chat novo de Claude com acesso a este repositório. Fase 0 (Inventário) primeiro; aguarda aprovação antes de produzir.

---

## Contexto rápido do projeto

KTask em uso interno na Kharis. Time pequeno. Estrutura provavelmente sem onboarding formalizado — devs novos hoje aprendem por imersão e perguntas ao Nicchon. O objetivo é criar um documento estruturado pra acelerar quem entra (e reduzir o gargalo do Nicchon).

---

## Objetivo desta sessão

Produzir um **documento de onboarding** pra dev novo no time, organizado em ondas de aprofundamento (semana 1, primeiros 30 dias, 60 dias, 90 dias). Cada onda com objetivos claros, tarefas concretas e critérios de "concluído".

**Audiência**: dev novo (júnior, pleno ou sênior) chegando ao KTask. Assume conhecimento de JS/TS moderno mas zero contexto do produto e da arquitetura.

**Entregável**:

- `docs/onboarding.md` — documento único, ~300-500 linhas

**Restrições**:

- Sem emojis.
- Tarefas concretas, não genéricas. "Crie um card pelo `pnpm dev` e verifique que aparece no kanban" — sim. "Familiarize-se com o sistema" — não.
- Idealmente cada tarefa termina com algo verificável (PR aprovado, artefato gerado, demonstração ao time).
- Realista: dev novo não vai dominar TUDO em 90 dias. Marca áreas avançadas como "fase 2".

---

## Fase 0 — Inventário forçado

### Leituras obrigatórias

1. [tarefas-md/README.md](../tarefas-md/README.md) — índice das docs
2. [tarefas-md/00-visao-geral.md](../tarefas-md/00-visao-geral.md)
3. [tarefas-md/05-stack-e-arquitetura.md](../tarefas-md/05-stack-e-arquitetura.md)
4. [apps/api/prisma/schema.prisma](../apps/api/prisma/schema.prisma)
5. Estrutura `apps/api/src/modules/` e `apps/web/src/app/`
6. `package.json` (raiz + apps) pra ver scripts disponíveis
7. `README.md` da raiz (se já existir gerado pelo briefing 01) — não repete instruções de setup, aponta pra ele

### Exploração estruturada

- Lista todos os módulos do api e classifica por complexidade (auth = nuclear, attachments = isolado, automations = complexo).
- Lista todas as features visíveis (rotas em `(app)/`).
- Identifica "good first issues" potenciais — bugs conhecidos, melhorias pequenas, refactors localizados.

### Saída da Fase 0

```
## Inventário (Fase 0)

### Módulos do api classificados por complexidade
- Nuclear (precisa entender antes de tocar): auth, cards, boards, lists
- Importante (precisa entender pra trabalhar em features cross-cutting): organizations, members-admin, automations
- Isolado (pode ser tocado sem dominar o resto): attachments, push, health, mail, ...

### Features visíveis (rotas)
- /quadros, /b/[boardId], /c/[code], /contatos, /aprovacoes, /indicadores, /configuracoes, ...

### Conceitos do domínio que o dev novo precisa absorver (priorizado)
1. Multi-tenant (organizationId em tudo)
2. Modelo Card → CardPresence (multi-fluxo)
3. Engine de automações (triggers, conditions, actions)
4. Sistema de aprovações (REVIEWER role, token público)
5. Real-time via Socket.IO
6. ...

### Boas-vindas técnicas (potenciais "good first issues")
- ...
- ...

### Coisas avançadas (fase 2, depois dos 90 dias)
- Engine de automações internals
- Importer Ummense
- WhatsApp integration profunda
- ...

### Coisas que vou DEIXAR DE FORA
- Onboarding cultural / processos de RH — fora do escopo técnico
- Onboarding de produto pra non-dev (será separado)

**Aguardo aprovação ou correção antes de produzir o doc.**
```

---

## Fase 1 — Produção

Após aprovação:

### `docs/onboarding.md`

Estrutura sugerida:

```markdown
# Onboarding — dev no KTask

Este doc te leva de "nunca vi o repo" até "consigo tocar features sozinho" em ~90 dias.

## Antes de começar

[Pré-requisitos do ambiente: Node 22+, Docker, IDE recomendado (VS Code com extensões), acesso ao GitHub, SSH para VM se for tocar prod.]

## Semana 1 — Sobrevivência

Objetivo: rodar o sistema local e fazer o primeiro PR mergeado.

- [ ] Clone do repo + setup local seguindo `README.md`. Critério: `pnpm dev` sobe sem erro.
- [ ] Cria conta seed (`desenvolvimento@agenciakharis.com.br / ktask123`) e navega: cria quadro, lista, card, comenta, sobe anexo.
- [ ] Lê [tarefas-md/00-visao-geral.md](../tarefas-md/00-visao-geral.md) (10min) — contexto de produto.
- [ ] Lê [README.md](../README.md) raiz.
- [ ] Pareia com Nicchon (ou outro sênior) numa session de 30min — pergunta livre.
- [ ] Faz primeiro PR: pode ser correção de typo, melhoria de copy, atualização de uma doc. Foco em rodar o ciclo todo: branch → commit → push → PR → CI verde → merge.

**Não precisa entender ainda**: automações, modelo de dados profundo, deploy.

## Primeiros 30 dias — Operação

Objetivo: contribuir em features pequenas confortavelmente.

### Domínio de produto

- [ ] Lê [tarefas-md/01-requisitos-funcionais.md](../tarefas-md/01-requisitos-funcionais.md) — não pra decorar, pra ter mapa mental.
- [ ] Lê [tarefas-md/04-fluxos-principais.md](../tarefas-md/04-fluxos-principais.md) — jornadas do usuário.
- [ ] Atravessa o sistema usando o app: cria um post de redes sociais → cria sub-cards (design, copy) → marca como prontos → solicita aprovação → cliente aprova (use link de teste).

### Domínio técnico — fundação

- [ ] Lê [tarefas-md/05-stack-e-arquitetura.md](../tarefas-md/05-stack-e-arquitetura.md).
- [ ] Lê [apps/api/prisma/schema.prisma](../apps/api/prisma/schema.prisma) — primeiro com `docs/data-model/README.md` aberto.
- [ ] Mapeia os 5-7 modelos centrais: Organization, User, Membership, Board, List, Card, CardPresence.
- [ ] Estuda 1 controller + 1 service + 1 module simples (sugestão: `attachments` ou `labels`). Critério: explicar fluxo de uma rota ao Nicchon em 5min.

### Domínio técnico — frontal

- [ ] Estuda uma página simples (sugestão: `/contatos`). Critério: explicar como ela carrega dados, como faz mutation, como invalida cache.
- [ ] Aprende padrões: TanStack Query keys, useMutation, ApiError handling.

### Contribuição

- [ ] Pega 1 issue de tamanho P (pequena). Implementa. Faz PR. Code review com sênior. Merge.

### Avaliação aos 30 dias

Com Nicchon, conversa:

- O que ficou claro?
- O que ainda não bateu?
- Quais áreas pegar nas próximas 4 semanas?

## Dias 31-60 — Profundidade

Objetivo: contribuir em features médias + entender áreas cross-cutting.

### Sistemas críticos

- [ ] Auth: lê `apps/api/src/modules/auth/`. Entende fluxo JWT access + refresh, RBAC.
- [ ] Real-time: lê `apps/api/src/modules/realtime/` + uma página que usa Socket.IO. Entende como mutations no api propagam pra UI.
- [ ] Permissões por board: `BoardAccessService` e `cardVisibilityWhere`. Entende a hierarquia OWNER → ADMIN → GESTOR → EDITOR → MEMBER → REVIEWER.

### Multi-fluxo

- [ ] Lê [tarefas-md/13-cards-multi-fluxo.md](../tarefas-md/13-cards-multi-fluxo.md) + ADR-0003 (se existir).
- [ ] Crítico: entender que `Card.boardId` é legacy e que `CardPresence` é fonte de verdade. Por quê isso evita refactor catastrófico se um dia precisarmos do "mesmo card em vários quadros".
- [ ] Exercício: dado um card, lista todos os boards onde ele aparece via `CardPresence`.

### Contribuição

- [ ] Pega 1 issue M (média). Implementa. Merge.
- [ ] OU: refatora um pedaço técnico identificado pelo time. Ex: extrair helper, melhorar tipo, adicionar testes.

### Deploy

- [ ] Lê [tarefas-md/10-deploy-producao.md](../tarefas-md/10-deploy-producao.md) + `.github/workflows/deploy.yml`.
- [ ] Acompanha um deploy real do início ao fim (com Nicchon ao lado).
- [ ] Aprende a rodar comandos básicos via SSH na VM (read-only — ainda sem mexer).

## Dias 61-90 — Autonomia

Objetivo: tocar feature grande de ponta a ponta. Plantão.

### Áreas avançadas

- [ ] Engine de automações: lê [tarefas-md/09-engine-automacoes.md](../tarefas-md/09-engine-automacoes.md) + `apps/api/src/modules/automations/`.
- [ ] BullMQ workers: como filas processam, como adicionar uma nova fila/processor.
- [ ] Aprovações cliente: token público, fluxo REVIEWER, branching automático.

### Contribuição

- [ ] Pega 1 feature G (grande, cross-module). Faz planning numa doc em `tarefas-md/`. Implementa. Merge.
- [ ] OU: lidera resolução de 1 incidente real (com runbook em mãos).

### Operação

- [ ] Acessa VM de produção em modo read (`docker ps`, `docker logs`).
- [ ] Roda um restore de backup em ambiente isolado pra entender o procedimento.
- [ ] Lê todos os runbooks em `docs/runbooks/`.

### Avaliação aos 90 dias

Com Nicchon, conversa:

- Pode tocar features G sozinho? Quais áreas ainda dependem de sênior?
- Está confortável de plantão (sem pânico)?
- Quais lacunas pra próximos 90 dias?

## Convenções importantes (consultar sempre)

- Sem emojis em código/UI/logs.
- Português br nas mensagens de UI e commits.
- Commits no padrão `type(scope): mensagem` (ex: `feat(card): adiciona campo X`).
- PRs descritivos, com print/gif se for UI.
- Testes pra features novas (mesmo que cobertura geral ainda seja baixa).
- ...

## Pessoas-chave

| Papel                   | Pessoa  | Quando procurar                                                       |
| ----------------------- | ------- | --------------------------------------------------------------------- |
| Tech lead / arquitetura | Nicchon | Decisões de design, autorização de deploy/SSH, mudanças cross-cutting |
| ...                     | ...     | ...                                                                   |

## Recursos

- Planejamento: [tarefas-md/](../tarefas-md/) (50 docs)
- Docs técnicas: [docs/](../docs/)
- Briefings pra gerar docs: [briefings/](../briefings/)
- Schema do banco: [apps/api/prisma/schema.prisma](../apps/api/prisma/schema.prisma)
- Repo no GitHub: ...

## Não há checklist perfeito

Esse documento é um guia, não contrato. Se você chega já com expertise em parte da stack, pule. Se sente que precisa mais tempo em alguma área, gasta. Conversa frequentemente com o sênior pra calibrar.
```

---

## Fase 2 — Auto-auditoria

1. **Tarefas concretas?**: nenhuma é "familiarize-se com X". Toda termina com critério verificável.
2. **Progressão realista?**: dev novo não vira dono de "engine de automações" em 30 dias. Está marcado como fase 2-3.
3. **Aponta pra docs reais?**: cada link existe no repo (verifica).
4. **Entrega**:

```
## Resumo da entrega

- Arquivo: docs/onboarding.md
- Linhas: ~XXX
- Tarefas concretas: ~XX
- Inferências (ex: lista de pessoas-chave): [lista]
- Sugestões de follow-up: [ex: "criar lista de boas primeiras issues"]
```

---

## Notas gerais

- Sem emojis.
- Datas em ISO.
- Tom: amigável mas direto. Não condescendente.
- Em dúvida sobre tom ou escopo, pergunte.
