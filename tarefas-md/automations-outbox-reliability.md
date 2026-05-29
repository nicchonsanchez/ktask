# Automations: Outbox + retry + observabilidade

> Status: **APROVADO (2026-05-29)** — pronto pra implementar em fases.

## Problema

Engine de automações hoje é fire-and-forget em-processo (EventEmitter2,
`@OnEvent({ async: true })`). Gap entre `events.emit(CARD_MOVED)` e
`AutomationsEngine.onCardMoved` não é persistido — se o container reinicia,
crasha, ou exceção é engolida pelo handler async, o evento some sem
rastro e a automação não roda.

Sintoma reportado pelo user: mover card pra coluna X às vezes não dispara
a automação configurada (ex: criar checklist no card).

## Escopo

### Dentro

- Persistir todo trigger de automação numa tabela `AutomationOutbox` na
  mesma transação que altera o card (move, create, approval decidida,
  checklist done, etc).
- Worker BullMQ consumindo o outbox em loop, com retry+backoff.
- Dead-letter (`AutomationFailure`) com payload pra reprocessar.
- Sweeper de `AutomationRun` travados em `RUNNING`.
- Painel admin `/admin/automacoes/saude` com 3 widgets + reprocessar.
- Alerta WhatsApp pro operador (Nicchon 7301) quando >5 falhas/hora.

### Fora

- Refatorar handlers existentes (mantém os 17 handlers como estão).
- Mudar trigger semântico (CARD_ENTERED, CARD_LEFT continuam idênticos).
- UI de configuração de automação (já existe).

## Arquitetura

```
move card
  └─> [TXN] Card.update + AutomationOutbox INSERT [COMMIT]
              │
              ↓
       Worker BullMQ (poller 1s OU enfileira na hora do INSERT)
              │
              ↓
       executeAutomation()
        ├─ SUCCESS → outbox.processedAt = now, run.status = SUCCESS
        ├─ FAIL retryable → re-enqueue (30s / 2min / 10min)
        └─ FAIL final (3 tentativas) → AutomationFailure + alerta

       Cron sweeper (5min)
        └─ RUNNING há >5min → marca ABANDONED → reempurra pro outbox

       Painel /admin/automacoes/saude
        └─ Falhas / RUNNING / backlog + botão reprocessar
```

## Modelo de dados (Prisma)

```prisma
model AutomationOutbox {
  id             String   @id @default(cuid())
  organizationId String
  // contexto do trigger pra reprocessar sem depender do estado atual
  trigger        AutomationTrigger
  cardId         String
  // escopo do trigger (qual lista/checklist/item disparou)
  scopeKind      String   // 'list' | 'checklist' | 'checklistItem'
  scopeId        String
  chainDepth     Int      @default(0)
  attempts       Int      @default(0)
  // null = pendente; setado = processado com sucesso
  processedAt    DateTime?
  nextAttemptAt  DateTime @default(now())
  lastError      String?
  createdAt      DateTime @default(now())

  @@index([processedAt, nextAttemptAt]) // worker poller
  @@index([organizationId, createdAt])  // painel admin
}

model AutomationFailure {
  id             String   @id @default(cuid())
  organizationId String
  automationId   String
  cardId         String
  runId          String?  // FK pro AutomationRun (pode ser null se nem chegou a criar)
  trigger        AutomationTrigger
  actionType     AutomationActionType
  attempts       Int
  errorMessage   String   @db.Text
  errorStack     String?  @db.Text
  // snapshot do payload do outbox pra reprocessar manualmente
  payloadSnapshot Json
  createdAt      DateTime @default(now())
  resolvedAt     DateTime?
  resolvedById   String?

  automation Automation @relation(fields: [automationId], references: [id], onDelete: Cascade)

  @@index([organizationId, resolvedAt, createdAt])
}
```

Enum novo opcional pra `AutomationRun.status`:

```prisma
enum AutomationRunStatus {
  RUNNING
  SUCCESS
  FAILED
  SKIPPED
  ABANDONED  // <- novo: sweeper marcou após >5min em RUNNING
}
```

## Etapas

### Fase 1 — Outbox + worker (núcleo)

1. **Migration**: cria `AutomationOutbox` + `AutomationFailure` + adiciona
   `ABANDONED` no enum `AutomationRunStatus`.
2. **Helper `enqueueAutomationTrigger`**: função em `automations.outbox.ts`
   que faz `prisma.automationOutbox.create` — deve ser chamada **dentro
   da mesma transação** que altera o card. Aceita um `Prisma.TransactionClient`
   opcional pra usar `tx` em vez do client global.
3. **Refatorar callers** de `events.emit(CARD_MOVED)` etc:
   - `cards.service.ts` (move legado + move multi-fluxo)
   - `cards.service.ts` create + `createCardWithPresence` helper
   - `approvals.service.ts` (APPROVAL_DECIDED)
   - `checklists.service.ts` (checklist.item.done, checklist.completed)
   - Substituir `events.emit(...)` por `enqueueAutomationTrigger(...)` na
     mesma TXN. Manter `events.emit` em paralelo só pro RealtimeGateway
     (que NÃO é automação — é socket pro frontend).
4. **Worker BullMQ** (`automations.worker.ts`):
   - Nova fila `automations-outbox`.
   - Job processor pega `AutomationOutbox where processedAt is null and nextAttemptAt <= now`.
   - Chama `engine.dispatchTriggerFromOutbox(row)` (novo método que envolve
     `dispatchTrigger` mas atualiza outbox).
   - Em sucesso: `processedAt = now`.
   - Em erro: incrementa `attempts`, calcula `nextAttemptAt` (30s/2min/10min),
     grava `lastError`. Se `attempts >= 3`, cria `AutomationFailure` + marca
     `processedAt = now` (pra sair do polling).
5. **Trigger do worker**: 2 caminhos complementares —
   - **Push**: o `enqueueAutomationTrigger` também enfileira um job no BullMQ
     com `outboxId` no payload (executa logo, sem esperar polling).
   - **Pull**: cron BullMQ a cada 10s busca outbox pendente que não foi
     processado em 30s (cobre push perdido — ex: Redis caiu na hora do
     enqueue, mas a row tá no Postgres).
6. **Testes**: spec que simula erro retryable + crash de processo
   (mockando worker) + confirma reprocessamento.

### Fase 2 — Sweeper + dead-letter

7. **Sweeper job** (`automations.sweeper.ts`): cron BullMQ a cada 5min.
   - Query: `AutomationRun where status = RUNNING and startedAt < now - 5min`
   - Pra cada: marca `ABANDONED` + cria entrada no outbox pra reprocessar
     (mesmo trigger, mesmo card) + grava motivo no `run.error`.
8. **`AutomationFailure` populada automaticamente** no path do worker (já
   está na fase 1). Aqui só validar que o snapshot do payload bate com o
   que o worker precisa pra rodar de novo.

### Fase 3 — Painel admin

9. **Backend** — endpoints em `management.controller.ts` (já é o módulo
   dos gestores, faz sentido viver lá ou criar `admin.controller.ts`):
   - `GET /admin/automations/health` → contadores (falhas 7d, RUNNING
     travados, outbox backlog).
   - `GET /admin/automations/failures` → lista paginada.
   - `POST /admin/automations/failures/:id/reprocess` → reempurra pro outbox.
10. **Frontend** — `/admin/automacoes/saude` (nova rota):
    - 3 cards (Falhas / Travados / Backlog) com números.
    - Tabela de falhas recentes com filtro por org/board + botão "Reprocessar".
    - Tabela de RUNNING travados (manual trigger sweeper).

### Fase 4 — Alerta WhatsApp

11. **Detector** — no fim do `worker.process`, depois de gravar
    `AutomationFailure`: query `count(*) from AutomationFailure where
createdAt > now - 1h and organizationId = X`. Se > 5 E último alerta
    pra essa org foi há mais de 1h:
    - Envia mensagem pelo `WhatsAppHelper` pro `OPERATOR_PHONE` (já no .env).
    - Marca `lastAlertAt` em algum lugar — sugiro `OrganizationSettings`
      ou tabela simples `AutomationAlertState(organizationId, lastAlertAt)`.
12. **Mensagem**: link pro painel admin + count + top 3 automation IDs
    afetadas.

## Critérios de aceite

- [ ] **Fase 1**: mover card 1000x em loop com worker derrubado no meio —
      após reerguer, todas as automações que deveriam rodar rodaram (zero
      perda).
- [ ] **Fase 1**: simular exceção em handler INSERT_CHECKLIST_ITEMS — após
      3 tentativas, entrada em `AutomationFailure` com `payloadSnapshot`
      válido pra reprocessar.
- [ ] **Fase 2**: matar API container durante execução de automação —
      sweeper marca RUN como ABANDONED em até 5min e reprocessa via outbox.
- [ ] **Fase 3**: gestor abre `/admin/automacoes/saude`, vê falhas dos
      últimos 7 dias, clica reprocessar, run roda de novo com sucesso.
- [ ] **Fase 4**: forçar 6 falhas seguidas numa org → operador recebe
      WhatsApp 7301 com link do painel.
- [ ] Performance: backlog do outbox nunca cresce em uso normal (sempre
      <10 rows pendentes). Validar com query em prod 1 semana após deploy.

## Riscos / decisões

- **Risco: TXN com outbox-INSERT atrasa o move?** Inserir 1 row a mais na
  mesma TXN é negligível (<1ms). Validar com EXPLAIN, mas não bloqueante.
- **Risco: BullMQ Redis cair**. Mitigação: o polling de 10s lê direto do
  Postgres, então mesmo com Redis fora os jobs são executados (só com
  até 10s de atraso). Sem Redis, o "push" perde, mas o "pull" salva.
- **Risco: worker em escala (multi-instância)**. BullMQ já cuida do
  locking entre workers. Pro polling cron, usar `SELECT ... FOR UPDATE
SKIP LOCKED` na query do outbox pra evitar dupla execução.
- **Decisão: por que `AutomationFailure` separado de `AutomationRun`?**
  Run é o histórico de cada tentativa (3 tentativas = 3 runs FAILED).
  Failure é o "incidente" consolidado pra UI e reprocessamento — 1 entry
  por evento que falhou definitivamente. Separar facilita o painel
  ("ver incidentes não-resolvidos" vs "ver histórico completo").
- **Decisão: outbox ou event sourcing puro?** Outbox é mais simples e
  cobre 100% do problema atual. Event sourcing seria over-engineering
  pra escala atual (centenas de automações/dia).
- **Decisão: deletar entradas do outbox processadas?** Cron de retenção
  (30 dias) pra não inchar a tabela. Outras informações ficam em
  `AutomationRun` que já é o histórico canônico.
- **Decisão: alerta WhatsApp só pro operador, não pra gestores das orgs**.
  Outro tipo de alerta (notificação in-app pro OWNER da org) pode ser
  follow-up. Por enquanto só Nicchon recebe — é quem opera o sistema.

## Estimativa

- Fase 1 (Outbox + worker): ~1 dia
- Fase 2 (Sweeper + dead-letter): ~3h
- Fase 3 (Painel admin): ~3h
- Fase 4 (Alerta WhatsApp): ~1h

**Total: ~2 dias úteis** de implementação focada. Sugiro entregar em PRs
separados por fase pra revisar incrementalmente.

## Ordem de implementação

Fase 1 isolada → deploy → observar 2-3 dias → Fases 2-4 num bloco.
Não tem dependência forte; o que importa é que Fase 1 elimina a perda de
evento (problema principal). Fases 2-4 são camadas de observabilidade e
auto-recuperação em cima de um sistema já estável.
