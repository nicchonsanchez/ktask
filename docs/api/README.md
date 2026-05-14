# API KTask — OpenAPI / Swagger

Documentação interativa da API REST do KTask, gerada a partir dos
decoradores `@nestjs/swagger` nos controllers de `apps/api/src/modules/*`.

## Acesso

- **Dev**: http://localhost:4000/docs (UI) — http://localhost:4000/docs-json (spec OpenAPI 3.x bruta)
- **Prod**: **bloqueado** — `/docs` e `/docs-json` retornam 404 em
  `api.ktask.agenciakharis.com.br`. KTask é uso interno hoje, sem
  integradores externos. Documentação interativa fica só em ambiente de
  desenvolvimento.

A trava do 404 em prod é feita no [infra/Caddyfile](../../infra/Caddyfile)
(matcher `@docs` com `respond 404`), **não** no código da aplicação. A
aplicação NestJS sempre monta o Swagger — quem decide expor ou não é o
proxy reverso na borda. Vantagem: pra abrir em staging/prod no futuro,
basta mudar o Caddyfile do ambiente, sem mexer no código.

## Autenticação no Swagger UI

A API usa JWT Bearer (cookie de refresh + access token em header). Para
testar endpoints autenticados pelo Swagger UI:

1. Chame `POST /api/v1/auth/login` direto pelo Swagger UI, com body `{ "email": "...", "password": "..." }`.
2. Copie o `accessToken` retornado.
3. Clique no botão **Authorize** no topo da UI.
4. Cole `accessToken` no campo do esquema **bearer** (sem o prefixo `Bearer `).
5. As próximas chamadas vão automaticamente com `Authorization: Bearer <token>`.

A opção `persistAuthorization: true` está ligada — o token sobrevive a
refresh do navegador.

## Estrutura de rotas

- **Prefix global**: `/api`
- **Versionamento URI**: `/v1` (atual)
- **Rotas reais**: `/api/v1/<modulo>/<resource>`
- **Fora do prefix**: `/healthz`, `/readyz` (terminus, não no Swagger)
- **Versionamento futuro**: mudanças breaking → `/v2`; mudanças aditivas
  continuam em `/v1`

## Como anotar novos endpoints

Padrão mínimo por endpoint:

```typescript
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('cards')
@ApiBearerAuth()
@Controller({ path: 'cards', version: '1' })
export class CardsController {
  @Post(':cardId/contacts')
  @ApiOperation({ summary: 'Vincula contato a um card' })
  linkContactToCard(...) { ... }
}
```

Padrões da casa:

- **`@ApiTags`** no controller — agrupa endpoints na UI.
- **`@ApiBearerAuth`** no controller — todos os endpoints exigem JWT, com
  exceção dos públicos (ex: `approvals-public`, `auth/login`, `auth/forgot-password`).
- **`@ApiOperation({ summary })`** em **todo** método HTTP — summary curto
  em pt-BR, imperativo ou substantivo. Exemplo: `"Criar card numa lista"`,
  `"Detalhe do card"`.
- **Endpoints públicos** levam `@Public()` (decorator próprio) **sem**
  `@ApiBearerAuth` no método.

## Gaps conhecidos (follow-up)

Estado em 2026-05-13:

- **Zero `@ApiResponse`** no projeto. UI não mostra schema/exemplo de
  resposta — apenas método, path, summary e body. Resolver isso bem requer
  um dos dois caminhos:
  - **(a)** Instalar `nestjs-zod` e converter os schemas Zod existentes em
    DTOs OpenAPI com `createZodDto`. Mantém Zod como fonte única de
    validação e ganha schemas automáticos. **Caminho recomendado.**
  - **(b)** Criar DTOs paralelos com `@ApiProperty`, duplicando os schemas
    Zod. Mais boilerplate, mais risco de drift.
- **Bodies de request sem schema OpenAPI**: mesma causa — schemas Zod via
  `ZodValidationPipe` não são introspectados pelo Swagger. Resolvido junto
  com o item acima.
- **`HealthController`** sem `@ApiOperation`. Decisão consciente: rota fora
  do prefix `/api`, terminus retorna formato próprio, não vale documentar
  no Swagger principal.

## Quando reabrir `/docs` em prod (futuro)

Quando KTask virar SaaS e precisar de integradores externos, abrir
`/docs-json` (spec bruta) é mais útil que abrir `/docs` (UI). Caminhos
possíveis:

1. **Mais simples**: remover o bloco `@docs` do `infra/Caddyfile`. Documentação
   passa a ficar pública.
2. **Mais seguro**: trocar `respond 404` por `basic_auth` (variáveis
   `KTASK_DOCS_USER` / `KTASK_DOCS_HASH`, hash gerado com
   `caddy hash-password`).
3. **Mais limpo pra SaaS**: gerar a spec em build-time, hospedar num bucket
   versionado e deixar `/docs` em prod ainda bloqueada.

## Arquivos relevantes

- [apps/api/src/main.ts](../../apps/api/src/main.ts) — bootstrap do Swagger (sempre ativo)
- [infra/Caddyfile](../../infra/Caddyfile) — bloqueio de `/docs` em prod
- [apps/api/src/modules/](../../apps/api/src/modules/) — controllers (fonte dos decoradores)
