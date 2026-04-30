# 35 — Convite por WhatsApp (paralelo ao email)

## Contexto

Doc 34 já entregou email automático e cadastro inline. Falta canal
adicional: muito convidado vai ler WhatsApp antes de email. Approach
escolhido: **A** (campo opcional de telefone no form de convite,
backend dispara nos dois canais ao criar).

## Decisões tomadas (com user)

1. **Campo telefone no form** é opcional. Quando preenchido, backend
   envia também por WhatsApp.
2. **Mensagem WhatsApp inclui o email do convite** — porque o
   convidado precisa saber qual conta vai criar/usar.
3. **Texto fixo** no V1 (não usa MessageTemplate). Sem emojis.
4. **Instância**: usa `WhatsAppHelper` existente, mesmo padrão das
   outras automações (Integration da Org com fallback no
   `EVOLUTION_DEFAULT_*`).
5. **Persiste o phone** em `Invitation.phone` pra futuro reenvio
   (doc 35.5 — não nesta entrega).
6. **Falha gracioso**: se WhatsApp falhar (Evolution off, número
   inválido), email ainda é tentado e link copiável continua. Sem
   exceção propagada.

## Mensagem proposta

```
*Convite para KTask*

[invitedByName] convidou você para entrar na *[orgName]* como *[roleLabel]*.

Para aceitar, abra o link abaixo. Sua conta será criada com o e-mail:
[invitation.email]

[inviteUrl]

Este convite expira em DD/MM/YYYY.
```

## Etapas

1. Migration `Invitation.phone` (TEXT NULL).
2. Backend `CreateInvitationParams` aceita `phone?: string`. Sanitiza
   e armazena (formato E.164 sem `+`).
3. Backend `dispatchInvitationEmail` agora também `dispatchInvitationWhatsApp`
   se `phone` presente. Roda em paralelo, fire-and-forget.
4. Frontend form de convite ganha campo "Telefone (opcional)".
5. Validação: se telefone informado, precisa virar `\d{10,15}` após
   sanitização.

## Critérios de aceite

- [ ] Convite sem telefone: comportamento idêntico (só email).
- [ ] Convite com telefone válido: email + WhatsApp recebidos com
      mesmo link tokenizado.
- [ ] Mensagem WhatsApp inclui o email do convite explicitamente.
- [ ] Telefone inválido (< 10 dígitos): form rejeita, backend rejeita.
- [ ] Falha do WhatsApp não impede email nem o convite ser criado.

## Backlog (V2)

- Botão "Reenviar por WhatsApp" na lista de convites pendentes.
- Permitir admin escolher template salvo (`MessageTemplate`).
- Botão "copiar mensagem WhatsApp" no toast pós-criação (manual share).
