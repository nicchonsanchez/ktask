# Vínculo Contact ↔ User

## Escopo

Permitir que cada `Contact` no CRM esteja opcionalmente vinculado a um `User` da Org. Quando vinculado:

- `email`, `phone`, `name`, `avatarUrl` → vêm do User (read-only no CRM)
- Os demais campos do Contact (`document`, `note`, `parentId/empresa`) continuam editáveis no CRM
- Cards vinculados ao Contact ficam automaticamente "vinculados ao User" via cadeia `Card → CardContact → Contact.userId`

**Fora do escopo:**

- Permissões granulares (cliente externo com login). Mantido pra fase SaaS futura.
- Auto-criar Contact ao criar User. Em vez disso, ao criar User, oferecer "vincular Contact existente" se houver match por email/phone.

## Etapas

1. **Schema + migration**
   - `Contact.userId String? @unique` (1 User pode ter no máximo 1 Contact)
   - Index implícito via `@unique`
   - Relation: `Contact.user User?` e `User.contact Contact?`
   - Prisma migrate em dev + script SQL pra aplicar em prod
2. **Backend — service `contacts.service.ts`**
   - `linkToUser(contactId, userId)` — valida que user é da mesma org e não tem outro contact vinculado
   - `unlinkFromUser(contactId)`
   - `getOne` / `list` retornam `linkedUser: {id, name, avatarUrl, email, phone} | null`
   - `update` rejeita mudança em `name/email/phone` quando `userId` está setado
   - List endpoint aceita filtro `?linkedUserOnly=true | false | all`
3. **Backend — controller**
   - `POST /contacts/:id/link-user` body: `{ userId }`
   - `DELETE /contacts/:id/link-user`
   - Endpoint helper: `GET /contacts/suggestions-for-user/:userId` retorna Contacts da org cujo email ou phone bate com o user (pra UI de criar User mostrar "vincular existente?")
4. **UI /contatos**
   - Badge "Membro do KTask" reforçado nos rows com `linkedUser` (em vez do "membro" atual via userMatch — mais explícito)
   - Avatar do User quando vinculado
   - Form de criar/editar: se contato tem `userId`, desabilita `name/email/phone` com tooltip "vem do user, editável em /perfil"
   - Filtro lateral: `Todos / Com user / Só externos`
   - Botão "Vincular a user" nos detalhes de um Contact externo → modal lista Users disponíveis (excluí os já vinculados)
5. **UI /equipe (admin) ou /perfil**
   - Mostrar "Contato vinculado: <nome do Contact>" ou "Nenhum"
   - Não permitir editar daqui (centralizar no CRM)
6. **UX de criar User**
   - Quando o admin/owner cria User com email/phone que bate com algum Contact da Org: dialog "Encontrei um Contact da Patrícia (email bate). Quer vincular?"
   - 3 opções: Vincular / Criar User sem vincular / Cancelar

## Critérios de aceite

- Existe coluna `Contact.userId` única, FK válida
- POST `/contacts/:id/link-user` vincula com sucesso quando não há conflito; 409 quando user já tem outro contact
- Update de `email/phone/name` num Contact com userId retorna 422 com mensagem clara
- /contatos lista mostra badge "Membro do KTask" pros vinculados, avatar do User
- Form do detalhe desabilita campos de identidade quando vinculado
- Criar User com email duplicado de Contact existente → dialog de vinculação
- Auto-vinculação de empresa no card (já implementada): se a "Pessoa" linkada ao card tem `userId`, mostra também a empresa vinculada do User (futuro? deixar de fora desta etapa)

## Riscos / decisões

- **Unique vs allow-multiple Contact por User**: optei por unique (1:1) pra evitar ambiguidade. Se no futuro precisar de N Contacts por User (ex: User trabalha em 2 empresas-cliente, cada um com Contact próprio), reverter pra many.
- **Read-only de `name`**: questionável — talvez o nome no CRM possa ser apelido diferente do User. Mantenho read-only pra começar, simples.
- **Sync de avatar**: quando User troca foto, Contact-card no CRM reflete via JOIN. Sem cron, sem cópia.
- **Contacts duplicados existentes** (Maciana com Contact tipo COMPANY erroneamente): após implementar, oferecer script one-time pra detectar e propor merge. Não automático.
