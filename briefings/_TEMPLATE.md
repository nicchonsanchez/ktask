# Briefing — {{TÍTULO DO DOC}}

> **Como usar:** cole este briefing inteiro num chat novo de Claude (sem histórico do KTask) com acesso a este repositório. O Claude vai começar pela Fase 0 (Inventário) e pedir tua aprovação antes de produzir o entregável final.

---

## Contexto rápido do projeto

Você está dentro do repositório do **KTask** — sistema interno de gestão de tarefas da agência **Kharis**, inspirado em Ummense (funcional) e Trello (UX). Stack:

- **Monorepo** pnpm + Turborepo: `apps/api` (NestJS 11) + `apps/web` (Next.js 15)
- **Banco**: Postgres 16 via Prisma 6
- **Real-time**: Socket.IO + Redis adapter
- **Jobs**: BullMQ
- **Multi-tenant** desde início (`organizationId` em tudo)
- **Produção**: Hetzner VM (`178.104.220.28`), domínio `ktask.agenciakharis.com.br`, Caddy + Docker, CI/CD via GitHub Actions
- **Fase atual**: uso interno (não-SaaS ainda)

Documentação de produto vive em [tarefas-md/](../tarefas-md/) — 50 docs, um por feature (00–10 são fundamentos, 11+ são features).

---

## Objetivo desta sessão

{{OBJETIVO_CLARO_EM_1_FRASE}}

**Audiência**: {{quem vai LER esse doc — define tom, profundidade, jargão}}

**Entregável**:

- Arquivo: `{{path/exato/do/arquivo.md}}`
- Formato: {{markdown, mermaid, etc}}
- Tamanho aproximado: {{X páginas ou Y linhas — pra calibrar verbosidade}}

**Restrições**:

- {{lista de coisas a NÃO fazer — emojis, marketing-speak, etc}}
- Sem emojis (regra do KTask)
- Português br padrão técnico, sem coloquialismos

---

## Fase 0 — Inventário forçado (FAÇA ISSO PRIMEIRO)

**Antes de escrever qualquer linha do entregável**, você vai mapear o que existe no repo relacionado a este doc. Os pontos de partida obrigatórios:

### Leituras obrigatórias

Leia (não delegue, leia você mesmo) os seguintes arquivos como contexto base:

1. [tarefas-md/README.md](../tarefas-md/README.md) — índice de todas as features documentadas
2. [tarefas-md/00-visao-geral.md](../tarefas-md/00-visao-geral.md)
3. [tarefas-md/05-stack-e-arquitetura.md](../tarefas-md/05-stack-e-arquitetura.md)
4. [apps/api/prisma/schema.prisma](../apps/api/prisma/schema.prisma) — fonte de verdade do modelo de dados
5. {{outros arquivos específicos pra ESTE briefing}}

### Exploração estruturada

Use `Glob` + `Grep` (ou `Agent(subagent_type=Explore)` se a área for ampla) pra mapear:

- {{área 1 — ex: "todos os módulos do api em apps/api/src/modules/"}}
- {{área 2 — ex: "todas as rotas em apps/web/src/app/(app)/"}}
- {{área 3 — ex: "todos os ActivityType enum em schema.prisma"}}

### Saída da Fase 0

**Apresente ao usuário uma lista enumerada** com TUDO que você encontrou relevante pro doc. Formato:

```
## Inventário (Fase 0)

### Features identificadas
1. [feature X] — encontrado em [path]
2. [feature Y] — encontrado em [path]
...

### Decisões arquiteturais identificadas
1. [decisão A] — encontrado em [path]
...

### Lacunas que vou cobrir no doc
- ...

### Coisas que vou DEIXAR DE FORA (e por quê)
- ...

**Aguardo aprovação ou correção antes de produzir o doc final.**
```

NÃO escreva o documento final ainda. Aguarde o usuário responder com "ok, prossegue" ou correções tipo "faltou X" ou "Y não é relevante".

---

## Fase 1 — Produção do entregável

Após aprovação da Fase 0, produza o entregável. Princípios:

- **Não invente**: se algo não tá no repo nem foi confirmado pelo user, não escreva.
- **Cite fontes**: links pra paths/linhas onde for relevante (formato `[arquivo.ts:42](path/arquivo.ts#L42)`).
- **Conciso**: prefira tabela e bullet a parágrafo longo. Dev lê em scan, não em prosa.
- **Honestidade sobre estado**: se algo está parcialmente implementado, diga. Não pinte mais bonito.

Estrutura sugerida do entregável:

{{ESTRUTURA_DETALHADA_DESTA_DOC — seções, ordem, conteúdo de cada}}

---

## Fase 2 — Auto-auditoria (FAÇA ISSO ANTES DE ENCERRAR)

Antes de declarar pronto, faça uma checagem honesta:

1. **Cobertura**: percorra o inventário aprovado da Fase 0 — cada item está representado no doc (ou explicitamente fora do escopo)? Se algo do inventário sumiu sem justificativa, volte e corrija.

2. **Verificação de fatos**: pra cada afirmação técnica importante no doc, verifique se há respaldo no código/schema/docs existentes. Marca onde foi inferência sem 100% de confirmação.

3. **Honestidade do estado**:
   - Listou TODOS os pontos onde o doc afirma algo que não confirmou com leitura direta?
   - Listou as limitações conhecidas do doc?

4. **Entrega**: ao final, na mensagem pro user, inclua uma seção curta:

```
## Resumo da entrega

- Arquivo gerado: [path]
- Itens do inventário cobertos: X/Y (Y - X listados abaixo se houver)
- Inferências sem confirmação direta: [lista, ou "nenhuma"]
- Limitações conhecidas do doc: [lista, ou "nenhuma"]
```

---

## Notas gerais

- Sem emojis no arquivo final (regra do KTask).
- Sem floreio comercial ("nosso incrível sistema..."). Tom técnico, direto.
- Datas: use ISO `YYYY-MM-DD`.
- Identificadores de código: nomes reais (`Contact.userId`, não "campo de vínculo").
- Se em dúvida sobre escopo durante Fase 1, pare e pergunte ao user — não chuta.
