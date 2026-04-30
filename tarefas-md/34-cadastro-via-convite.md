# 34 — Cadastro via convite (signup inline)

## Contexto

Hoje o fluxo de convite está quebrado pra usuário novo. Dois problemas:

1. **Email não é enviado.** [env.ts:55-67](../apps/api/src/config/env.ts#L55-L67)
   tem `SMTP_*` configurado mas nenhum mailer está integrado em
   `invitations.service.ts`. O admin que convida só recebe o token de
   volta da API e a UI exibe o link copiável.

2. **Link não cria conta.** A rota `/convite/[token]` redireciona pra
   `/entrar` se o usuário não estiver logado. Pra logar, precisa ter
   conta. Pra ter conta… precisaria de uma rota de cadastro que **não
   existe**. O `accept()` em
   [invitations.service.ts:117-121](../apps/api/src/modules/organizations/invitations.service.ts#L117-L121)
   exige que o `user.email` bata com `invitation.email`, ou seja, só
   aceita usuário pré-existente.

Resultado: convidar pessoa nova é impossível. O fluxo assume que ela
já tem conta de outra Org, ou que alguém criou o User dela manualmente
(via DB ou seed).

## Decisão de escopo

V1 entrega o **caminho feliz pra usuário novo**:

- **Preview do convite indica `userExists: boolean`**.
- Quando `userExists = false`, a página `/convite/[token]` exibe form
  inline (nome + senha) em vez de redirecionar pra login.
- Submit chama `POST /v1/auth/signup-from-invite` que, em transação:
  - Cria `User` com email do convite + senha argon2id.
  - Cria `Membership` na Org com role do convite.
  - Marca `Invitation.acceptedAt`.
  - Retorna tokens (access + refresh) e dispara fluxo de auto-login.

**Email automático fica pra V2** — fora do escopo. Continua o canal
manual (admin copia o link e envia por WhatsApp/email externo).

## Decisões tomadas

- **Senha**: mín 8 caracteres na V1 (mesmo critério do login). Política
  reforçada (zxcvbn, pwned check) fica pra outro doc.
- **Email do form**: read-only, vem do convite (não pode editar — se
  digitar email diferente, o backend rejeita).
- **Conflito de race**: se outro convite com mesmo email aceitar antes,
  segundo signup falha com 409 Conflict (User já existe). Aí cai no
  fluxo de "logar e aceitar" automaticamente — frontend detecta o erro
  e mostra "essa pessoa já tem conta, peça pra ela logar e abrir o
  link de novo".
- **Auto-login após signup**: emite tokens do user recém-criado,
  redireciona pra `/`.

## Etapas

1. **Backend `previewByRawToken`** retorna `userExists: boolean`.
2. **Backend `auth.controller`** novo endpoint público `POST
/v1/auth/signup-from-invite` com payload `{ token, name, password }`.
3. **Backend `auth.service.signupFromInvite`**: valida token, valida
   que email não tem User, cria User+Membership+marca convite, retorna
   tokens.
4. **Frontend `previewInvitation`** type ganha `userExists: boolean`.
5. **Frontend `/convite/[token]/page.tsx`**: renderização condicional —
   form de signup quando `userExists=false` E user não logado.
6. **Frontend `signupFromInvite()`** query function + integração com
   `useAuthStore`.

## Critérios de aceite

- [ ] Convidar email novo → admin copia link → convidado abre →
      preenche nome+senha → entra direto na Org sem passar por login.
- [ ] Convidar email existente → preview detecta, mostra "logar pra
      aceitar" → user loga → aceita.
- [ ] Convite com email já existente que tenta signup → backend
      retorna 409, frontend explica.
- [ ] Senha < 8 caracteres → form bloqueia client-side e backend
      rejeita.

## Riscos

- **Mailer ausente** continua sendo lacuna funcional. V2 deve
  implementar nodemailer + SMTP da config existente. Documentar no
  README que admin precisa enviar link manual até lá.
- **Auto-login**: não validamos email (não tem como — convidado pode
  receber link de qualquer lugar). Modelo confia que quem tem o
  token pode aceitar. Aceitável já que é mesmo modelo de
  `/aprovar/[token]`.
- **Brute force no token**: já protegido por rate limit do `/auth/*`
  global; não adicionamos camada extra.

## Relação com outros docs

- **README dev** menciona Mailpit em localhost:1025 — usar pra
  testar quando V2 implementar mailer.
- Decisão pendente do checklist "Recuperação de senha por e-mail"
  é correlata: ambas precisam do mesmo mailer.
