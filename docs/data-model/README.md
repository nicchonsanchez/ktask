# Modelo de dados

Documentação do schema Prisma do KTask: [apps/api/prisma/schema.prisma](../../apps/api/prisma/schema.prisma) é a fonte de verdade. Este diretório descreve o modelo num nível confortável pra um dev novo, pra revisão de produto, e pra DBA externo eventual.

Audiência:

- **Dev novo**: entender as entidades, FKs e o porquê das decisões não-óbvias.
- **Produto**: avaliar complexidade e ler glossário.
- **DBA externo**: enxergar PKs, FKs, uniques e indexes compostos sem ter que ler Prisma.

Conteúdo:

- [er-diagram.md](er-diagram.md) — diagrama Mermaid geral, 8 modelos centrais.
- [er-by-area.md](er-by-area.md) — 6 sub-diagramas por subsistema, mais texto explicativo das decisões críticas.

## Visão geral

- Banco: PostgreSQL 16.
- ORM: Prisma 6 (schema-first, migrate deploy).
- Schema único em `apps/api/prisma/schema.prisma` (~1.260 linhas).
- 36 modelos, 18 enums, 70 `@@index` + 5 `@@unique` compostos declarados + 1 partial unique via SQL puro (`List_boardId_isFinalList_unique`).
- Multi-tenant via `organizationId` em quase toda tabela do domínio (cascade `onDelete`). Exceções deliberadas: `ServiceProvider` é global (federação IdP gerida por admin de plataforma).
- IDs: CUID (`@id @default(cuid())`), exceto chaves compostas em tabelas N:N.

## Convenções universais

- **Timestamps**: todo modelo tem `createdAt DateTime @default(now())` e `updatedAt DateTime @updatedAt` (omitidos dos diagramas pra reduzir ruído).
- **Soft-delete**: `deletedAt DateTime?` em models que precisam preservar histórico — `User`, `Organization`, `Contact`, `Comment` (`Card.isArchived` é arquivamento, não soft-delete).
- **Tenant-aware**: tabelas do domínio têm `organizationId` (FK pra `Organization` com `onDelete: Cascade`). Apagar a org cascateia tudo.
- **IDs**: CUID via `@id @default(cuid())`. Tabelas join puras (sem id próprio) usam PK composta — ver lista abaixo.
- **Posições**: `position` é `Float` (não `Int`) — permite inserções entre cards/items sem reindexar a lista inteira (média de vizinhos).
- **JSON estruturado**: `description` (Tiptap), `Comment.body` (Tiptap), `Activity.payload`, `Automation.triggerConfig/actionConfig/conditions`, `ChecklistItem.recurrence`, `ChecklistTemplate.items` (array<string>).
- **Enums Postgres nativos**: 18 enums no schema (não strings com check constraint).

### PKs compostas (tabelas N:N puras)

- `BoardFavorite (userId, boardId)`
- `BoardMember (boardId, userId)` — tem id próprio + `@@unique` (ver tabela na seção)
- `CardPresence (cardId, boardId)`
- `CardMember (cardId, userId)`
- `CardLabel (cardId, labelId)`
- `CardContact (cardId, contactId)`
- `CardVisit (userId, cardId)`

### Uniques compostos relevantes

- `Card @@unique([organizationId, shortCode])` — `#412` é único por org.
- `Membership @@unique([userId, organizationId])`.
- `BoardMember @@unique([boardId, userId])` (tem id próprio mas é efetivamente N:N).
- `OrgImportMapping @@unique([organizationId, kind, sourceName])`.
- `List` tem partial unique custom via migration `20260508120000_unique_final_list_per_board` — não aparece no `@@unique` do schema (Prisma não suporta partial unique nativo).

## Subsistemas

| #   | Subsistema                       | Modelos                                                                                                                  | Diagrama                                                  |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| 1   | Tenancy                          | `Organization`, `User`, `Membership`, `Invitation`, `Session`, `PasswordResetToken`                                      | [Tenancy](er-by-area.md#tenancy)                          |
| 2   | Kanban                           | `Board`, `List`, `Card`, `CardPresence`, `BoardMember`, `BoardFavorite`, `CardMember`, `Label`, `CardLabel`, `CardVisit` | [Kanban](er-by-area.md#kanban)                            |
| 3   | Conteúdo do card                 | `Checklist`, `ChecklistItem`, `ChecklistTemplate`, `Comment`, `CommentReaction`, `Attachment`, `TimeEntry`, `Task`       | [Conteúdo](er-by-area.md#conteudo-do-card)                |
| 4   | Aprovações                       | `CardApproval`, `CardApprovalReviewer`                                                                                   | [Aprovações](er-by-area.md#aprovacoes)                    |
| 5   | CRM                              | `Contact`, `CardContact`                                                                                                 | [CRM](er-by-area.md#crm)                                  |
| 6   | Automação, auditoria, mensageria | `Automation`, `AutomationRun`, `Activity`, `Notification`, `MessageTemplate`, `PushSubscription`                         | [Automação](er-by-area.md#automacao-auditoria-mensageria) |
| 7   | IDP / Federação                  | `ServiceProvider`                                                                                                        | [IDP](er-by-area.md#idp-federacao)                        |
| —   | Operacional                      | `OrgImportMapping`                                                                                                       | [Operacional](er-by-area.md#operacional) (só texto)       |

## Decisões de modelagem importantes

### Multi-fluxo via CardPresence

`Card` carrega os dados do cartão; `CardPresence` registra **onde ele aparece**. Um card pode estar em N boards simultaneamente, cada presença com sua `(listId, position, completedAt, removedAt)` independente. PK composta `(cardId, boardId)` garante "no máximo uma lista por board".

Durante a transição, `Card.boardId` e `Card.listId` ainda existem como **presença primária** — leituras antigas não quebraram. A presença com `boardId == Card.boardId` é a "primária". Plano completo em [tarefas-md/13-cards-multi-fluxo.md](../../tarefas-md/13-cards-multi-fluxo.md).

### CardStatus ortogonal à coluna

`CardStatus` (`ACTIVE | COMPLETED | WAITING | CANCELED`) é independente da `listId`. Card em coluna "Finalizado" (`List.isFinalList`) pode estar `ACTIVE`, e card em qualquer coluna pode estar `COMPLETED`. Espelha o modelo do Ummense. `completedAt` é setado quando o status vira `COMPLETED`.

### Contact ↔ User (1:1 opcional)

`Contact.userId` é nullable e único. Quando setado, o CRM trata `name`/`email`/`phone`/`avatar` como read-only — fonte autoritativa é o `User`. Cada `User` tem no máximo 1 `Contact` vinculado. Cross-reference por email/phone com outros Users da Org é feito on-demand no frontend (sem persistir FK), pra manter entidades independentes.

Ver [tarefas-md/50-contact-user-vinculo.md](../../tarefas-md/50-contact-user-vinculo.md).

### Família de cards

`Card.parentCardId` é self-FK opcional (`onDelete: SetNull`) com relation name `"Subtasks"`. Subtarefas mantém o pai mesmo se ele sumir (vira `null`). Ver [tarefas-md/17-familia-cards.md](../../tarefas-md/17-familia-cards.md).

### Privacidade de card

`CardPrivacy` (`PUBLIC` | `TEAM_ONLY`): TEAM_ONLY restringe a visão pro `leadId` + membros em `CardMember`. OWNER/ADMIN/GESTOR da Org bypassam. V1 propositalmente com 2 níveis — V2 pode expandir pra 4 níveis do Ummense (TEAM_VIEW, LEAD_ONLY) se houver demanda.

### Aprovações com undo

`CardApproval` é "primeiro a votar ganha" entre `CardApprovalReviewer`s. Decisor pode reverter dentro de 5min (ou OWNER/ADMIN/GESTOR a qualquer tempo, se nenhuma ação humana posterior bloqueou). `sideEffects` (Json) registra o que foi feito pra rollback.

Bloqueio anti-pisada usa `Activity.automationRunId IS NULL` — distingue ação humana (bloqueia undo) de ação de automação encadeada (não bloqueia). Daí a importância do `automationRunId` no `Activity` (subsistema 6).

### Reviewer interno vs externo (XOR)

`CardApprovalReviewer` tem `userId` OU `phone + externalName` — XOR validado no service. `accessToken` único sempre presente: mesmo reviewer interno pode aprovar via link no WhatsApp/email sem login (rota pública `/aprovar/:token`).

### Multi-fluxo no `position` Float

`position Float` em `List`/`Card`/`CardPresence`/`Checklist`/`ChecklistItem` permite inserir entre dois itens calculando a média (`(a+b)/2`) sem reindexar a lista inteira. Trade-off: se inserir muitas vezes no mesmo intervalo, eventualmente perde precisão e precisa de reindex periódico (ainda não implementado — sem incidente até hoje).

### Soft-delete vs hard-delete vs archive

Três conceitos distintos coexistem:

- **Hard-delete (cascade)**: deletar `Organization` apaga tudo. Deletar `User` cascateia em `Membership`, `Session`, etc.
- **Soft-delete** (`deletedAt`): `User`, `Contact`, `Comment`, `Organization`. Linha continua no banco; filtragem aplicada no service. Permite recuperar histórico.
- **Archive** (`isArchived`): `Board`, `List`, `Card`. Esconde da UI ativa mas mantém referências vivas e relacionamentos. Reversível por toggle.

### `OrgImportMapping` (importer Ummense)

Memória persistida do wizard de mapeamento: `(orgId, kind, sourceName) → targetId | null`. Reaplica decisões em próximos imports sem reperguntar. `kind` é string solta (`'user'`, `'list'`) — não enum — pra permitir extensão futura sem migration. `targetId = null` = "Ignorar este nome".

### `ServiceProvider` (federação IdP)

Tabela **global** (sem `organizationId`) gerida por admin de plataforma. Cada row é um SP externo (ex: Ogma) que recebe webhooks de eventos sensíveis do KTask (senha alterada, conta desativada, email alterado). `secretHash` armazena SHA-256 do secret HMAC — plaintext mostrado 1 vez ao admin na criação. `escopo` é `String[]` listando eventos assinados.

## Riscos conhecidos e dívida técnica

Inventário factual do que existe hoje no banco que **não é bug** mas merece atenção. Ordenado por urgência prática.

### Hot tables sem estratégia de archive

`Activity`, `AutomationRun`, `Notification` e `TimeEntry` crescem indefinidamente. Sem partição nem soft-delete + cold storage, custos de backup, VACUUM e queries com `ORDER BY createdAt DESC LIMIT` vão degradar passados ~12 meses de uso intenso.

- **Quando endereçar:** após 6m de produção (medir crescimento real antes de decidir entre archive table ou partição por `organizationId`).
- **Mitigação interina:** indexes compostos atuais (`@@index([userId, isRead, createdAt])` no Notification, etc.) seguram bem até o primeiro milhão de rows.

### JSON opaco com múltiplos shapes

Campos `Json` que carregam shapes diferentes dependendo de outro campo discriminador:

| Campo                                              | Discriminador            | Shapes distintos                        |
| -------------------------------------------------- | ------------------------ | --------------------------------------- |
| `Activity.payload`                                 | `Activity.type`          | 55 (1 por `ActivityType`)               |
| `Automation.actionConfig` + `triggerConfig`        | `actionType` + `trigger` | 19 + 8                                  |
| `CardApproval.sideEffects`, `*Targets`, `*Actions` | — (livre)                | múltiplos                               |
| `ChecklistItem.recurrence`, `Task.recurrence`      | `recurrence.freq`        | 4 (`DAILY`/`WEEKLY`/`MONTHLY`/`YEARLY`) |

**Consequência:** queries analíticas tipo "quantas automações do tipo X temos rodando" exigem `actionConfig::jsonb->>'campo'` frágil. Refactor de shape obriga migration manual.

**Trade-off aceito:** flexibilidade > query-ability. Validação fica 100% no service.

### Sem reindex job pra `position Float`

5 modelos usam `position Float` (`List`, `Card`, `CardPresence`, `Checklist`, `ChecklistItem`, `Task`). Inserir entre dois vizinhos calcula `(a+b)/2`. Após 50+ inserções consecutivas no mesmo intervalo, perda de precisão IEEE754 vira posição "grudada" e ordenação fica caótica.

**Mitigação atual:** nenhuma. Sem incidente reportado.
**Plano sugerido:** job semanal de reindex que normaliza `position` em `0, 1000, 2000, ...` por escopo (lista/checklist/board).

### Constraints só no service (não no banco)

Casos onde o schema permite estado inválido e a validação vive 100% no service — se algum service for esquecido, vaza:

- **`Contact.parentId`** (self-FK): só `COMPANY` pode ter filhos `PERSON`. Sem CHECK constraint, hierarquia pode ser quebrada.
- **`User.phone` / `Invitation.phone` / `CardApprovalReviewer.phone`**: comentário diz "E.164 sem +", mas é `String` livre. Pode entrar `+5531999999999` ou `(31) 9 9999-9999`.
- **`CardApprovalReviewer`** XOR interno/externo: `userId` OU `phone+externalName`, nunca os dois. Service valida.
- **`MessageTemplate.body`**: sem `max length`. Pode receber 100KB e estourar limite do WhatsApp silenciosamente.

**Quando endereçar:** ao primeiro incidente. CHECK constraint Postgres é barato de adicionar via migration.

### Soft-delete vs archive — convivência confusa

Três conceitos no schema:

| Conceito              | Como detecta            | Models                                       |
| --------------------- | ----------------------- | -------------------------------------------- |
| Soft-delete           | `deletedAt IS NOT NULL` | `User`, `Organization`, `Contact`, `Comment` |
| Archive               | `isArchived = true`     | `Board`, `List`, `Card`                      |
| Hard-delete + cascade | linha some              | resto                                        |

Inconsistência: por que `Comment` é soft-delete mas `Card` é archive? Decisão histórica (Comment precisa preservar resposta a comentário deletado; Card pode voltar do arquivo). Documentar para não virar dúvida recorrente. Antes de adicionar `deletedAt` em novo model, decidir conscientemente qual padrão usar.

### `ServiceProvider` global é proposital

Não tem `organizationId` — é gerido por admin de plataforma (`User.isPlatformAdmin`). Se um dia federação virar self-service por Org, adicionar FK com `onDelete: Cascade` + index. Hoje é mono-tenant aceito.

### Indexes que valem revisar quando crescer

Os índices atuais cobrem o caminho quente bem (kanban drag-drop, sino de notificação, home pessoal). Esses ainda **não** estão sob pressão mas merecem ficar no radar:

- `Activity` sem index em `(organizationId, createdAt DESC)` — usado em auditoria e timeline geral.
- `AutomationRun` sem index composto `(automationId, status, startedAt)` — query do painel de execuções.
- `CardVisit` sem TTL ou archive — cresce 1 row por visita.

Medir antes de adicionar — `EXPLAIN ANALYZE` decide.

## Diagramas

- [Diagrama geral simplificado](er-diagram.md) — 8 modelos centrais.
- [Diagramas por subsistema](er-by-area.md) — 6 sub-diagramas detalhados.
