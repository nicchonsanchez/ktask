# Architecture Decision Records (ADRs)

Registro histórico das decisões arquiteturais do KTask. Cada ADR responde "por que escolhemos X em vez de Y, num momento específico".

ADR **não é** documentação de "como funciona X" — pra isso existe `tarefas-md/` e o próprio código. ADR é "qual era o contexto, que opções tinham, o que foi decidido, que trade-offs aceitamos".

## Quando criar uma nova ADR

Crie uma ADR quando a decisão:

- Define uma camada do stack (ex: ORM, broker, runtime de deploy)
- Define um padrão arquitetural com efeito transversal (ex: multi-tenancy, autenticação, formato de evento)
- Substitui ou contradiz uma ADR anterior
- Vai ser difícil de reverter (lock-in de fornecedor, mudança de schema invasiva, contrato com terceiro)
- Foi debatida com mais de uma alternativa viável

Não crie ADR pra:

- Convenção tática (estrutura de pasta, nome de variável, lint rule)
- Bug fix
- Escolha de biblioteca pequena (utility, formatador, ícone) sem impacto arquitetural

## Como numerar

- Numeração sequencial de 4 dígitos: `0001`, `0002`, `0003`, ...
- Nome do arquivo: `NNNN-titulo-em-kebab-case.md`
- **Nunca renumerar** após criação. Mesmo se a ADR for marcada `Deprecated`, ela mantém o número.

## Como marcar uma ADR como superseded

Quando uma decisão muda:

1. Crie uma nova ADR (próximo número sequencial) com `Status: Accepted` e adicione no Contexto a referência à ADR antiga.
2. Edite a ADR antiga: troque `Status: Accepted` por `Status: Superseded by ADR-XXXX` e adicione uma linha no final apontando pra nova.
3. Não reescreva o conteúdo da ADR antiga — ela permanece como registro histórico do estado anterior.

ADRs `Accepted` são imutáveis. Pequenas correções de typo / link quebrado são aceitáveis; mudanças de conteúdo viram nova ADR.

## Índice

| Nº                                              | Título                                                 | Status                      | Tags                           |
| ----------------------------------------------- | ------------------------------------------------------ | --------------------------- | ------------------------------ |
| [0001](0001-monorepo-pnpm-turborepo.md)         | Monorepo pnpm + Turborepo                              | Accepted                    | monorepo, build, tooling       |
| [0002](0002-multi-tenant-organizationid.md)     | Multi-tenant via `organizationId` (shared schema)      | Accepted                    | multi-tenant, banco, segurança |
| [0003](0003-cards-multi-fluxo-cardpresence.md)  | Cards em múltiplos fluxos via tabela `CardPresence`    | Accepted (migração parcial) | domínio, banco, kanban         |
| [0004](0004-deploy-hetzner-vs-aws.md)           | Deploy em Hetzner VM (supersedes plano AWS App Runner) | Accepted                    | infra, deploy, custo           |
| [0005](0005-evolution-api-vs-meta-cloud-api.md) | WhatsApp via Evolution API self-hosted                 | Accepted                    | integração, whatsapp           |

## Template

Use [`_TEMPLATE.md`](_TEMPLATE.md) como ponto de partida pra novas ADRs.

## Sugestões de ADRs futuras

Decisões que aparecem nos docs com debate explícito mas ainda não viraram ADR:

- NestJS vs Next.js fullstack (Server Actions) — comparação em `tarefas-md/05`
- Prisma vs Drizzle ORM — comparação em `tarefas-md/05`
- REST/OpenAPI vs tRPC — comparação em `tarefas-md/05`
- Auth próprio (JWT + refresh) vs NextAuth — comparação em `tarefas-md/05`
- Socket.IO vs Pusher/Ably — comparação em `tarefas-md/05`
- BullMQ vs Inngest/Trigger.dev — comparação em `tarefas-md/05`
