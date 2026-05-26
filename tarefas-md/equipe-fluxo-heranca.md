# Herança de equipe do fluxo

## Escopo

Hoje `Board.inheritTeamOnNewCards` só adiciona a equipe do board em cards
**criados direto** no board. Não cobre:

- Card vinculado de outro fluxo (multi-fluxo via CardPresence)
- Cards que já existiam quando o toggle foi ligado

Tornar a herança de equipe coerente — "equipe do fluxo está em todos os
cards presentes no fluxo":

1. **Link multi-fluxo herda equipe**: `linkToFlow` passa a adicionar a
   equipe do board destino se ele tem `inheritTeamOnNewCards`.
2. **Botão "Aplicar a equipe aos cards atuais"**: varre cards presentes
   no fluxo e adiciona membros da equipe que faltam. Aditivo, idempotente,
   nunca remove.

## Fora do escopo

- Remover membros (operação é só aditiva)
- Notificar os membros adicionados (operação administrativa silenciosa —
  adicionar N×M CardMembers dispararia spam de ASSIGNED)
- Sincronização contínua/automática (toggle + botão cobrem; não precisa
  de listener que re-sincroniza a cada mudança de equipe do board)

## Etapas

### Backend

1. `cards.service.ts::linkToFlow`: após upsert da presence, se o board
   destino tem `inheritTeamOnNewCards`, adicionar `CardMember` pros
   membros do board (skipDuplicates). Mesmo padrão do `create()`.
2. `boards.service.ts::applyTeamToCards(userId, tenant, boardId)`:
   - assertAccess EDITOR no board (ou ADMIN? decidir — uso EDITOR pra
     alinhar com quem mexe em card)
   - pega membros do board
   - pega cards com CardPresence ativa nesse board (distinct cardId)
   - createMany CardMember (skipDuplicates)
   - retorna `{ cardsAffected, membersApplied, rowsCreated }`
3. `boards.controller.ts`: `POST /boards/:id/apply-team-to-cards`
4. Sem Activity log por card (seria ruído) — 1 log opcional de "equipe
   aplicada retroativamente" no nível do board.

### Frontend

5. Query/mutation `applyTeamToCards(boardId)` em `lib/queries/boards.ts`
6. Botão no `board-settings-dialog.tsx`, perto do toggle
   `inheritTeamOnNewCards`:
   - Label: "Aplicar a equipe aos cards atuais"
   - Subtexto: "Adiciona os membros da equipe a todos os cards do fluxo
     que ainda não os têm. Não remove ninguém."
   - Confirmação antes (pode afetar muitos cards)
   - Toast de resultado: "Equipe aplicada a N cards."

## Critérios de aceite

- [ ] Card criado direto no ANEC → herda equipe (ja funcionava)
- [ ] Card do Atendimento vinculado ao ANEC → herda equipe do ANEC (se toggle on)
- [ ] Botão aplica equipe aos cards existentes do fluxo
- [ ] Operação idempotente — clicar 2x não duplica nem erra
- [ ] Não remove membros que não são da equipe
- [ ] Cards multi-fluxo: considera presença ativa, não só primário
- [ ] Não dispara notificações em massa
- [ ] Typecheck + lint + testes verdes

## Riscos / decisões

- **Permissão do botão**: EDITOR no board (quem edita cards). Poderia ser
  ADMIN-only, mas equipe é config operacional, não estrutural.
- **Performance**: board grande (500 cards × 8 membros = 4000 rows).
  createMany skipDuplicates numa query só. Aceitável.
- **inheritTeamOnNewCards desligado**: o botão ainda funciona? SIM — o
  botão é ação explícita, independente do toggle. Toggle = automático
  no futuro; botão = retroativo agora.
- **TEAM_ONLY cards**: incluídos — equipe do fluxo é justamente quem deve
  ter acesso.
