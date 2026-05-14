# Briefing — Postmortem template + caso CARROSSEL FESTIVAL DE CANNES

> **Como usar:** cole este briefing num chat novo de Claude com acesso a este repositório. Fase 0 (Inventário) primeiro; aguarda aprovação antes de produzir.

---

## Contexto rápido do projeto

KTask em produção. Em 2026-05-13, um bug foi descoberto: vários cards criados via dialog "Criar card filho" estavam **invisíveis no kanban** apesar de existirem no banco (não tinham `CardPresence` nem `shortCode`). 9 cards órfãos foram detectados e corrigidos. A causa raiz: o método `createChild` em [apps/api/src/modules/cards/cards.service.ts](../apps/api/src/modules/cards/cards.service.ts) esqueceu de incrementar `Organization.cardSequence` e criar `CardPresence`. Mais 2 métodos com o mesmo bug foram detectados em auditoria subsequente (`copy()` e `handleCreateChildCard` em automations). Todos corrigidos.

Commits envolvidos:

- `b132c54` — fix(card): createChild gera shortCode + cria CardPresence
- `324ab29` — fix(card): copy() e automation CREATE_CHILD_CARD criam CardPresence

---

## Objetivo desta sessão

Criar a estrutura de **postmortems** no KTask:

1. **Template** reutilizável (blameless postmortem — sem buscar culpado, foco em sistema).
2. **Postmortem do CARROSSEL CANNES** — escrever o primeiro caso real, enquanto ainda fresco.

**Audiência**: time todo. Postmortem é ferramenta de **aprendizado coletivo**, não auditoria pra punir alguém. Tom: técnico, factual, construtivo.

**Entregáveis**:

- `docs/postmortems/README.md` — índice + política (quando criar, como escrever blameless)
- `docs/postmortems/_TEMPLATE.md` — molde
- `docs/postmortems/2026-05-13-carrossel-cannes.md` — primeiro postmortem

Tamanho: postmortem entre **150 e 300 linhas**.

**Restrições**:

- Sem emojis.
- Nunca atribuir culpa a pessoa nomeada. Sistema, processo, falta de instrumentação — sim. "Fulana errou" — não.
- Honestidade total sobre o que falhou e o que poderia ter pego antes. Sem maquiar.
- Datas ISO `YYYY-MM-DD`. Horários em America/Sao_Paulo.
- Não publicar dados sensíveis (URLs de aprovação com token, emails de clientes).

---

## Fase 0 — Inventário forçado

### Leituras obrigatórias

1. [apps/api/src/modules/cards/cards.service.ts](../apps/api/src/modules/cards/cards.service.ts) — pelo menos as funções `create`, `copy`, `createChild`, `setParent` (e o fix em `createChild`)
2. [apps/api/src/modules/automations/automations.engine.ts](../apps/api/src/modules/automations/automations.engine.ts) — função `handleCreateChildCard`
3. [apps/api/prisma/schema.prisma](../apps/api/prisma/schema.prisma) — models `Card`, `CardPresence`, `Organization` (`cardSequence`)
4. Git log dos commits envolvidos: `git show b132c54`, `git show 324ab29`
5. [tarefas-md/13-cards-multi-fluxo.md](../tarefas-md/13-cards-multi-fluxo.md) — onde a decisão multi-fluxo é descrita
6. [tarefas-md/17-familia-cards.md](../tarefas-md/17-familia-cards.md) — feature "card filho"

### Exploração estruturada

- Linha do tempo: descobrir quando o feature "Criar card filho" foi introduzida (`git log --oneline --all -- apps/api/src/modules/cards/cards.service.ts | head -30`).
- Quantos cards órfãos no total? (no caso, 9 — confirmado em SQL durante a sessão de fix).
- Por quanto tempo o bug existiu? (estimar: data do commit que adicionou `createChild` → data da detecção `2026-05-13`).
- Houve impacto além dos 9 cards? (ex: clientes confusos, aprovações bloqueadas, etc).
- Detecção: por quê só descobrimos hoje? Que sinais existiam antes (logs? erros?) e que sinais não existiam (alertas? testes?)?

### Saída da Fase 0

```
## Inventário (Fase 0)

### Linha do tempo (provisória)
- YYYY-MM-DD: feature "Criar card filho" implementada (commit ABC)
- YYYY-MM-DD: bug latente — cada uso da feature cria card órfão
- 2026-05-13 ~14:51: último card órfão (CARROSSEL CANNES, cmp2w7r80...) criado
- 2026-05-13 ~17:30: Nicchon nota ausência do card no kanban
- 2026-05-13 ~17:35: link público de aprovação confirma que card existe
- 2026-05-13 ~17:38: INSERT manual da CardPresence faltante
- 2026-05-13 ~18:00: auditoria detecta 8 outros órfãos
- 2026-05-13 ~18:15: SQL batch corrige todos os 9 + fix do código em b132c54
- 2026-05-13 ~21:30: auditoria de TODOS os métodos de criação de Card detecta 2 outros bugs latentes (copy, handleCreateChildCard) — fix em 324ab29

### Impacto medido
- Cards afetados: 9 (entre 11/05 e 13/05)
- Boards afetados: 1 (Redes Sociais)
- Clientes afetados: confirma se algum cliente reportou que não viu card que deveria ver
- Tempo offline / degradação: nenhum (cards seguiam acessíveis via link direto, só não apareciam no kanban)

### Causa raiz (já identificada)
- Método createChild em cards.service.ts não chamava org.update(cardSequence) nem prisma.cardPresence.create
- Era padrão em todos os outros métodos de criação (create, importer)
- Probabilidade alta: copiou parcialmente o template do create() ao implementar createChild

### Detecção
- Falhou a pegar: nenhum teste cobria criação de filho + visualização no kanban
- Pegou (acidentalmente): user reportou card sumido no fluxo de aprovação ao cliente
- Sinais que existiam: cards no banco com shortCode NULL (anomalia detectável via query simples)

### Métodos corretivos aplicados
1. Backfill SQL nos 9 cards: INSERT CardPresence + UPDATE shortCode via cardSequence
2. Fix do createChild: commit b132c54
3. Auditoria de TODOS os 6 caminhos de criação: detectou 2 outros bugs
4. Fix de copy() e handleCreateChildCard: commit 324ab29

### Action items propostos (vou listar no postmortem)
1. Helper centralizado createCardWithPresence() pra eliminar o esquecimento estrutural
2. Teste e2e cobrindo "criar filho → aparece no kanban do pai"
3. Query de health-check periódica: detectar cards com shortCode NULL ou sem CardPresence ativa
4. ADR pra documentar a regra "todo create de Card precisa de CardPresence + shortCode"
5. ...

### Lacunas que devo esclarecer
- Não sei a data EXATA em que createChild foi introduzido — preciso conferir git blame
- Não sei se algum cliente reportou o problema antes do user notar
- ...

**Aguardo aprovação ou correção antes de produzir o postmortem.**
```

---

## Fase 1 — Produção

Após aprovação:

### 1. `_TEMPLATE.md`

```markdown
# Postmortem — [Título curto do incidente]

- **Data do incidente**: YYYY-MM-DD
- **Detectado por**: [pessoa ou monitoramento]
- **Detectado em**: YYYY-MM-DD HH:MM (America/Sao_Paulo)
- **Resolvido em**: YYYY-MM-DD HH:MM
- **Duração do impacto**: X horas/dias
- **Severidade**: P0 | P1 | P2 | P3
- **Autor do postmortem**: [pessoa]

## Resumo executivo

[2-3 frases. O que aconteceu, qual o impacto, como foi resolvido. Legível em 30 segundos.]

## Impacto

- Usuários afetados: ...
- Funcionalidades afetadas: ...
- Dados perdidos / corrompidos: ... (idealmente "nenhum")
- Receita ou SLA: ... (omitir se interno)

## Linha do tempo

| Horário (BRT) | Evento |
| ------------- | ------ |
| HH:MM         | ...    |
| HH:MM         | ...    |

## Causa raiz

[Análise técnica. O que causou. Não "fulano fez X errado" — "o sistema permitiu X em circunstância Y porque Z". Inclua trechos de código relevantes com link pra commit/arquivo.]

## O que funcionou bem

[Reconhece o que ajudou a detectar/resolver. Importante pra reforçar boas práticas.]

## O que falhou

[Sem culpado individual. Falhas de processo, ferramenta, falta de instrumentação, suposições não-validadas.]

## Lições aprendidas

[3-5 lições genéricas que ficam pro time.]

## Action items

| #   | Ação              | Tipo       | Prioridade | Responsável | Status |
| --- | ----------------- | ---------- | ---------- | ----------- | ------ |
| 1   | Implementar X     | preventivo | alta       | [pessoa]    | aberto |
| 2   | Adicionar teste Y | corretivo  | média      | [pessoa]    | aberto |

Tipos: preventivo (impede recorrência), detectivo (acelera detecção futura), corretivo (resolve causa raiz remanescente), mitigatório (reduz impacto se ocorrer de novo).

## Links

- Commits do fix: ...
- Issues / PRs: ...
- Outras docs relevantes: ...
```

### 2. `docs/postmortems/README.md`

Política e índice:

- O que é blameless postmortem
- Quando criar (severidade P0 ou P1 obrigatório; P2 a critério)
- Quem escreve (quem liderou a resolução)
- Tempo máximo após o incidente: 7 dias
- Tabela com todos os postmortems

### 3. `2026-05-13-carrossel-cannes.md`

Preencher o template com o caso real. Pontos importantes:

- **Resumo**: bug latente em `createChild` causou 9 cards "invisíveis" no kanban. Detectado quando "CARROSSEL FESTIVAL DE CANNES" não apareceu no quadro Redes Sociais apesar de estar em fluxo de aprovação ativa. Causa: método de criação esqueceu de criar `CardPresence` e gerar `shortCode`.

- **Impacto**: 9 cards entre 2026-05-11 e 2026-05-13. Nenhum dado perdido. Cards seguiam acessíveis via link direto. Equipe Kharis não perdia trabalho — só não enxergava o card no quadro até o fix.

- **Linha do tempo**: usa os dados que você confirmou na Fase 0.

- **Causa raiz**:
  - Code path `createChild` não replicou a sequência completa de criação de Card que o `create()` normal fazia (`Organization.cardSequence` increment + `Card` insert + `CardPresence` insert).
  - Pano de fundo: modelo `CardPresence` foi introduzido na iteração 2 (multi-fluxo) — antes, `Card.boardId` bastava. Métodos novos que assumem o modelo antigo causam órfãos.
  - Padrão sistêmico: outros 2 métodos (`copy()`, `handleCreateChildCard`) tinham mesma omissão. Sugere que falta um helper centralizado.

- **O que funcionou**: link público de aprovação independe de CardPresence (acessa Card direto) — ajudou a confirmar que o problema era de visualização, não corrupção de dados.

- **O que falhou**:
  - Nenhum teste cobria "criar filho → verificar que aparece no kanban".
  - Nenhuma query de health-check detectava cards com shortCode NULL ou sem CardPresence ativa (sinal claríssimo).
  - A documentação da decisão "multi-fluxo via CardPresence" ([tarefas-md/13](../tarefas-md/13-cards-multi-fluxo.md)) não destacava a regra "todo create de Card precisa criar CardPresence" como invariante crítica.

- **Lições**:
  1. Adicionar um modelo novo (CardPresence) sem **centralizar a criação** em helper deixa cada path criando manualmente e cada um pode esquecer.
  2. Cards "invisíveis no kanban" são silenciosos — não geram erro, não aparecem em logs. Falta de feedback negativo = bug pode viver meses.
  3. Auditoria de "todos os caminhos que fazem X" é barata e pega bugs latentes. Foi feita agora, deveria ter sido feita logo após introdução do CardPresence.

- **Action items**:
  | # | Ação | Tipo | Prioridade |
  |---|---|---|---|
  | 1 | Helper `createCardWithPresence()` em CardsService | preventivo | alta |
  | 2 | Teste e2e: "criar filho do card pai" → card aparece no kanban | detectivo | alta |
  | 3 | Query SQL agendada (cron diário): alerta se houver cards com shortCode NULL ou sem CardPresence ativa | detectivo | média |
  | 4 | ADR documentando invariante "todo Card precisa de CardPresence" | preventivo | média |
  | 5 | Atualizar [tarefas-md/13](../tarefas-md/13-cards-multi-fluxo.md) com seção "Como criar Card corretamente" | preventivo | baixa |

---

## Fase 2 — Auto-auditoria

1. **Blameless**: nenhum nome próprio aparece numa frase culpando? (OK aparecer em "detectado por", "autor", "responsável")
2. **Factual**: cada afirmação técnica tem respaldo no código ou commits?
3. **Action items são acionáveis**: cada um tem dono, tipo e prioridade?
4. **Privacidade**: nenhum link público de aprovação com token real está no doc?
5. **Entrega**:

```
## Resumo da entrega

- Arquivos: docs/postmortems/README.md, _TEMPLATE.md, 2026-05-13-carrossel-cannes.md
- Action items propostos: N
- Inferências sem confirmação: [lista]
- Dados sensíveis verificados: [confirma que nenhum token vazou no doc]
```

---

## Notas gerais

- Sem emojis.
- Blameless de verdade — se sentir que precisa de "culpa", repensa a frase.
- Use exemplos concretos (trechos de código, ids reais de cards). Mas sem expor tokens.
- Em dúvida, pergunte.
