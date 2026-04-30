# 31 — Importer: vincular cards existentes a novos fluxos (multi-fluxo)

## Contexto

CSV do Ummense tem coluna `Fluxos` que pode conter múltiplos valores
separados por `|` (ex: `KHARIS|Tecnologia`, `ANEC|Tecnologia`). Isso
significa que o mesmo card está em mais de um fluxo no Ummense.

Hoje o importer V1/V2 do KTask usa `Card.shortCode` como chave única
**por Org**. Quando re-importamos um CSV que contém cards já presentes
em outros boards, eles são silenciosamente pulados:

```ts
// importer.service.ts ~L536, L1039
const existing = await this.prisma.card.findUnique({
  where: { organizationId_shortCode: { organizationId, shortCode } },
});
if (existing) return null; // skipped++
```

O comportamento correto pra simular o multi-fluxo do Ummense é:
**adicionar uma `CardPresence` no novo board** ao invés de pular.
Assim o card aparece em ambos os boards, com colunas/posições
independentes, exatamente como no Ummense.

## Observado em produção

User importou CSV grande (4 cards novos criados, dezenas pulados).
Os "pulados" eram cards que tinham o mesmo `shortCode` mas com `Fluxos`
diferentes — eram multi-fluxo no Ummense, mas no KTask só ficaram no
primeiro board importado. As colunas do segundo board foram criadas
mas vazias.

## Escopo

### Dentro do escopo

1. Quando `existing.shortCode` é encontrado:
   - **Se já existe `CardPresence` ativa do card no board destino**
     (`removedAt IS NULL`): pular (já está vinculado, idempotente).
   - **Se NÃO existe**: criar `CardPresence` no board destino apontando
     pra lista mapeada (mesma lógica de `listsByName` do import normal).
     Position = última posição da lista + 1 (ou recalcular).
   - Contar como `linkedToFlow` no relatório (não `skipped`, não
     `created`).
2. Aplicar tanto no caminho **legado auto-resolve** (`importCard`,
   ~L536) quanto no **wizard V2** (`importCardWithMapping`, ~L1039).
3. Relatório `ImportReport` ganha campo `linkedToFlow: number` separado
   de `created` e `skipped`. UI do wizard mostra nas estatísticas
   finais.
4. Activity `CARD_LINKED_TO_BOARD` registrada por presença criada (já
   existe esse type no enum? Verificar — senão criar).
5. Status do card (`completedAt`, `forceCompleted` da estratégia
   "Marcar como Finalizado" do CSV) aplica-se à `CardPresence` do novo
   board independentemente. Card pode estar finalizado em um board e
   ativo em outro.

### Fora do escopo

- Reconciliar diferenças do CSV vs DB para cards já existentes (ex:
  título mudou no CSV, descrição mudou). Hoje pulamos qualquer update
  — mantemos isso. Apenas adicionamos vínculo.
- Suportar a coluna `Fluxos` do CSV diretamente (separando por `|` e
  criando 1 card com N presences a partir de uma única linha do CSV).
  Continua sendo "1 import = 1 board" e o multi-fluxo emerge de imports
  sucessivos.
- Backfill retroativo dos cards já pulados em imports anteriores (não
  temos como saber quais cards foram pulados em qual board sem registro;
  user faz re-import manual se quiser corrigir).

## Etapas

1. **Schema check**: `CardPresence` (cardId, boardId) é PK composta.
   `findUnique` por `cardId_boardId` resolve "já vinculado?". Index
   já existe.
2. **`importCard` (legado)**: substituir o `return null` no caminho
   `existing` por um upsert de `CardPresence`. Manter `report.skipped++`
   só quando a presence já existia ativa.
3. **`importCardWithMapping` (wizard V2)**: mesma lógica. Cuidado com
   `forceCompleted` — aplicar no `CardPresence.completedAt`, não no
   `Card.completedAt`.
4. **Posição na lista destino**: query rápida pra `MAX(position)` da
   lista + step (ex: +65536). Reaproveitar helper `nextPosition` se
   já existir; senão inline.
5. **Relatório**: estender `ImportReport` com `linkedToFlow`. Atualizar
   tipo no `apps/web/src/lib/queries/importer.ts`. Mostrar no Step3 do
   wizard (`page.tsx`).
6. **Tests rápidos** (manual, sem unit test framework consolidado):
   - Caso 1: import vazio → 1 card cria 1 presence (já funciona).
   - Caso 2: re-import mesmo CSV no mesmo board → 0 created, 1 skipped
     (presence já existe).
   - Caso 3: import 1 board, depois import OUTRO board com mesmo
     shortCode → 0 created, 1 linkedToFlow, card aparece em ambos.

## Critérios de aceite

- [ ] Re-import do CSV em board diferente do original cria
      `CardPresence` no novo board ao invés de pular.
- [ ] Re-import do mesmo CSV no mesmo board é idempotente (não duplica
      presença).
- [ ] Card aparece em ambos os boards após re-import em board novo,
      cada um na coluna mapeada via wizard.
- [ ] Status "Marcar como Finalizado" aplica-se à presença do board
      novo independentemente da do board original.
- [ ] Relatório final mostra `linkedToFlow` separado de `created` e
      `skipped`.

## Riscos / decisões

- **Performance**: grande import com muitos shortCodes existentes vai
  gerar 1 `CardPresence` insert por linha. Aceitável — mesmo volume
  do import original.
- **Lista destino existe?**: o card precisa cair em uma lista do board
  novo. O wizard V2 já garante mapping (`listsByName` resolvido em
  `executeWithMapping`), então é só usar o mesmo. No legado auto-resolve,
  usa o mesmo nome de coluna do CSV pra encontrar/criar lista.
- **`Card.boardId` (primary)**: NÃO mudamos. Card mantém o board
  primário do primeiro import. Multi-fluxo é via `CardPresence`.
- **Doc 13 (multi-fluxo)**: este doc assume que CardPresence está
  funcionando. Verificar se o backfill de presences pra cards
  pré-multi-fluxo já rodou.

## Relação com outros docs

- **13-cards-multi-fluxo.md**: pré-requisito.
- **16-importer-ummense.md** e **28-importer-ummense-wizard.md**:
  evoluções do importer; este é o V2.1 que fecha o gap de multi-fluxo.
- **30-fluxos-arquivados-drawer.md**: complementa — boards podem ser
  arquivados/restaurados sem afetar presences em outros boards.
