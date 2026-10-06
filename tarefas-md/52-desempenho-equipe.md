# Doc 52 — Desempenho da Equipe e Relatórios de Atividade

> **Status:** PLANO — nada implementado ainda. Decisões do Nicchon de
> 06/10/2026 já incorporadas (D6, D8, D9, D10) e perguntas ao Lucas
> respondidas (seção 13.2). Pronto pra iniciar a Fase 1.
>
> **Origem:** pedido do Lucas (áudio WhatsApp de 06/10/2026) +
> "KTask — Especificação Funcional — Desempenho da Equipe e Relatórios de
> Atividade", versão 1.1, 22/09/2026 (PDF enviado junto).
>
> **Docs relacionados:** [40-monitoramento-equipe.md](40-monitoramento-equipe.md)
> ("Ver como"), [41-dashboard-cards.md](41-dashboard-cards.md) (Indicadores
> de Cards), [visao-gerencial-kanban.md](visao-gerencial-kanban.md),
> [13-cards-multi-fluxo.md](13-cards-multi-fluxo.md) (`CardPresence`),
> [09-engine-automacoes.md](09-engine-automacoes.md).

---

## 1. O que o Lucas pediu (leitura do áudio + spec)

### 1.1 Contexto do pedido

- Lucas acompanha o **Fábio no Comercial**. O **Giovanni** pede relatórios
  de andamento: volume de contatos, quais movimentações aconteceram, como
  está o andamento frente à **meta combinada**.
- Hoje, pra montar isso, Lucas tem três caminhos — todos ruins:
  1. **Notificações** (não são relatório, somem, não agregam);
  2. **Abrir card por card** (lento, sem consolidação);
  3. **"Simular a conta" do colaborador** (modo "Ver como", doc 40) — e ao
     navegar o sistema "volta pra sessão dele" (diagnóstico na seção 11).
- Quer usar o mesmo relatório pro **time de Atendimento** (Fernanda, Leila,
  Tiago) — "fluxo de movimentações durante o dia", trabalho de proposta.
- O ajuste do "simular conta" ele vai abrir como card separado, **num
  segundo momento** — não é bloqueio desta entrega.

### 1.2 A pergunta que o sistema precisa responder

> "O que cada colaborador ou equipe fez no período?" — de forma objetiva e
> **auditável** (todo número abre os registros que o compõem).

O que **já é respondido** hoje (spec §1/§16, confirmado no código):
"como estão os cards agora" (Visão Gerencial) e "como está o fluxo"
(Indicadores de Cards: lead time, throughput, WIP, atrasados, reabertos,
entrada × saída, saúde por coluna, cards parados). **Nada disso é refeito.**

O que **falta** (spec §16): cards trabalhados por pessoa, histórico de
movimentações por pessoa, avanço/retrocesso, atividade comercial, evolução
diária individual, relatório individual por período.

### 1.3 Requisitos-chave da spec que mais pesam na arquitetura

| #   | Requisito                                                                                            | Seção spec     |
| --- | ---------------------------------------------------------------------------------------------------- | -------------- |
| R1  | Não inferir progresso por nome/posição de coluna — configuração gerencial **por quadro**             | §3, §5         |
| R2  | Configuração não altera o board operacional (nomes, colunas, cards)                                  | §5             |
| R3  | Regra automática por "ordem de progresso" + **exceções por transição**                               | §5.3           |
| R4  | Quadro não configurado continua aparecendo, só com métricas factuais + aviso                         | §5.8           |
| R5  | Histórico estruturado, permanente, nunca sobrescrito                                                 | §6             |
| R6  | Diferenciar ação manual × automação × sistema; **não atribuir ao colaborador o que a automação fez** | §5.4, §18      |
| R7  | Mudança de configuração **não reclassifica o histórico silenciosamente**                             | §18            |
| R8  | Todo KPI com drill-down até os eventos/cards de origem                                               | §5.6, §11, §18 |
| R9  | Registro de atividade comercial **sem mover o card**                                                 | §9, §19.8      |
| R10 | Acompanhamento, **não ranking automático**                                                           | §11            |

---

## 2. Validação técnica (spec §21) — o que o KTask já armazena

A spec pede, antes de estimar, verificar se o KTask já guarda de forma
consultável: usuário, card, quadro, coluna anterior, coluna nova, timestamp
e origem manual/automática. **Resultado da auditoria do código (06/10/2026):**

### 2.1 Tabela `Activity` (audit log) — já existe e é a fundação

`apps/api/prisma/schema.prisma` → `model Activity`:
`id, organizationId, boardId?, cardId?, actorId?, type (ActivityType),
payload (Json), automationRunId?, createdAt` + índices
`(organizationId, createdAt)`, `(cardId, createdAt)`, `(boardId, createdAt)`.

| Dado exigido (spec §6)           | Existe?                     | Onde / observação                                                                                                                           |
| -------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| event_id                         | Sim                         | `Activity.id`                                                                                                                               |
| card_id                          | Sim                         | `Activity.cardId`                                                                                                                           |
| board_id                         | Sim                         | `Activity.boardId` — no move multi-fluxo é o **fluxo onde o move ocorreu** (correto)                                                        |
| user_id                          | Sim, **com ressalva grave** | `Activity.actorId` — ver 2.3 (automação grava como o criador da automação)                                                                  |
| timestamp                        | Sim                         | `Activity.createdAt`                                                                                                                        |
| event_type                       | Sim                         | `ActivityType` (60+ valores)                                                                                                                |
| from_status / to_status (coluna) | Sim, em JSON                | `payload.fromListId` / `payload.toListId` (+ nomes no move manual)                                                                          |
| movement_class                   | **Não**                     | precisa ser criado (configuração + classificador)                                                                                           |
| origin                           | **Parcial**                 | só via `payload.via = 'automation'` / `payload.automationId` / `actorId = null`; coluna `automationRunId` existe mas **nunca é preenchida** |

**Conclusão:** a base existe → a primeira entrega concentra-se em
**classificação, agregação e interface**, MAS há um pré-requisito de backend
pequeno e obrigatório: **origem confiável dos eventos** (seção 2.3) e
**cobertura completa dos caminhos de movimentação** (seção 2.2).

### 2.2 Mapa de TODOS os caminhos que mudam um card de coluna

| Caminho                                                                                    | Arquivo                                                | Grava `CARD_MOVED`?                                                                 | actorId                      | Origem identificável? |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------- | ---------------------------- | --------------------- |
| Drag-and-drop no Kanban (`PATCH /cards/:id/flows/:boardId/move`) — **é o que o front usa** | `cards.service.ts` `moveInFlow` (~L2010-2195)          | Sim, com `fromListId/toListId/fromListName/toListName/inFlow`                       | usuário                      | Sim (manual)          |
| Move "legado" (`PATCH /cards/:id/move`) — sem uso no web hoje                              | `cards.service.ts` `move` (~L585-693)                  | Sim, com nomes + `boardName`                                                        | usuário                      | Sim (manual)          |
| Aba "Fluxos" do card (`moveCardInFlow`)                                                    | mesmo `moveInFlow`                                     | Sim                                                                                 | usuário                      | Sim                   |
| Automação `MOVE_CARD`                                                                      | `automations.engine.ts` `handleMoveCard` (~L1521-1645) | Sim, **sem nomes** de coluna; `via: 'automation'`                                   | **criador da automação**     | Só via payload        |
| Decisão de aprovação (aprovar/reprovar move o card)                                        | `approvals.service.ts` `applyDecision` (~L701-860)     | **NÃO** — só `CARD_UPDATED` com `kind: 'approval.approved'` e `sideEffects.moves[]` | decisor (ou null se externo) | Só via payload        |
| Desfazer aprovação (revert)                                                                | `approvals.service.ts` (~L1040-1130)                   | **NÃO** — `CARD_UPDATED kind 'approval.reverted'`                                   | quem desfez                  | Só via payload        |
| "Desconcluir" card (`uncomplete`)                                                          | `cards.service.ts` (~L1582-1650)                       | Não — `CARD_UNCOMPLETED` com `toListId` (sem `fromListId`)                          | usuário                      | Sim                   |
| Vincular card a outro fluxo                                                                | `cards.service.ts` (~L1960-2000)                       | `CARD_CREATED` (reuso) com `linkedFromBoardId`                                      | usuário                      | Sim                   |
| Importador Ummense                                                                         | `importer.service.ts`                                  | `CARD_CREATED` com `via: 'ummense-import*'`                                         | quem importou                | Só via payload        |

**Lacunas a fechar na Fase 1:** aprovações (decisão + revert) não geram
`CARD_MOVED`; automação não grava nome das colunas (não é bloqueante — o
relatório resolve nome pelo `listId`).

### 2.3 Achado crítico — atribuição de ações de automação

Todas as Activities criadas pela engine (`automations.engine.ts` linhas
~829, 1109, 1161, 1267, 1477, 1609, 1723) gravam
**`actorId: automation.createdById`** — ou seja, se o Nicchon criou a
automação "ao entrar em Reunião Agendada, mover para Negociação", **todo
movimento automático aparece como se o Nicchon tivesse feito**.

Consequências:

- Sem correção, o relatório atribuiria ao criador das automações dezenas
  de movimentações que ele não fez (viola R6 diretamente).
- `Activity.automationRunId` existe no schema, mas **nenhum código preenche**
  (`grep automationRunId` → só leitura em `approvals.service.ts:1024`).
- **Efeito colateral já existente hoje:** a checagem de "interferência
  humana" do undo de aprovação (`approvals.service.ts` ~L1019-1037) filtra
  `automationRunId: null` acreditando excluir automações — mas como o campo
  nunca é preenchido, **movimentos feitos por automação bloqueiam o undo**,
  contrariando o comentário do próprio código ("ações de automação não
  bloqueiam"). Ao corrigir o preenchimento, esse comportamento muda (para
  o pretendido). Ver risco RK3.

**Boa notícia:** todas essas Activities de automação têm `payload.via`
começando com `'automation'` **ou** `payload.automationId` (inclusive
`SET_CARD_STATUS`, que não tem `via`). E a sincronização automática de
status (`card-status-sync.ts`) grava `actorId: null` +
`kind: 'card.status.autoSync'`. Logo, **o histórico já existente pode ser
reclassificado por backfill determinístico** (sem heurística de horário).

Também notado (não muda nada nesta tarefa, só documentado):

- Comentários criados por automação (`POST_COMMENT`) gravam
  `Comment.authorId = criador da automação` e **não** geram Activity
  `COMMENT_ADDED`. → O relatório conta ações a partir do `Activity`, não da
  tabela `Comment`, então esses comentários não inflam ninguém.
- `SET_CARD_STATUS → COMPLETED` via automação grava
  `Card.completedById = criador da automação`. → O relatório não usa
  `completedById` para atribuição; usa Activity + origem.

### 2.4 Como cada "evento considerado" (spec §7) aparece hoje

| Evento (spec §7)            | Activity hoje                                                                                                                                                                  | Observação                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Criação de card             | `CARD_CREATED`                                                                                                                                                                 | também reusado pra "vinculou a outro fluxo" (`payload.linkedFromBoardId`) e importação (`payload.via`) — o relatório precisa distinguir |
| Movimentação                | `CARD_MOVED`                                                                                                                                                                   | ver 2.2                                                                                                                                 |
| Conclusão/finalização       | `CARD_COMPLETED` (endpoint complete, automação, auto-sync) **e** `CARD_UPDATED kind='status_changed' to='COMPLETED'` (badge de status no modal — é o caminho mais comum na UI) | duas representações → normalizar na leitura                                                                                             |
| Reabertura                  | `CARD_UNCOMPLETED` **e** `CARD_UPDATED kind='status_changed' from='COMPLETED'` **e** auto-sync `presenceReopenedFromFinal`                                                     | Indicadores de Cards hoje conta só `CARD_UNCOMPLETED` (subconta) — não mexer lá nesta tarefa, registrar                                 |
| Comentário                  | `COMMENT_ADDED`                                                                                                                                                                | ok                                                                                                                                      |
| Alteração de responsável    | `CARD_LEAD_CHANGED`, `CARD_ASSIGNED`, `CARD_UNASSIGNED`                                                                                                                        | ok                                                                                                                                      |
| Criação/conclusão de tarefa | `CHECKLIST_ITEM_CREATED`, `CHECKLIST_ITEM_DONE/UNDONE`                                                                                                                         | `Task` avulsa (sem card) não gera Activity — fora do escopo (não é "card trabalhado")                                                   |
| Aprovação/reprovação        | `CARD_UPDATED kind='approval.*'`                                                                                                                                               | ok                                                                                                                                      |
| Atividade comercial         | **não existe**                                                                                                                                                                 | criar (Fase 3)                                                                                                                          |

### 2.5 Outros pontos do sistema atual relevantes pro plano

- **Permissão:** OWNER/ADMIN/GESTOR têm bypass em todos os boards por design
  (`board-permissions.ts`, `ORG_ROLES_WITH_BOARD_BYPASS`). O doc 40 já assume
  "gestor enxerga tudo da org". → O novo relatório segue o mesmo modelo.
- **Aba Indicadores** hoje é visível a todos exceto GUEST
  (`admin.service.ts cardsStats`). A nova aba precisa de gate próprio.
- **Fuso:** os gráficos diários atuais usam `DATE_TRUNC('day', ...)` em UTC
  (um evento às 22h BRT cai no dia seguinte). O novo relatório agrupa por
  dia no fuso da org (`Organization.timezone`, default `America/Sao_Paulo`).
- **Coalescing:** `CARD_UPDATED` de edição de campos é **mesclado** numa
  janela de 60s (`upsertRecentActivity`). Não afeta movimentações (essas
  nunca são mescladas). Para "Ações", 5 edições seguidas do mesmo campo em
  1 min contam como 1 ação — comportamento desejável (evita inflar). Documentar
  na Central de Ajuda.
- **Gráficos** do app são SVG artesanal (`indicadores/cards/page.tsx`
  `Sparkline`, `FlowInOutChart`) — sem lib de chart. Manter o padrão (sem
  dependência nova).
- **Não existe conceito de "Área/Equipe"** (Comercial/Atendimento/Dev) no
  schema. `ADD_TEAM` é só "adicionar membros ao card". → Área entra como
  atributo da configuração gerencial do quadro (seção 4).
- **Cliente** = `Contact` tipo `COMPANY` via `CardContact` (já usado em
  "Por Empresa", doc 38). Reutilizar.
- Link pra card: rota `/c/[code]` (shortCode) já existe — usar no drill-down.

### 2.6 Dados reais de produção (consulta read-only, 06/10/2026)

Consultas feitas com o usuário `deploy`, dentro de `BEGIN TRANSACTION READ
ONLY ... ROLLBACK` (nenhuma escrita). Scripts em scratchpad da sessão.

**Volume**

- `Activity`: 66.032 linhas, 40 MB, primeira em 24/04/2026. Índice novo e
  backfill são baratos (não precisa `CREATE INDEX CONCURRENTLY`).
- `CARD_MOVED`: 3.112 desde 11/05/2026 (~650/mês). Histórico de ~5 meses
  disponível pra aplicar a classificação retroativamente.
- `automationRunId` preenchido: **0** (confirma 2.3).

**Peso da automação (confirma o achado crítico 2.3)**

- **1.553 dos 3.112 `CARD_MOVED` (≈50%) são de automação**, + 1.502
  `CARD_UPDATED` e 463 `CARD_COMPLETED`. Todos identificáveis pelo payload →
  backfill determinístico viável.
- Automações ativas foram criadas principalmente por **Claude Bot** e
  **Fernanda Biazatti** → hoje esses movimentos aparecem no nome deles.
- **Fernanda, desde agosto: 344 movimentos de automação × 297 manuais.**
  Sem a Fase 1, o relatório dela mais que dobraria — distorção concreta
  no time de Atendimento que o Lucas quer acompanhar.
- Backfill SYSTEM: 675 (`card.status.autoSync`). IMPORT: 4.478
  (`ummense-import` 231 + `ummense-import-v2` 4.247).

**Pessoas e papéis**

- OWNER: Nicchon, Dhyovaine · ADMIN: **Lucas Santiago**, **Fernanda
  Biazatti**, Claude Bot · GESTOR: **FABIO MACHADO**, **Leila Oliveira**,
  **Thiago Bueno**, Taiane Barboza, Ramiro Monte · demais MEMBER.
- **Giovanni não tem conta no KTask** → recebe os relatórios pelo Lucas.
- Atenção (impacta D6): todos os acompanhados (Fábio, Leila, Thiago,
  Fernanda) são GESTOR+ → com o gate "GESTOR+" eles também veriam o
  relatório de toda a equipe. Resolvido em D6: acesso só Dono/Admin.

**Quadro comercial real — "Relações Institucionais Kharis"**

- Colunas atuais (ordem do board): Backlog · FOLLOW UP · LIGANDO ·
  INTERATIVIDADE · **Concluído** (`isFinalList`, vazia, no meio do fluxo) ·
  REUNIÃO AGENDADA · NEGOCIAÇÃO · **FINALIZADO /GABRIELA E FERNADA** (não é
  `isFinalList`) · MARKETING · ADMINISTRATIVO. "Novo Lead" está **arquivada**.
  → Prova prática do R1: inferir conclusão por `isFinalList` ou por posição
  daria resultado errado neste quadro.
- Desde julho: 160 movimentos, **158 do Fábio**, 0 por automação.
  Ações manuais: Fábio 508 em 136 cards; Lucas 209 em 75; Dhyovaine 130.
- Transições mais comuns: Novo Lead → LIGANDO (61), Novo Lead →
  INTERATIVIDADE (11), REUNIÃO AGENDADA → NEGOCIAÇÃO (11)…; também há
  movimentos de colunas antigas (A Fazer → Fazendo).
- **105 movimentos têm origem em colunas que hoje estão arquivadas/
  renomeadas** → a tela de configuração precisa listar também as colunas
  arquivadas que aparecem no histórico (ver 7.1).
- **O Fábio registra os contatos como comentário marcando o Lucas**:
  221 comentários desde julho, ex. "@lucas.santiago Liguei e não atendeu",
  "enviei email", "enviei para o Ricardo a proposta", "Reunião realizada".
  É exatamente a "atividade comercial" da spec §9, hoje em texto livre —
  e explica por que o Lucas acompanha "pelas notificações".
- Só 2 cards do quadro têm contato do CRM vinculado → filtro "Cliente"
  terá pouco uso no Comercial por enquanto.
- Outros quadros comerciais: "Comercial AGÊNCIA Kharis" (659 cards, 0
  movimentos desde julho) e "Executivo de contas - Fábio Machado"
  (10 cards, 0 movimentos) — parecem inativos (confirmar, P1).

**Atendimento (Fernanda, Leila, Thiago)** — onde agem desde agosto
(ações manuais): Fernanda — Redes Sociais 2.286, ANEC 515, Packs de Posts
164, Atendimento 78; Thiago — Redes Sociais 364, ANEC 244; Leila — Redes
Sociais 110, ANEC 32. O quadro "Atendimento" quase não tem movimento (4
desde julho). → O relatório do Atendimento vai olhar sobretudo Redes
Sociais e ANEC (confirmar, P1).

### 2.7 Relação com a página Indicadores (não é substituição)

A nova funcionalidade é **uma aba a mais** dentro de Indicadores. Não
substitui, não altera e não recalcula nenhuma das 4 abas atuais.

| Aba                             | Pergunta que responde                                                    | Fonte de dados                                            |
| ------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| Timesheet da organização        | Quanto tempo foi apontado?                                               | `TimeEntry`                                               |
| Indicadores de cards            | Como está o fluxo de cards (lead time, WIP, atrasados, entrada × saída)? | `Card` (+ `Activity` só pra contar "Reabertos")           |
| Indicadores de tarefas          | Como estão as tarefas de checklist?                                      | `ChecklistItem`                                           |
| Por empresa                     | Quanto trabalho/horas por cliente?                                       | `Card`, `CardContact`, `TimeEntry`                        |
| **Desempenho da equipe (nova)** | **O que cada pessoa fez no período?**                                    | `Activity` (eventos) + config + `CardInteraction` + metas |

Pontos de contato verificados no código (06/10/2026):

- Backend novo vive no módulo `performance`; `admin.service.ts` (que serve
  as 4 abas) **não é tocado**.
- Única leitura de `Activity` nas abas atuais: contagem de `CARD_UNCOMPLETED`
  em "Reabertos" (`admin.service.ts` ~L321-340). A Fase 1 só adiciona a
  coluna `origin` e cria `CARD_MOVED` em aprovações — nenhuma das duas muda
  essa contagem.
- Os novos `CARD_MOVED` de aprovação aparecem em outros leitores de
  `Activity` fora de Indicadores, com efeito mínimo e correto: timeline do
  card ("moveu de X para Y"), "atividade recente" e "última atividade" do
  decisor, e o horário de "última movimentação" do quadro em /quadros (mesmo
  instante da Activity de aprovação que já existe).
- Frontend: só o `indicadores/layout.tsx` muda (1 aba condicional +
  rolagem horizontal no celular). As abas atuais continuam visíveis pra
  quem já as vê; a nova só pra Dono/Admin.
- Os números podem **diferir de propósito** entre abas, porque medem
  coisas diferentes: "Finalizados" em Indicadores de cards = cards com
  `completedAt` no período (qualquer origem, inclusive automação);
  "Finalizações" no Desempenho = conclusões feitas por pessoas, segundo a
  coluna de finalizado escolhida pelo Lucas. A Central de Ajuda explica.
- Divergências já existentes nas abas atuais (dia em UTC, reabertura
  subcontada) ficam registradas mas **não são corrigidas aqui**.

---

## 3. Escopo

### Entra (este plano, em fases — seção 8)

1. **Fundação de eventos:** origem confiável (`USER / AUTOMATION / SYSTEM /
APPROVAL / IMPORT`) em toda Activity nova + backfill do histórico +
   preenchimento de `automationRunId` + `CARD_MOVED` nos moves de aprovação.
2. **Configuração dos relatórios em tela central** (D8): por fluxo, coluna(s)
   de finalizado (positiva/negativa) no nível básico; ordem do funil,
   transferências e exceções no nível avançado; área; liga/desliga do
   registro de contato. Versionada.
3. **Classificador** de movimentações (função pura, testada).
4. **Aba "Desempenho da Equipe"** em Indicadores (só Dono/Admin — D6):
   filtros, KPIs, resumo por colaborador, drill-down, visão individual
   cronológica, evolução diária, visão semanal por dia.
5. **Registro de contato** integrado à caixa de comentário, só nos fluxos
   onde for ligado (D9) + KPIs do Comercial.
6. **Metas configuráveis** pelo próprio Lucas (D10), sobre métricas de
   resultado, depois que o registro de contato estiver em uso.
7. Reuso do mesmo motor para **Atendimento e Desenvolvimento** (só
   configuração + recortes de indicador; sem sistema paralelo).
8. Documentação: este doc, ADR, data-model, Central de Ajuda.

### Fica fora (registrado, não esquecido)

- Exportação CSV/Excel/PDF e relatórios automáticos (spec §17/§20 fase 5).
- Taxas de conversão e campos financeiros (spec §14: "somente quando houver
  definição clara do denominador").
- Ranking automático (spec §11 — explicitamente não é objetivo).
- Corrigir o "Ver como" que perde o contexto ao navegar (Lucas abrirá card;
  diagnóstico já feito na seção 11).
- Mudar os KPIs existentes de Indicadores de Cards (reabertura subcontada,
  dia em UTC) — anotado como melhoria separada, **não tocar** aqui.
- Atribuir a automação ao usuário que a disparou (ex.: Lucas move pra X,
  automação move pra Y) — V2; V1 mostra como "Automação".

---

## 4. Decisões de arquitetura (com recomendação)

### D1 — Onde ficam os fatos: estender `Activity` (recomendado) × tabela nova

**Recomendação: estender `Activity`** com 1 coluna factual (`origin`) e
passar a preencher `automationRunId`. Os demais fatos de movimentação
(`fromListId`/`toListId`) já existem no payload de todo `CARD_MOVED` com o
mesmo shape.

- Prós: zero duplicação; timeline do card, "atividade recente" e o novo
  relatório leem a mesma fonte; migração 100% aditiva.
- Contras: from/to ficam em JSON (consulta via `payload->>'fromListId'`).
  Volume interno (dezenas de usuários) torna isso irrelevante; se crescer,
  adicionar colunas geradas/índice de expressão depois.
- Alternativa descartada: tabela `WorkEvent` paralela gravada junto da
  Activity → dobra os pontos de escrita (mais risco de divergência) sem
  ganho real neste volume.

### D2 — Classificação: na leitura, com configuração versionada (recomendado)

Duas opções para cumprir R7 ("não reclassificar silenciosamente"):

- (a) **Snapshot na escrita**: gravar `movementClass` em cada Activity no
  momento do move. Exige chamar o classificador em todos os caminhos de
  move (5+), e um quadro configurado depois teria o passado "não classificado"
  para sempre (ou precisaria de UPDATE em massa no audit log).
- (b) **Fatos imutáveis + interpretação versionada** ✅: a Activity guarda só
  fatos (quem, onde, de→para, origem). A configuração do quadro é salva em
  **versões com `effectiveFrom`**. Cada evento é classificado pela versão
  vigente **na data do evento**.

**Recomendação: (b).** Atende R5 (fatos nunca reescritos), R7 (editar a
config cria versão nova válida "a partir de agora"; o passado mantém a
classificação antiga) e dá a "regra definida" que a spec pede: o admin pode
**explicitamente** escolher "aplicar esta configuração desde dd/mm"
(registrado na versão, com autor). Na primeira configuração de um quadro, a
UI oferece "aplicar também ao histórico a partir de [data]" — é o que faz o
relatório já nascer útil com os meses de histórico que existem.

Custo: classificar em memória no service (TS) os eventos do período. Para
90 dias × equipe interna, são milhares de linhas — trivial. Se um dia pesar,
materializar numa tabela de cache recalculável (sem mudar contrato da API).

### D3 — Categorias, áreas e tipos comerciais como `String` validada (não enum Prisma)

A spec pede que a lista de categorias "permita evolução futura". Precedente
no repo: `OrgImportMapping.kind` e `WhatsappOutbox.eventType` são `String`
validadas em TS justamente "pra permitir extensão sem migration de enum".
→ Categorias/áreas/tipos/resultados ficam como `String`, validados por Zod em
`packages/contracts` (fonte única para API e web).

Exceção: `ActivityOrigin` vira **enum Prisma** — é conjunto fechado e
estável, e enum dá segurança de tipo nos 100+ pontos de escrita.

### D4 — Origem com default `USER` + marcação explícita nos caminhos não-humanos

`Activity.origin ActivityOrigin @default(USER)`. Justificativa: ~95% dos
`activity.create` do código são ações de usuário (mais de 100 pontos). Os
caminhos não-humanos são poucos e conhecidos: engine de automações, status
auto-sync, importador, aprovações. Marcá-los explicitamente é cirúrgico; não
precisa tocar nos outros 100 pontos.

Proteção contra regressão: teste unitário que varre o `automations.engine.ts`
e falha se algum `activity.create` não passar `origin: 'AUTOMATION'` (teste
estático simples por regex — barato e eficaz) + teste do engine verificando
`automationRunId` preenchido.

### D5 — `actorId` das automações: NÃO mudar (recomendado)

Trocar `actorId` de automações para `null` alteraria o que a timeline do
card mostra hoje ("Nicchon moveu…") e o `user-recent-activity`. Para não
mexer em comportamento visível sem pedido, **mantém-se `actorId`** e o
relatório filtra por `origin = 'USER'`. (Opcional, futuro: a timeline exibir
"via automação" usando `origin` — melhoria de UX separada.)

### D6 — Escopo de acesso (decidido pelo Nicchon, 06/10/2026)

- **Ver o relatório, configurar os relatórios e gerenciar metas:**
  **somente OWNER e ADMIN.** GESTOR, MEMBER e GUEST não veem a aba nem a
  tela de configuração (frontend esconde; backend bloqueia com 403).
  - O **Lucas é ADMIN** (confirmado em produção) → tem acesso sem nenhum
    nível novo.
  - **Fernanda também é ADMIN** e é uma das pessoas acompanhadas → ela
    também verá o relatório de todos. Ciente e aceito.
  - Fábio, Leila e Thiago (GESTOR) não veem o relatório.
- **Não criar nível de papel novo.** Se no futuro for preciso liberar o
  relatório pra alguém sem promover a Admin, usar uma **permissão avulsa
  por pessoa** (ex.: flag em `Membership`, "pode ver relatórios de
  desempenho"). Um papel novo mexeria na hierarquia usada por quadros,
  privacidade, automações e lixeira (`ORG_ROLES_WITH_BOARD_BYPASS`,
  `BOARD_ROLE_RANK`, `isOrgAdmin`) — risco alto sem ganho.
- Constante única em contracts, ex. `PERFORMANCE_REPORT_ROLES = ['OWNER',
'ADMIN']`, usada pelo guard da API e pelo gate do front.
- **Registrar contato** (D9): quem pode comentar no card, igual hoje.

### D7 — Fuso horário

Todo agrupamento por dia/semana e todo preset de período ("Hoje", "Ontem")
usa `Organization.timezone`. Backend recebe `from/to` ISO já calculados pelo
front no fuso da org **e** agrupa no SQL/TS com o mesmo fuso.

### D8 — Configuração numa tela central, com nível básico e avançado (decidido)

Em vez de configurar dentro das configurações de cada quadro, uma tela
única **"Configuração dos relatórios"** dentro de Indicadores lista todos
os fluxos. Quem configura (Lucas) faz tudo num lugar só.

- **Nível básico, por fluxo:** escolher a(s) **coluna(s) de finalizado** —
  uma ou mais, cada uma marcada como positiva ("Ganho") ou negativa
  ("Perdido"). Isso já libera Finalizações e Reaberturas no relatório.
- **Nível avançado (opcional), por fluxo:** ordem do funil, colunas de
  transferência (fluxo paralelo), "contabilizar", exceções de transição,
  área. Libera Avanços, Retrocessos e Transferências.
- **Liga/desliga do registro de contato** por fluxo (D9).
- A escolha de finalizado **não altera** a coluna "Finalizado" operacional
  do quadro (`List.isFinalList`, faixa especial do Kanban, auto-conclusão
  do card). É só a referência dos relatórios. Caso real: no Relações
  Institucionais, `isFinalList` = "Concluído" (vazia, no meio do fluxo); o
  Lucas aponta "FINALIZADO /GABRIELA E FERNADA" sem mexer no quadro.
- Fluxo sem nada configurado continua aparecendo com métricas factuais
  (spec §5.8). Por isso o relatório funciona em todos os fluxos desde o
  primeiro dia; a configuração só acrescenta camadas:

| Situação do fluxo            | O relatório mostra                                   |
| ---------------------------- | ---------------------------------------------------- |
| Sem configuração             | Cards trabalhados, ações, movimentações, comentários |
| + coluna(s) de finalizado    | + Finalizações e Reaberturas                         |
| + ordem do funil             | + Avanços, Retrocessos, Transferências               |
| + registro de contato ligado | + Contatos e resultados                              |

### D9 — Registro de contato dentro da caixa de comentário, ligado por fluxo (decidido)

Aproveita o hábito real (o Fábio já registra contatos como comentário
marcando o @lucas — seção 2.6) em vez de criar um formulário separado.

- **Desligado em todos os fluxos por padrão.** Depois do deploy, ninguém
  vê diferença. O Lucas liga na tela central (D8) nos fluxos que quiser.
- Em **todo card de um fluxo ligado**, aparece acima da caixa de comentário
  uma linha opcional: Ligação · WhatsApp · E-mail · Reunião · Proposta ·
  Follow-up · Outro. Ao escolher um tipo, aparecem os resultados (spec §9).
  A pessoa escreve o comentário como sempre (inclusive com @menção) e
  envia: o comentário é salvo normalmente **e** fica gravado o registro
  estruturado ligado a ele.
- Os botões são **opcionais**: comentar sem escolher tipo continua igual.
- Cards de fluxos desligados: caixa de comentário **exatamente como hoje**.
- **Card em vários fluxos** (`CardPresence`): os botões aparecem se pelo
  menos um dos fluxos ativos do card estiver ligado. O registro fica no
  fluxo ligado; se houver mais de um ligado, vale o fluxo pelo qual a
  pessoa abriu o card (contexto `boardId` do modal); sem contexto, o fluxo
  primário se estiver ligado, senão o primeiro ligado em ordem alfabética.
- Desligar depois: os botões somem; registros antigos continuam no
  histórico e no relatório.
- Por que por fluxo (e não por card ou por pessoa): por card exigiria
  ligar manualmente card a card e leads novos nasceriam sem; por pessoa
  quebraria quando outra pessoa (ex.: Lucas cobrindo) registrar no mesmo
  card. Por fluxo acompanha o processo.
- Comentários antigos **não** são convertidos (texto livre; classificar por
  palavra-chave erraria muito). A contagem de contatos vale a partir da
  entrada do recurso.

### D10 — Metas configuráveis pelo Lucas (decidido, fase própria)

- O Lucas cria metas independentes, cada uma com: **métrica** · **alcance**
  (uma pessoa, uma área ou um fluxo) · **período** (diário, semanal,
  mensal) · **alvo** · **ativa/inativa**. Pode mudar o alvo e ligar/desligar
  quando quiser. O painel mostra o progresso (ex.: "Fábio · Contatos na
  semana: 31/40").
- Reaproveita o mesmo cálculo do relatório (sem motor novo): o progresso de
  uma meta é o mesmo número do KPI, no alcance e período da meta.
- **Só métricas de resultado** podem virar meta: contatos realizados,
  reuniões agendadas, reuniões realizadas, propostas enviadas, avanços,
  finalizações (positivas). **Não** "ações", "movimentações" ou
  "comentários" — são fáceis de inflar e virariam ranking (spec §11).
- Entra **depois** do registro de contato (a meta mais provável do Fábio é
  de contatos, e essa métrica só fica confiável com D9).
- Mudança de alvo é versionada como a configuração (meta tem histórico:
  semana passada é medida contra o alvo que valia na semana passada).

---

## 5. Modelo de dados proposto (100% aditivo)

> Nenhuma coluna removida, nenhum tipo alterado, nenhum dado existente
> apagado. `schema.prisma` só recebe adições. Migrations seguem o padrão
> `YYYYMMDDHHMMSS_nome` em `apps/api/prisma/migrations/`.

### 5.1 Migration A — origem das atividades

```prisma
enum ActivityOrigin {
  USER        // ação manual de um usuário
  AUTOMATION  // engine de automações (Activity.automationRunId preenchido)
  SYSTEM      // regra do sistema (ex.: card-status-sync)
  APPROVAL    // efeito colateral de decisão/revert de aprovação
  IMPORT      // importadores (Ummense)
}

model Activity {
  // ...campos atuais intactos...
  origin ActivityOrigin @default(USER)

  // novo índice pro relatório por pessoa
  @@index([organizationId, actorId, createdAt])
}

enum ActivityType {
  // ...valores atuais intactos...
  COMMERCIAL_ACTIVITY_LOGGED   // Fase 3
  COMMERCIAL_ACTIVITY_UPDATED  // Fase 3
  COMMERCIAL_ACTIVITY_DELETED  // Fase 3
}
```

Notas de migration:

- `ALTER TYPE ... ADD VALUE` é aditivo (precedente:
  `20260608170000_add_card_primary_changed_activity`). Pode ir numa migration
  própria da Fase 3 pra não misturar.
- `ADD COLUMN origin ... DEFAULT 'USER' NOT NULL` em Postgres 16 é
  operação de metadado (não reescreve tabela) — seguro mesmo com Activity grande.
- `CREATE INDEX` na Activity: avaliar `CONCURRENTLY` se o volume em prod for
  alto (medir antes — etapa 1.0, exige autorização pra consultar prod).

**Backfill (SQL dentro da migration, idempotente, só UPDATE em `origin`):**

```sql
-- automação: todo payload da engine tem via 'automation*' OU automationId
UPDATE "Activity" SET origin = 'AUTOMATION'
WHERE origin = 'USER'
  AND (payload->>'via' LIKE 'automation%' OR payload ? 'automationId');

-- sistema: auto-sync de status (actorId null + kind conhecido)
UPDATE "Activity" SET origin = 'SYSTEM'
WHERE origin = 'USER' AND payload->>'kind' = 'card.status.autoSync';

-- importação
UPDATE "Activity" SET origin = 'IMPORT'
WHERE origin = 'USER' AND payload->>'via' LIKE 'ummense-import%';
```

Aprovações antigas **não** são reclassificadas como `APPROVAL`: a Activity
`approval.approved` em si É ação humana do decisor (correto ficar `USER`). A
origem `APPROVAL` vale só para os novos `CARD_MOVED` derivados (Fase 1).

Antes de rodar em prod: rodar os 3 `SELECT count(*)` equivalentes e conferir
contra amostra manual (etapa 1.0 / 1.9).

### 5.2 Migration B — configuração gerencial por quadro

```prisma
/// Doc 52: configuração gerencial de um quadro pro módulo Desempenho da
/// Equipe. NÃO altera o board operacional — só interpreta eventos.
model BoardPerformanceConfig {
  id                          String   @id @default(cuid())
  organizationId              String
  boardId                     String   @unique
  /// 'COMERCIAL' | 'ATENDIMENTO' | 'DESENVOLVIMENTO' | 'OUTRA' (Zod em contracts).
  area                        String?
  /// D9: mostra os botões de registro de contato na caixa de comentário
  /// dos cards deste fluxo. Default false = nada muda pros usuários.
  contactLoggingEnabled       Boolean  @default(false)
  createdAt                   DateTime @default(now())
  updatedAt                   DateTime @updatedAt

  organization Organization                    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  board        Board                           @relation(fields: [boardId], references: [id], onDelete: Cascade)
  versions     BoardPerformanceConfigVersion[]

  @@index([organizationId, area])
}

/// Versão imutável da classificação. Nunca é editada: salvar = nova versão.
/// Evento é classificado pela versão com maior effectiveFrom <= evento.createdAt.
model BoardPerformanceConfigVersion {
  id             String   @id @default(cuid())
  configId       String
  organizationId String
  boardId        String
  /// Início da vigência. Default = momento do save. Retroativo só por
  /// escolha explícita do admin (fica registrado aqui + createdById).
  effectiveFrom  DateTime
  /// [{ listId, category, progressOrder: number|null, counted: boolean }]
  columns        Json
  /// [{ fromListId, toListId, movementClass }]
  transitionOverrides Json @default("[]")
  note           String?
  createdById    String
  createdAt      DateTime @default(now())

  config    BoardPerformanceConfig @relation(fields: [configId], references: [id], onDelete: Cascade)
  createdBy User                   @relation("PerformanceConfigVersionCreator", fields: [createdById], references: [id])

  @@index([boardId, effectiveFrom])
}
```

Nível básico (D8) cabe no mesmo shape: só as colunas de finalizado vêm com
`category = CONCLUSAO_POSITIVA | CONCLUSAO_NEGATIVA`; as demais ficam sem
categoria/ordem. O classificador (6.3) trata isso.

Por que `columns` em JSON dentro da versão (e não linhas por coluna): a
versão é um **snapshot imutável**; JSON garante que nada "vaza" entre
versões. Coluna apagada do board → `listId` órfão no JSON é ignorado com
segurança. Coluna nova criada depois → aparece como "não configurada" na
tela de configuração (aviso), e movimentos envolvendo ela ficam
`NAO_CLASSIFICADA` até o admin salvar nova versão.

### 5.3 Migration C (Fase 3) — atividade comercial

```prisma
/// Doc 52 §9: registro de trabalho comercial no card SEM movimentação.
model CardInteraction {
  id             String    @id @default(cuid())
  organizationId String
  cardId         String
  /// Fluxo onde foi registrada (snapshot — card multi-fluxo).
  boardId        String
  userId         String
  /// 'CALL' | 'WHATSAPP' | 'EMAIL' | 'MEETING' | 'FOLLOW_UP' | 'PROPOSAL' | 'OTHER'
  type           String
  /// Resultado validado por tipo em contracts (ex.: CALL → DONE | NO_ANSWER | CALL_BACK).
  outcome        String
  /// Rótulo livre quando type = 'OTHER'.
  customLabel    String?
  note           String?
  /// D9: comentário onde o registro foi feito (fluxo normal). Null só se um
  /// dia houver registro sem texto. onDelete: SetNull — apagar o
  /// comentário não apaga o registro de trabalho (auditoria).
  commentId      String?   @unique
  /// Contato do CRM com quem falou (opcional).
  contactId      String?
  /// Quando aconteceu (default now; permite registrar algo feito há pouco).
  occurredAt     DateTime  @default(now())
  /// Follow-up gerado (opcional) — ChecklistItem atribuído ao user (seção 7.3).
  followUpItemId String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  deletedAt      DateTime?

  @@index([organizationId, userId, occurredAt])
  @@index([cardId, occurredAt])
  @@index([boardId, occurredAt])
}
```

(Relações Prisma com `Card`, `User`, `Contact`, `Organization` — `onDelete:
Cascade` em Card/Org, `SetNull` em Contact. Cada criar/editar/excluir gera
Activity `COMMERCIAL_ACTIVITY_*` com `origin: USER`, então aparece na
timeline do card e conta como "ação".)

Comentário + registro são criados **na mesma transação** (endpoint de
comentário aceita um campo opcional `interaction: { type, outcome, ... }`).
Sem esse campo, o endpoint se comporta exatamente como hoje. O comentário
continua gerando `COMMENT_ADDED` e notificações/menções normais — o Lucas
segue sendo avisado como hoje.

### 5.4 Migration D (Fase 4) — metas

```prisma
/// Doc 52 D10: meta configurável. Alvo versionado em PerformanceGoalTarget.
model PerformanceGoal {
  id             String    @id @default(cuid())
  organizationId String
  name           String
  /// Só métricas de resultado (Zod em contracts): CONTACTS_DONE,
  /// MEETINGS_SCHEDULED, MEETINGS_HELD, PROPOSALS_SENT, ADVANCES, COMPLETIONS.
  metric         String
  /// 'USER' | 'AREA' | 'BOARD'
  scopeType      String
  /// userId, chave de área ou boardId conforme scopeType.
  scopeId        String
  /// 'DAY' | 'WEEK' | 'MONTH'
  period         String
  isActive       Boolean   @default(true)
  createdById    String
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  deletedAt      DateTime?

  targets PerformanceGoalTarget[]

  @@index([organizationId, isActive])
}

/// Alvo com vigência: mudar o alvo cria linha nova; períodos passados são
/// medidos contra o alvo que valia na época.
model PerformanceGoalTarget {
  id            String   @id @default(cuid())
  goalId        String
  target        Int
  effectiveFrom DateTime
  createdById   String
  createdAt     DateTime @default(now())

  goal PerformanceGoal @relation(fields: [goalId], references: [id], onDelete: Cascade)

  @@index([goalId, effectiveFrom])
}
```

---

## 6. Regras de classificação e medição

### 6.1 Categorias gerenciais (spec §5.2)

`ENTRADA`, `EM_ANDAMENTO`, `AGUARDANDO` (cliente/terceiro), `PAUSADO`,
`CONCLUSAO_POSITIVA`, `CONCLUSAO_NEGATIVA`, `FLUXO_PARALELO`.
Rótulos pt-BR na UI exatamente como a spec: "Entrada; Em andamento;
Aguardando cliente/terceiro; Pausado; Conclusão positiva; Conclusão
negativa; Fluxo paralelo".

### 6.2 Classes de movimentação

`AVANCO`, `RETROCESSO`, `TRANSFERENCIA`, `CONCLUSAO` (com subtipo
positiva/negativa), `NEUTRA`, `NAO_CLASSIFICADA` (quadro/coluna sem config
vigente na data — spec §5.8: **não inferir**).

### 6.3 Algoritmo (`classifyMovement(from, to, version)` — função pura)

```
1. sem versão vigente na data do evento          → NAO_CLASSIFICADA
2. existe override (from,to) na versão            → classe do override
3. from ou to com counted = false                 → NEUTRA (fora do progresso)
4. to ∈ CONCLUSAO_* e from ∉ CONCLUSAO_*          → CONCLUSAO (+ subtipo)
5. from ∈ CONCLUSAO_* e to CONFIGURADA ∉ CONCLUSAO_* → REABERTURA → conta como RETROCESSO
6. to = FLUXO_PARALELO ou from = FLUXO_PARALELO   → TRANSFERENCIA
7. ambos com progressOrder:
     to > from → AVANCO ; to < from → RETROCESSO ; igual → NEUTRA
8. versão só com nível básico (nenhuma ordem)     → NAO_CLASSIFICADA
   (não há base pra dizer se foi avanço — spec §5.8: não inferir)
9. caso contrário (coluna sem ordem, ex. Aguardando) → NEUTRA
```

Regras 4 e 5 vêm antes da exigência de configuração completa de propósito:
com o nível básico (D8), só as colunas de finalizado estão configuradas,
e mesmo assim conclusões e reaberturas precisam ser detectadas. Exceção à
regra 5: se o destino for `FLUXO_PARALELO` (ex.: Finalizado → Marketing),
a regra 6 se aplica antes — é transferência, não reabertura (exemplo da
spec §5.4). Na implementação, checar 6 antes de 5 quando `to` é paralelo.

**Tabela de verdade com os exemplos da spec** (vira teste unitário literal):

| Movimentação (spec §5.4)                          | Esperado      | Regra que decide |
| ------------------------------------------------- | ------------- | ---------------- |
| Ligando[2] → Interatividade[3]                    | Avanço        | 7                |
| Interatividade[3] → Reunião Agendada[4]           | Avanço        | 7                |
| Reunião Agendada[4] → Negociação[5]               | Avanço        | 7                |
| Negociação[5] → Finalizado[6, Conclusão positiva] | Conclusão     | 4                |
| Negociação[5] → Ligando[2]                        | Retrocesso    | 7                |
| Finalizado → Marketing[Fluxo paralelo]            | Transferência | 6 (ou override)  |

Casos de borda a cobrir em teste: Finalizado → Ligando (reabertura →
Retrocesso, regra 5); só nível básico: Ligando → Interatividade
(→ Não classificada, regra 8) e Negociação → Finalizado (→ Conclusão,
regra 4); coluna em `AGUARDANDO` sem ordem (→ Neutra); override que
contradiz a ordem (override vence); versão retroativa; coluna arquivada
que aparece no histórico ("Novo Lead").

### 6.4 Conceitos de medição (spec §8 e §10) — definições exatas

Todos os indicadores consideram **só `origin = USER`** e `actorId = colaborador`.

| Indicador                                  | Definição implementável                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ações registradas**                      | nº de Activities do colaborador no período cujo `type` está na lista de "ações válidas" (6.5).                                                                                                                                                                                                                                              |
| **Cards trabalhados**                      | nº de `cardId` **distintos** entre essas ações (único — spec §8).                                                                                                                                                                                                                                                                           |
| **Movimentações**                          | nº de `CARD_MOVED` (inclui factual mesmo em quadro não configurado — spec §5.8).                                                                                                                                                                                                                                                            |
| **Avanços / Retrocessos / Transferências** | `CARD_MOVED` classificados como tal (6.3). Quadros sem config → não somam, e a UI avisa.                                                                                                                                                                                                                                                    |
| **Finalizações**                           | Proposta: nº de **cards distintos** que o colaborador levou à conclusão no período — evento = move classificado `CONCLUSAO` **ou** status → `COMPLETED` (`CARD_COMPLETED` / `status_changed`). Distinto por card evita contar 2× quem move pra "Finalizado" e também clica "Concluir". Drill-down mostra todos os eventos. Decidido (13.1). |
| **Reaberturas**                            | `CARD_UNCOMPLETED` + `status_changed` saindo de `COMPLETED` + move de coluna `CONCLUSAO_*` para não-conclusão.                                                                                                                                                                                                                              |
| **Atividades comerciais**                  | nº de `CardInteraction` não excluídas do colaborador (`occurredAt` no período).                                                                                                                                                                                                                                                             |

### 6.5 "Ações válidas" (o que conta como trabalho no card)

Lista inicial em `packages/contracts` (fácil de ajustar):

- Contam: `CARD_CREATED` (exceto vínculo de fluxo e importação), `CARD_UPDATED`
  (edição de campos, status, aprovação), `CARD_MOVED`, `CARD_COMPLETED`,
  `CARD_UNCOMPLETED`, `CARD_ASSIGNED`, `CARD_UNASSIGNED`, `CARD_LEAD_CHANGED`,
  `LABEL_ADDED/REMOVED`, `COMMENT_ADDED`, `CHECKLIST_*` (criar/concluir/
  renomear item), `ATTACHMENT_ADDED`, `CARD_CONTACT_LINKED`,
  `TIME_ENTRY_STOPPED/CREATED`, `COMMERCIAL_ACTIVITY_LOGGED`.
- Não contam: `BOARD_VIEWED_IMPLICIT`, visitas, ações de lixeira/restauração
  (`CARD_TRASHED`, `*_RESTORED*`, `*_DELETED_PERMANENTLY`), `CARD_ARCHIVED`,
  eventos de board/lista/membros/contatos sem card.
- Decidido (13.1): arquivar não conta; apontar horas conta.

---

## 7. Interface

### 7.1 Tela central "Configuração dos relatórios" (D8; spec §5.1, §5.5)

- Rota `/indicadores/desempenho/configuracao`, aberta por um botão
  "Configurar relatórios" dentro da aba Desempenho (não é uma aba nova).
  Só OWNER/ADMIN (D6). **Não mexe** em `board-settings-dialog.tsx`.
- Lista todos os fluxos ativos, com status: "Não configurado" ·
  "Finalizado definido" · "Funil completo" · "Registro de contato ligado".
- **Por fluxo, nível básico:** select da(s) coluna(s) de finalizado, cada
  uma marcada como positiva ou negativa.
- **Por fluxo, "Configuração avançada"** (expansível), no wireframe da spec
  §5.5:
  - Carrega **todas as colunas atuais** do fluxo, na ordem do board, **mais
    as colunas arquivadas que aparecem em movimentações do histórico**
    (bloco "Colunas antigas", recolhido). Sem isso, 105 movimentos do
    Relações Institucionais (de "Novo Lead", arquivada) ficariam "não
    classificados".
  - Por coluna: **Categoria**, **Ordem** (opcional), **Contabilizar**.
  - **Área** do fluxo.
  - **Exceções de transição**: "De [coluna] → Para [coluna] = [classe]".
  - Botão **"Sugerir ordem"**: pré-preenche só a ordem pela posição e
    Backlog → Entrada; **não** sugere conclusão pela flag `isFinalList`
    (no Relações Institucionais ela aponta "Concluído", vazia no meio do
    fluxo). Só sugestão visual — nada é salvo sem revisar (R1).
- **Liga/desliga "Registro de contato"** por fluxo (D9).
- **Salvar** com "Vale a partir de: ( ) agora ( ) data [dd/mm/aaaa]". Na
  primeira configuração, data sugerida = início do histórico (11/05/2026).
  "Histórico de versões" com autor + data (auditoria).
- Aviso quando há colunas novas não configuradas.

### 7.2 Aba "Desempenho da Equipe" — `/indicadores/desempenho`

- Adicionar 5ª aba em `app/(app)/indicadores/layout.tsx` →
  "Desempenho da equipe" (seguindo o estilo de rótulo das abas atuais).
  Renderizada só pra OWNER/ADMIN (D6), usando o mesmo `myRole` que o
  `topbar.tsx` já busca; a página redireciona se outro papel acessar direto,
  e o backend bloqueia. As 4 abas atuais continuam iguais e visíveis pra
  quem já as vê hoje.
- O cabeçalho de abas hoje é uma linha sem rolagem (`flex gap-1`); com 5
  abas no celular pode estourar → acrescentar `overflow-x-auto` na `<nav>`
  (única mudança visual no layout existente; não afeta desktop).
- **Filtros** (spec §10) persistidos na URL (deep-link — o Lucas pode mandar
  o link pro Giovanni):
  - Período: Hoje | Ontem | 7 dias | 15 dias | 30 dias | 90 dias |
    Personalizado (fuso da org).
  - Área: Comercial | Atendimento | Desenvolvimento | Todas.
  - Quadro: um, vários ou todos (multi-select — o FilterBar atual é
    single-select; criar componente novo sem alterar o de Cards).
  - Colaborador: um ou todos.
  - Cliente (empresa do CRM), quando aplicável.
- **Faixa de KPIs** (spec §5.6/§10): Cards trabalhados · Ações ·
  Movimentações · Avanços · Retrocessos · Transferências · Finalizações ·
  Atividades comerciais (esta só quando há quadro com o recurso ligado).
  Cada número é clicável → drill-down.
- **Aviso** (spec §5.8), quando há quadro filtrado sem config:
  "Classificação de progresso não configurada para este quadro." + link
  "Configurar relatórios".
- **Resumo por colaborador** (spec §11): tabela Colaborador · Cards
  trabalhados · Ações · Movimentações · Avanços · Finalizações · Ativ.
  comercial. **Ordenação padrão alfabética** (não ranking — R10); usuário
  pode ordenar por coluna se quiser. Todo número clicável.
- **Evolução no período** (spec §13): para período > 1 dia, gráfico diário
  (SVG no padrão do `FlowInOutChart`) com seletor de métrica: Ações, Cards
  trabalhados, Movimentações, Avanços, Finalizações, Atividades comerciais.
- **Visão por dia** (spec §5.7): tabela Dia · Cards trabalhados · Avanços ·
  Retrocessos · Finalizações, + frase-resumo "84 movimentações = 52 avanços,
  7 retrocessos, 11 transferências, 14 conclusões".
- **Drill-down**: drawer lateral listando os eventos que compõem o número:
  Horário · Card (link `/c/[code]`) · Quadro · De · Para · Resultado (com
  ícones Lucide, **sem emoji** — regra do projeto). Paginado.

### 7.3 Visão individual — `/indicadores/desempenho?user=<id>`

Spec §12: ao selecionar uma pessoa → resumo do período + evolução + **lista
cronológica de todas as ações** (Horário · Card · Quadro · De · Para ·
Classificação), incluindo comentários e atividades comerciais com descrição
legível (reusar `lib/activity-format.ts`, que já tem fallback `default`
para tipos novos).

Isso resolve a necessidade de "simular a conta" pra ver as movimentações do
dia de alguém — sem trocar de sessão.

### 7.4 Registro de contato na caixa de comentário (D9, Fase 3)

- Só em cards com presença ativa em fluxo com `contactLoggingEnabled`.
  Nos demais, a caixa de comentário (`timeline-feed.tsx` / `MentionTextarea`)
  fica **idêntica à de hoje**.
- Linha opcional de chips acima da caixa: Ligação · WhatsApp · E-mail ·
  Reunião · Follow-up · Proposta · Outro. Escolhido o tipo, aparecem os
  resultados (spec §9, rótulos exatos): Ligação (Realizado / Não respondeu /
  Retornar depois); WhatsApp (Realizado / Não respondeu / Interessado / Sem
  interesse); E-mail (Enviado / Retorno recebido); Reunião (Realizada / Não
  realizada); Follow-up (Realizado / Pendente); Proposta (Enviada /
  Revisada); Outro (campo configurável — V1: rótulo livre).
- Opcional: contato do CRM e "Retornar em [data]" (vira `ChecklistItem`
  atribuído a quem registrou → aparece em Tarefas na home; "follow-ups
  pendentes/vencidos" da spec §14 = esses itens não concluídos).
- Comentário publicado mostra um selo discreto ("Ligação · Não respondeu",
  ícone Lucide, sem emoji). @menções e notificações funcionam como hoje.

---

## 8. Fases e etapas

> Cada fase é entregável e útil sozinha. Ordem pensada pra o Lucas ter
> valor o quanto antes e o risco ficar concentrado onde é menor.

### Fase 1 — Fundação (backend; sem UI nova)

1.0 **(exige autorização — produção)** Medir em prod: total de linhas em
`Activity`, distribuição por `type`, contagem dos 3 backfills, data da
primeira Activity `CARD_MOVED` (= quanto histórico existe). Só SELECT.
Também listar boards/colunas reais (Relações Institucionais Kharis,
Comercial, Atendimento) pra validar o wireframe com dados reais.
1.1 Migration A (enum `ActivityOrigin`, coluna `origin`, índice
`(organizationId, actorId, createdAt)`, backfill SQL).
1.2 Engine: passar `run.id` de `executeAutomation` → `routeAction` →
handlers; todo `activity.create` da engine grava
`origin: 'AUTOMATION', automationRunId: run.id`. Inclui
`logAutomationActivity` (WhatsApp).
_Arquivo:_ `apps/api/src/modules/automations/automations.engine.ts`.
1.3 `handleMoveCard`: acrescentar `fromListName`/`toListName` ao payload
(aditivo; timeline passa a mostrar "moveu de X para Y" também em moves
automáticos — melhoria visível, sem quebrar nada).
1.4 `card-status-sync.ts`: `origin: 'SYSTEM'`.
1.5 Importador: `origin: 'IMPORT'` nos 3 pontos de `CARD_CREATED`.
1.6 Aprovações: em `applyDecision` e no revert, para cada item de
`moves[]` gravar uma Activity `CARD_MOVED` (`origin: 'APPROVAL'`,
`actorId` = decisor/quem desfez, payload no shape padrão +
`kind: 'approval.move'`, `approvalId`).
**E** ajustar a query de "interferência humana" do undo para
considerar só `origin: 'USER'` (senão o próprio move da aprovação
bloquearia o undo — risco RK2).
_Arquivo:_ `apps/api/src/modules/approvals/approvals.service.ts`.
1.7 Migration B (config + versões) + contracts Zod
(`packages/contracts/src/performance.ts`: categorias, classes, áreas,
shapes de config, lista de ações válidas).
1.8 Classificador puro + testes (`apps/api/src/modules/performance/
    movement-classifier.ts` + `.spec.ts`) com a tabela de verdade 6.3.
1.9 Testes de regressão: engine grava origin/runId; undo de aprovação
continua bloqueando move humano e deixa de bloquear move de automação;
backfill conferido em dev com fixtures.

#### Fase 1 — execução (06/10/2026, branch `feat/desempenho-equipe`)

- [x] 1.0 Medição em produção (read-only) — seção 2.6.
- [x] 1.1 Migration `20261006120000_activity_origin` (enum, coluna, índice,
      backfill). Validada em Postgres descartável com 68 migrations
      anteriores + fixtures no formato real: 10/10 casos de backfill corretos.
- [x] 1.2 Engine: `AsyncLocalStorage` com o id da execução; os 8
      `activity.create` da engine gravam `origin: AUTOMATION` +
      `automationRunId`. Nenhuma assinatura de handler mudou.
- [x] 1.3 `handleMoveCard` grava `fromListName`/`toListName`.
- [x] 1.4 `card-status-sync.ts` → `origin: SYSTEM`.
- [x] 1.5 Importador (3 pontos) → `origin: IMPORT`.
- [x] 1.6 Aprovações: `logApprovalMoves` (decisão e undo) +
      `origin: 'USER'` na checagem de interferência do undo.
- [x] 1.7 Migration `20261006120100_board_performance_config` + contratos
      (`packages/contracts/src/performance.ts`).
- [x] 1.8 Classificador puro + 23 testes (tabela da spec §5.4 literal).
- [x] 1.9 Guarda estática (5 testes) + smoke E2E com a API real contra banco
      descartável: move manual (USER), automação encadeada (AUTOMATION + run,
      2 runs SUCCESS), aprovação + undo (APPROVAL nos dois sentidos, undo não
      se bloqueia), aprovação + automação (undo liberado — mudança intencional),
      GET card e Indicadores de cards 200.
- Resultado: typecheck API/web/contracts OK, lint OK, **119 testes** (91
  existentes + 28 novos). Diff em código existente: só adições, exceto 2
  linhas (chamada `routeAction` envolvida no contexto; `select` com `name`).

#### Achados pré-existentes (NÃO corrigidos — decisão do Nicchon)

1. **Undo de aprovação nunca é bloqueado por movimento manual.** A
   checagem de interferência (`approvals.service.ts`, `humanInterference`)
   usa `NOT: { payload: { path: ['kind'], equals: 'approval.approved' } }`.
   Em Postgres, quando o payload não tem `kind` (todo `CARD_MOVED` manual,
   edições de campo), a comparação vira NULL e o `NOT` descarta a linha.
   Comprovado no banco de teste com a query idêntica à do `main`. Hoje só
   bloqueiam o undo activities que têm `kind` (ex.: `status_changed`).
   Correção sugerida: `OR: [{ payload: { path: ['kind'], equals: Prisma.DbNull }}, { NOT: ... }]`
   ou filtrar por tipo/kind em memória. Corrigir deixa o undo **mais
   restrito** que hoje → mudança de comportamento, precisa de OK.
2. **Drift de schema antigo:** o índice `CardApproval_status_reminderDisabled_idx`
   (migration `20260529160000_approval_reminders`) não está declarado no
   `schema.prisma`. Inofensivo (útil pro cron de lembretes); só aparece em
   `prisma migrate diff`. Não mexido.

### Fase 2 — Desempenho (o que o Lucas precisa pro Comercial e Atendimento)

2.1 Endpoints de config (módulo novo `performance`, guard OWNER/ADMIN):
`GET /api/v1/performance/config` (todos os fluxos + status),
`GET/PUT /api/v1/performance/config/:boardId` (`PUT` cria versão nova;
body com `effectiveFrom` opcional) e
`GET /api/v1/performance/config/:boardId/versions`.
2.2 Endpoints de relatório (mesmo módulo, guard OWNER/ADMIN): - `GET /api/v1/performance/summary` → KPIs + por colaborador + série
diária + lista de quadros não configurados. - `GET /api/v1/performance/events` → drill-down paginado
(`metric=MOVES|AVANCO|RETROCESSO|TRANSFERENCIA|FINALIZACAO|ACTIONS|
      CARDS|COMMERCIAL`, `userId`, filtros iguais).
Filtros comuns: `from, to, boardIds[], userIds[], area, companyId`.
Validação Zod; limites (período máx. 366 dias, page size máx. 100).
2.3 Tela central "Configuração dos relatórios" (7.1).
2.4 Aba "Desempenho da equipe" (7.2) + visão individual (7.3) + drill-down.
2.5 Swagger dos endpoints novos; Central de Ajuda (`/ajuda`): artigo "Como
configurar a classificação de um quadro" e "Como ler o Desempenho da
Equipe" (incluindo o que conta como ação e por que automações não contam).
2.6 Configurar, **junto com o Lucas**, os fluxos do Comercial e Atendimento
em produção (é dado de negócio — decisão dele). Mínimo: coluna de
finalizado do Relações Institucionais.

#### Fase 2 — execução (06/10/2026, branch `feat/desempenho-equipe`)

- [x] 2.1 Config: `GET /performance/config`, `GET|POST /performance/config/:boardId`
      (POST cria versão; o cliente web não tem PUT). Salvar só área sem
      mudar colunas não cria versão nova (comparação canônica — jsonb
      reordena chaves).
- [x] 2.2 Relatório: `GET /performance/summary|events|cards` (OWNER/ADMIN,
      read-only, período máx. 366 dias, dias no fuso da org).
- [x] 2.3 Tela central `/indicadores/desempenho/configuracao` (nível básico + avançado, colunas antigas do histórico, vigência, histórico de
      versões). Liga/desliga do registro de contato fica pra Fase 3 (sem
      efeito antes dela).
- [x] 2.4 Aba `/indicadores/desempenho`: filtros na URL (período no fuso da
      org, área, fluxos múltiplos, colaborador, cliente), 8 KPIs clicáveis,
      aviso de fluxo sem classificação, resumo por colaborador (alfabético),
      evolução diária com seletor, tabela por dia, visão individual,
      drill-down (card abre pelo `?card=` existente).
- [x] Testes: 41 unitários (classificador, agregação, fuso) + smoke E2E
      28/28 com API real (permissão 403 p/ GESTOR, automação fora, básico
      sem inferência, versionamento, filtros, drill-down, telas antigas 200) + build de produção do web OK + conferência visual das 2 telas.
- Bugs pegos pelo E2E e corrigidos: (1) duas versões com a mesma vigência
  → agora vale a salva por último; (2) nível básico contava
  "Finalizado → coluna não configurada" como reabertura → regra 6 do
  classificador só considera reabertura se o destino estiver configurado
  (reabertura por status continua contando sempre).
- [ ] 2.5 Central de Ajuda (2 artigos) — pendente.
- [ ] 2.6 Configurar os fluxos com o Lucas — depende do deploy.
- [ ] Conferência visual em celular (largura pequena) — anotado, não crucial.

### Fase 3 — Comercial

3.1 Migration C (`CardInteraction`) + valores novos de `ActivityType`.
3.2 Endpoint de comentário aceita `interaction` opcional (mesma transação,
D9/5.3) — sem o campo, comportamento idêntico ao atual. Endpoints
`PATCH/DELETE /api/v1/interactions/:id` (soft delete; auditoria) e
`GET /api/v1/cards/:cardId/flows/contact-logging` (o front sabe se mostra
os chips).
3.3 Chips na caixa de comentário (7.4) + selo no comentário + render na
timeline (`activity-format.ts`). Teste: card em fluxo desligado renderiza
a caixa sem nenhuma diferença.
3.4 Follow-up → `ChecklistItem` (reuso).
3.5 KPIs comerciais (spec §14) que têm definição clara hoje: leads/cards
trabalhados, atividades comerciais, contatos realizados (= interações
com resultado "Realizado/Enviado/..."), cards movimentados, avanços,
retrocessos, reuniões agendadas (= entradas na coluna configurada como
tal — exige marcar "coluna de reunião" na config; decidido em 13.1: métricas separadas),
propostas enviadas, conclusões positivas/negativas, follow-ups
pendentes/vencidos. **Sem** taxa de conversão (spec §14).

#### Fase 3 — execução (06/10/2026, branch `feat/desempenho-equipe`)

- [x] 3.1 Migrations `20261006150000_commercial_activity_types` (3 valores
      de `ActivityType`) e `20261006150100_card_interaction` (tabela nova).
- [x] 3.2 `POST /comments` aceita `interaction` opcional: validado ANTES do
      comentário (fluxo desligado/resultado inválido → 400 e nenhum
      comentário criado), gravado logo depois. `CommentsService` intocado.
      `GET /cards/:id/interactions?boardId=` (habilita botões + selos),
      `PATCH|DELETE /interactions/:id` (autor ou Dono/Admin/Gestor, auditado).
- [x] 3.3 Botões na caixa de comentário (componente separado, só em fluxo
      ligado), selo no comentário, timeline formata os 3 tipos novos e não
      duplica o registro que já aparece como selo.
- [x] 3.4 "Retornar em [data]" (quando não atendeu / retornar depois /
      pendente) cria tarefa no checklist "Follow-ups" via `ChecklistsService`
      (assignee = quem registrou → aparece na Home).
- [x] 3.5 Relatório: registros de contato, contatos realizados, reuniões
      realizadas, propostas enviadas, follow-ups pendentes/vencidos (agora),
      coluna "Contatos" por colaborador, métrica no gráfico. Usa o estado
      atual do registro (correção/exclusão refletem). Toggle por fluxo na
      tela central.
- [x] Testes: 141 unitários (inclui regra multi-fluxo D9) + smoke E2E 27/27
      (regressão do comentário normal, fluxo desligado, validações,
      follow-up, multi-fluxo, MEMBER registra mas não vê relatório,
      correção/exclusão, apagar comentário mantém registro) + conferência
      visual da caixa de comentário.
- [ ] "Reuniões agendadas" por entrada em coluna (precisa marcar a coluna
      na config) — fica pra Fase 4 junto com a meta `MEETINGS_SCHEDULED`.
- Achado pré-existente (não corrigido): o modal do card dispara aviso de
  acessibilidade do Radix ("DialogContent requires a DialogTitle",
  `card-modal.tsx:97`) — só no console de dev, sem efeito funcional.

### Fase 4 — Metas (D10)

4.1 Migration D (`PerformanceGoal` + `PerformanceGoalTarget`).
4.2 CRUD de metas (OWNER/ADMIN), alvo versionado.
4.3 Cálculo de progresso reusando o serviço do relatório (mesmo número do
KPI no alcance/período da meta). Semana = seg–dom no fuso da org.
4.4 UI: seção "Metas" na aba Desempenho (barras "31/40") + tela de gestão
(criar, ativar/desativar, mudar alvo, histórico de alvos).
4.5 Validar com o Lucas as metas reais do Comercial (resposta da P1).

#### Fase 4 — execução (06/10/2026, branch `feat/desempenho-equipe`)

- [x] 4.1 Migration `20261006160000_performance_goals` (2 tabelas novas).
- [x] 4.2 `GET|POST /performance/goals`, `PATCH|DELETE /performance/goals/:id`
      (OWNER/ADMIN). Só métricas de resultado (`GOAL_METRICS`); alcance
      validado (pessoa da org, área válida, fluxo da org).
- [x] 4.3 Progresso com o mesmo motor do relatório (`loadEvents` +
      `aggregate`), período atual + 3 anteriores, semana segunda–domingo no
      fuso da org. Alvo versionado: muda a partir do período atual; editar 2x
      no mesmo período substitui (não empilha). Meta cuja métrica depende de
      configuração mostra o que falta (não mostra 0).
- [x] Métricas novas: "Reuniões agendadas" (entrada em coluna marcada na
      config avançada — checkbox por coluna) e "Fechamentos" (finalizações
      positivas, exclui conclusão negativa). KPI + drill-down no relatório.
- [x] 4.4 UI: seção "Metas" na aba (barras, histórico) + página
      `/indicadores/desempenho/metas` (criar, alvo, ativar/desativar,
      remover).
- [x] 4.5 Script `scripts/ops/seed-metas-exemplo.mjs` (via API, idempotente,
      `--dry-run`) com as 6 metas da seção 12.1. **Rodar em produção só com
      autorização**, após o deploy.
- [x] Testes: 154 unitários (períodos, alvo versionado, reuniões, fechamentos) + smoke E2E 26/26 (script cria 6 e não duplica, avisos de config,
      valores, versionamento por período, 403 GESTOR, validações, relatório) + conferência visual (aba e página de metas, console sem erros).

### Fase 5 — Outras áreas

5.1 Configurar fluxos de Atendimento e Desenvolvimento (só config).
5.2 Indicadores específicos (spec §15) que saem do mesmo motor: recebidos,
iniciados, concluídos, reabertos, aguardando cliente (categoria
`AGUARDANDO`), devolvidos (= retrocessos), tempo por etapa (diferença
entre `CARD_MOVED` consecutivos do mesmo card — dá pra calcular porque o
histórico de moves é completo).

### Fase 6 — Evolução (fora deste plano; só registrado)

Exportação CSV/Excel/PDF (relevante: o Giovanni não tem conta e recebe
pelo Lucas), relatórios automáticos (ex.: resumo semanal no WhatsApp do
gestor — reusa outbox existente), comparativos entre períodos.

---

## 9. Integridade do KTask — o que NÃO muda

- Nenhuma coluna/tabela/enum removido ou alterado; só adições.
- Boards, colunas, nomes, ordem e cards: intocados pela configuração (R2).
- `Activity.actorId` mantém o significado atual (timeline igual).
- Indicadores de Cards, Tarefas, Timesheet, Por Empresa, Visão Gerencial e
  "Ver como": código intocado. No `indicadores/layout.tsx` só entra 1 aba
  condicional (OWNER/ADMIN) + `overflow-x-auto` na `<nav>`.
- Configurações do quadro (`board-settings-dialog.tsx`): intocado (D8).
- Caixa de comentário: idêntica em todo fluxo onde o registro de contato
  não foi ligado (default: nenhum).
- Engine de automações: mesma lógica; só passa `runId` e grava 2 campos a
  mais em cada Activity.
- Mudanças de comportamento **intencionais** (comunicar no commit e ao Lucas):
  1. Undo de aprovação deixa de ser bloqueado por moves feitos por automação
     (alinha com a intenção documentada no código).
  2. Timeline passa a mostrar "moveu de X para Y" em moves por automação e
     por aprovação (antes: "moveu o card" genérico / nada).

### Checklist de verificação por fase

- `pnpm typecheck` + `pnpm lint` + `pnpm test` verdes (regra do projeto).
- Migrations testadas em banco de dev com cópia anonimizada ou fixtures
  (nunca contra prod sem autorização).
- Smoke manual: mover card manualmente, por automação, por aprovação,
  desfazer aprovação; conferir timeline do card, "Atividade recente" do
  "Ver como", Indicadores de Cards inalterados.
- Deploy: push em `main` dispara CI/CD de produção → **pedir autorização**
  antes (denylist). Migrations com `set -e` (lição do incidente Zest).

---

## 10. Riscos e mitigação

| #    | Risco                                                                                            | Mitigação                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| RK1  | Novo caminho de Activity esquecer de marcar `origin` e virar `USER`                              | Default cobre ações humanas (maioria); teste estático no engine; seção no doc de arquitetura "toda Activity não-humana DEVE setar origin".            |
| RK2  | `CARD_MOVED` criado pela própria aprovação bloquear o undo dela                                  | Ajustar query de interferência para `origin: 'USER'` na mesma etapa (1.6) + teste.                                                                    |
| RK3  | Mudança de comportamento do undo (automação deixa de bloquear)                                   | É o comportamento documentado como pretendido; teste explícito; avisar no commit.                                                                     |
| RK4  | Backfill classificar errado algum tipo antigo                                                    | Rodar SELECTs antes (1.0), conferir amostra; UPDATE só em `origin` (reversível: `SET origin='USER' WHERE ...`).                                       |
| RK5  | Lucas interpretar número como "produtividade" injusta (ex.: quem faz menos moves mas fecha mais) | Sem ranking; definições na Central de Ajuda; drill-down sempre disponível.                                                                            |
| RK6  | Performance em períodos longos                                                                   | Índice novo; limite de 366 dias; classificação em memória é O(n) com n pequeno; cache materializado só se medir lentidão.                             |
| RK7  | Config retroativa "mudando números antigos" e gerando desconfiança                               | Retroatividade só explícita, com autor/data na versão e histórico visível.                                                                            |
| RK8  | Card multi-fluxo: mesmo card em 2 quadros conta 2× em "cards trabalhados"?                       | Não — distinto por `cardId` no período; por quadro, aparece em cada quadro onde houve ação (esperado).                                                |
| RK9  | Privacidade `TEAM_ONLY`                                                                          | Relatório só para OWNER/ADMIN, que já têm bypass de privacidade (doc 25). Se um dia houver permissão avulsa (D6) pra outro papel, filtrar por acesso. |
| RK10 | Metas virarem pressão/ranking                                                                    | Só métricas de resultado (D10); sem ordenação por desempenho; metas visíveis só a OWNER/ADMIN.                                                        |
| RK11 | Fernanda (ADMIN) vê o relatório da equipe, inclusive o dela                                      | Decisão consciente (D6). Se incomodar, permissão avulsa resolve sem mudar papéis.                                                                     |
| RK12 | Chips de contato aparecerem onde não deviam                                                      | Default desligado; teste de regressão da caixa de comentário em fluxo desligado; regra multi-fluxo explícita (D9).                                    |

---

## 11. O "simular a conta" (Ver como) — diagnóstico (fora do escopo)

Lucas: "eu tenho que meio que simular a conta deles, e aí quando eu vou
navegando ali, ele acaba voltando pra minha seção".

Causa no código: o modo "Ver como" (doc 40) é **só um parâmetro de URL na
home** (`app/(app)/page.tsx` lê `?as=<userId>`). Não é uma sessão: ao clicar
em qualquer link (quadro, card, outra página), o `?as=` não é propagado e as
demais telas sempre usam os dados do usuário logado. Não há bug de sessão —
o recurso foi desenhado só pra home.

Opções pro card que o Lucas vai abrir:

- (a) Persistir o "ver como" em contexto (`sessionStorage` + banner global)
  e fazer as telas pessoais (home, notificações, "meus cards") respeitarem —
  médio esforço, toca várias telas.
- (b) Manter "Ver como" restrito à home e deixar o **Desempenho da Equipe**
  (7.3) cobrir o "o que a pessoa fez no dia" — custo zero adicional.

Recomendação: entregar Fase 2 primeiro e perguntar ao Lucas se (a) ainda
faz falta.

---

## 12. Metas

Decisão D10, fase própria (Fase 4), modelo em 5.4.

### 12.1 Metas de exemplo (criadas no deploy da Fase 4)

Decisão do Nicchon (06/10/2026): criar metas fictícias plausíveis para o
painel não nascer vazio; o Lucas edita alvos, desativa ou apaga depois.
Alvos calibrados no ritmo real do Relações Institucionais (consulta
read-only de 06/10/2026):

| Dado real (jul–set/2026)                   | Valor         |
| ------------------------------------------ | ------------- |
| Comentários do Fábio por semana ativa      | 36–56         |
| Entradas em REUNIÃO AGENDADA               | 7–10/mês      |
| Entradas em NEGOCIAÇÃO                     | 6–8/mês       |
| Entradas em FINALIZADO /GABRIELA E FERNADA | 3 em setembro |
| Entradas em LIGANDO (leads em prospecção)  | 21–45/mês     |

| Nome (com "exemplo" pra ficar claro) | Métrica                   | Alcance                              | Período | Alvo |
| ------------------------------------ | ------------------------- | ------------------------------------ | ------- | ---- |
| Contatos realizados (exemplo)        | `CONTACTS_DONE`           | Fábio Machado                        | Semanal | 40   |
| Reuniões agendadas (exemplo)         | `MEETINGS_SCHEDULED`      | Fábio Machado                        | Semanal | 2    |
| Reuniões realizadas (exemplo)        | `MEETINGS_HELD`           | Fábio Machado                        | Mensal  | 6    |
| Propostas enviadas (exemplo)         | `PROPOSALS_SENT`          | Fábio Machado                        | Mensal  | 6    |
| Avanços no funil (exemplo)           | `ADVANCES`                | Fluxo Relações Institucionais Kharis | Semanal | 12   |
| Fechamentos (exemplo)                | `COMPLETIONS` (positivas) | Fluxo Relações Institucionais Kharis | Mensal  | 3    |

Notas:

- Todas ativas, com nome terminando em "(exemplo)".
- `MEETINGS_SCHEDULED` só funciona depois que a coluna REUNIÃO AGENDADA
  estiver marcada como tal na configuração do fluxo; `ADVANCES` exige a
  ordem do funil configurada; `COMPLETIONS` exige a coluna de finalizado.
  Se o fluxo ainda não estiver configurado no deploy da Fase 4, a meta
  mostra "Configure o fluxo para medir esta meta" em vez de 0.
- `CONTACTS_DONE`, `MEETINGS_HELD` e `PROPOSALS_SENT` vêm do registro de
  contato (Fase 3); nas primeiras semanas os números refletem a adoção.
- Criação: script idempotente `scripts/ops/seed-metas-exemplo.mjs` (cria
  só se não existir meta com o mesmo nome), autor = usuário interno
  `claude-bot@ktask.local`. Rodar em produção é escrita no banco → **pedir
  autorização no momento**.

---

## 13. Perguntas e decisões

### 13.1 Já respondido pelo áudio + dados de produção (vira decisão padrão)

| Pergunta original                                                                                                              | Resposta                                                                                                                           | Fonte           |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Giovanni acessa o KTask?                                                                                                       | Não tem conta; recebe os relatórios pelo Lucas → filtros na URL (link compartilhável) e, depois, exportação ganham peso            | DB (Membership) |
| Quadro comercial principal (não precisa perguntar — o relatório funciona em todos os fluxos; o Lucas escolhe o que configurar) | "Relações Institucionais Kharis" (158 dos 160 movimentos desde julho são do Fábio; é o exemplo da spec)                            | DB + spec §3    |
| Como os contatos são registrados hoje                                                                                          | Comentários com @lucas.santiago em texto livre                                                                                     | DB (Comment)    |
| Há histórico pra aplicar retroativamente?                                                                                      | Sim, movimentações desde 11/05/2026 → padrão: na 1ª configuração, aplicar desde o início do histórico (o Lucas pode mudar na tela) | DB              |
| Finalização: cards distintos ou eventos?                                                                                       | Decisão técnica: KPI = cards distintos; drill-down mostra todos os eventos                                                         | —               |
| O que conta como "ação"                                                                                                        | Decisão técnica: lista 6.5; arquivar não conta, apontar horas conta                                                                | —               |
| Reuniões agendadas                                                                                                             | Decisão técnica: duas métricas separadas — "entradas na coluna configurada como reunião agendada" e "atividade Reunião registrada" | —               |

### 13.2 Perguntas ao Lucas — respondidas (via Nicchon, 06/10/2026)

- **P1 — Meta:** criar metas de exemplo plausíveis; o Lucas ajusta depois
  (seção 12.1).
- **P2 — Registro de contato:** sim, o Fábio vai usar os botões na caixa
  de comentário (D9).

### 13.3 Decisões do Nicchon (06/10/2026)

- Acesso: só Dono e Admin; Lucas é Admin, sem nível novo (D6).
- Configuração numa tela central; Lucas escolhe a coluna de finalizado de
  cada fluxo, sem mexer no quadro (D8).
- Registro de contato na caixa de comentário, ligado por fluxo, desligado
  por padrão (D9).
- Metas configuráveis pelo Lucas, fase própria (D10).
- Perguntas sobre quais quadros e sobre as colunas do Relações
  Institucionais saem: o Lucas resolve configurando.

## 14. Critérios de aceite (spec §19 + integridade)

Primeira entrega (Fases 1 + 2):

- [ ] 1. Filtrar por período, quadro e colaborador (+ área e cliente).
- [ ] 2. Exibir cards trabalhados, ações, movimentações, avanços, retrocessos
     e finalizações.
- [ ] 3. Todo indicador abre o detalhamento dos eventos que o originaram.
- [ ] 4. Histórico cronológico das ações de um colaborador.
- [ ] 5. Movimentação manual diferenciada de automação/sistema/aprovação;
     automação **não** soma para o colaborador nem para o criador da automação.
- [ ] 6. Configuração gerencial de colunas e transições por quadro, versionada,
     sem alterar o board.
- [ ] 7. Funciona com quadros de fluxos e nomes diferentes; quadro sem config
     mostra métricas factuais + aviso "Classificação de progresso não
     configurada para este quadro."
- [ ] 8. (Fase 3) No Comercial, registrar contato sem mudar de coluna, pela
     caixa de comentário; fluxos com o recurso desligado não mudam nada.
- [ ] 9. Nenhum KPI já existente duplicado; as 4 abas atuais de Indicadores
     exibem os mesmos números antes e depois do deploy; nenhuma tela
     existente alterada além da aba nova no layout de Indicadores.
- [ ] 9b. Aba e configuração visíveis só pra Dono/Admin (API retorna 403
      pros demais).
- [ ] 9c. Coluna de finalizado escolhida no relatório não altera a coluna
      "Finalizado" operacional do quadro.
- [ ] 9d. (Fase 4) Metas: criar, ativar/desativar e mudar alvo; período
      passado medido contra o alvo da época.
- [ ] 10. Tabela de verdade da spec §5.4 passa como teste unitário.
- [ ] 11. Editar configuração não altera números de períodos anteriores
      (salvo retroatividade explícita registrada).
- [ ] 12. Dias agrupados no fuso da organização.
- [ ] 13. typecheck + lint + testes verdes; smoke manual da seção 9 ok.
- [ ] 14. Docs atualizados: este arquivo, `docs/adr/0007-*.md`,
      `docs/data-model/`, `docs/architecture.md` (módulo `performance`),
      Central de Ajuda, `checklist.md`.

---

## 15. Documentação a produzir junto

- `docs/adr/0007-desempenho-fatos-imutaveis-config-versionada.md` — decisões
  D1/D2/D4/D5 (Status / Context / Decision / Consequences).
- `docs/data-model/` — `ActivityOrigin`, `BoardPerformanceConfig(+Version)`,
  `CardInteraction` nos diagramas Mermaid.
- `docs/architecture.md` — módulo `performance` e a regra "toda Activity
  não-humana deve setar `origin`".
- Central de Ajuda (`/ajuda`) — 2 artigos (Fase 2) + 1 (Fase 3).
