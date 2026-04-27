# 25 — Modelos de mensagem reutilizáveis

## Escopo

Templates de texto Mustache reutilizáveis em campos de mensagem das automações
(WhatsApp, comentário e — no futuro — e-mail). Cada Org tem sua coleção
compartilhada; qualquer MEMBER+ cria/edita/deleta. Variáveis Mustache (`{{card.title}}` etc) continuam funcionando dentro do template salvo.

### Dentro

- Modelo `MessageTemplate` na Org com `{ name, body, type }` — type discriminador (`whatsapp`, `comment`)
- CRUD endpoints com permissão por OrgRole
- 2 botões no formulário de automação: **Carregar modelo** + **Salvar como modelo**
- Página `/configuracoes/modelos-mensagem` com listagem, edit inline, delete
- Reuso da `VarTextarea` (autocomplete `/`) na criação/edição

### Fora (followups)

- Templates por user (privados)
- Categorias / tags em modelos
- Versionamento / histórico de edições
- Templates "de sistema" (pré-prontos pra Org nova)
- Type `email` (vira na hora que SEND_EMAIL for implementado)

## Modelo de dados

```prisma
model MessageTemplate {
  id             String   @id @default(cuid())
  organizationId String
  name           String   // ex: "Aviso de prazo"
  body           String   // texto Mustache
  type           String   // 'whatsapp' | 'comment'
  createdById    String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  createdBy    User         @relation(fields: [createdById], references: [id])

  @@index([organizationId, type])
}
```

## Endpoints

- `GET /organizations/me/message-templates?type=whatsapp` — lista
- `POST /organizations/me/message-templates` — cria
- `PATCH /message-templates/:id` — edita
- `DELETE /message-templates/:id` — apaga

Permissão: GUEST não vê; MEMBER+ vê todos da Org; criador OU OWNER/ADMIN
podem editar/deletar.

## UI

### Formulário SEND_WHATSAPP / POST_COMMENT

Acima da textarea de mensagem, dois botões pequenos lado a lado:

- **📥 Carregar** → popover com lista (nome + preview); click substitui o texto
- **💾 Salvar** → prompt pede nome; cria com texto atual

### Página `/configuracoes/modelos-mensagem`

- Tabela: nome · tipo (badge) · preview · autor · ações (editar/deletar)
- Filtro por tipo (whatsapp/comment)
- Botão "Novo modelo" abre dialog com `VarTextarea` (autocomplete `/`)

## Critérios de aceite

- [ ] Migration aplicada
- [ ] CRUD funciona (com permissão validada)
- [ ] Botão "Carregar" no form lista modelos do tipo certo
- [ ] Botão "Salvar" cria modelo a partir do conteúdo atual
- [ ] Página de gestão lista, edita, deleta
- [ ] Variáveis Mustache resolvem ao usar template salvo
- [ ] Tests do service: criar/listar/editar/deletar com checks de permissão

## Riscos / decisões

- **Compartilhar Org** vs privados por user: começamos Org. `isShared` pode vir depois sem migration disruptiva.
- **Type discriminator** vs tabelas separadas: discriminador é mais simples e DRY. Migration futura se virar problema é trivial.
- **Mustache vs Tiptap rich**: WhatsApp/comment tipicamente plain text com placeholders; rich text seria over-engineering pra esse caso.
