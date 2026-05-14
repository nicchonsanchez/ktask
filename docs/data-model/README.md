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
- Schema único em `apps/api/prisma/schema.prisma`.
- 34 modelos, 18 enums.
- Multi-tenant via `organizationId` em quase toda tabela do domínio (cascade `onDelete`).
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
| 3   | Conteúdo do card                 | `Checklist`, `ChecklistItem`, `ChecklistTemplate`, `Comment`, `Attachment`, `TimeEntry`, `Task`                          | [Conteúdo](er-by-area.md#conteudo-do-card)                |
| 4   | Aprovações                       | `CardApproval`, `CardApprovalReviewer`                                                                                   | [Aprovações](er-by-area.md#aprovacoes)                    |
| 5   | CRM                              | `Contact`, `CardContact`                                                                                                 | [CRM](er-by-area.md#crm)                                  |
| 6   | Automação, auditoria, mensageria | `Automation`, `AutomationRun`, `Activity`, `Notification`, `MessageTemplate`, `PushSubscription`                         | [Automação](er-by-area.md#automacao-auditoria-mensageria) |
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

## Diagramas

- [Diagrama geral simplificado](er-diagram.md) — 8 modelos centrais.
- [Diagramas por subsistema](er-by-area.md) — 6 sub-diagramas detalhados.
