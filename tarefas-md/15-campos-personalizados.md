# 15 — Campos personalizados

> **Status:** discussão iniciada (2026-04-26), implementação adiada pra depois
> de Aprovações por cliente. Doc captura as decisões em aberto pra retomar
> sem precisar redescobrir.

## Cenário-modelo

Cada **fluxo (board)** define seus próprios campos extras. No board "Vendas":
`Valor R$`, `Origem do lead` (dropdown), `Data fechamento`. No board "Eventos":
`Local`, `N° convidados`. Card herda os campos do board.

## Decisões em aberto (marcadas D7-D14 da discussão original)

### D7 — Escopo: por board, por org ou por card?

- **A (recomendada):** Por board. Cada fluxo define seus campos. Padrão Ummense/Trello.
- B: Por org, com habilitar por board.
- C: Livre por card. Bagunça.

### D8 — Tipos de campo no MVP

Sugestão: **text, textarea, number, currency, date, select, checkbox, user** (8 tipos).
v2 adiciona: email, phone, url, multiselect.

### D9 — Campos obrigatórios?

- A: Flag `isRequired`. Card não move pra "Concluído" sem preencher (similar Ummense).
- B: Tudo opcional, sem validação.

### D10 — Onde aparecem no card?

- A: Seção dedicada "Campos personalizados" no modal (referência visual: bloco "Campos personalizados" do Ummense).
- B: Misturado com Detalhes (Prioridade, Prazo, etc.).
- C: Aba própria.

### D11 — Mostrar no card-mini do kanban?

- A: Sim, configurável por campo (`showOnCard: boolean`).
- B: Só no modal.

### D12 — Filtrar/buscar por campos?

- A: Filtros do header ganham seção dinâmica baseada nos campos do board.
- B: Só busca por palavra-chave global.

### D13 — Schema proposto

```prisma
enum CustomFieldType {
  TEXT
  TEXTAREA
  NUMBER
  CURRENCY
  DATE
  SELECT
  CHECKBOX
  USER
  // v2: EMAIL, PHONE, URL, MULTISELECT
}

model CustomField {
  id          String          @id @default(cuid())
  boardId     String
  name        String          // "Valor", "Origem"
  type        CustomFieldType
  isRequired  Boolean         @default(false)
  showOnCard  Boolean         @default(false)
  position    Float           // ordem no modal
  options     Json?           // SELECT/MULTISELECT: [{label, value, color?}]
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  board       Board           @relation(fields: [boardId], references: [id], onDelete: Cascade)
  values      CardFieldValue[]

  @@index([boardId, position])
}

model CardFieldValue {
  cardId  String
  fieldId String
  value   Json   // tipo varia: string, number, ISO date, boolean, userId, etc

  card    Card        @relation(fields: [cardId], references: [id], onDelete: Cascade)
  field   CustomField @relation(fields: [fieldId], references: [id], onDelete: Cascade)

  @@id([cardId, fieldId])
}
```

**Tradeoff:** `value: Json` simplifica MUITO (1 tabela cobre todos os tipos)
mas perde tipagem forte no banco. A alternativa seria 1 tabela por tipo
(`CardFieldValueText`, `CardFieldValueNumber`...) — chato de manter,
queries complicadas. Recomendação: Json.

### D14 — Estimativa

- Aprovações por cliente: 4-6h (entregue primeiro)
- Campos personalizados: 8-12h (mais complexo: editor de schema dinâmico no
  board settings, renderização condicional por tipo, validação)

## Dependências cruzadas

- **D6 (Aprovações)** depende de Campos Personalizados pra ter um campo
  tipo `user` chamado "Cliente" no card, usado na automação de criação
  automática de pedido de aprovação.
- **`FILL_FIELDS`** (action #11 das automações) depende disso.

## Riscos / decisões parkadas

- Validação client-side vs server-side de tipos: ambos.
- Migração: como introduzir campos numa Org com cards já criados?
  → Campos vazios por default (null). Validação `isRequired` só dispara
  ao tentar mover/concluir, não retroativamente.
- Performance de query: kanban com 200 cards × 10 campos = 2000 rows
  em CardFieldValue. JOIN comum. Adicionar `@@index([fieldId, cardId])`
  além do PK.
