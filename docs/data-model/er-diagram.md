# Diagrama ER — visão geral

Eixo principal do modelo: oito entidades que estruturam o produto. Detalhes por área (conteúdo do card, aprovações, automação, etc.) ficam em [er-by-area.md](er-by-area.md).

Convenções do diagrama:

- Campos `createdAt`/`updatedAt`/`deletedAt` omitidos (ver [README](README.md)).
- `PK,FK` indica chave primária composta cuja coluna também é FK (caso de `CardPresence`).
- `UK` marca colunas únicas (incluindo unique composto explicitado no comentário).
- `CardContact` aparece só como relação N:N entre `Card` e `Contact` (a tabela join é mostrada no [diagrama de CRM](er-by-area.md#crm)).

```mermaid
erDiagram
    Organization ||--o{ Membership   : "tem"
    User         ||--o{ Membership   : "pertence a"
    Organization ||--o{ Board        : "owns"
    Board        ||--o{ List         : "has columns"
    Organization ||--o{ Card         : "scoped to"
    User         ||--o{ Card         : "creates / leads"
    Card         |o--o{ Card         : "parent / subtasks"
    Card         ||--o{ CardPresence : "appears in"
    Board        ||--o{ CardPresence : "hosts"
    List         ||--o{ CardPresence : "currently in"
    Organization ||--o{ Contact      : "owns"
    Contact      |o--o| User         : "linked (1:1 opcional)"
    Contact      |o--o{ Contact      : "company / person"
    Card         }o--o{ Contact      : "linked via CardContact"

    Organization {
        string id PK
        string slug UK
        string name
        enum   plan
        int    cardSequence
    }
    User {
        string id PK
        string email UK
        string name
        string phone "nullable"
        datetime suspendedAt "nullable"
        datetime deletedAt "nullable"
    }
    Membership {
        string id PK
        string userId FK
        string organizationId FK
        enum   role
    }
    Board {
        string id PK
        string organizationId FK
        string createdById FK
        string name
        enum   visibility
        boolean isArchived
    }
    List {
        string id PK
        string organizationId FK
        string boardId FK
        string name
        float  position
        boolean isFinalList
        boolean isBacklog
        boolean isArchived
    }
    Card {
        string id PK
        string organizationId FK
        string shortCode "UK por org"
        string boardId FK
        string listId FK
        string createdById FK
        string leadId FK "nullable"
        string parentCardId FK "nullable, self"
        string title
        enum   privacy
        enum   status
        float  position
        datetime dueDate "nullable"
        datetime completedAt "nullable"
        boolean isArchived
    }
    CardPresence {
        string cardId PK,FK
        string boardId PK,FK
        string listId FK
        string completedById FK "nullable"
        float  position
        datetime completedAt "nullable"
        datetime removedAt "nullable"
    }
    Contact {
        string id PK
        string organizationId FK
        string userId FK,UK "nullable, 1:1"
        string parentId FK "nullable, self"
        enum   type
        string name
        string email "nullable"
        string phone "nullable"
        datetime deletedAt "nullable"
    }
```

## Leitura do diagrama

- **Tenant boundary**: `Organization` é raiz de cascade em quase tudo. `User` é multi-tenant via `Membership` (um user pode pertencer a várias orgs com `role` diferentes).
- **Hierarquia kanban**: `Organization → Board → List`. `Card` referencia `boardId`+`listId` diretos (legacy do modelo single-board, preservado pra leitura rápida).
- **Multi-fluxo**: `CardPresence` é onde o card "aparece" — PK composta `(cardId, boardId)` garante "no máximo uma lista por board". A presença com `boardId == Card.boardId` é a "primária".
- **Família de cards**: `Card.parentCardId` é self-FK opcional (`onDelete: SetNull`).
- **CRM 1:1**: `Contact.userId` é unique e nullable — quando setado, o CRM trata identidade do User como fonte de verdade (read-only).
- **CRM hierárquico**: `Contact.parentId` self-FK liga uma `PERSON` à `COMPANY` dela.

Fora deste diagrama mas no eixo do produto (ver [er-by-area.md](er-by-area.md)):

- Conteúdo do card: `Checklist`, `ChecklistItem`, `Comment`, `Attachment`.
- Aprovações: `CardApproval`, `CardApprovalReviewer`.
- Time/etiquetas: `CardMember`, `Label`, `CardLabel`, `CardVisit`, `BoardMember`, `BoardFavorite`.
- Automação e auditoria: `Automation`, `AutomationRun`, `Activity`.
- Mensageria: `Notification`, `MessageTemplate`, `PushSubscription`.
- Produtividade pessoal e ops: `Task`, `TimeEntry`, `OrgImportMapping`.
