# 53 — Confirmação de troca de e-mail (admin de membros)

## Contexto

Caso real em 05–06/10/2026: a admin Fernanda tentou 5 vezes trocar o e-mail
da Taiane (`taianepbarboza@gmail.com` → `taiane.barboza@agenciakharis.com.br`).
Todas as chamadas `PATCH /admin/members/:userId` retornaram 200, mas a troca
nunca concluiu: o `MembersAdminService.update` só gravava `pendingEmail` e
logava um token de confirmação (`TODO send email`). O token não era
persistido, nenhum e-mail era enviado e não existia rota de confirmação.
O modal prometia "dispara link de confirmação pro novo endereço".

## Escopo

- Persistir token de troca de e-mail (hash SHA-256, TTL 48h, uso único).
- Enviar e-mail com link de confirmação **para o novo endereço** (prova de
  posse da caixa — anti-sequestro).
- Rota pública `POST /v1/auth/confirm-email-change` que efetiva a troca
  (`pendingEmail` → `email`), registra Activity e emite
  `usuario.email_alterado` pros SPs federados.
- Página pública `/confirmar-email/[token]` (confirmação por clique, não no
  carregamento — evita que scanners de link consumam o token).
- Endpoints admin: reenviar link e cancelar pendência.
- Modal do membro: botões Reenviar / Cancelar na pendência e texto de ajuda
  fiel ao comportamento.

**Fora do escopo:** troca do próprio e-mail pelo usuário em `/configuracoes/perfil`;
aviso ao e-mail antigo; envio do link por WhatsApp (o WhatsApp é do usuário,
não prova posse do novo e-mail).

## Etapas

1. Schema: model `EmailChangeToken` + valores de `ActivityType`
   `MEMBER_EMAIL_CHANGED` e `MEMBER_EMAIL_CHANGE_CANCELLED`. Migration aditiva.
2. `MailService.sendEmailChangeConfirmation`.
3. `AuthService.dispatchEmailChangeConfirmation` (invalida tokens anteriores
   não usados, cria novo, envia) e `AuthService.confirmEmailChange`.
4. `AuthController`: `POST /auth/confirm-email-change` (público, throttle 5/15min).
5. `MembersAdminService`: `update` passa a disparar o envio;
   `resendEmailChange` e `cancelEmailChange` + rotas no controller.
6. Web: página `/confirmar-email/[token]`, funções em `queries/members-admin.ts`,
   botões e texto no modal.
7. Testes unitários do `confirmEmailChange`; typecheck + lint + test.

## Critérios de aceite

- [ ] Admin troca e-mail → novo endereço recebe e-mail com link. _(unitário ok; validar em produção após deploy)_
- [ ] Clique em "Confirmar" na página troca o e-mail; login passa a ser com o novo. _(unitário ok; validar em produção)_
- [x] Token usado, expirado, inexistente ou de pendência cancelada → erro claro.
- [x] Se outro usuário passou a usar o e-mail entre pedido e confirmação → erro, nada muda.
- [x] Reenviar invalida o link anterior; Cancelar limpa `pendingEmail` e invalida links.
- [x] Activities `MEMBER_EMAIL_CHANGE_REQUESTED` / `MEMBER_EMAIL_CHANGED` / `MEMBER_EMAIL_CHANGE_CANCELLED` registradas.
- [x] Evento `usuario.email_alterado` emitido na confirmação.
- [x] typecheck + lint + test verdes (API 103 testes; migrations aplicadas do zero em Postgres 16).

## Achado extra: telefone apagado em PATCH parcial

`PhoneNullableSchema` (admin de membros) e `PhoneSchema` (contracts, `PATCH /users/me`)
transformavam campo **ausente** em `null`. Resultado: salvar só nome/e-mail no modal
apagava o telefone do membro; o salvamento seguinte o restaurava (caso da Taiane:
telefone alternando entre vazio e preenchido a cada tentativa). Corrigido: ausente
continua `undefined`; `""` e `null` seguem limpando. Teste em `phone-schema.spec.ts`.

Também no modal: depois de salvar a troca, o campo e-mail volta ao endereço atual —
antes ele seguia "sujo" e o botão Salvar convidava a repetir o pedido (5 tentativas
da admin em 05–06/10).

## Riscos / decisões

- **TTL 48h** (reset de senha usa 1h): troca de e-mail não é urgente e o
  usuário pode não abrir a caixa nova no mesmo dia.
- **Pendências antigas em produção** (ex.: Taiane, se o UPDATE manual ainda não
  tiver rodado) não têm token. O admin usa "Reenviar link" para gerar um.
- **Sessões** não são revogadas na troca: o access token (15min) carrega o
  e-mail antigo até o próximo refresh, que relê o usuário.
- `ALTER TYPE ... ADD VALUE` não roda dentro de transação em Postgres < 12;
  produção usa versão recente, e a migration não usa o valor novo na mesma transação.
