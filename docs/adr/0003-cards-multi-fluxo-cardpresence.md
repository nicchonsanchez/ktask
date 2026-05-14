# ADR 0003 — Cards em múltiplos fluxos via tabela `CardPresence`

- **Status**: Accepted (migração parcial — iteração 3 pendente)
- **Data**: 2026-04-25
- **Decisores**: Nicchon (operador único)
- **Tags**: domínio, banco, kanban

## Contexto

O modelo original do KTask seguia o padrão Trello clássico: um `Card` pertence a exatamente **um** `Board` e a exatamente **uma** `List` dentro daquele board. O schema refletia isso com `Card.boardId` e `Card.listId` 1:1.

Na prática, o caso de uso da Kharis demanda outra coisa. Inspirado no Ummense (ferramenta de referência declarada em `tarefas-md/00`), uma mesma demanda frequentemente vive em **vários fluxos simultaneamente**. Caso real citado em [tarefas-md/13-cards-multi-fluxo.md](../../tarefas-md/13-cards-multi-fluxo.md):

- Card "ANEC | NOVO PORTAL" em 2 fluxos:
  - `ANEC` → coluna `APROVAÇÃO`
  - `Tecnologia` → coluna `Aguardando retorno de terceiros`

Cada fluxo tem seu próprio ciclo: Tecnologia entrega antes de Comercial fechar; cada um tem coluna atual e estado de finalização **independentes**. Os comentários, anexos, líder e histórico do card são **compartilhados** entre os fluxos — é o mesmo card, vivendo em N kanbans.

Manter `Card.boardId/listId` single tornava esse caso de uso impossível sem duplicar cards (o que duplicaria comentários, anexos e histórico — inaceitável).

Evidência no repo:

- [apps/api/prisma/schema.prisma](../../apps/api/prisma/schema.prisma#L575): model `CardPresence` com `@@id([cardId, boardId])`.
- Doc detalhado em [tarefas-md/13-cards-multi-fluxo.md](../../tarefas-md/13-cards-multi-fluxo.md) — descreve as 3 iterações.
- Commit decisivo: `9bdf171 feat(cards): multi-fluxo iteracao 1 - CardPresence + endpoints + UI` (2026-04-25).
- Iteração 2 (kanban lê de `CardPresence`): `2da7e0d feat(cards): multi-fluxo iteracao 2` (2026-04-26).

## Decisão

Cards são associados a fluxos via tabela M:N **`CardPresence`** com `@@id([cardId, boardId])`. Cada linha representa a presença do card em um fluxo específico e carrega o estado **per-fluxo**: `listId`, `position`, `completedAt`, `completedById`, `addedAt`, `removedAt` (soft-delete).

`CardPresence` é a fonte de verdade do kanban: o endpoint `boards.getOne` lê dela. Operações de mover/finalizar por fluxo mutam `CardPresence`, não `Card`.

## Alternativas consideradas

### Alternativa A: `CardPresence` M:N (escolhida)

- Pros: modela exatamente o caso de uso (card vivendo em N fluxos com estado independente); soft-delete via `removedAt` preserva histórico de "esse card já viveu nesse fluxo"; índices por `(boardId, listId, position)` cobrem a query principal do kanban; comentários/anexos ficam no `Card` (compartilhados naturalmente).
- Contras: queries que antes faziam `card.listId` agora exigem JOIN com `CardPresence` filtrando por board; o move otimista no front precisa saber em qual fluxo está acontecendo; activity log ganha contexto de fluxo (já tem `Activity.boardId`).
- Evidência: descrita e justificada no doc 13.

### Alternativa B: `Card.boardId` single (modelo legacy)

- Pros: schema mais simples; queries diretas sem JOIN; produto Trello-like resolvido.
- Contras: incapaz de representar o caso ANEC | NOVO PORTAL sem duplicação; cada fluxo extra exigiria copiar o card e perder a unicidade de comentários/anexos.
- Evidência: era o modelo original do KTask, explicitamente substituído pelo doc 13.

### Alternativa C: N:N direto entre Card e List (sem Board no meio)

- Pros: ainda mais flexível — card podia atravessar quadros via lista direta.
- Contras: perde a semântica de "fluxo" como unidade de negócio (board é onde permissões, automações e templates moram); query do kanban (board → lists → cards) fica mais cara; complica permissões (`BoardMember` perde sentido se a unidade real é List).
- Evidência: padrão da indústria, sem debate registrado nos docs do KTask.

### Alternativa D: Card duplicado por fluxo

- Pros: zero mudança de schema.
- Contras: comentários, anexos, histórico, líder — todos precisariam ser sincronizados manualmente entre cópias, ou perderiam consistência. Inviável.
- Evidência: padrão da indústria descartado implicitamente pela exigência de "mesmo card em N fluxos".

## Consequências

### Positivas

- Caso de uso Ummense (card em N fluxos com estado per-fluxo) virou trivial.
- Coluna virtual "Finalizado" do kanban conta por board — cada fluxo tem contagem própria.
- Soft-delete (`removedAt`) preserva auditoria — desvincular não apaga histórico.
- Activity log granular: cada ação aparece no fluxo onde aconteceu, e a timeline do card agrega tudo.

### Negativas / trade-offs aceitos

- **Migração parcial**: a iteração 3 (remover `Card.boardId/listId/position/completedAt/completedById`) ainda não foi feita. Hoje esses campos existem como **espelho** da presença primária, mantidos por `Card.create/move/complete` pra evitar quebrar callers legacy. Isso causa duplicação de fonte de verdade que precisa ser eliminada — risco de drift se algum service nunca atualizar `CardPresence` corretamente. Mitigado por testes e pelo fix-up de commits recentes (`324ab29`, `b132c54`) que garantem que `copy()` e automações criem `CardPresence` explicitamente.
- Move otimista no kanban via dnd ainda usa `cards/move` legacy (espelha automaticamente, mas sem semântica per-flow real) — pendência conhecida no doc 13 iteração 2.
- Finalizar via dnd na coluna "Finalizado" finaliza `Card.completedAt` (legacy), não `CardPresence.completedAt` per-fluxo — também pendência da iteração 2.
- Queries N+1 no carregamento do board são um risco maior agora (board → lists → presences → cards); o doc 05 já flagga isso como ponto de atenção.

### Neutras / observações

- Comentários, anexos e participantes do card ficam no `Card`, não em `CardPresence` — escolha consciente pra preservar compartilhamento.
- Permissão de ler o card = união de permissões a qualquer board onde tem presença ativa.
- Automações que movem/finalizam cards (ex: `MOVE_CARD`, `CREATE_CHILD_CARD`) precisam saber **em qual fluxo** agir. Decisão explícita em `tarefas-md/13` e código já refletindo.

## Notas

- Schema: [apps/api/prisma/schema.prisma:575](../../apps/api/prisma/schema.prisma#L575).
- Doc detalhado: [tarefas-md/13-cards-multi-fluxo.md](../../tarefas-md/13-cards-multi-fluxo.md).
- Commits chave: `9bdf171` (iteração 1, 2026-04-25), `2da7e0d` (iteração 2, 2026-04-26), `8188fac` (dnd usa moveCardInFlow, 2026-04-26), `324ab29` (copy cria CardPresence, 2026-05-13).
- Iteração 3 (cleanup dos campos legacy do Card) é a próxima ADR — quando rodada, esta ADR ganha nota "iteração 3 concluída em YYYY-MM-DD" mas continua `Accepted` (a decisão arquitetural não muda; só a migração termina).
