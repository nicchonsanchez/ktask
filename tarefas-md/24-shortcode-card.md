# 24 — Identificador curto do card (shortCode)

> **Status:** planejada (2026-04-27). Pré-requisito do importer Ummense
> (doc 16) pra resolver `Card Pai`. Independente das demais features.

## Motivação

Card hoje só tem `id` cuid (`clw3xy7z9...`) — bom pra URL e DB, ruim pra
comunicação humana ("manda o card cluuhsdfx... pra mim" não rola).

Ummense usa `20250409000751` (yyyymmdd + sequencial 6 dígitos por dia).
Outros sistemas usam `KTASK-412` (slug-prefix + sequencial por org).

Caso de uso:

- "Conferir o card #412" no WhatsApp/email
- Search rápido por número
- Importar do Ummense preservando o identificador antigo

## Decisão de formato

**Recomendação:** `Card.shortCode String @unique` por **Org**, formato:

- **Padrão novo (KTask)**: `<numero-sequencial-por-org>` (ex: `412`)
- **Importado do Ummense**: preserva o número original do Ummense (ex: `20250409000751`) — fica no mesmo campo, único na Org

Não usar prefixo `KTASK-` no schema; o frontend exibe como `#412` em
contextos visuais, e a busca/URL aceita qualquer formato sem prefixo.

**Por que sequencial por Org e não yyyymmdd:**

- Mais curto (3-5 dígitos por anos)
- Mais fácil de falar verbalmente
- Compatível com importer (Ummense identifier vai como string, não conflita)

**Como gerar:** counter por organização. Implementação Prisma com transação:

```ts
const next = await tx.organization.update({
  where: { id: orgId },
  data: { cardSequence: { increment: 1 } },
  select: { cardSequence: true },
});
const shortCode = String(next.cardSequence);
```

Adicionar `Organization.cardSequence Int @default(0)` no schema.

## Etapas

1. Schema:
   - `Card.shortCode String? @unique` (nullable inicialmente)
   - `Organization.cardSequence Int @default(0)`
   - Migration aditiva
2. Backfill: gerar shortCode pra todos os cards existentes em ordem de `createdAt` (script one-shot ou seed)
3. Service `CardsService.create`: gerar shortCode na transação de criação
4. UI:
   - Card-mini: mostrar `#412` ao lado do título (cinza, fonte mono, font-size [11px])
   - Card-modal header: exibir `#412` próximo ao breadcrumb
   - Search global: `#412` ou `412` busca por shortCode
5. URL alternativa: `/c/412` resolve pra `/b/<boardId>?card=<id>` (redirect)
6. Permitir importer (doc 16) gravar shortCode arbitrário (ex: `20250409000751`) bypassando o counter

## Critérios de aceite

- [ ] Migration adiciona campo + counter sem dropar dados
- [ ] Cards novos recebem shortCode automaticamente
- [ ] Backfill gera shortCode pra cards antigos sem conflito
- [ ] Card-mini exibe `#412`
- [ ] Card-modal exibe `#412` no header
- [ ] Search global resolve `#412` e `412`
- [ ] URL `/c/412` redireciona corretamente
- [ ] Importer Ummense pode passar shortCode literal (sem incrementar counter)

## Riscos / decisões

- **Conflito no import:** importador valida `shortCode UNIQUE` antes; se colidir com sequencial KTask (improvável — Ummense usa 14 dígitos, KTask 1-5), pula com warning
- **Race em criação concorrente:** `increment: 1` no Prisma é atômico via Postgres `UPDATE ... RETURNING`, sem race
- **Sequence reset:** se importer puxa cards Ummense com `2025…`, não muda o counter da Org
- **Multi-tenancy:** counter é POR Org, então mesmo `#1` pode existir em 2 orgs diferentes — `@unique` precisa ser composto: `@@unique([organizationId, shortCode])` em vez de `@unique` simples no campo

## Estimativa

~2-3h. Simples e independente.
