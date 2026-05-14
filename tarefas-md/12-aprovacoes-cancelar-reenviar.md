# Cancelar e reenviar pedidos de aprovação

> Adicionar 2 ações no fluxo de aprovações do KTask: cancelar pedido pendente e reenviar mensagem pros revisores. Plus: remover revisor individual e padronizar tom das mensagens automáticas WhatsApp com rodapé "_Esta é uma mensagem automática._".

## Escopo

### Dentro

- **Status `CANCELED`** no enum `ApprovalStatus` + campos de auditoria (`canceledAt`, `canceledById`, `cancelReason`).
- **Endpoint `DELETE /v1/approvals/:id`** pra cancelar pedido enquanto status = PENDING (qualquer tempo, sem rate limit). Mostra na UI quem cancelou + motivo.
- **Endpoint `POST /v1/approvals/:id/resend`** pra reenviar WhatsApp + notificação in-app. Comportamento condicional ao número de revisores:
  - 1 revisor → dispara direto.
  - 2+ revisores → UI abre pop-up com "Reenviar para todos" + 1 radio por revisor (escolhe 1).
- **Endpoint `DELETE /v1/approvals/:id/reviewers/:reviewerId`** pra remover revisor individual sem cancelar o pedido todo.
- **Persistir mensagem original** (`CardApproval.message`) pra reenviar com mesmo texto.
- **Rate limit** no reenvio: cooldown 30s entre reenvios + 10/dia (proteção anti-burst, não autoritário).
- **Página pública `/aprovar/:token`**: mostra estado "Pedido cancelado" + quem cancelou + motivo, em vez dos botões Aprovar/Reprovar.
- **WhatsApp de cancelamento** pros revisores (template novo).
- **Templates WhatsApp padronizados** com negritos e rodapé `> Esta é uma mensagem automática.` em todas as mensagens automáticas do KTask (não só aprovação).
- **Activity log**: `kind: 'approval.canceled'`, `'approval.resent'`, `'approval.reviewer_removed'` em payload de `CARD_UPDATED`.
- **Tutorial** [apps/web/content/ajuda/aprovacoes/01-pedir-aprovacao-cliente.md](apps/web/content/ajuda/aprovacoes/01-pedir-aprovacao-cliente.md): remover tags `[CONFIRMAR]` das seções "Cancelar ou reverter" e "Remover revisor".

### Fora

- Aprovação quorum (vários precisam aprovar). Continua "primeiro a votar ganha".
- Recriar pedido cancelado com 1 clique (basta reabrir pedir-aprovação).
- Notificação push do navegador pra cancelamento (segue notificações já existentes).
- Reverter aprovação já decidida (já existe via `undo`).

## Etapas

### 1. Backend — Prisma

1.1. Adicionar `CANCELED` ao enum `ApprovalStatus` em [apps/api/prisma/schema.prisma:617-622](apps/api/prisma/schema.prisma#L617).

1.2. Adicionar campos em `model CardApproval`:

- `canceledAt DateTime?`
- `canceledById String?`
- `cancelReason String?`
- `message String?` — mensagem original do requester (pra reenvio idêntico).
- `lastNotifiedAt DateTime?` — pra rate-limit.
- `notifyCount Int @default(0)` — pra cap diário.
- Relação `canceledBy User? @relation("ApprovalCanceler", fields: [canceledById], references: [id])`.

  1.3. Adicionar em `model User`: `approvalsCanceled CardApproval[] @relation("ApprovalCanceler")`.

  1.4. `pnpm prisma migrate dev --name approvals_cancel_and_resend`.

### 2. Backend — DTOs

Em [apps/api/src/modules/approvals/dto/approvals.schemas.ts](apps/api/src/modules/approvals/dto/approvals.schemas.ts):

- `CancelApprovalSchema = z.object({ reason: z.string().max(500).trim().optional() })`
- `ResendApprovalSchema = z.object({ reviewerId: z.string().cuid().optional() })` — `null/undefined` = todos.
- `RemoveReviewerSchema = z.object({})` — sem body, só URL param.

### 3. Backend — Service

[apps/api/src/modules/approvals/approvals.service.ts](apps/api/src/modules/approvals/approvals.service.ts):

3.1. **Persistir mensagem** no `request()` (linha 149+): incluir `message: body.message ?? null` no `.create()`.

3.2. **Extrair `dispatchNotifications`** do `notifyReviewers` privado. Assinatura: `dispatchNotifications(approvalId, opts: { targetReviewerIds?: string[]; sendInApp: boolean; sendWhatsApp: boolean; messageVariant: 'initial' | 'reminder' | 'canceled' })`. Atualiza `notifiedAt` por reviewer + `lastNotifiedAt`/`notifyCount` no approval.

3.3. **`cancel(userId, tenant, approvalId, body)`**:

- Valida org, status = PENDING.
- RBAC: requester OU OWNER/ADMIN/GESTOR org OU admin do board.
- Transação: update status/canceledAt/canceledById/cancelReason + expira tokens dos reviewers (`expiresAt = now`).
- Dispara `dispatchNotifications` com `messageVariant: 'canceled'` (manda WhatsApp + in-app pros reviewers).
- Activity `kind: 'approval.canceled'` no payload.
- Emite `CARD_UPDATED` socket.

3.4. **`resend(userId, tenant, approvalId, body)`**:

- Valida org, status = PENDING.
- RBAC igual cancel.
- Rate limit: `lastNotifiedAt + 30s > now` → 429; `notifyCount >= 10` (hoje) → 429.
- Se `reviewerId` setado, valida que pertence ao approval; senão, todos.
- Chama `dispatchNotifications` com `messageVariant: 'reminder'`.
- Activity `kind: 'approval.resent'`.
- Emite `CARD_UPDATED`.

3.5. **`removeReviewer(userId, tenant, approvalId, reviewerId)`**:

- Valida org, status = PENDING, reviewer existe.
- RBAC igual cancel.
- Se for o último reviewer pendente → erro 400 "Use cancelar pedido em vez".
- Deleta `CardApprovalReviewer` (ou soft delete — decisão de implementação; preferência: hard delete pra não complicar índices).
- Activity `kind: 'approval.reviewer_removed'`.
- Emite `CARD_UPDATED`.

3.6. **`getPublicView`** (linha 988+): tratar `status === 'CANCELED'` retornando shape específico com `canceledAt`, `canceledBy.name`, `cancelReason`.

3.7. **`decideByToken`**: rejeitar com 400 "Pedido cancelado" se status = CANCELED.

### 4. Backend — Controller

[apps/api/src/modules/approvals/approvals.controller.ts](apps/api/src/modules/approvals/approvals.controller.ts):

- `@Delete('approvals/:id') cancel(...)` com `ZodValidationPipe(CancelApprovalSchema)`.
- `@Post('approvals/:id/resend') resend(...)` com `ResendApprovalSchema`.
- `@Delete('approvals/:id/reviewers/:reviewerId') removeReviewer(...)`.

### 5. Templates WhatsApp

Criar helper centralizado em `apps/api/src/modules/whatsapp/templates.ts` (ou adicionar a `whatsapp.helper.ts`) com 3 variantes:

```ts
function approvalInitialMessage({
  reviewerName,
  cardTitle,
  boardName,
  userMessage,
  publicUrl,
}): string;
function approvalReminderMessage({ reviewerName, cardTitle, boardName, publicUrl }): string;
function approvalCanceledMessage({ reviewerName, cardTitle, boardName, cancelReason }): string;
```

**Templates aprovados pelo Nicchon** (ver Riscos / decisões abaixo). Todos terminam com `\n\n> Esta é uma mensagem automática.`.

### 6. Padronização das outras mensagens automáticas

Auditar todos os pontos do código que mandam WhatsApp via Evolution e:

- Aplicar negritos onde fizer sentido (título do card, nome do destinatário).
- Adicionar rodapé `\n\n> Esta é uma mensagem automática.` em todas.

Pontos a auditar (lista provisória — confirmar com grep `sendText` em `apps/api/src/`):

- Pedido de aprovação (já coberto em #5).
- Reset de senha por WhatsApp (`feat(auth): redefinicao de senha tambem via WhatsApp`).
- Convite a membro (futuro — hoje envio é manual, mas se virar automático precisa cair na regra).
- Notificação de menção em comentário (se existe).
- Notificação de prazo se houver automação configurada.

### 7. Frontend — Queries

[apps/web/src/lib/queries/approvals.ts](apps/web/src/lib/queries/approvals.ts):

- Estender `ApprovalStatus`: `'PENDING' | 'APPROVED' | 'REJECTED' | 'REVERTED' | 'CANCELED'`.
- Estender `CardApproval`: `canceledAt`, `canceledById`, `cancelReason`, `canceledBy`, `lastNotifiedAt`, `notifyCount`, `message`.
- Funções:
  - `cancelApproval(approvalId, reason?)` → `DELETE /api/v1/approvals/:id` com body.
  - `resendApproval(approvalId, reviewerId?)` → `POST /api/v1/approvals/:id/resend`.
  - `removeReviewer(approvalId, reviewerId)` → `DELETE /api/v1/approvals/:id/reviewers/:reviewerId`.

### 8. Frontend — Componente

[apps/web/src/components/board/approvals-block.tsx](apps/web/src/components/board/approvals-block.tsx):

- Em `PendingApprovalCard`: adicionar 2 botões no header — `Reenviar` (icon `Send`) e `Cancelar pedido` (icon `Ban`/`X`). Visíveis se user é requester OU OWNER/ADMIN/GESTOR.
- `Cancelar pedido`: abre `ConfirmModal` com textarea de motivo opcional.
- `Reenviar`:
  - Se `reviewers.length === 1`: dispara `resendApproval(id, undefined)` direto + toast "Mensagem reenviada".
  - Se 2+: abre modal com radio "Reenviar para todos" (default) + 1 radio por reviewer. Confirma → `resendApproval(id, selectedReviewerId)`.
- Em `ReviewerList`: adicionar "X" ao lado de cada reviewer pendente → chama `removeReviewer`. Esconde "X" se for o último.
- Mostrar `notifiedAt` formatado como "Enviado há Xmin" em cada pílula de reviewer.
- Em `ApprovalHistory`: mapear `CANCELED → 'Pedido cancelado por <nome> em <data>'` + `cancelReason` se houver.

### 9. Página pública

[apps/web/src/app/aprovar/[token]/page.tsx](apps/web/src/app/aprovar/[token]/page.tsx):

- Tratar response com `status: 'CANCELED'`: renderizar tela "Pedido cancelado" com avatar + nome de quem cancelou + data + motivo (se houver). Sem botões Aprovar/Reprovar. Link "Voltar ao site" opcional.

### 10. Tutorial

[apps/web/content/ajuda/aprovacoes/01-pedir-aprovacao-cliente.md](apps/web/content/ajuda/aprovacoes/01-pedir-aprovacao-cliente.md):

- Remover tags `[CONFIRMAR]` das seções existentes que mencionam cancelar e remover revisor.
- Documentar comportamento de "reenvio" (1 vs múltiplos revisores).

## Critérios de aceite

### Backend

- [ ] Migration roda sem erro em dev. Schema tem `CANCELED` no enum + campos novos.
- [ ] `DELETE /v1/approvals/:id` retorna 200 + approval com novo status. Token público invalida (decideByToken retorna 400).
- [ ] `POST /v1/approvals/:id/resend` com `reviewerId` envia só pra 1; sem `reviewerId` envia pra todos. Rate limit 30s e 10/dia funcionam.
- [ ] `DELETE /v1/approvals/:id/reviewers/:reviewerId` remove e atividade gera. Bloqueia delete do último.
- [ ] RBAC: requester + OWNER/ADMIN/GESTOR conseguem; EDITOR comum não.
- [ ] WhatsApp de cancelamento entrega com template aprovado.

### Frontend

- [ ] Botões "Cancelar pedido" e "Reenviar" aparecem só pra quem tem permissão.
- [ ] Reenvio com 1 reviewer dispara direto; com 2+ abre modal com radio.
- [ ] "X" remove revisor sem cancelar pedido. Esconde se for o último.
- [ ] Histórico mostra cancelamento com nome + data + motivo.
- [ ] Página pública `/aprovar/:token` mostra "Pedido cancelado" quando aplicável.

### Não-regressão

- [ ] Pedido novo continua funcionando (texto digitado pelo user vira `message` persistida).
- [ ] `undo` continua funcionando pra aprovações já decididas.
- [ ] Badge "Aprovações" da topbar atualiza após cancelamento (polling 60s).
- [ ] Mensagens automáticas (todas) terminam com `> Esta é uma mensagem automática.`.

## Riscos / decisões

### Templates aprovados (decisão do Nicchon)

**Pedido inicial (mensagem do user, sem template fixo)**: o user já digita o texto que será enviado. Aplicar negritos e rodapé apenas no _wrap_:

```
{textoDigitadoPeloUser}

📋 Card: *{tituloCard}*
📁 Fluxo: {nomeBoard}

Acesse e decida:
{linkPublico}

> Esta é uma mensagem automática.
```

**Reenvio (lembrete)**:

```
LEMBRETE
Sua aprovação ainda está *pendente*:

📋 Card: *{tituloCard}*
📁 Fluxo: {nomeBoard}

Acesse e confira:
{linkPublico}

> Esta é uma mensagem automática.
```

**Cancelamento**:

```
Olá, {nomeRevisor}!

O pedido de aprovação foi *cancelado* pela equipe.

📋 Card: *{tituloCard}*
📁 Fluxo: {nomeBoard}
{motivoSeHouver}

Se tiver dúvida, fale com seu contato na equipe.

> Esta é uma mensagem automática.
```

### Outras decisões

- **Status CANCELED** em vez de delete físico — preserva histórico, página pública mostra "cancelado" em vez de 404.
- **Cancelar a qualquer momento** desde que `status = PENDING`. Sem rate limit no cancelamento.
- **Quem cancelou aparece sempre** (`canceledBy` no select padrão).
- **Rate limit no reenvio** (30s + 10/dia) — proteção anti-burst, não autoritário. Mensagem clara no 429: "Aguarde Xs antes de reenviar".
- **Remover revisor**: hard delete em `CardApprovalReviewer`. Se for o último, bloqueia (sugere cancelar o pedido todo).
- **Mensagens automáticas em todo o KTask** (não só aprovação) vão ter o rodapé "Esta é uma mensagem automática." — auditar grep `sendText` antes de implementar.
- **`approval.message` persistida** pra reenviar com mesmo texto. Fallback: se for `null` (pedidos pré-migration), usa template default sem o textoDoUser no início.

### Riscos

- Migration adiciona 6 colunas em tabela ativa — rodar em janela tranquila se base for grande (KTask é interno, baixo volume → OK).
- `dispatchNotifications` extraído precisa cobrir 3 caminhos sem regressão no original. Testar manualmente os 3 (initial / reminder / canceled) antes de mergear.
- Rate limit por approval pode ser contornado criando vários pedidos. Aceitável pra MVP — se virar abuso, sobe limite per-user.
- Página pública precisa lidar com `CANCELED` antes do deploy do front, ou um cliente abrindo um link cancelado vê erro feio. Garantir ordem de release: backend → front.

## Follow-ups depois desta tarefa

- Recriar pedido cancelado em 1 clique (auto-fill da modal `request-approval-dialog` com os mesmos reviewers).
- Aprovação por quorum (>1 reviewer precisa aprovar).
- Histórico de envios por reviewer (quantos lembretes recebeu, quando).
- WebSocket event específico de aprovação (em vez de `CARD_UPDATED` genérico) pra badge da topbar atualizar instantâneo, sem polling.
