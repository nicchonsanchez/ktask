# ADR 0001 — Monorepo pnpm + Turborepo

- **Status**: Accepted
- **Data**: 2026-04-23
- **Decisores**: Nicchon (operador único)
- **Tags**: monorepo, build, tooling

## Contexto

O KTask precisa de pelo menos duas aplicações executáveis (`apps/api` em NestJS e `apps/web` em Next.js) que compartilham contratos: schemas Zod de validação, tipos de DTO, helpers puros (ex: ordenação por posição em float). Há intenção desde o início de extrair pacotes internos reutilizáveis (`packages/config-eslint`, `packages/config-tsconfig`, `packages/contracts`, `packages/utils`) — ver estrutura proposta em `tarefas-md/05-stack-e-arquitetura.md`.

Manter `web` e `api` em repositórios separados implicaria duplicar tipos, sincronizar versões manualmente e perder a possibilidade de typecheck cross-app numa única passada de CI. Como o projeto é tocado por uma única pessoa hoje e o contrato API↔web muda com frequência, o atrito de dois repos pesa mais que o ganho de isolamento.

Evidência da decisão no repo:

- `pnpm-workspace.yaml` declara `apps/*` e `packages/*`
- `turbo.json` define pipeline `build`/`lint`/`typecheck`/`test` com `dependsOn: ["^build"]`
- `package.json` raiz declara `"packageManager": "pnpm@9.15.0"` e scripts `turbo run ...`
- Commit inicial do monorepo: `e44c703 feat(phase-0): bootstrap monorepo, infra and foundational apps` (2026-04-23)

## Decisão

Usamos um monorepo único gerenciado por **pnpm workspaces** com **Turborepo** como orquestrador de tasks.

## Alternativas consideradas

### Alternativa A: pnpm workspaces + Turborepo (escolhida)

- Pros: workspace nativo do pnpm é rápido e usa hardlinks (instalações compactas); Turborepo dá cache de tasks incrementais e execução paralela por dependência de grafo; é o stack que outros sistemas internos da Kharis também usam, então DX é familiar.
- Contras: Turborepo é um binário a mais no toolchain; o cache remoto (Vercel) não é usado e o cache local pode inchar; alguns plugins eslint/typescript precisam de configuração extra pra resolver paths de workspace.
- Evidência: escolha registrada em `tarefas-md/05-stack-e-arquitetura.md` linha 27 ("Monorepo: pnpm workspaces + Turborepo / Cache incremental, tasks paralelas").

### Alternativa B: npm/yarn workspaces sem orquestrador (single repo "manual")

- Pros: setup mais simples, nenhuma ferramenta extra além do package manager.
- Contras: sem cache de tasks; rodar `lint`/`typecheck`/`build` no monorepo inteiro a cada commit fica caro; CI gasta mais minutos.
- Evidência: padrão da indústria, sem debate registrado nos docs do KTask.

### Alternativa C: Nx

- Pros: orquestrador maduro, plugins oficiais pra Next.js e Nest, gera dependency graph rico.
- Contras: opinionado em estrutura, vendor lock em `nx.json`/generators; mais pesado pra um projeto pequeno; curva de aprendizado maior que Turborepo.
- Evidência: padrão da indústria, sem debate registrado nos docs do KTask.

### Alternativa D: Lerna

- Pros: histórico longo de uso em monorepos JS, foco em versionamento/publish.
- Contras: foco em publicar pacotes (não é o caso — nada do KTask é publicado em registry); manutenção foi inconsistente nos últimos anos; não traz cache incremental sem Nx.
- Evidência: padrão da indústria, sem debate registrado nos docs do KTask.

### Alternativa E: repositórios separados (`ktask-api` e `ktask-web`)

- Pros: isolamento forte, CI independente, blast radius menor por repo.
- Contras: contratos API/web precisam ser duplicados ou publicados como pacote NPM privado; refactors cross-cutting (renomear DTO, ajustar schema Zod compartilhado) viram cross-repo PRs; com um operador único, o overhead é desproporcional.
- Evidência: padrão da indústria, sem debate registrado nos docs do KTask.

## Consequências

### Positivas

- Refactor de tipos compartilhados entre API e web acontece em commit único.
- Turborepo cacheia `build`/`typecheck` por workspace, então CI roda só o que mudou.
- pnpm reduz tempo de install (relevante no CI).
- Permite extrair pacotes internos (`packages/contracts`, `packages/utils`) sem nova infra de publish.

### Negativas / trade-offs aceitos

- Toda mudança em arquivos compartilhados invalida o cache de Turborepo para múltiplos workspaces — em projetos grandes isso pesa.
- pnpm tem incompatibilidades pontuais com pacotes que assumem hoisting do npm (resolvidas caso a caso com `public-hoist-pattern` ou `node-linker=hoisted`).
- O modelo de workspace prende todo o time numa única versão major de TypeScript/ESLint — atualizações precisam ser coordenadas.

### Neutras / observações

- Cache remoto do Turborepo (Vercel Remote Cache) não é usado hoje. Pode ser ativado se o CI ficar lento.
- A versão do pnpm está pinada em `packageManager` do `package.json`, e Node `>=22` no `engines` — garantia de reprodutibilidade em CI e VM.

## Notas

- Arquivos de evidência: [pnpm-workspace.yaml](../../pnpm-workspace.yaml), [turbo.json](../../turbo.json), [package.json](../../package.json).
- Plano original em [tarefas-md/05-stack-e-arquitetura.md](../../tarefas-md/05-stack-e-arquitetura.md).
- Commit decisivo: `e44c703` (2026-04-23).
