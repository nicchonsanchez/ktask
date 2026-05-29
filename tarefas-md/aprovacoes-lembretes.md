# Aprovações: lembretes automáticos em horas úteis

> Status: **APROVADO (2026-05-29)** — implementar Fase 1 agora.

## Problema

Approval fica parada porque reviewer esqueceu. Hoje só temos resend
manual (botão "Cobrar" — não existe ainda mas ia ser follow-up).
Queremos lembrete automático a cada X horas úteis, configurável.

## Decisões fechadas

| #   | Decisão                         | Escolha                                                                   |
| --- | ------------------------------- | ------------------------------------------------------------------------- |
| D1  | Onde configurar?                | **2 níveis**: default org + override per-approval. Sem board-level.       |
| D2  | Consolidar ou granular?         | **Consolidar**: 1 msg/reviewer mesmo com N approvals pendentes            |
| D3  | Canais                          | **WhatsApp + notificação in-app**. Sem email.                             |
| D4  | Stop conditions                 | Para após: decidiu / cancelou / atingiu `maxAttempts` / approval >30 dias |
| D5  | Snooze pelo reviewer            | **V2** — não entra Fase 1                                                 |
| D6  | Horário do disparo              | X horas após `lastReminderAt` respeitando janela 8-18h (não round hour)   |
| D7  | Feriados                        | **V2** — V1 só seg-sex                                                    |
| D8  | Reviewers externos (phone-only) | Recebem WhatsApp (não tem notificação in-app por não terem User)          |

## Escopo

### Fase 1

- Settings da org: enable, intervalo, janela de horas, max attempts.
- Override per-approval: `reminderDisabled` + `reminderIntervalHoursOverride`.
- Cron a cada 30min verifica e envia.
- Consolida por reviewer (1 msg agrupando N approvals).
- UI: seção "Aprovações" em `/configuracoes/organizacao` + "Opções
  avançadas" no popup de request approval.

### Fora (follow-ups)

- Snooze (V2).
- Feriados (V2).
- Override por board.
- Tempo médio de aprovação por reviewer.

## Modelo de dados

**Organization** — adicionar campos de settings:

```prisma
approvalReminderEnabled        Boolean @default(false)
approvalReminderIntervalHours  Int     @default(4)
approvalReminderHourStart      Int     @default(8)   // 0-23
approvalReminderHourEnd        Int     @default(18)  // 0-23
approvalReminderMaxAttempts    Int     @default(5)
```

**CardApproval** — adicionar override + tracking:

```prisma
reminderDisabled               Boolean   @default(false)
reminderIntervalHoursOverride  Int?      // null = usa org default
reminderCount                  Int       @default(0)
lastReminderAt                 DateTime?
```

## Lógica do cron

```
@Cron a cada 30min:
  pra cada Organization com approvalReminderEnabled = true:
    se NOW (BRT) NÃO está em business hours (seg-sex + hourStart-hourEnd):
      continue

    busca approvals candidatas:
      status = PENDING
      reminderDisabled = false
      reminderCount < org.approvalReminderMaxAttempts
      requestedAt > NOW - 30 dias       // hard cap
      base = COALESCE(lastReminderAt, requestedAt)
      interval = COALESCE(reminderIntervalHoursOverride, org.intervalHours)
      base + interval <= NOW

    pra cada candidata, junta reviewers pendentes (userId IS NOT NULL)
    agrupa por reviewer:
      msg consolidada = "Você tem N aprovações esperando: ..."
      envia 1 WhatsApp via Evolution
      cria 1 in-app notification ("N aprovações esperando")

    pra cada approval enviada:
      lastReminderAt = NOW
      reminderCount++
```

Reviewers externos (phone-only, sem userId) recebem WhatsApp também,
sem notificação in-app (não tem User pra notificar).

## UX

**Settings da org** (`/configuracoes/organizacao`, OWNER/ADMIN):

- Toggle "Enviar lembrete automático de aprovação"
- Quando on: campos intervalo (h), janela horária, max attempts.

**Popup request approval** (visível pra quem pede aprovação):

- Seção "Opções avançadas" colapsada por default.
- ☐ Sem lembrete automático para este pedido
- ⏰ Intervalo personalizado: [4]h (vazio = usa default da org)

## Critérios de aceite

- [ ] Settings da org persiste e respeita papel ADMIN
- [ ] Cron envia primeiro lembrete após `intervalo` horas úteis
- [ ] Reviewer com 3 approvals pendentes recebe 1 mensagem consolidada,
      não 3 separadas
- [ ] Reviewer externo (phone-only) recebe WhatsApp, sem in-app
- [ ] Para de enviar após `maxAttempts` lembretes
- [ ] Override per-approval funciona (disableReminder pula esse approval)
- [ ] Janela horária respeita BRT (8-18h seg-sex)
- [ ] Approval decidida/cancelada não recebe mais lembrete

## Esforço

~7h: 2h backend (cron + service) + 2h schema/migration/endpoint +
2h frontend (settings + popup) + 1h validação.
