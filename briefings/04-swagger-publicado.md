# Briefing — Swagger/OpenAPI publicado em /docs

> **Como usar:** cole este briefing num chat novo de Claude com acesso a este repositório. Fase 0 (Inventário) primeiro; aguarda aprovação antes de modificar código ou produzir docs.

---

## Contexto rápido do projeto

KTask. API NestJS 11 em `apps/api`. `@nestjs/swagger` já é uma dependência do projeto. Provável que decoradores já existam parcialmente (`@ApiTags`, `@ApiBearerAuth`, `@ApiOperation`) mas não conferido se está exposto publicamente. URL da API em prod: `https://api.ktask.agenciakharis.com.br`.

---

## Objetivo desta sessão

Garantir que a documentação **OpenAPI 3.x** da API esteja:

1. **Exposta** numa rota acessível (`/docs` para UI Swagger, `/docs-json` para spec bruta).
2. **Completa** o suficiente pra ser útil — operações descritas, request/response schemas anotados, autenticação documentada.
3. **Documentada** — um guia curto explicando como adicionar/manter conforme novos endpoints surgirem.

**Audiência**: dev backend (mantém), dev frontend (consume), futuros integradores externos (quando virar SaaS).

**Entregáveis** (a depender do estado atual encontrado na Fase 0):

- **Se Swagger NÃO está exposto**: configurar exposição em `apps/api/src/main.ts` (ou módulo dedicado) e produzir `docs/api/README.md`.
- **Se Swagger está exposto mas incompleto**: produzir relatório de gaps + adicionar decoradores faltantes nos módulos mais críticos (auth, cards, boards, contacts).
- **Se Swagger está completo**: produzir `docs/api/README.md` explicando como acessar, autenticar e contribuir.

Sempre produzir `docs/api/README.md` com:

- Como acessar `/docs` em dev e prod
- Como autenticar no Swagger UI (Bearer token)
- Convenções: como anotar novos endpoints (referência rápida)
- Schema de versionamento (se há versão prefix `/v1`)

**Restrições**:

- Sem emojis.
- Não expor `/docs` em prod sem autenticação se houver dados sensíveis no path (avaliar; talvez basta basic-auth no Caddy).
- Não inventar endpoints — se um módulo não tem decorador `@ApiOperation`, o gap deve ser sinalizado, não preenchido com texto inventado.

---

## Fase 0 — Inventário forçado

### Leituras obrigatórias

1. [apps/api/src/main.ts](../apps/api/src/main.ts) — confere se `SwaggerModule.setup()` já existe
2. [apps/api/package.json](../apps/api/package.json) — versão exata de `@nestjs/swagger`
3. [apps/api/src/modules/](../apps/api/src/modules/) — varrer controllers de cada módulo
4. [infra/Caddyfile](../infra/Caddyfile) (ou prod) — confere se `/docs` está exposto ou bloqueado
5. [tarefas-md/05-stack-e-arquitetura.md](../tarefas-md/05-stack-e-arquitetura.md) — alguma menção a OpenAPI/Swagger?

### Exploração estruturada

Use `Grep`:

- `SwaggerModule\.setup` em `apps/api/src` — está configurado?
- `@ApiOperation` em controllers — quais têm, quais não têm
- `@ApiBearerAuth` — confirma uso de auth Bearer
- `@ApiTags` — pra organizar UI
- `@Controller\(` em todos os módulos — lista total de controllers existentes

Faça um `curl https://api.ktask.agenciakharis.com.br/docs` (HEAD ou GET) pra confirmar se está exposto em prod ou retorna 404 / 401.

### Saída da Fase 0

```
## Inventário (Fase 0)

### Estado atual do Swagger
- Configurado em main.ts: sim/não, código encontrado em: [path:linha]
- Rota exposta: /docs ou /api/docs ou outra ou nenhuma
- Versão @nestjs/swagger: X.Y.Z
- Em produção responde em /docs? (curl testado): [resultado]

### Cobertura de decoradores por módulo (controllers)
| Módulo | Controller | @ApiTags | @ApiOperation | @ApiBearerAuth | @ApiResponse | DTO Zod com anotação |
|--------|-----------|----------|---------------|----------------|--------------|---------------------|
| auth | AuthController | ✓ | parcial (3/8 ops) | ✗ | ✗ | ✗ |
| cards | ... | ... | ... | ... | ... | ... |
...

### Decisão (proposta)
Cenário identificado: A | B | C
- A: Swagger não configurado → preciso configurar do zero
- B: Swagger configurado mas com X% de cobertura → preciso completar
- C: Swagger completo → só falta documentação

### Plano de ação proposto
1. ...
2. ...

### Coisas que vou DEIXAR DE FORA
- Endpoints internos não-públicos (admin?)
- Webhooks (se existirem) — geralmente fora do Swagger principal
- ...

**Aguardo aprovação ou correção antes de produzir o entregável.**
```

---

## Fase 1 — Produção

Depende do cenário identificado.

### Cenário A — Swagger não configurado

Configurar `apps/api/src/main.ts`:

```typescript
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// dentro de bootstrap(), após criação do app:
const config = new DocumentBuilder()
  .setTitle('KTask API')
  .setDescription('API do sistema KTask.')
  .setVersion('1.0')
  .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
  .build();
const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('docs', app, document, {
  swaggerOptions: { persistAuthorization: true },
});
```

Confirma se `/docs` e `/docs-json` ficam expostos. Aponta pro Nicchon avaliar exposição em prod (basic-auth via Caddy?).

### Cenário B — Cobertura incompleta

Pra cada módulo do top-5 mais usado (auth, cards, boards, contacts, automations):

- Adiciona `@ApiTags`, `@ApiBearerAuth` no controller
- Pra cada `@Get/@Post/@Patch/@Delete`, garante `@ApiOperation({ summary })`
- Pra DTOs Zod, usa `nestjs-zod` (`createZodDto`) ou adicione `@ApiProperty` nos exemplos

NÃO faz pra todos os módulos. Foca nos 5 mais críticos. Sinaliza no relatório os outros como follow-up.

### Cenário C — Já está completo

Pula direto pro `docs/api/README.md`.

### Sempre — `docs/api/README.md`

````markdown
# API KTask — OpenAPI / Swagger

## Acesso

- Dev: http://localhost:4000/docs
- Prod: https://api.ktask.agenciakharis.com.br/docs (acesso restrito? listar)
- Spec JSON: /docs-json (mesmo host)

## Autenticação

1. ...
2. Cola o `accessToken` no botão "Authorize" do Swagger UI

## Versionamento

- Prefixo: /v1 (todas as rotas)
- Mudanças breaking → /v2 (a definir)

## Como anotar novos endpoints

Padrão obrigatório por endpoint:

```typescript
@Post('cards/:cardId/contacts')
@ApiOperation({ summary: 'Vincula contato a um card' })
@ApiResponse({ status: 201, type: ContactDto })
@ApiBearerAuth('access-token')
linkContactToCard(...) { ... }
```
````

## Gaps conhecidos

- [módulo X] sem @ApiOperation em N endpoints
- [DTO Y] sem schema OpenAPI (usar @ApiProperty)
- ...

## Roadmap

- ...

```

---

## Fase 2 — Auto-auditoria

1. **Acessibilidade**: `/docs` responde em dev (`localhost:4000`)?
2. **Cobertura**: tabela de gaps no `docs/api/README.md` é honesta?
3. **Segurança**: marcou claramente se `/docs` em prod precisa de proteção?
4. **Entrega**:

```

## Resumo da entrega

- Cenário identificado: A | B | C
- Arquivos modificados: [lista de paths em apps/api]
- Arquivos criados: docs/api/README.md
- Cobertura antes / depois: X% → Y%
- Endpoints sem decorador (follow-up): [lista]
- Risco de exposição prod: [avaliação]

```

---

## Notas gerais

- Sem emojis.
- Não use `class-validator` se o projeto já usa `nestjs-zod` — confere convenção existente antes.
- Não documentar endpoints que NÃO devem ser públicos (rotas internas de admin).
- Em dúvida, pergunte.
```
