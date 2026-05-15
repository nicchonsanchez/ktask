# 51 — Federação de Identidade: KTask como IdP do Ogma

## Escopo

Implementar no KTask os **5 gaps** necessários pra ele atuar como Identity Provider do **Ogma** (sistema de atendimento WhatsApp da Creatyze), via OAuth2/OIDC simplificado.

Decisão arquitetural completa em:

- [Ogma — ADR-0001](../../../Creatyze/sistema-atendimento/docs/adr/0001-decisoes-iniciais-da-arquitetura.md) decisão 5
- [Ogma — ADR-0002](../../../Creatyze/sistema-atendimento/docs/adr/0002-refinamentos-pos-auditoria.md) decisão 17
- [Ogma — Auditoria do KTask](../../../Creatyze/sistema-atendimento/docs/auditoria-ktask.md)

### Fora do escopo

- 2FA TOTP (preparado no schema mas não implementado — fica pra depois)
- UI completa de gestão de Service Providers (MVP: form simples no painel admin)
- OAuth2 completo com authorization code flow (não precisamos — Ogma valida via endpoint dedicado)
- OIDC discovery completo (`.well-known/openid-configuration` etc. — fica pra depois)

## Etapas

### Etapa 1 — Endpoint `POST /api/v1/auth/validate` (aditivo)

- Body: `{ email, senha, serviceProviderId? }`
- Valida credenciais usando o pipeline existente (Argon2id)
- Retorna em sucesso:
  ```json
  {
    "valido": true,
    "usuario": { "id", "nome", "email" },
    "memberships": [{ "organizationId", "slug", "role" }],
    "jwt": "<token JWT assinado>"
  }
  ```
- Retorna em falha: `401` com `{ "valido": false, "motivo": "credenciais_invalidas" | "usuario_desativado" }`
- Sem dependência de sessão prévia
- Rate limit por IP (5 tentativas / 5 min) via `@nestjs/throttler`

Estimativa: **2-3h**

### Etapa 2 — Migração JWT HMAC → RSA + JWKS (DISRUPTIVO, dual-validation)

Atualmente o KTask usa HS256 com secret simples (`JWT_ACCESS_SECRET`). Pra Ogma poder validar JWT do KTask sem consultar o KTask a cada requisição, precisamos par de chaves assimétricas (RSA-2048 recomendado pra começar, EdDSA depois se compensar).

Sub-etapas:

1. Gerar par RSA-2048
2. Armazenar chave privada em `JWT_PRIVATE_KEY` (PEM em env var); chave pública derivada dela
3. Atualizar `JwtStrategy` (passport-jwt) pra aceitar 2 algoritmos durante a janela de transição:
   - HS256 com `JWT_ACCESS_SECRET` antigo (tokens emitidos antes do deploy)
   - RS256 com chave pública nova (tokens emitidos a partir do deploy)
4. Novos tokens emitidos a partir do deploy usam RS256
5. Endpoint público `GET /.well-known/jwks.json` retorna chave pública no formato JWKS
6. Header `Cache-Control: max-age=3600` no JWKS pra Ogma cachear 1h

Janela de transição: **7 dias** com dual-validation. Após isso, PR separado remove o caminho HS256.

Estimativa: **5h** (implementação) + 7 dias monitoramento + **1h** (remoção do HS256 em PR seguinte)

**Plano de rollout**:

- Avisar Kharis 24h antes do deploy (precaucional; sem impacto esperado pelos usuários)
- Deploy 1 (dual-validation ativa): novos logins usam RS256, sessões antigas continuam válidas em HS256
- Monitorar logs por 7 dias buscando rejeições inesperadas
- Deploy 2: remover validação HS256

### Etapa 3 — Webhook dispatcher outbound assinado (aditivo)

Novo módulo `WebhooksModule`:

- Tabela `ServiceProvider`:
  ```
  id, nome, webhookUrl, secret (HMAC), escopo (array), ativo, criadoEm
  ```
- Service `WebhookDispatcherService` escuta eventos internos via `EventEmitterModule` (já carregado no `app.module`) e enfileira job em BullMQ (`webhook-outbound`)
- Worker faz `POST` HTTP com payload JSON + header `X-Signature: HMAC-SHA256(secret, body)` + `X-Event-Id: <uuid>` (idempotência)
- Retry exponencial: 1min, 5min, 30min, 2h, 8h (5 tentativas; depois desiste e loga)

Eventos emitidos no MVP:

- `usuario.email_alterado`
- `usuario.senha_alterada`
- `usuario.desativado`
- `usuario.removido`
- `organizacao.atualizada`

Estimativa: **5h**

### Etapa 4 — Endpoint `POST /api/v1/auth/revoke/:userId` (aditivo)

- Restrito a admin da organização ou OWNER global
- Marca user em `TokenRevogado(userId, revogadoEm, motivo)` com TTL = TTL do refresh token mais longo (90 dias)
- `JwtStrategy` consulta essa tabela (cache em Redis com TTL curto, ~30s) e rejeita tokens de users revogados
- Dispara webhook `usuario.desativado` pra todos os SPs ativos

Estimativa: **2h**

### Etapa 5 — Cadastro de Service Providers (aditivo, com UI mínima)

- Tabela `ServiceProvider` (já citada na etapa 3)
- Endpoints REST CRUD restritos a admin global:
  - `POST /api/v1/service-providers`
  - `GET /api/v1/service-providers`
  - `PATCH /api/v1/service-providers/:id`
  - `DELETE /api/v1/service-providers/:id`
- UI no painel admin do KTask: lista + form de criar/editar (verificar antes se KTask já tem área de admin global; se não, criar área mínima)
- Secret HMAC gerado automaticamente na criação; mostrar 1 vez ao admin (não armazenar plaintext recuperável depois — só hash pra verificar)

Estimativa: **4-6h** dependendo se a área admin já existe

### Etapa 6 — Documentação e testes

- Adicionar seção em `docs/architecture.md` do KTask sobre federação
- Criar ADR no KTask: `docs/adr/XXXX-ktask-como-identity-provider.md` espelhando a decisão (apontar pros ADRs do Ogma como contexto cross-projeto)
- Testes unitários:
  - `AuthValidateService`: credenciais corretas/incorretas, user desativado, rate limit
  - `JwtStrategy`: aceita HS256 antigo E RS256 novo
  - `WebhookDispatcherService`: assinatura HMAC correta, retry exponencial, idempotência
- Teste e2e: mock de Ogma faz `POST /auth/validate` no KTask local e recebe JWT válido; valida assinatura com chave pública obtida via `GET /.well-known/jwks.json`

Estimativa: **3h**

## Critérios de aceite

1. `POST /api/v1/auth/validate` retorna JWT válido pra credenciais corretas; 401 pra incorretas
2. Tokens RS256 são aceitos pela API normalmente
3. Tokens HS256 antigos continuam aceitos por 7 dias após o deploy 1
4. `GET /.well-known/jwks.json` retorna chave pública válida em formato JWKS
5. Trocar senha de um user dispara webhook `usuario.senha_alterada` pra todos os SPs ativos (testar com SP mock)
6. `POST /auth/revoke/:userId` força logout (sessões expiram em até 30s por causa do cache Redis); webhook é disparado
7. Admin global consegue cadastrar/editar Service Providers via UI
8. Documentação atualizada (architecture.md + ADR no KTask)
9. Testes passam (unit + e2e mínimo)
10. Lint e typecheck verdes

## Riscos / decisões

- **RSA-2048 vs Ed25519**: Ed25519 é mais moderno (chaves 32 bytes vs 256, mais rápido). Compat com `jsonwebtoken` (pacote padrão) precisa verificar. **Recomendação**: começar com RS256, migrar pra EdDSA depois se compensar.
- **Onde armazenar chave privada**: variável de ambiente (`JWT_PRIVATE_KEY` como PEM multi-linha) é simples e funciona. Vault tipo HashiCorp seria melhor mas overkill no MVP. Adicionar ao `.env.example` (com placeholder, não a chave real).
- **TTL da chave pública no Ogma**: 1h via header `Cache-Control: max-age=3600`. Se precisar rotacionar urgente, Ogma precisa fazer fetch novo (mitigar com header forçado ou flush manual).
- **Onde fica a UI de admin global**: precisa auditar antes — pode ser que a etapa 5 estoure se a área não existir.
- **Eventos faltantes**: outros podem surgir conforme integração evolui (`organizacao.membro_adicionado`, etc.). Adicionar conforme necessidade.

## Estimativa total

| Etapa                                 | Estimativa                                          |
| ------------------------------------- | --------------------------------------------------- |
| 1. Endpoint `/auth/validate`          | 3h                                                  |
| 2. JWT RS256 + JWKS + dual-validation | 5h + 7 dias janela + 1h cleanup                     |
| 3. Webhook dispatcher                 | 5h                                                  |
| 4. Endpoint `/auth/revoke`            | 2h                                                  |
| 5. Service Providers (com UI mínima)  | 4-6h                                                |
| 6. Docs + testes                      | 3h                                                  |
| **Total**                             | **~24h trabalho focado + 7 dias janela calendário** |

## Ordem de execução

Recomendo nessa ordem (cada etapa pode ser PR separado):

1. **Etapa 5 primeiro** (Service Providers + cadastro) — fundação; outras etapas dependem da tabela
2. **Etapa 1** (validate) — primeiro endpoint funcional pra Ogma usar
3. **Etapa 3** (webhook dispatcher) — Ogma já consegue receber eventos
4. **Etapa 4** (revoke) — fecha o ciclo de revogação
5. **Etapa 2** (RS256 + JWKS) — disruptivo, fazer com tudo o resto já testado
6. **Etapa 6** (docs + testes) — em paralelo, ao longo de tudo

## Comunicação com o Ogma

Cada etapa concluída, atualizar o status correspondente em:

- [Ogma — decisoes-pendentes.md item 13.x](../../../Creatyze/sistema-atendimento/docs/decisoes-pendentes.md)
- [Ogma — auditoria-ktask.md seção 4](../../../Creatyze/sistema-atendimento/docs/auditoria-ktask.md) — marcar gap como resolvido
