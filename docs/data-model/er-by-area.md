# Modelo de dados por subsistema

Seis subsistemas. Diagrama geral em [er-diagram.md](er-diagram.md). Convenções universais (timestamps, soft-delete, cascade) em [README.md](README.md).

Sumário:

1. [Tenancy](#tenancy) — `Organization`, `User`, `Membership`, `Invitation`, `Session`, `PasswordResetToken`
2. [Kanban](#kanban) — `Board`, `List`, `Card`, `CardPresence`, `BoardMember`, `BoardFavorite`, `CardMember`, `Label`, `CardLabel`, `CardVisit`
3. [Conteúdo do card](#conteudo-do-card) — `Checklist`, `ChecklistItem`, `ChecklistTemplate`, `Comment`, `Attachment`, `TimeEntry`, `Task`
4. [Aprovações](#aprovacoes) — `CardApproval`, `CardApprovalReviewer`
5. [CRM](#crm) — `Contact`, `CardContact`
6. [Automação, auditoria e mensageria](#automacao-auditoria-mensageria) — `Automation`, `AutomationRun`, `Activity`, `Notification`, `MessageTemplate`, `PushSubscription`

`OrgImportMapping` é descrito em texto na seção [Operacional](#operacional).

---

## Tenancy {#tenancy}

Modelos: `Organization`, `User`, `Membership`, `Invitation`, `Session`, `PasswordResetToken`.

Dividido em dois aspectos:

- **1.1 Identidade**: Org, User, Membership, Invitation — quem existe e em qual org.
- **1.2 Auth artifacts**: Session, PasswordResetToken — artefatos efêmeros de autenticação (mesmo arquivo, separados pra leitura).

Decisões críticas:

- `Membership` é a tabela "user pertence a org" — N:N com `id` próprio + `@@unique([userId, organizationId])`. `role` é `OrgRole` (OWNER, ADMIN, GESTOR, MEMBER, GUEST).
- `Invitation.token` é único e curto-circuita o flow de cadastro (signup via convite + envio de email/WhatsApp).
- `Session` é authoritative pra refresh: `rememberMe` controla TTL longo (90d) vs curto (1d). `tokenHash` único.
- `PasswordResetToken` é single-use (`usedAt`), TTL 1h, raw vai pro email, hash sha256 no DB.
- `User.suspendedAt` é distinto de `deletedAt`: suspensão bloqueia login mas preserva dados (admin pode reverter).
- `User.pendingEmail` permite troca de email confirmada pelo próprio user (anti-sequestro).

### 1.1 Identidade

```mermaid
erDiagram
    Organization ||--o{ Membership : "tem"
    User         ||--o{ Membership : "pertence a"
    Organization ||--o{ Invitation : "envia"
    User         ||--o{ Invitation : "convidou (invitedBy)"

    Organization {
        string id PK
        string slug UK
        string name
        enum   plan
        string timezone
        int    cardSequence
    }
    User {
        string id PK
        string email UK
        string name
        string phone "nullable"
        boolean twoFactorEnabled
        datetime suspendedAt "nullable"
        string  suspendedReason "nullable"
        string  pendingEmail "nullable"
        datetime deletedAt "nullable"
    }
    Membership {
        string id PK
        string userId FK
        string organizationId FK
        enum   role "OrgRole"
    }
    Invitation {
        string id PK
        string organizationId FK
        string invitedById FK
        string email
        string phone "nullable"
        enum   role
        string token UK
        datetime expiresAt
        datetime acceptedAt "nullable"
    }
```

### 1.2 Auth artifacts

```mermaid
erDiagram
    User ||--o{ Session            : "abre"
    User ||--o{ PasswordResetToken : "solicita"

    Session {
        string id PK
        string userId FK
        string tokenHash UK
        string userAgent "nullable"
        string ip "nullable"
        boolean rememberMe
        datetime expiresAt
        datetime revokedAt "nullable"
    }
    PasswordResetToken {
        string id PK
        string userId FK
        string tokenHash UK
        datetime expiresAt
        datetime usedAt "nullable"
        string requestIp "nullable"
        string userAgent "nullable"
    }
```

Indexes/uniques relevantes:

- `Membership @@unique([userId, organizationId])`
- `Invitation.token UK`, `Session.tokenHash UK`, `PasswordResetToken.tokenHash UK`
- `Invitation @@index([expiresAt])` e `Session @@index([expiresAt])` — usados por jobs de cleanup.

---

## Kanban {#kanban}

Modelos: `Board`, `List`, `Card`, `CardPresence`, `BoardMember`, `BoardFavorite`, `CardMember`, `Label`, `CardLabel`, `CardVisit`.

Dividido em dois sub-diagramas:

- **2.1 Estrutura**: hierarquia Board → List → Card + presença multi-fluxo.
- **2.2 Equipe e labels**: associações N:N do card com User, Label, e tracking `CardVisit`.

Decisões críticas:

- **Card multi-fluxo** (`CardPresence`): card existe em N boards com `(boardId, listId, position, completedAt)` independentes. PK composta `(cardId, boardId)` garante "no máximo uma lista por board". Soft-delete via `removedAt`. Ver `tarefas-md/13-cards-multi-fluxo.md`.
- **`position` é Float** (não Int) — permite inserções entre cards sem reindexar tudo (média de vizinhos). Vale pra `List.position`, `Card.position`, `CardPresence.position`, `Checklist.position`, `ChecklistItem.position`.
- **`Card.boardId`/`listId` legacy**: durante a transição pra multi-fluxo, os FKs diretos no Card seguem vivos como "presença primária" pra leituras existentes não quebrarem.
- **`isFinalList` (max 1 por board)**: enforced por partial unique index custom criado na migration `20260508120000_unique_final_list_per_board` — não aparece no `@@unique` do schema.
- **`isBacklog` (min 1 por board)**: garantido em `ListsService` (ensureBacklogList + bloqueio no archive da última). Múltiplas backlog permitidas.
- **`Label.boardId` nullable**: label de board (atual) ou label global da org (preparado, não usado).
- **`CardVisit @@id([userId, cardId])`**: 1 row por (user, card), `visitedAt` é `@updatedAt` — upsert em vez de insert pra evitar bloat. Alimenta "Cards recentes" da home.

### 2.1 Estrutura

```mermaid
erDiagram
    Organization ||--o{ Board         : "owns"
    Organization ||--o{ List          : "owns (denorm)"
    Board        ||--o{ List          : "tem colunas"
    Organization ||--o{ Card          : "scoped"
    Board        ||--o{ Card          : "legacy primary"
    List         ||--o{ Card          : "legacy primary"
    User         ||--o{ Card          : "createdBy / lead / completedBy"
    Card         |o--o{ Card          : "parent / subtasks"
    Card         ||--o{ CardPresence  : "appears in"
    Board        ||--o{ CardPresence  : "hosts"
    List         ||--o{ CardPresence  : "currently in"
    Board        ||--o{ BoardMember   : "membros"
    User         ||--o{ BoardMember   : "participa de"
    Board        ||--o{ BoardFavorite : "favoritado por"
    User         ||--o{ BoardFavorite : "favorita"

    Board {
        string id PK
        string organizationId FK
        string createdById FK
        string name
        enum   visibility "PRIVATE | ORGANIZATION"
        enum   cardOrdering
        boolean inheritTeamOnNewCards
        boolean isArchived
    }
    List {
        string id PK
        string organizationId FK
        string boardId FK
        string name
        float  position
        int    wipLimit "nullable"
        int    slaMinutes "nullable"
        boolean isFinalList "max 1/board, partial unique"
        boolean isBacklog "min 1/board"
        boolean isArchived
    }
    Card {
        string id PK
        string organizationId FK
        string shortCode "UK por org"
        string boardId FK "legacy"
        string listId FK "legacy"
        string createdById FK
        string leadId FK "nullable"
        string parentCardId FK "nullable, self"
        string coverAttachmentId FK "nullable"
        string title
        json   description "nullable"
        float  position
        enum   privacy "CardPrivacy"
        enum   status "CardStatus"
        string cardColor "nullable"
        string flagColor "nullable"
        datetime flagAt "nullable"
        datetime startDate "nullable"
        datetime dueDate "nullable"
        datetime completedAt "nullable"
        string completedById FK "nullable"
        int    estimateMinutes "nullable"
        datetime enteredListAt
        boolean isArchived
    }
    CardPresence {
        string cardId PK,FK
        string boardId PK,FK
        string listId FK
        float  position
        datetime completedAt "nullable"
        string completedById FK "nullable"
        datetime addedAt
        datetime removedAt "nullable"
    }
    BoardMember {
        string id PK
        string boardId FK
        string userId FK
        enum   role "BoardRole"
    }
    BoardFavorite {
        string userId PK,FK
        string boardId PK,FK
        datetime favoritedAt
    }
```

### 2.2 Equipe e labels

```mermaid
erDiagram
    Card         ||--o{ CardMember : "team"
    User         ||--o{ CardMember : "atribuído a"
    Organization ||--o{ Label      : "owns"
    Board        ||--o{ Label      : "owns (nullable)"
    Card         ||--o{ CardLabel  : "tem"
    Label        ||--o{ CardLabel  : "aplicado em"
    User         ||--o{ CardVisit  : "abre"
    Card         ||--o{ CardVisit  : "foi visto"

    CardMember {
        string cardId PK,FK
        string userId PK,FK
        enum   role "MEMBER | REVIEWER"
    }
    Label {
        string id PK
        string organizationId FK
        string boardId FK "nullable"
        string name
        string color
    }
    CardLabel {
        string cardId PK,FK
        string labelId PK,FK
    }
    CardVisit {
        string userId PK,FK
        string cardId PK,FK
        datetime visitedAt "@updatedAt"
    }
```

Indexes/uniques relevantes:

- `Card @@unique([organizationId, shortCode])` — `#412` único por org.
- `Card @@index([listId, position])`, `CardPresence @@index([boardId, listId, position])` — ordering kanban.
- `Card @@index([boardId, completedAt])`, `CardPresence @@index([boardId, completedAt])` — listagens "concluídos".
- `Card @@index([dueDate])` — filas temporais.
- `BoardMember @@unique([boardId, userId])`.
- `CardVisit @@index([userId, visitedAt(sort: Desc)])` — home recente.

---

## Conteúdo do card {#conteudo-do-card}

Modelos: `Checklist`, `ChecklistItem`, `ChecklistTemplate`, `Comment`, `CommentReaction`, `Attachment`, `TimeEntry`, `Task`.

Decisões críticas:

- **`Comment.body` é Json** (Tiptap) e `Comment.mentions` é `String[]` denormalizado — notificação não precisa parsear JSON.
- **`Comment.parentCommentId`** (self-FK, `onDelete: SetNull`): respostas. Preserva reply mesmo quando o pai é soft-deletado.
- **`CommentReaction`**: emoji reactions com `@@unique([commentId, userId, emoji])` — um user só pode usar o mesmo emoji uma vez por comment.
- **`Attachment.commentId` opcional**: anexo do card direto (`commentId = null`) vs anexo da timeline de um comment.
- **`Attachment.embedded`**: true = imagem dentro do corpo do Comment/descrição, não aparece na lista visual de anexos.
- **`Card.coverAttachmentId`**: 1:N reverso (um Attachment pode ser cover de muitos cards em tese, na prática 1).
- **`ChecklistItem.recurrence`** (Json): doc 49. Quando item recorrente é concluído, backend cria nova instância com `dueDate` recalculada. Sem dueDate ou sem recurrence = item normal.
- **`ChecklistTemplate.items`** (Json array de strings): só os textos. `dueDate`/`assignee`/`priority` ficam pra ajuste pós-aplicar.
- **`TimeEntry.cardId` nullable**: timer "livre" criado pelo botão do header sem contexto de card.
- **`Task`** é standalone (sem card), nível da Org. Aparece na home pessoal junto com `ChecklistItem`. Mesmo shape de `recurrence` que `ChecklistItem`.

```mermaid
erDiagram
    Card         ||--o{ Checklist          : "tem"
    Checklist    ||--o{ ChecklistItem      : "tem"
    User         ||--o{ ChecklistItem      : "assignee / doneBy"
    Organization ||--o{ ChecklistTemplate  : "owns"
    User         ||--o{ ChecklistTemplate  : "createdBy"
    Card         ||--o{ Comment            : "tem"
    User         ||--o{ Comment            : "autor"
    Comment      ||--o{ CommentReaction    : "tem"
    User         ||--o{ CommentReaction    : "reage"
    Comment      ||--o{ Comment            : "parentCommentId (reply)"
    Card         ||--o{ Attachment         : "tem"
    Comment      ||--o{ Attachment         : "anexa (nullable)"
    User         ||--o{ Attachment         : "uploader"
    Card         ||--o{ TimeEntry          : "rastreia (nullable)"
    User         ||--o{ TimeEntry          : "abre"
    Organization ||--o{ TimeEntry          : "scoped"
    Organization ||--o{ Task               : "owns"
    User         ||--o{ Task               : "assignee / createdBy / doneBy"

    Checklist {
        string id PK
        string cardId FK
        string title
        float  position
    }
    ChecklistItem {
        string id PK
        string checklistId FK
        string text
        float  position
        boolean isDone
        enum   priority
        datetime dueDate "nullable"
        string assigneeId FK "nullable"
        string doneById FK "nullable"
        datetime doneAt "nullable"
        json   recurrence "nullable"
    }
    ChecklistTemplate {
        string id PK
        string organizationId FK
        string createdById FK
        string title
        json   items "Array<string>"
    }
    Comment {
        string id PK
        string cardId FK
        string authorId FK
        string parentCommentId FK "nullable, self-FK SetNull"
        json   body "Tiptap JSON"
        string mentions "string[] denorm userIds"
        datetime editedAt "nullable"
        datetime deletedAt "nullable"
    }
    CommentReaction {
        string id PK
        string commentId FK
        string userId FK
        string emoji
        datetime createdAt
    }
    Attachment {
        string id PK
        string cardId FK
        string commentId FK "nullable"
        string uploaderId FK
        string fileName
        string mimeType
        int    sizeBytes
        string storageKey
        enum   kind "FILE | LINK | IMAGE"
        boolean embedded
        string externalUrl "nullable"
    }
    TimeEntry {
        string id PK
        string cardId FK "nullable"
        string userId FK
        string organizationId FK
        datetime startedAt
        datetime endedAt "nullable"
        int    durationSec "nullable"
        enum   source "TIMER | MANUAL"
        string note "nullable"
    }
    Task {
        string id PK
        string organizationId FK
        string text
        float  position
        boolean isDone
        datetime dueDate "nullable"
        string assigneeId FK "nullable"
        string createdById FK
        string doneById FK "nullable"
        datetime doneAt "nullable"
        json   recurrence "nullable"
    }
```

Indexes relevantes:

- `ChecklistItem @@index([assigneeId, dueDate, isDone])` — query da home pessoal.
- `Comment @@index([cardId, createdAt])` — timeline.
- `CommentReaction @@index([commentId])` + `@@unique([commentId, userId, emoji])` — agrupamento + dedup.
- `Attachment @@index([cardId])`, `@@index([commentId])`.
- `TimeEntry @@index([userId, endedAt])` — achar entry ativa do user em O(1).
- `Task @@index([organizationId, assigneeId, isDone])`, `@@index([organizationId, dueDate])`.

---

## Aprovações {#aprovacoes}

Modelos: `CardApproval`, `CardApprovalReviewer`. Toca `List` (defaults de fallback) e `User` (4 papéis).

Decisões críticas:

- **Primeiro a votar ganha**: `CardApproval.status` muda quando qualquer reviewer decide. Reviewers restantes são informados.
- **Reviewer XOR**: `CardApprovalReviewer` é `userId` (interno) OU `phone + externalName` (externo via link tokenizado). `accessToken` único sempre presente — mesmo interno pode aprovar via link no WhatsApp/email sem login.
- **Reprovação obriga `note`** — validado no service.
- **Undo 5min**: decisor original (ou OWNER/ADMIN/GESTOR) pode reverter dentro da janela. `sideEffects` (Json) guarda o que foi feito pra rollback. `REVERTED` é status terminal.
- **Bloqueio anti-pisada**: ação humana posterior nos side-effects bloqueia o undo. Ações de automação encadeada NÃO bloqueiam — daí a importância do `Activity.automationRunId` (ver subsistema automação).
- **Fallback sem automação**: `defaultOnApproveListId`/`defaultOnRejectListId` movem o card mesmo sem regra configurada.
- **Notificação por WhatsApp**: `User.notifyApprovalsOnWhatsApp` + `User.phone` (E.164 sem `+`) acionam Evolution API quando user é reviewer.

```mermaid
erDiagram
    Card         ||--o{ CardApproval         : "tem"
    Organization ||--o{ CardApproval         : "scoped (denorm)"
    User         ||--o{ CardApproval         : "requestedBy"
    User         ||--o{ CardApproval         : "decidedBy (nullable)"
    User         ||--o{ CardApproval         : "revertedBy (nullable)"
    List         ||--o{ CardApproval         : "defaultOnApproveList (nullable)"
    List         ||--o{ CardApproval         : "defaultOnRejectList (nullable)"
    CardApproval ||--o{ CardApprovalReviewer : "tem reviewers"
    User         ||--o{ CardApprovalReviewer : "interno (XOR phone)"

    CardApproval {
        string id PK
        string cardId FK
        string organizationId FK
        string requestedById FK
        enum   status "PENDING | APPROVED | REJECTED | REVERTED"
        datetime requestedAt
        datetime decidedAt "nullable"
        string decidedById FK "nullable"
        string decidedByExternalName "nullable"
        string note "nullable, obrigatória pra REJECTED"
        string defaultOnApproveListId FK "nullable"
        string defaultOnRejectListId FK "nullable"
        json   onApproveActions "addTagIds, removeTagIds"
        json   onRejectActions "idem"
        json   sideEffects "pra rollback no undo"
        datetime revertedAt "nullable"
        string revertedById FK "nullable"
        string revertReason "nullable"
    }
    CardApprovalReviewer {
        string id PK
        string approvalId FK
        string userId FK "nullable, XOR com phone"
        string phone "nullable, E.164 sem +"
        string externalName "nullable, quando phone-only"
        string accessToken UK
        datetime expiresAt "requestedAt + 7d default"
        datetime notifiedAt "nullable"
    }
```

Indexes relevantes:

- `CardApproval @@index([organizationId, status, requestedAt])` — listagem "pendentes" multi-tenant.
- `CardApprovalReviewer @@index([accessToken])` — lookup do link público.

---

## CRM {#crm}

Modelos: `Contact`, `CardContact`.

Decisões críticas:

- **`Contact.userId @unique` (1:1 opcional)**: quando setado, name/email/phone/avatar viram read-only no CRM (fonte autoritativa = User). 1 User no máximo 1 Contact. Ver `tarefas-md/50-contact-user-vinculo.md`.
- **Cross-reference sem FK**: match por email/phone com outros Users da Org é feito on-demand no frontend (sem persistir FK), pra manter entidades independentes quando o vínculo formal não existe.
- **Hierarquia B2B via self-FK** (`Contact.parentId`): PERSON pertence a COMPANY. Empresas têm `parentId = null` (validado no service). Relation name `"ContactPerson"`.
- **Soft-delete** (`deletedAt`): cards históricos seguem referenciando contatos removidos da agenda principal. Listing filtra `deletedAt: null`.
- **`CardContact` N:N puro**: PK composta `(cardId, contactId)`, sem id próprio.

```mermaid
erDiagram
    Organization ||--o{ Contact     : "owns"
    Contact      |o--o{ Contact     : "company / person (self)"
    Contact      |o--o| User        : "linked (1:1 opcional)"
    Card         ||--o{ CardContact : "tem"
    Contact      ||--o{ CardContact : "vinculado a"

    Contact {
        string id PK
        string organizationId FK
        string userId FK,UK "nullable, 1:1"
        string parentId FK "nullable, self"
        enum   type "PERSON | COMPANY"
        string name
        string email "nullable"
        string phone "nullable, livre"
        string document "nullable, CPF/CNPJ"
        string note "nullable"
        datetime deletedAt "nullable"
    }
    CardContact {
        string cardId PK,FK
        string contactId PK,FK
        datetime createdAt
    }
```

Indexes relevantes:

- `Contact @@index([organizationId, type])`, `@@index([organizationId, name])`, `@@index([organizationId, email])`, `@@index([organizationId, phone])` — buscas por critério no agenda.
- `Contact @@index([parentId])` — listar PERSONs de uma COMPANY.
- `CardContact @@index([contactId])` — listar cards por contato.

---

## Automação, auditoria e mensageria {#automacao-auditoria-mensageria}

Modelos: `Automation`, `AutomationRun`, `Activity`, `Notification`, `MessageTemplate`, `PushSubscription`.

Os três blocos vivem juntos porque `Activity.automationRunId` linka audit log à execução, `MessageTemplate` alimenta as actions `SEND_WHATSAPP`/`POST_COMMENT`, e `PushSubscription` é o canal de delivery das `Notification` geradas pela engine.

Decisões críticas:

- **`Automation` escopo mutex**: cada regra pertence a `list` OU `board` OU `org` OU `scopeChecklist` OU `scopeChecklistItem` (validado no service). Triggers temporais usam list/board/org; `CHECKLIST_ITEM_DONE` e `CHECKLIST_COMPLETED` usam scopeChecklist/Item.
- **`triggerConfig` e `actionConfig` (Json)**: shape varia por enum. Ex: `triggerConfig = { minutes: 60 }` pra TIME_IN_LIST; `actionConfig = { tagIds: [...] }` pra INSERT_TAGS.
- **`conditions` (Json)**: array AND, cada item é `AutomationCondition`. Avaliado em `executeAutomation` antes da action. Null = sempre roda.
- **`chainDepth=5`** anti-loop — engine aborta acima disso.
- **`Activity.automationRunId`**: crítico pro undo de aprovação. `IS NULL` = ação humana (bloqueia undo); `NOT NULL` = ação de automação encadeada (não bloqueia).
- **`Activity.payload` (Json)**: shape varia por `ActivityType` (55 valores).
- **`MessageTemplate.type`**: discriminador `'whatsapp'` | `'comment'` pra autocomplete não cruzar contextos.
- **`PushSubscription.endpoint UK`** globalmente. `410 Gone` no envio → registro removido automaticamente.

```mermaid
erDiagram
    Organization  ||--o{ Automation       : "owns"
    List          ||--o{ Automation       : "scope (nullable)"
    Board         ||--o{ Automation       : "scope (nullable)"
    Checklist     ||--o{ Automation       : "scope (nullable)"
    ChecklistItem ||--o{ Automation       : "scope (nullable)"
    User          ||--o{ Automation       : "createdBy"
    Automation    ||--o{ AutomationRun    : "executa"
    Card          ||--o{ AutomationRun    : "disparou (nullable)"
    AutomationRun ||--o{ Activity         : "gerou"
    Organization  ||--o{ Activity         : "scoped"
    Card          ||--o{ Activity         : "sobre (nullable)"
    User          ||--o{ Activity         : "actor (nullable)"
    Organization  ||--o{ MessageTemplate  : "owns"
    User          ||--o{ MessageTemplate  : "createdBy"
    User          ||--o{ Notification     : "recebe"
    User          ||--o{ PushSubscription : "registra"

    Automation {
        string id PK
        string organizationId FK
        string listId FK "nullable, mutex"
        string boardId FK "nullable, mutex"
        string scopeChecklistId FK "nullable, mutex"
        string scopeChecklistItemId FK "nullable, mutex"
        string createdById FK
        enum   trigger "AutomationTrigger"
        json   triggerConfig
        enum   actionType "AutomationActionType"
        json   actionConfig
        json   conditions "AND, nullable"
        boolean isActive
        string label "nullable"
    }
    AutomationRun {
        string id PK
        string automationId FK
        string cardId FK "nullable"
        enum   status "PENDING|RUNNING|SUCCESS|FAILED|SKIPPED"
        int    chainDepth "anti-loop, max 5"
        string error "nullable"
        json   result "nullable"
        datetime startedAt "nullable"
        datetime finishedAt "nullable"
    }
    Activity {
        string id PK
        string organizationId FK
        string boardId FK "nullable"
        string cardId FK "nullable"
        string actorId FK "nullable"
        string automationRunId FK "nullable"
        enum   type "ActivityType (55 valores)"
        json   payload
    }
    Notification {
        string id PK
        string userId FK
        string organizationId FK
        enum   type "NotificationType"
        string title
        string body "nullable"
        string entityType "nullable"
        string entityId "nullable"
        boolean isRead
        datetime readAt "nullable"
    }
    MessageTemplate {
        string id PK
        string organizationId FK
        string createdById FK
        string name
        string body "Mustache placeholders"
        string type "'whatsapp' | 'comment'"
    }
    PushSubscription {
        string id PK
        string userId FK
        string endpoint UK
        string p256dh
        string auth
        string userAgent "nullable"
        datetime lastUsedAt
    }
```

Indexes relevantes:

- `Automation @@index([listId, isActive])`, `@@index([boardId, isActive])`, `@@index([scopeChecklistId, isActive])`, `@@index([scopeChecklistItemId, isActive])` — engine resolve "quais regras pra esse evento".
- `AutomationRun @@index([automationId, createdAt])`, `@@index([cardId])` — debug e histórico.
- `Activity @@index([organizationId, createdAt])`, `@@index([cardId, createdAt])`, `@@index([boardId, createdAt])`, `@@index([automationRunId])` — feed e undo.
- `Notification @@index([userId, isRead, createdAt])` — sino do header.
- `MessageTemplate @@index([organizationId, type])`.

---

## IDP / Federação {#idp-federacao}

Modelos: `ServiceProvider`.

Subsistema **global** (sem `organizationId`) gerido pelo admin de plataforma (`User.isPlatformAdmin`). Cada row é um Service Provider externo (ex: Ogma) que recebe webhooks de eventos sensíveis disparados pelo KTask.

Decisões críticas:

- **Sem `organizationId`**: deliberado. Federação IdP é responsabilidade do KTask como Identity Provider — quem decide quais SPs existem é o admin global, não cada Org. Se isso virar self-service por Org, adicionar FK depois.
- **`slug @unique`**: identificador estável usado em logs e nas URLs internas (`ogma`, `creatyze-atendimento`).
- **`secretHash` (SHA-256)**: plaintext nunca é armazenado. Mostrado 1 vez ao admin na criação. Verificação HMAC quando o webhook é assinado.
- **`escopo String[]`**: lista de eventos assinados pelo SP. Hoje: `usuario.email_alterado`, `usuario.senha_alterada`, `usuario.desativado`. Sem enum porque eventos novos não exigem migration — só código novo no dispatcher.
- **`ativo Boolean`**: kill switch sem deletar. Quando false, o dispatcher pula esse SP.

```mermaid
erDiagram
    ServiceProvider {
        string id PK
        string nome
        string slug "@unique"
        string webhookUrl
        string secretHash "SHA-256 do HMAC secret"
        string escopo "String[] eventos assinados"
        boolean ativo
        string notas "nullable"
        datetime criadoEm
        datetime atualizadoEm
    }
```

Sem relação direta com nenhum outro model — é uma tabela de configuração. Os webhooks dispatchados são fire-and-forget; sucesso/falha de entrega fica em logs do API, não no banco.

Plano completo da federação em [tarefas-md/51-federacao-idp-para-ogma.md](../../tarefas-md/51-federacao-idp-para-ogma.md).

---

## Operacional {#operacional}

Modelo não-domínio que vale citar:

**`OrgImportMapping`** — memória de mapeamentos do importer (CSV Ummense). Quando o user mapeia "Thiago" (CSV) → Thiago Bueno (User do KTask) em `/configuracoes/importar`, persistimos pra próximo import já chegar pré-mapeado. Shape: `(organizationId, kind, sourceName) → targetId | null` com upsert. `kind` é `'user'` ou `'list'` (string solta, sem enum, pra permitir extensão futura). `targetId = null` significa "Ignorar este nome, não perguntar de novo". Unique composto `@@unique([organizationId, kind, sourceName])`.

Sem diagrama dedicado — entidade isolada, FK só pra `Organization`.
