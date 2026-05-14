# Briefing — Runbooks dos 5 incidentes mais prováveis

> **Como usar:** cole este briefing inteiro num chat novo de Claude com acesso a este repositório. O Claude executará a Fase 0 (Inventário) e pedirá tua aprovação antes de produzir os entregáveis.

---

## Contexto rápido do projeto

KTask em produção numa Hetzner VM `178.104.220.28`. Stack: NestJS 11 + Next.js 15 + Postgres 16 + Redis 7 + BullMQ + Socket.IO. Caddy como reverse proxy + TLS automático. Docker Compose roda 5 containers. CI/CD via GitHub Actions (`.github/workflows/deploy.yml`), imagens em GHCR. Integrações externas: Evolution API (WhatsApp), S3 (anexos), SMTP, push notifications (web-push/VAPID).

Acesso operacional:

- SSH: `ssh -i ~/.ssh/ktask-deploy root@178.104.220.28`
- Usuário ops dedicado: `kops` (chave + sudo NOPASSWD)
- Banco: container `ktask-postgres`, `docker exec -i ktask-postgres psql -U ktask -d ktask`
- Backup automático: configurado via `scripts/ops/backup.sh`

---

## Objetivo desta sessão

Criar **runbooks** pros 5 incidentes mais prováveis em produção. Runbook = passo-a-passo executável às 3h da manhã sem precisar pensar, com comandos prontos pra copiar.

**Audiência**: plantonista (hoje, Nicchon; futuramente, qualquer dev de plantão). Não assume conhecimento do código — assume só Linux/Docker básico + acesso SSH.

**Entregáveis**:

- `docs/runbooks/README.md` — índice + diretrizes (severidade, escalonamento, registro)
- `docs/runbooks/_TEMPLATE.md` — molde de novo runbook
- `docs/runbooks/01-api-fora-do-ar.md`
- `docs/runbooks/02-banco-com-conexoes-saturadas.md`
- `docs/runbooks/03-filas-bullmq-travadas.md`
- `docs/runbooks/04-evolution-api-fora.md`
- `docs/runbooks/05-deploy-falhou-rollback.md`

Cada runbook entre **100 e 200 linhas**. Comandos copiáveis.

**Restrições**:

- Sem emojis.
- Comandos exatos com paths reais, não placeholders.
- Onde houver risco de comando destrutivo, **marca claramente** (`# CUIDADO: destrutivo`) e exige confirmação.
- NUNCA escrever senhas no runbook. Aponta pra `.env.ops` ou secret manager.
- Cada passo tem critério de "deu certo" (como verificar que funcionou).
- Se uma ação requer autorização (ex: rollback de release), runbook indica quem autoriza.

---

## Fase 0 — Inventário forçado

### Leituras obrigatórias

1. [tarefas-md/10-deploy-producao.md](../tarefas-md/10-deploy-producao.md) — fluxo de deploy real
2. [.github/workflows/deploy.yml](../.github/workflows/deploy.yml)
3. [.github/workflows/ci.yml](../.github/workflows/ci.yml)
4. [infra/docker-compose.prod.yml](../infra/docker-compose.prod.yml) (ou equivalente)
5. [infra/Caddyfile](../infra/Caddyfile) (se existir)
6. [apps/api/src/modules/health/](../apps/api/src/modules/health/) — endpoints `/healthz` `/readyz`
7. [apps/api/Dockerfile](../apps/api/Dockerfile) — pra saber CMD (migrate deploy)
8. [scripts/ops/backup.sh](../scripts/ops/backup.sh)
9. [.env.ops.example](../.env.ops.example) — credenciais ops
10. [apps/api/src/modules/whatsapp/](../apps/api/src/modules/whatsapp/) — integração Evolution
11. [apps/api/src/modules/notifications/](../apps/api/src/modules/notifications/) — push notifications

### Exploração estruturada

- Mapear endpoints de health/readiness exatos.
- Listar nomes de containers em produção (provavelmente `ktask-api`, `ktask-web`, `ktask-postgres`, `ktask-redis`, `caddy` — confirmar).
- Listar todas as filas BullMQ (`Grep` por `new Queue(` ou `@Processor` no api).
- Identificar quais módulos do api dependem do Redis (pra entender impacto de Redis fora do ar — fica sem real-time? sem jobs? ambos?).
- Identificar quais módulos dependem do S3 (anexos).
- Confirmar onde está o backup automático e qual o retention.

### Saída da Fase 0

```
## Inventário (Fase 0)

### Componentes em produção (containers)
1. ktask-api — comando: ..., porta interna: ..., depende de: Postgres + Redis + S3 + ...
2. ktask-web — ...
3. ktask-postgres — ...
4. ktask-redis — ...
5. caddy — ...

### Health/readiness endpoints
- /healthz: ...
- /readyz: ...

### Filas BullMQ identificadas
- nome: ..., processador em: apps/api/src/modules/<x>/<y>.processor.ts
- ...

### Integrações externas que podem cair
1. Evolution API (whatsapp) — impacto: ...
2. SMTP — impacto: ...
3. S3 — impacto: ...
4. Push (VAPID) — impacto: ...

### Backup automático
- Frequência: ...
- Onde fica: ...
- Retention: ...
- Como restaurar: ...

### Acesso operacional
- SSH key: ~/.ssh/ktask-deploy
- Usuário: root e/ou kops
- Comandos típicos: ...

### 5 incidentes mais prováveis (vou produzir runbook)
1. API fora do ar (502/503 no domínio) — sintomas: ..., causas comuns: ...
2. Postgres com conexões saturadas — sintomas: ..., causas: ...
3. Filas BullMQ travadas (jobs não processam) — sintomas: ..., causas: ...
4. Evolution API fora (envio WhatsApp falha) — sintomas: ..., causas: ...
5. Deploy falhou — sintomas: ..., como rollback: ...

### Incidentes considerados mas com runbook NÃO prioritário (justifique)
- ...

### Coisas que vou DEIXAR DE FORA
- ...

**Aguardo aprovação ou correção antes de produzir os runbooks.**
```

---

## Fase 1 — Produção

Após aprovação, produza:

### 1. `_TEMPLATE.md`

````markdown
# Runbook NN — Título do incidente

- **Severidade**: P0 (crítico, usuário sem serviço) | P1 (impacto parcial) | P2 (degradado, contornável) | P3 (sem impacto imediato)
- **Tempo médio de resolução**: ~Xmin (estimativa, ajustar após uso real)
- **Última atualização**: YYYY-MM-DD
- **Quem pode executar**: qualquer dev | apenas com acesso ops | exige autorização do Nicchon

## Sintomas

[O que o usuário vê / o que o monitoramento alerta. Sintomas observáveis sem entrar no servidor.]

## Diagnóstico rápido (5 min)

Liste comandos de diagnóstico em ordem. Para cada um, o que o output significa.

```bash
# 1. Confere se o domínio responde
curl -I https://ktask.agenciakharis.com.br/healthz
# Esperado: HTTP 200. Se 502/503 → API caída. Se 522 → Cloudflare/timeout.

# 2. SSH na VM
ssh -i ~/.ssh/ktask-deploy root@178.104.220.28

# 3. Status dos containers
docker ps --format 'table {{.Names}}\t{{.Status}}'
# Esperado: 5 containers Up. Se algum Restarting / Exited → ...
```
````

## Resolução

### Caso A: [hipótese mais provável]

1. Passo 1 (comando + o que esperar)
2. Passo 2
3. Verificação: como saber que voltou ao normal

### Caso B: [próxima hipótese]

...

### Se nada funcionar

- Escalar pra Nicchon (WhatsApp +55 31 99376-7301)
- Considerar rollback (ver `05-deploy-falhou-rollback.md`)
- Comunicar usuários afetados se P0 (template de mensagem opcional)

## Pós-incidente

- [ ] Registrar postmortem em `docs/postmortems/` se P0/P1
- [ ] Abrir issue se a correção for tática (gambiarra) e precisar fix definitivo
- [ ] Atualizar este runbook com novas hipóteses descobertas

## Links úteis

- Logs do api: `docker logs ktask-api --tail 200 -f`
- ...

```

### 2. `docs/runbooks/README.md`

Índice + diretrizes curtas:
- Definição de severidade (P0/P1/P2/P3)
- Quando abrir postmortem
- Quem está de plantão (placeholder; pode escrever "Nicchon" se for o caso)
- Como criar novo runbook (referenciar `_TEMPLATE.md`)
- Tabela com os 5 runbooks + severidade típica

### 3. Os 5 runbooks

Cada um cobrindo realisticamente o cenário. Especialmente importante:

**01 — API fora do ar**
- Cobrir: container crashou, restart loop, OOM, migrate deploy travado, Postgres inacessível
- Comandos: `docker logs ktask-api`, `docker stats`, `docker compose -f infra/docker-compose.prod.yml restart api`

**02 — Postgres com conexões saturadas**
- Sintomas: timeouts no api, erros `too many connections` no log
- Diagnóstico: `psql ... -c "SELECT count(*) FROM pg_stat_activity;"`, `SELECT * FROM pg_stat_activity WHERE state='idle in transaction';`
- Resolução: matar conexões idle, ajustar pool, último recurso restart

**03 — Filas BullMQ travadas**
- Sintomas: WhatsApp não envia, automação não dispara, notificações atrasadas
- Diagnóstico: usar `ioredis` CLI ou Bull Board (se houver) pra inspecionar filas
- Resolução: reprocessar failed jobs, limpar stalled, ver erros do worker

**04 — Evolution API fora**
- Sintomas: erros em chamadas a `EVOLUTION_DEFAULT_URL`
- Diagnóstico: `curl` direto na Evolution
- Resolução: confirmar instância (`NicchonSanchez` default), reconectar QR code, contato com responsável do Evolution

**05 — Deploy falhou / rollback**
- Sintomas: workflow Deploy vermelho, ou Deploy passou mas healthcheck falha
- Diagnóstico: GitHub Actions logs, smoke test do deploy.yml
- Resolução: `gh workflow run deploy.yml --ref main -f image_tag=<SHA_ANTERIOR>` ou editar `IMAGE_TAG` no `infra/prod.env` e `docker compose up -d`

---

## Fase 2 — Auto-auditoria

1. **Cada comando funciona?** Você confirmou paths, nomes de containers, nomes de filas? Marcou onde inferiu sem confirmação?
2. **Cada passo tem critério de "deu certo"?**
3. **Senhas vazaram?** (não deveriam estar no runbook — só referência ao `.env.ops`)
4. **Severidade está coerente?** P0 só pra "usuário sem serviço".

```

## Resumo da entrega

- Arquivos gerados: docs/runbooks/README.md, \_TEMPLATE.md, 01-...md ... 05-...md
- Comandos testados em laboratório: [sim/não — provavelmente NÃO, marque "não testado em laboratório, baseado em leitura do código + docs"]
- Inferências não confirmadas: [lista]
- Sugestões de runbooks adicionais (não prioritários hoje): [lista]

```

---

## Notas gerais

- Sem emojis.
- Comandos copiáveis (sem placeholders tipo `<seu-token-aqui>` — usa variáveis env reais como `$EVOLUTION_DEFAULT_API_KEY`).
- Tom: pragmático, plantonista cansado precisa ler isso e agir.
- Cada runbook deve ser legível em 3 minutos.
- Em dúvida sobre escopo, pergunte. Não chute.
```
