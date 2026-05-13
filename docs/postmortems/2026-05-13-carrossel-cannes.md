# Postmortem — Cards invisíveis no kanban (CARROSSEL CANNES)

- **Data do incidente**: 2026-05-13
- **Detectado por**: Nicchon (operador), durante uso normal do quadro Redes Sociais
- **Detectado em**: 2026-05-13 ~17:30 (America/Sao_Paulo)
- **Resolvido em**: 2026-05-13 ~18:15 (backfill) / 18:05:28 (último fix de código, commit `324ab29`)
- **Duração do impacto**: ~17 dias de bug latente (2026-04-26 → 2026-05-13); 9 cards efetivamente órfãos entre 2026-05-11 e 2026-05-13
- **Severidade**: P2
- **Autor do postmortem**: Nicchon

> Nota sobre severidade: classificado como **P2** porque o impacto foi interno e contornável — aprovações com cliente seguiam funcionando via link público, nenhum dado foi perdido e nenhum cliente externo notou. Tenderia a **P1** se o time tivesse perdido contexto de cards em pauta ou se a feature "card filho" estivesse no caminho crítico de algum cliente.

## Resumo executivo

Três métodos de criação de Card (`createChild`, `duplicate`, automation `CREATE_CHILD_CARD`) omitiam a criação de `CardPresence` e a geração de `shortCode`, deixando cards "invisíveis" no kanban apesar de existirem no banco. O bug viveu 17 dias em produção. Foi detectado quando o card "CARROSSEL FESTIVAL DE CANNES" não apareceu no quadro Redes Sociais apesar de estar em fluxo de aprovação ativa. 9 cards afetados foram corrigidos via backfill SQL; o código foi corrigido em dois commits.

## Impacto

- **Usuários afetados**: equipe interna Kharis. Cards seguiam existindo no banco e acessíveis via link direto / aprovação pública — só não apareciam no kanban.
- **Funcionalidades afetadas**: visualização de cards no quadro (`GET /boards/:id`) e numeração humana (`shortCode`).
- **Dados perdidos / corrompidos**: nenhum. Apenas escritas omitidas em tabelas auxiliares (`CardPresence`, `Organization.cardSequence`).
- **Reportes externos**: 0. Clientes acessavam os cards via link público de aprovação, que lê `Card` direto sem depender de `CardPresence`.
- **Trabalho interno perdido**: nenhum. O fluxo de aprovação seguiu rodando; apenas a visibilidade no quadro estava prejudicada até o backfill.
- **Cards efetivamente afetados**: 9, todos no board Redes Sociais, criados entre 2026-05-11 e 2026-05-13.

## Linha do tempo

| Horário (BRT)                          | Evento                                                                                                                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-25 (commit `9bdf171`)          | Modelo `CardPresence` introduzido (multi-fluxo iteração 1). Kanban ainda lia de `Card.boardId/listId`.                                                                           |
| 2026-04-25 (commit `cabaa0f`)          | `createChild()` implementado em [apps/api/src/modules/cards/cards.service.ts](../../apps/api/src/modules/cards/cards.service.ts). Já nasceu sem criar `CardPresence`.            |
| 2026-04-25 (commit `87d9d57`)          | `handleCreateChildCard()` implementado em [apps/api/src/modules/automations/automations.engine.ts](../../apps/api/src/modules/automations/automations.engine.ts). Mesma omissão. |
| 2026-04-24 (commit `44d287f`)          | `duplicate()` em `cards.service.ts:693` ganha versão com seleção fina cross-board. Sem `CardPresence`.                                                                           |
| 2026-04-26 (commit `2da7e0d`)          | Kanban passa a **ler de `CardPresence`** em vez de `Card.listId`. Bug latente vira efetivo: cards criados pelos 3 paths deixam de aparecer.                                      |
| 2026-04-27 (commit `84003d5`)          | `shortCode` (sequência humana por Org) introduzido. Cards dos 3 paths passam a ficar com `shortCode = NULL` — sinal adicional detectável.                                        |
| 2026-05-11 a 2026-05-13                | 9 cards criados via `createChild()` no board Redes Sociais ficam órfãos.                                                                                                         |
| 2026-05-13 ~14:51 (aprox.)             | Último card órfão criado (CARROSSEL FESTIVAL DE CANNES, `cmp2w7r80...`).                                                                                                         |
| 2026-05-13 ~17:30 (aprox.)             | Detecção visual: card sumido do quadro Redes Sociais apesar de estar em aprovação ativa.                                                                                         |
| 2026-05-13 ~17:35 (aprox.)             | Link público de aprovação aberto confirma que o Card existe no banco — problema é de visualização, não de corrupção.                                                             |
| 2026-05-13 ~17:38 (aprox.)             | `INSERT` manual da `CardPresence` faltante restaura visibilidade do card afetado.                                                                                                |
| 2026-05-13 17:47:49 (commit `b132c54`) | Fix `createChild()` pushed: incrementa `Organization.cardSequence` e cria `CardPresence`.                                                                                        |
| 2026-05-13 ~18:00 (aprox.)             | Auditoria SQL identifica mais 8 cards órfãos (9 no total).                                                                                                                       |
| 2026-05-13 ~18:15 (aprox.)             | Batch SQL corrige `CardPresence` + `shortCode` dos 9.                                                                                                                            |
| 2026-05-13 18:05:28 (commit `324ab29`) | Auditoria sistemática dos 6 paths de criação de Card. Fix de `duplicate()` e `handleCreateChildCard()` pushed.                                                                   |

> Horários marcados com `~` são aproximações baseadas em mensagens do operador. Timestamps de commit são exatos.

## Causa raiz

Três métodos de criação de Card replicavam apenas parte da sequência canônica que o `create()` principal executava. A sequência completa é:

1. Incrementar `Organization.cardSequence` (gera próximo `shortCode`).
2. Inserir row em `Card` (com o `shortCode` gerado).
3. Inserir row em `CardPresence` apontando pra `boardId`/`listId` (sem essa row, o card não aparece no kanban desde a iteração 2 do multi-fluxo).

Os 3 paths quebrados:

| Método                    | Arquivo                                                                                                                | Faltava                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `createChild()`           | [apps/api/src/modules/cards/cards.service.ts](../../apps/api/src/modules/cards/cards.service.ts)                       | `Organization.cardSequence` + `CardPresence`     |
| `duplicate()`             | [apps/api/src/modules/cards/cards.service.ts:693](../../apps/api/src/modules/cards/cards.service.ts#L693)              | `Organization.cardSequence` + `CardPresence`     |
| `handleCreateChildCard()` | [apps/api/src/modules/automations/automations.engine.ts](../../apps/api/src/modules/automations/automations.engine.ts) | `CardPresence` (gerava `shortCode` corretamente) |

Pano de fundo — por que essas omissões existiam:

- **`CardPresence` é jovem**: introduzido em 2026-04-25 (commit `9bdf171`). Antes, `Card.boardId/listId` bastava pro kanban renderizar. As 3 funções foram escritas **antes ou junto** com essa mudança, sem reflexão sistemática sobre todos os paths de criação.
- **`shortCode` é ainda mais novo**: introduzido em 2026-04-27 (commit `84003d5`), 2 dias depois das funções já estarem em produção. A invariante "todo Card precisa de `shortCode`" nunca foi documentada como contrato dos métodos.
- **Sem helper centralizado**: cada path de criação de Card monta sua própria sequência de Prisma calls. Não havia um `createCardWithPresence()` interno que centralizasse a invariante.

Padrão sistêmico: **3 dos 6 paths de criação de Card omitiam parte da sequência canônica**. A descoberta veio só na auditoria pós-incidente — sinaliza que o problema estava distribuído, não pontual.

## O que funcionou bem

- **Link público de aprovação acessa Card diretamente**, sem passar por `CardPresence`. Foi o que permitiu confirmar em segundos que o card existia e não tinha sido deletado — narrowing rápido do problema (visualização vs corrupção).
- **Auditoria sistemática pós-fix**: depois de corrigir `createChild`, o reflexo certo foi rodar "o que mais cria Card?" e auditar os outros 5 paths. Foi assim que `duplicate()` e `handleCreateChildCard()` apareceram. Sem essa auditoria, esses 2 paths continuariam sendo bombas-relógio.
- **Backfill SQL foi simples e seguro**: schema do `CardPresence` é estável, o `INSERT` ficou trivialmente reconstruível a partir de `Card.boardId/listId`. Risco zero de quebrar dados existentes.
- **Resposta rápida**: entre detecção (~17:30) e fix em prod (18:05), passaram ~35 minutos.

## O que falhou

- **Nenhum teste e2e** cobria "criar card filho → conferir que aparece no `GET /boards/:id` do pai". Mesma lacuna pra "duplicar card" e pra automation `CREATE_CHILD_CARD`. Um único teste de visibilidade pegaria o bug em CI antes do merge.
- **Nenhuma query de health-check periódica** detectava `Card` com `shortCode IS NULL` ou `Card` ativo sem `CardPresence`. Ambas seriam queries triviais com saída clara.
- **Falta de helper centralizado** transformou cada método de criação em ponto de esquecimento independente. Quando o modelo `CardPresence` foi introduzido, a equipe deveria ter centralizado a sequência canônica em vez de confiar que cada path lembraria de fazer manualmente.
- **`tarefas-md/13-cards-multi-fluxo.md`** e [`docs/adr/0003-cards-multi-fluxo-cardpresence.md`](../adr/0003-cards-multi-fluxo-cardpresence.md) descrevem a decisão arquitetural mas **não destacam a invariante "todo create de Card precisa criar CardPresence"** como contrato crítico. Documentação tratou `CardPresence` como detalhe de implementação, não como invariante de domínio.
- **Bug silencioso por design**: cards "invisíveis no kanban" não geram erro, não aparecem em logs, não soam alerta. A única forma de detectar é alguém procurar um card específico que sabe que deveria estar lá. Bug com esse perfil tende a viver muito.

## Lições aprendidas

1. **Adicionar um modelo novo (`CardPresence`) sem centralizar a criação em helper é convite pra cada path criar manualmente — e cada path pode esquecer.** Quando uma invariante de domínio depende de múltiplas escritas, ela precisa ser encapsulada antes de viver em vários callsites.
2. **Bugs silenciosos podem viver meses.** "Não joga erro, não aparece em log, não soa alerta" significa que o único sinal é alguém procurar especificamente. Pra esse perfil de bug, **health-check periódico é a única defesa realista** — não dá pra confiar em detecção orgânica.
3. **Auditoria de "todos os caminhos que fazem X" é barata e pega bugs latentes.** Foi feita agora, em ~30 minutos, e revelou 2 outros bugs. Deveria ter sido feita logo após a introdução do `CardPresence` — fica como prática a aplicar quando uma invariante de domínio nova é introduzida.
4. **ADR/tarefa-md descrevendo decisão arquitetural não é suficiente** se não destaca as invariantes que a decisão cria. Documentação precisa marcar "a partir daqui, X passa a ser obrigatório em Y" de forma explícita, idealmente com uma seção "Como atualizar callers existentes" + "Como criar callers novos".
5. **Link público de aprovação como caminho independente foi sorte boa.** Se a feature dependesse de `CardPresence` (como o kanban depende), o bug teria afetado clientes externos diretamente. Vale revisar se outras "rotas de fuga" existem para outros domínios sensíveis — diversidade de paths é defesa em profundidade.

## Action items

| #   | Ação                                                                                                                                                                                                                                                          | Tipo       | Prioridade | Responsável | Status    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------- | ----------- | --------- |
| 1   | Extrair helper interno `createCardWithPresence()` em `CardsService` encapsulando `{ org.update(cardSequence) + card.create + cardPresence.create }`. Refatorar os 6 paths de criação pra consumir o helper.                                                   | preventivo | alta       | Nicchon     | aberto    |
| 2   | Teste e2e cobrindo "criar card filho", "duplicar card" e automation `CREATE_CHILD_CARD` → asserção de que o card aparece em `GET /boards/:id`.                                                                                                                | detectivo  | alta       | Nicchon     | aberto    |
| 3   | Query SQL agendada (cron diário, alerta via WhatsApp do operador): alertar se `count(Card WHERE shortCode IS NULL) > 0` ou se houver `Card` ativo sem `CardPresence` correspondente.                                                                          | detectivo  | média      | Nicchon     | aberto    |
| 4   | ADR documentando a invariante "todo Card precisa de `CardPresence` + `shortCode`" como contrato público do `CardsService`, com lista dos paths atuais e referência ao helper. Marca `0003-cards-multi-fluxo-cardpresence.md` como complementada por essa ADR. | preventivo | média      | Nicchon     | aberto    |
| 5   | Atualizar [tarefas-md/13-cards-multi-fluxo.md](../../tarefas-md/13-cards-multi-fluxo.md) com seção "Como criar Card corretamente" referenciando o helper e a ADR.                                                                                             | preventivo | baixa      | Nicchon     | aberto    |
| 6   | Registrar este postmortem como primeiro caso real no índice (já listado em [README.md](README.md)). Manter referenciado em discussões futuras de bugs de criação de entidade como exemplo de tom blameless e de padrão sistêmico.                             | decorativo | baixa      | Nicchon     | concluído |

## Links

- Commits do fix:
  - [`b132c54`](https://github.com/kharis-edu/gestao-de-tarefas/commit/b132c54) — fix(card): createChild gera shortCode + cria CardPresence
  - [`324ab29`](https://github.com/kharis-edu/gestao-de-tarefas/commit/324ab29) — fix(card): copy() e automation CREATE_CHILD_CARD criam CardPresence
- ADR relacionada: [0003-cards-multi-fluxo-cardpresence.md](../adr/0003-cards-multi-fluxo-cardpresence.md)
- Tarefa-md relacionadas:
  - [13-cards-multi-fluxo.md](../../tarefas-md/13-cards-multi-fluxo.md) — decisão multi-fluxo via `CardPresence`
  - [17-familia-cards.md](../../tarefas-md/17-familia-cards.md) — feature "card filho"
- Arquivos do código:
  - [apps/api/src/modules/cards/cards.service.ts](../../apps/api/src/modules/cards/cards.service.ts) — `create`, `createChild`, `duplicate`, `setParent`
  - [apps/api/src/modules/automations/automations.engine.ts](../../apps/api/src/modules/automations/automations.engine.ts) — `handleCreateChildCard`
  - [apps/api/prisma/schema.prisma](../../apps/api/prisma/schema.prisma) — models `Card`, `CardPresence`, `Organization`
