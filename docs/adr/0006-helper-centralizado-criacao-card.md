# ADR 0006 — Helper centralizado pra criação de Card

- **Status**: Accepted
- **Data**: 2026-05-13
- **Decisores**: Nicchon
- **Tags**: card, refactor, invariante, prevenção

## Contexto

KTask tem 6 caminhos no código que criam linha na tabela `Card`:

| #   | Caminho                                     | Quando                                  |
| --- | ------------------------------------------- | --------------------------------------- |
| 1   | `CardsService.create()`                     | Botão "+ Adicionar card" na UI          |
| 2   | `CardsService.duplicate()`                  | Ação "Duplicar card"                    |
| 3   | `CardsService.createChild()`                | Dialog "Criar sub-card"                 |
| 4   | `AutomationsEngine.handleCreateChildCard()` | Action `CREATE_CHILD_CARD` de automação |
| 5   | `ImporterService` path A                    | Importer Ummense JSON                   |
| 6   | `ImporterService` path B                    | Importer Ummense CSV                    |

Cada criação tem **3 passos obrigatórios** que precisam acontecer juntos:

1. Incrementar `Organization.cardSequence` atomicamente (UPDATE...RETURNING).
2. INSERT na tabela `Card` com o `shortCode` gerado.
3. INSERT na tabela `CardPresence` (sem essa row, `GET /boards/:id` não retorna o card — o kanban lê de `CardPresence` desde a iteração 2 do multi-fluxo).

Entre 2026-04-25 e 2026-05-13, **3 dos 6 caminhos** (`createChild`, `duplicate`, `handleCreateChildCard`) foram implementados sem replicar a sequência completa: criavam a linha em `Card` mas **esqueciam** a `Organization.cardSequence` e/ou a `CardPresence`. Resultado: 9 cards "invisíveis no kanban" em produção (existiam no banco, eram acessíveis via link público de aprovação, mas sumiam do quadro). Detectado em 2026-05-13 quando o card "CARROSSEL FESTIVAL DE CANNES" não apareceu apesar de estar em fluxo de aprovação ativa.

Postmortem em [docs/postmortems/2026-05-13-carrossel-cannes.md](../postmortems/2026-05-13-carrossel-cannes.md).

Pano de fundo: `CardPresence` foi introduzido em [tarefas-md/13-cards-multi-fluxo.md](../../tarefas-md/13-cards-multi-fluxo.md) (iteração 2). Antes, `Card.boardId` bastava pro card aparecer no kanban. `Organization.cardSequence`/`shortCode` veio em [tarefas-md/24-shortcode-card.md](../../tarefas-md/24-shortcode-card.md). Métodos antigos não foram revisitados pra incluir as novas invariantes; métodos novos foram escritos olhando os antigos como template e copiaram só parte da sequência.

## Decisão

Centralizar a criação de Card em uma função pura `createCardWithPresence()` exportada de [apps/api/src/modules/cards/helpers/create-card-with-presence.ts](../../apps/api/src/modules/cards/helpers/create-card-with-presence.ts). Todos os caminhos da API e do engine de automações chamam o helper. Caminhos novos de criação **devem** chamar o helper — chamar `tx.card.create()` direto exige justificativa documentada.

## Alternativas consideradas

### Alternativa A: Helper centralizado (escolhida)

Função pura `(tx, input) => Promise<Card>` que executa os 3 passos em sequência. Caller controla a transação (passa `tx`) e os efeitos colaterais (membros, labels, activity, eventos).

- Pros:
  - Impossível esquecer um dos 3 passos
  - Função pura testável isoladamente
  - Sem dependência cruzada (`CardsService` ↔ `AutomationsEngine` ficaria circular se o helper fosse método de classe injetado)
- Contras:
  - Adiciona 1 nível de indireção; dev precisa abrir o helper pra entender exatamente o que acontece
  - Importer mantém criação manual porque tem lógica de batch (aloca shortCodes em sequência sem N transações)

### Alternativa B: Método privado em `CardsService` + injeção em `AutomationsEngine`

- Pros: encapsula no service "dono" da entidade
- Contras: cria acoplamento circular entre módulos `Cards` e `Automations`; difícil de resolver sem refactor maior; testes ficam mais complicados (precisa mockar o service inteiro)

### Alternativa C: Não centralizar; documentar invariante em comentário no schema

- Pros: zero refactor
- Contras: comentário em schema não impede esquecimento. Foi a abordagem implícita até 2026-05-13 e falhou em 3 caminhos. Repetir o caminho que falhou não é uma decisão.

### Alternativa D: Validação a nível de DB (trigger ou constraint)

- Pros: garante invariante mesmo em SQL ad-hoc
- Contras: triggers Postgres são opacos e difíceis de versionar com Prisma; constraints `CHECK` não dão pra cobrir "Card precisa ter CardPresence" porque é cross-table; complexidade alta pra retorno marginal

## Consequências

### Positivas

- Eliminada a classe inteira de bug "card invisível por esquecer CardPresence/shortCode".
- Próximo dev que precise criar Card numa feature nova encontra o helper como API canônica (JSDoc rico aponta pra postmortem + invariante).
- Auto-teste implícito: typecheck do helper força o caller a passar todos os campos obrigatórios.

### Negativas / trade-offs aceitos

- 1 nível de indireção: pra entender exatamente o que acontece num `create`, precisa abrir o helper.
- Importer continua com criação manual (lógica de batch ainda incompatível com helper genérico). Documentado no helper.
- Helper não emite eventos (`CARD_CREATED`) nem cria `Activity` — responsabilidade do caller, porque payload varia (manual vs automation vs duplicate). Risco: caller pode esquecer de emitir evento.

### Neutras / observações

- Refactor preservou 100% do comportamento existente (typecheck verde, sem mudança de schema).
- Os 6 caminhos atuais (incluindo importer) já estavam corretos antes deste ADR — refactor é preventivo, não corretivo.

## Notas

- Helper: [apps/api/src/modules/cards/helpers/create-card-with-presence.ts](../../apps/api/src/modules/cards/helpers/create-card-with-presence.ts)
- Postmortem: [docs/postmortems/2026-05-13-carrossel-cannes.md](../postmortems/2026-05-13-carrossel-cannes.md)
- Multi-fluxo (decisão original): [ADR-0003](0003-cards-multi-fluxo-cardpresence.md)
- Doc da feature multi-fluxo: [tarefas-md/13-cards-multi-fluxo.md](../../tarefas-md/13-cards-multi-fluxo.md)
- shortCode: [tarefas-md/24-shortcode-card.md](../../tarefas-md/24-shortcode-card.md)
