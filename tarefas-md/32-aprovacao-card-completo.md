# 32 — Aprovação WhatsApp: mostrar card completo

## Contexto

Hoje a página `/aprovar/[token]` ([page.tsx](../apps/web/src/app/aprovar/[token]/page.tsx))
mostra apenas: título do card, board, lista, prioridade, data de
entrega, e quem solicitou. **Não mostra** descrição, anexos, timeline,
comentários, checklists, membros nem labels.

O recipient (cliente externo via link tokenizado, sem login) precisa
de **contexto completo** pra decidir aprovar/reprovar com responsabilidade.
Imagine um designer enviando um post pra aprovação do cliente — o
cliente precisa ver a arte (anexo), o briefing (descrição), notas da
timeline, comentários da equipe.

## Escopo

### Dentro do escopo

1. Backend: ampliar `getPublicView()` em
   [approvals.service.ts:789](../apps/api/src/modules/approvals/approvals.service.ts#L789)
   pra incluir no `select` do card:
   - `description` (já incluído mas não renderizado)
   - `startDate`, `completedAt`, `estimateMinutes`
   - `labels` (CardLabel → Label)
   - `members` (CardMember → user com role)
   - `lead` (User do `Card.leadId`)
   - `checklists` com `items`
   - `attachments` (não-embedded, não-deletados) — fileName, mimeType,
     sizeBytes, storageKey, kind, externalUrl
   - `comments` (não-deletados) com `author`, ordenados desc por
     createdAt, paginação simples (take 50)
   - `activities` (audit log) ordenadas desc, take 50, com actor
2. Backend: hidratar URLs públicas dos attachments via `StorageService`
   (igual o `coverImageUrl` existente em listings).
3. Frontend: renderizar todas as seções na `/aprovar/[token]/page.tsx`,
   read-only:
   - **Descrição**: `<RichEditor readOnly>` ([editor/rich-editor.tsx](../apps/web/src/components/editor/rich-editor.tsx))
     já suporta `readOnly`.
   - **Membros + líder**: avatares com nome.
   - **Labels**: chips coloridos.
   - **Prioridade + datas**: badge + linha.
   - **Checklists**: lista expandida com itens marcados/desmarcados
     (não interativos — somente leitura).
   - **Anexos**: lista com ícone por kind (FILE/IMAGE/LINK), nome,
     tamanho, link de download (`<a target="_blank">`). Imagens podem
     ter preview thumb.
   - **Timeline**: 2 abas — "Comentários" (Tiptap render read-only) e
     "Atividades" (lista de eventos formatados via helpers existentes
     em [activity-format.ts](../apps/web/src/lib/activity-format.ts)).
4. Layout: ampliar largura do `CenteredCard` quando carregar dados
   completos (max-w-2xl ou 3xl) — caber tudo sem ficar apertado.
5. Mobile: scroll vertical natural; sem tabs/abas se for ruim em tela
   pequena. Sections empilhadas com headers colapsáveis (`<details>`)
   pra reduzir cognitive load.

### Fora do escopo

- **Aba "Cards filhos"** (subtarefas) — fora do contexto de aprovação
  pontual. Se o cliente precisar ver hierarquia, o solicitante pode
  enviar links separados.
- **Aba "Fluxos"** — multi-fluxo é detalhe interno, não interessa ao
  approver externo.
- **Permitir comentar/anexar** no link público — só leitura. Se o
  approver tem feedback, usa o campo "Reprovar com justificativa".
- **Real-time updates** — view é estática, snapshot do momento de
  abrir. Se algo muda, approver re-abre o link.

## Considerações de privacidade

- O link tokenizado expõe **TODO o conteúdo do card** pra qualquer
  pessoa que tenha o link. Isso já é o caso hoje (token único +
  expirável), mas com mais dados o blast radius cresce.
- Comentários internos da equipe ficam visíveis. Pode ser indesejável
  em alguns casos (ex: discussões sobre cliente). **Aceitar como
  trade-off por enquanto** — comentário interno de risco fica no chat
  da equipe, não no card.
- **Risco real**: link vazado → todo histórico exposto. Mitigado por:
  (a) token aleatório longo, (b) `expiresAt`, (c) revoke ao decidir.
  Não vamos adicionar mais camadas (PIN, OTP) nesta iteração.
- Documentar no doc: aprovador externo vê tudo. Solicitante deve
  pensar antes de pedir aprovação de cards com info sensível.

## Etapas

1. Backend `getPublicView()`: estender `select` com todos os campos.
2. Backend: hidratar `attachments` com `publicUrl` resolvido via
   `StorageService.publicUrlFor(storageKey)` — só p/ não-embedded.
3. Frontend: tipos atualizados em
   [queries/approvals.ts](../apps/web/src/lib/queries/approvals.ts).
4. Frontend: criar componentes auxiliares se ficar verboso:
   - `<ApprovalDescription>` — wrap do `RichEditor` readOnly.
   - `<ApprovalAttachments>` — lista com ícones + downloads.
   - `<ApprovalChecklists>` — lista hierárquica.
   - `<ApprovalTimeline>` — comments + activities.
5. Frontend: integrar tudo em
   [page.tsx](../apps/web/src/app/aprovar/[token]/page.tsx).
6. Validar typecheck + lint.
7. Sanity check manual no dev: criar card com descrição rica,
   anexar arquivo, comentar, criar checklist; pedir aprovação e
   abrir link incógnito.

## Critérios de aceite

- [ ] Página pública mostra descrição renderizada (não JSON cru).
- [ ] Anexos aparecem como links clicáveis com nome e tamanho.
- [ ] Imagens (kind=IMAGE) têm preview thumb.
- [ ] Checklists aparecem com itens marcados/desmarcados (read-only).
- [ ] Timeline mostra comentários (com autor + data) e atividades
      relevantes (movimentações, criação, etc).
- [ ] Membros + líder do card visíveis com avatares.
- [ ] Labels do card visíveis como chips coloridos.
- [ ] Prioridade + datas (start, due, completed) visíveis quando
      preenchidos.
- [ ] Aprovador externo (sem login) vê tudo sem permissão extra
      (mantém o modelo atual de token).
- [ ] Layout funciona bem em mobile (DOM em coluna, sem overflow
      horizontal).

## Riscos / decisões abertas

- **Performance**: card com muitas activities (100+) e comments pode
  ficar pesado. `take: 50` em ambos é o limite — depois disso, omite
  com aviso "Mais histórico só pelo card original".
- **Render de Tiptap em página pública**: bundle do editor é ~150KB.
  Aceitável só na página de aprovação (lazy load). Confirmar que o
  `RichEditor` existente já é dynamic-imported.
- **i18n**: helpers de timeline ([activity-format.ts](../apps/web/src/lib/activity-format.ts))
  formatam em pt-BR. Se a Org tiver clientes anglo, fica em pt-BR
  mesmo — i18n é fora do escopo do MVP.
