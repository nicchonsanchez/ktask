# Briefing — Formulário de suporte que cria card no KTask

> **Como usar:** cole este briefing num chat novo de Claude com acesso a este repositório. Fase 0 (Inventário) primeiro; aguarda aprovação antes de produzir.

---

## Contexto rápido do projeto

KTask. NestJS 11 + Prisma 6 + Postgres 16 + Next.js 15. Já existe estrutura de Boards/Lists/Cards com `CardsService.create()` e helper `createCardWithPresence()` (ADR-0006). A Central de Ajuda (`/ajuda`) está sendo implementada paralelamente no briefing 09 e vai ter uma página `/ajuda/suporte` que precisa do backend deste briefing.

---

## Objetivo desta sessão

Implementar o **canal de suporte que vira card no KTask**:

1. Frontend: formulário em `/ajuda/suporte` com campos básicos
2. Backend: endpoint REST que valida + cria card num board "Suporte" via helper canônico
3. Infra: garantir que o board "Suporte" existe (migration ou seed)
4. Resposta: usuário recebe confirmação + número do ticket (shortCode do card)

**Audiência**: usuário com dúvida ou problema (operador interno ou cliente externo). Sem necessidade de login.

**Entregáveis**:

- Endpoint público `POST /api/v1/support-tickets` (sem auth, com rate-limit)
- Migration ou seed que garante board "Suporte" na org Kharis
- Página `/ajuda/suporte`: FAQ no topo + formulário no fundo
- DTO Zod com validação (nome, email, telefone, categoria, mensagem, anexos?)
- Service que monta payload e chama `createCardWithPresence`
- Notificação WhatsApp pro operador quando ticket criado (opcional — perguntar na Fase 0)

**Restrições**:

- Sem emojis.
- Endpoint **público** mas com **rate-limit** (5 req/min/IP) e **captcha simples** (honeypot ou similar — não Recaptcha do Google).
- Body parser limitado (sem anexo grande nessa primeira versão; pode-se adicionar depois).
- O card criado entra num board específico (vamos chamar de "Suporte") da Org `kharis` (organização interna). NÃO multi-tenant esse formulário — sempre vai pra um board fixo.
- LGPD: armazena email/telefone do usuário (necessário pra contato) com `note` explicando origem. Sem cookies de tracking adicionais.

---

## Fase 0 — Inventário forçado

### Leituras obrigatórias

1. [apps/api/src/modules/cards/cards.service.ts](../apps/api/src/modules/cards/cards.service.ts) — método `create` (referência) e `createCardWithPresence` (helper)
2. [apps/api/src/modules/cards/helpers/create-card-with-presence.ts](../apps/api/src/modules/cards/helpers/create-card-with-presence.ts) — helper canônico
3. [apps/api/prisma/schema.prisma](../apps/api/prisma/schema.prisma) — models Board, List, Card, Organization
4. [apps/api/src/main.ts](../apps/api/src/main.ts) — pra ver setup global, ValidationPipe, rate-limit
5. [apps/api/src/modules/auth/](../apps/api/src/modules/auth/) — pra entender como rotas autenticadas são marcadas (vou marcar a do suporte como pública)
6. [docs/adr/0006-helper-centralizado-criacao-card.md](../docs/adr/0006-helper-centralizado-criacao-card.md) — invariante de criação de card
7. [tarefas-md/00-visao-geral.md](../tarefas-md/00-visao-geral.md) — pra saber slug da org Kharis (provavelmente "kharis" ou similar)

### Exploração estruturada

- Verificar se já há decorator `@Public()` ou similar pra marcar rotas sem auth.
- Verificar como rate-limit é configurado (provavelmente `@nestjs/throttler` ou middleware).
- Conferir se há módulo dedicado pra "Notifications" ou "Activity" que valha emitir evento ao criar ticket.
- Identificar a Org da Kharis no banco (provavelmente única org "interna" hoje). Pode ser slug, id, ou primeira org.
- Verificar se há lib de envio WhatsApp interna usável (provavelmente `WhatsAppHelper` em `apps/api/src/modules/whatsapp/`).
- Decidir entre **migration** (board criado uma vez na infra) ou **seed condicional no startup** (verifica se existe, cria se não — mais flexível).

### Saída da Fase 0

```
## Inventário (Fase 0)

### Org Kharis identificada
- Como descobrir: query por slug "kharis" / primeira org / configurado em env
- Decisão: ...

### Board "Suporte"
- Existe? sim/não
- Decisão: criar via migration / seed condicional / endpoint admin
- Lista padrão pra cards novos: "Novo" ou "A Triagem"

### Rate-limit
- @nestjs/throttler instalado: sim/não
- Configuração proposta: 5 req/min/IP no endpoint

### Decorator pra rota pública
- Como rotas públicas são marcadas hoje: @Public() ou similar
- Se não existe: criar minha

### WhatsApp notification
- WhatsAppHelper disponível: sim/não
- Decisão: notificar operador (e quem?) ao criar ticket / não notificar nesta versão

### Campos do formulário (proposta)
- nome (string, obrigatório)
- email (string, obrigatório)
- telefone (string, opcional — formatado livremente)
- categoria (enum: dúvida, problema, sugestão, outro)
- mensagem (string, obrigatório, max 2000 chars)
- urlOrigem (string, opcional — preenchido pelo frontend com window.location.href anterior, ajuda triagem)

### Como o card vai ficar
- Title: "[Suporte] {categoria}: {primeiras 40 chars da mensagem}"
- Description (TipTap JSON): mensagem completa formatada
- Contact criado e linkado ao card (CardContact): nome + email + telefone
- Tag/label opcional: "suporte-formulario"
- Lead/createdBy: usuário "sistema" ou primeiro admin da org

### Captcha / honeypot
- Honeypot simples (campo invisível que bots preenchem): sim
- Recaptcha: não nesta versão (depende de chave Google, complica deploy)

### Coisas que vou DEIXAR DE FORA
- Anexo no formulário (versão 2)
- Resposta automática por email
- Triagem automática por categoria
- ...

**Aguardo aprovação ou correção antes de implementar.**
```

---

## Fase 1 — Produção

Após aprovação:

### 1. Migration (ou seed) — board "Suporte"

Se for migration:

```typescript
// prisma/migrations/YYYYMMDD_support_board/migration.sql
INSERT INTO "Board" (id, "organizationId", name, ...)
VALUES (...);
INSERT INTO "List" (...) VALUES (...);
```

Se for seed condicional, criar `apps/api/src/modules/support/support-bootstrap.service.ts` que roda no `onModuleInit` e cria se não existir. Idempotente.

### 2. Module `support`

Estrutura padrão NestJS:

```
apps/api/src/modules/support/
├── support.module.ts
├── support.controller.ts
├── support.service.ts
├── dto/
│   └── create-support-ticket.schema.ts (Zod)
└── support-bootstrap.service.ts (se for seed)
```

### 3. Endpoint `POST /api/v1/support-tickets`

```typescript
@Controller({ path: 'support-tickets', version: '1' })
export class SupportController {
  @Post()
  @Public() // rota sem auth
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async create(@Body() dto: CreateSupportTicketDto) {
    return this.support.createTicket(dto);
  }
}
```

DTO Zod:

```typescript
export const CreateSupportTicketSchema = z.object({
  nome: z.string().trim().min(2).max(100),
  email: z.string().email().max(200),
  telefone: z.string().trim().max(40).optional(),
  categoria: z.enum(['duvida', 'problema', 'sugestao', 'outro']),
  mensagem: z.string().trim().min(10).max(2000),
  urlOrigem: z.string().url().optional(),
  /** Honeypot: campo invisível pro user. Bots preenchem. Se vier setado, rejeita. */
  website: z.string().max(0).optional(),
});
```

### 4. Service

```typescript
async createTicket(dto: CreateSupportTicketDto) {
  if (dto.website) throw new BadRequestException(); // honeypot

  const board = await this.supportBoard.get();
  const list = board.lists.find(l => l.name === 'Novo')!;

  const last = await this.prisma.card.findFirst({
    where: { listId: list.id },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  const card = await this.prisma.$transaction(async (tx) => {
    const card = await createCardWithPresence(tx, {
      organizationId: board.organizationId,
      boardId: board.id,
      listId: list.id,
      title: `[Suporte] ${dto.categoria}: ${dto.mensagem.slice(0, 40)}`,
      description: this.buildDescription(dto),
      position: (last?.position ?? 0) + 1024,
      createdById: this.systemUserId, // ver Fase 0
    });

    // Cria contact ou linka existente por email
    const contact = await tx.contact.upsert({
      where: { /* organizationId + email se único */ },
      create: {...},
      update: {},
    });
    await tx.cardContact.create({ data: { cardId: card.id, contactId: contact.id } });

    return card;
  });

  // Opcional: notifica WhatsApp do operador
  await this.notifyOperator(card, dto);

  return { ticketCode: `#${card.shortCode}`, message: 'Recebemos sua mensagem. Em breve entraremos em contato.' };
}
```

### 5. Frontend `/ajuda/suporte`

- Header curto: "Suporte"
- **FAQ** acima do formulário (lista de 5-8 perguntas comuns com expand/collapse) — conteúdo placeholder, o briefing 11 popula
- **Formulário** abaixo:
  - Nome, email, telefone, categoria (select), mensagem (textarea)
  - Campo honeypot `website` escondido com CSS (`position: absolute; left: -10000px`)
  - Botão "Enviar"
  - Após envio: mostra "Recebemos sua mensagem #4523. Em breve entraremos em contato." + link "Voltar pra ajuda"
- Erro: mostra mensagem amigável (rate-limit, validação) sem expor detalhes técnicos

### 6. WhatsApp opcional

Se decidido na Fase 0, envia mensagem pro operador (Nicchon, `5531993767301`) tipo:

```
Novo ticket de suporte #4523
Categoria: dúvida
De: João Silva <joao@empresa.com>
Mensagem: [primeiros 200 chars da mensagem]
Ver no KTask: https://ktask.agenciakharis.com.br/c/4523
```

Falha silenciosa (não bloqueia criação do ticket se WhatsApp cair — padrão já estabelecido pelo `WhatsAppHelper`).

---

## Fase 2 — Auto-auditoria

1. **Endpoint funciona?** POST `/api/v1/support-tickets` com payload válido retorna `{ticketCode, message}` e cria card de fato?
2. **Rate-limit ativo?** 6º req do mesmo IP em 60s retorna 429?
3. **Honeypot funciona?** Payload com `website` preenchido retorna 400 (e card NÃO é criado)?
4. **Board "Suporte" existe?** Confirma em prod após migration/seed rodar?
5. **Helper canônico usado?** Confirma que chamada usa `createCardWithPresence`, NÃO `prisma.card.create` direto (ADR-0006)?
6. **Contact criado/vinculado?** Confirma `CardContact` aparece no card?
7. **Frontend amigável?** Erro de validação mostra mensagem útil? Sucesso mostra número do ticket?
8. **Typecheck + lint verde.**
9. **Entrega**:

```
## Resumo da entrega

- Endpoint: POST /api/v1/support-tickets (público, rate-limit 5/min)
- Module: apps/api/src/modules/support/
- Migration/seed do board: aplicada
- Frontend: /ajuda/suporte com FAQ placeholder + formulário
- WhatsApp notification: habilitado / desabilitado
- Inferências sem confirmação: [lista]
- Sugestões de follow-up: [anexos, resposta automática, triagem por categoria]
```

---

## Notas gerais

- Sem emojis.
- Endpoint público mas com rate-limit obrigatório.
- LGPD: dados pessoais só pra contato; sem tracking adicional.
- Em dúvida, pergunte.
