# ADR 0004 — Deploy em Hetzner VM (supersedes plano AWS App Runner)

- **Status**: Accepted
- **Data**: 2026-04-24
- **Decisores**: Nicchon (operador único)
- **Tags**: infra, deploy, custo

## Contexto

O plano original de infra do KTask, registrado em [tarefas-md/08-infra-e-deploy.md](../../tarefas-md/08-infra-e-deploy.md), era:

- Frontend (`apps/web`) na **Vercel**
- API e workers em **AWS App Runner** (containers gerenciados)
- Banco em **RDS Postgres**
- Cache/filas em **ElastiCache Redis**
- Anexos em **S3**
- E-mail via **SES**, secrets via **SSM**, deploy via **GitHub Actions → ECR → App Runner**

Custo estimado MVP: ~$80/mês.

Quando chegou o momento de subir produção, três fatores fizeram a decisão mudar:

1. **Custo absoluto**: ~$80/mês na AWS vs ~R$ 34/mês numa VM Hetzner CX23 (~$7 USD). Pra uso interno da Kharis, com ~10 usuários, a relação custo/valor não justifica.
2. **Complexidade operacional**: configurar 8 serviços AWS (App Runner ×2, RDS, ElastiCache, S3, SES, SSM, ECR) + IAM + Security Groups + VPC pesa pra um operador único. Docker Compose numa VM é dia-1.
3. **Dependência de uso interno**: a primeira fase do produto é interna — não há SLA contratado, não há tráfego que justifique auto-scaling. Uma VM única com restart automático é suficiente.

O próprio doc 05 já previa essa bifurcação: "Produção MVP interno: VPS (Hetzner/DigitalOcean) com Docker Compose + Caddy" vs "Produção SaaS: Kubernetes (EKS ou DOKS) com HPA nos workers".

Evidência da execução no repo:

- [tarefas-md/10-deploy-producao.md](../../tarefas-md/10-deploy-producao.md) — doc vivo do deploy real (Hetzner CX23, IP `178.104.220.28`, Caddy + Let's Encrypt, Docker Compose, ~R$ 34/mês).
- [.github/workflows/deploy.yml](../../.github/workflows/deploy.yml).
- Commit inicial: `bdcf313 feat(deploy): docker-compose de producao, Caddyfile e Dockerfile web` (2026-04-24).
- Doc de produção publicado mesmo dia: `ef48de8 docs: registra deploy em producao (Hetzner + Caddy + CI/CD)` (2026-04-24).

## Decisão

Produção do KTask roda numa **única VM Hetzner CX23** em Falkenstein (DE), com **Docker Compose** orquestrando 5 containers (`ktask-api`, `ktask-web`, `ktask-postgres`, `ktask-redis`, `ktask-caddy`) e **Caddy** como reverse proxy com TLS automático via Let's Encrypt. Deploy via GitHub Actions: build da imagem no runner → push pro GHCR → SSH na VM → `docker compose pull && up -d`.

O plano AWS de `tarefas-md/08` fica como **registro histórico** — supersede esse plano.

## Alternativas consideradas

### Alternativa A: Hetzner VM + Docker Compose + Caddy (escolhida)

- Pros: custo absoluto baixíssimo (~R$ 34/mês total); TLS automático via Caddy elimina toda a complexidade de ACM/Cloudflare proxy; um único host facilita debug e logs (tudo via `docker logs`); operador único consegue dominar todo o stack.
- Contras: scaling vertical apenas (subir CX23 → CX33 → CPX); single point of failure (VM cai = produto cai); backup do banco precisa ser gerenciado manualmente (script + retention); sem multi-AZ; storage do MinIO/anexos depende do disco da VM.
- Evidência: doc 10 inteiro descreve a execução.

### Alternativa B: AWS App Runner + RDS + ElastiCache (plano original)

- Pros: managed services reduzem trabalho operacional (backups RDS, failover, métricas embutidas); escalável horizontalmente (App Runner sobe instâncias automaticamente); SES barato pra e-mail transacional.
- Contras: ~$80/mês MVP vs R$ 34/mês Hetzner — 5× mais caro; complexidade de IAM + VPC + Security Groups pra um operador único; vendor lock-in (sair da AWS depois é trabalho); App Runner não suporta WebSocket bem em todas as configurações de scaling.
- Evidência: detalhado em `tarefas-md/08-infra-e-deploy.md` (plano original).

### Alternativa C: Vercel (frontend) + serverless (backend)

- Pros: frontend grátis no plano hobby; deploy automático; preview por PR.
- Contras: backend serverless é incompatível com Socket.IO (conexões longas); workers BullMQ precisam de ambiente long-running; cold starts atrapalham latência percebida; estado em memória (presença) não funciona sem sticky session.
- Evidência: padrão da indústria, sem debate registrado nos docs do KTask além da menção a "Vercel pro frontend" no plano original — descartada implicitamente ao ir tudo pra Hetzner.

### Alternativa D: Fly.io

- Pros: containers em regiões múltiplas, suporte nativo a WebSocket e long-running; preço competitivo; deploy via `flyctl` simples.
- Contras: ainda é plataforma gerenciada (não tem o controle total de uma VM); operador único não tem experiência prévia; banco gerenciado da Fly tem histórico inconsistente.
- Evidência: padrão da indústria, sem debate registrado nos docs do KTask.

### Alternativa E: Kubernetes (EKS/DOKS) — caminho SaaS futuro

- Pros: padrão pra SaaS escalável; HPA nos workers; ecossistema maduro de observabilidade.
- Contras: overkill pra fase interna; custo de cluster (EKS ~$73/mês só de control plane) inviabiliza pra esse volume.
- Evidência: doc 05 menciona como caminho **futuro** quando virar SaaS — explicitamente fora do escopo MVP.

## Consequências

### Positivas

- Custo total da operação cabe em R$ 50/mês (incluindo domínio + backups ocasionais).
- Operador único entende 100% do stack — não há "caixa preta" gerenciada que precise abrir ticket pra debugar.
- Deploy via `git push origin main` → GitHub Actions → SSH na VM. Tempo total ~3 min.
- Caddy resolve TLS automaticamente — zero gestão manual de certificados.
- Volumes Docker persistentes (`ktask-prod_pgdata`, `ktask-prod_redisdata`, `ktask-prod_caddy_data`) ficam no disco da VM.

### Negativas / trade-offs aceitos

- **Single point of failure**: a VM cai (manutenção Hetzner, kernel panic, disco cheio) e o produto inteiro fica fora. Mitigação: snapshot diário da VM (Hetzner oferece), monitoring externo (UptimeRobot grátis), restart automático dos containers.
- **Backup do Postgres é manual**: script de backup + retention precisa ser configurado (commit `8498227 ops: backup diario + prune automatico no deploy` cuida disso) e os dumps idealmente saem da VM (Hetzner Storage Box ou S3 baratinho — pendente).
- **Sem auto-scaling**: pico de uso = subir CX para classe maior manualmente. Aceitável pra uso interno.
- **Recurso compartilhado**: Postgres + Redis + API + Web competem por CPU/RAM da mesma VM. Se um worker pesar, afeta os outros.
- **Migração futura pra cloud**: se o produto virar SaaS, voltar pro plano AWS (ou equivalente) implica refazer infra-as-code. Não é trivial, mas é trabalho previsto e isolado da camada de aplicação.

### Neutras / observações

- O plano AWS de `tarefas-md/08` permanece como referência arquitetural caso o cenário SaaS dispare a migração — não é "papel jogado fora", é "blueprint guardado".
- Cloudflare como DNS proxy foi descartado mesmo no plano AWS pra não bloquear WebSocket; aqui na Hetzner o DNS aponta direto pra VM (gerenciado em dnspro.com.br).

## Notas

- Doc de execução: [tarefas-md/10-deploy-producao.md](../../tarefas-md/10-deploy-producao.md).
- Plano AWS original (superseded): [tarefas-md/08-infra-e-deploy.md](../../tarefas-md/08-infra-e-deploy.md).
- Workflow CI/CD: [.github/workflows/deploy.yml](../../.github/workflows/deploy.yml).
- Commit decisivo: `bdcf313` (2026-04-24).
- Custo aproximado mensal: R$ 34 (CX23 + backup + snapshot ocasional).
