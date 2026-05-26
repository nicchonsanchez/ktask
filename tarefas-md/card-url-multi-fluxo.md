# Card URL multi-fluxo

## Escopo

Cards multi-fluxo (`CardPresence` em N boards) hoje sao tratados como se morassem num board so — `Card.boardId` eh autoritativo. URLs ficam `/b/<boardId>?card=<id>` e checks de permissao olham so o board primario. Resultado: usuario que faz parte de board secundario nao consegue abrir link do card (403).

Tornar URL do card **board-independente**:

- Permissao olha presencas + lider/membros, nao um board so
- Links no app usam `?card=<id>` preservando rota atual (`GlobalCardModal` ja cuida do render)
- Rota curta `/c/<shortCode>` redireciona pra `/?card=<id>` em vez de `/b/<board>?card=<id>`

## Fora do escopo

- Refactor da coluna `Card.boardId` (continua existindo como "presenca primaria legacy")
- Mudar URL do board em si (`/b/<boardId>`)
- Permissoes de operacoes que **mudam a estrutura** (mover/arquivar): essas ainda precisam de board context (vao continuar usando `assertAccess(boardId)`)

## Etapas

### Backend

1. Adicionar `BoardAccessService.assertCardAccess(userId, cardId, tenant, required)`
   - OWNER/ADMIN/GESTOR da Org → ok
   - `card.privacy = TEAM_ONLY` → user precisa ser `leadId` ou estar em `CardMember`
   - `card.privacy = PUBLIC` → user precisa ter acesso (>= `required`) a **pelo menos um** board onde o card tem `CardPresence` ativa (`removedAt = null`)
   - Backward compat: continua throwando Forbidden/NotFound como `assertAccess`
2. Trocar em `cards.service.ts`: `assertAccess(userId, card.boardId, ...)` → `assertCardAccess(userId, cardId, ...)`
   - getOne, updateCore, comments, checklists relacionados a card, etc. (15 chamadas)
3. Espelhar em `attachments.service.ts`, `comments.service.ts`, `checklists.service.ts`, `time-entries.service.ts`, `approvals.service.ts` (operacoes que partem do card, nao do board)
4. NAO mexer em chamadas que partem de **list/board** (ex: criar card em coluna → `assertAccess(list.boardId)`) — essas mantem semantica de board

### Frontend

5. Atualizar `apps/web/src/app/(app)/c/[code]/page.tsx`: redirecionar pra `/?card=<id>` (modal sobre home) em vez de `/b/<board>?card=<id>`
6. Trocar links em ~17 lugares no front: `/b/<boardId>?card=<id>` → preservar pathname atual + adicionar `?card=<id>`
   - Helper `cardModalHref(cardId, currentPath)` pra consistencia
   - Casos:
     - `/aprovacoes` → ja tem currentPath `/aprovacoes`
     - `/contatos` → idem
     - `/indicadores/cards` → idem
     - etc.
7. Botao "copiar link" no card-modal: copia `${origin}/c/<shortCode>` (rota curta)

## Criterios de aceite

- [ ] User membro de board secundario (nao primario) consegue abrir card via link → modal abre
- [ ] User sem acesso a NENHUM board do card recebe 403 (e nao 200)
- [ ] Card TEAM_ONLY: user nao-lead, nao-membro recebe 403 mesmo sendo membro de board onde o card aparece
- [ ] Card TEAM_ONLY: lead consegue abrir
- [ ] Link compartilhado `/c/412` abre modal sobre home (nao redireciona pra board)
- [ ] Clicar em card no painel/aprovacoes/contatos abre modal SEM perder a pagina atual
- [ ] Botao "copiar link" no modal copia URL com `/c/<shortCode>`
- [ ] Testes: typecheck + lint passam

## Riscos / decisoes

- **Performance**: `assertCardAccess` faz mais 1 JOIN (em CardPresence) vs `assertAccess(boardId)`. Aceitavel — sempre executa em rota individual de card, nao em listagem.
- **Realtime**: modal global ja subscreve no card via Socket.IO; nao depende de room de board. Sem mudanca aqui.
- **TEAM_ONLY**: bypass pra OWNER/ADMIN/GESTOR mantido (espelha comportamento atual de privacy.ts).
- **Compat**: links antigos `/b/<boardId>?card=<id>` continuam funcionando — `GlobalCardModal` so renderiza fora de `/b/`, dentro do board o modal local ainda assume.
- **Edit operations**: continuam exigindo EDITOR no board acessivel. Se user so tem VIEWER em todos os boards do card, vai conseguir VER mas nao EDITAR — comportamento esperado.
