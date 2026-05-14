# Runbook 02 — Postgres saturado / com conexões esgotadas

- **Severidade**: P0 se 100% de timeouts; P1 se intermitente.
- **Tempo médio de resolução**: ~15 min
- **Última atualização**: 2026-05-13
- **Quem pode executar**: dev com acesso SSH + `psql` básico

## Sintomas

- `/readyz` retorna 503 com `checks.db = "error"`.
- Logs da API: `PrismaClientKnownRequestError`, `too many connections for role "ktask"`, `Timed out fetching a new connection from the connection pool`, `canceling statement due to statement timeout`.
- Requests demoram (> 5s) ou retornam 500 esporádicos. Web carrega mas listas vêm vazias / com erro.
- `docker stats ktask-postgres` mostra CPU travada em 100% por minutos.

## Diagnóstico rápido (5 min)

```bash
# 1. SSH
ssh -i ~/.ssh/ktask-deploy root@178.104.220.28

# 2. Postgres está respondendo?
docker exec ktask-postgres pg_isready -U ktask
# "accepting connections" = ok, é saturação. "no response" = caiu, runbook 01 caso C.

# 3. Conexões em uso vs limite
docker exec ktask-postgres psql -U ktask -d ktask -c "
  SELECT count(*) AS total,
         count(*) FILTER (WHERE state='active') AS active,
         count(*) FILTER (WHERE state='idle') AS idle,
         count(*) FILTER (WHERE state='idle in transaction') AS idle_in_tx
    FROM pg_stat_activity
   WHERE datname='ktask';"

# Limite default do postgres:16-alpine é 100. Se total >= 95: saturado.
# idle_in_tx > 5 é red flag (Prisma deixando conexão presa).

# 4. Queries longas (>30s)
docker exec ktask-postgres psql -U ktask -d ktask -c "
  SELECT pid, now()-query_start AS duration, state, left(query, 120) AS query
    FROM pg_stat_activity
   WHERE datname='ktask' AND state<>'idle'
     AND now()-query_start > interval '30 seconds'
   ORDER BY duration DESC LIMIT 20;"

# 5. Disco do volume pgdata (Postgres trava se /var encheu)
df -h /var/lib/docker
docker system df -v | grep pgdata
```

## Resolução

### Caso A: muitas conexões "idle in transaction"

Causa típica: API teve exception que não fechou a transação, ou pool do Prisma com leak.

```bash
# 1. Identifica os PIDs
docker exec ktask-postgres psql -U ktask -d ktask -c "
  SELECT pid, application_name, state, now()-state_change AS idle_time, left(query, 80) AS last_query
    FROM pg_stat_activity
   WHERE datname='ktask' AND state='idle in transaction'
   ORDER BY state_change LIMIT 20;"

# 2. Mata conexões idle in tx com mais de 5 min
# CUIDADO: destrutivo (aborta a transação cliente). Em produção é ok porque o
# cliente que segurava a tx ja desistiu — a conexão é fantasma.
docker exec ktask-postgres psql -U ktask -d ktask -c "
  SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
   WHERE datname='ktask'
     AND state='idle in transaction'
     AND now()-state_change > interval '5 minutes';"

# 3. Confere alivio
docker exec ktask-postgres psql -U ktask -d ktask -c "SELECT count(*) FROM pg_stat_activity WHERE datname='ktask';"
```

Verificação: `/readyz` volta a 200; logs do api param de mostrar `too many connections`.

### Caso B: query longa segurando recursos

Causa típica: query sem índice rodando em tabela grande, ou seed/backfill ad-hoc rodando em prod.

```bash
# 1. Lista as queries mais longas (já visto no diagnóstico passo 4)

# 2. Avaliar: é query do app (vinda do ktask-api) ou alguém rodando manual?
# application_name=ktask-api -> app. Outro -> alguém com psql aberto.

# 3. Se for legítima e crítica: deixar terminar.
#    Se for backfill/relatório que pode ser refeito depois:
# CUIDADO: destrutivo (interrompe a query, transação reverte)
docker exec ktask-postgres psql -U ktask -d ktask -c "SELECT pg_cancel_backend(<PID>);"
# Se pg_cancel não funcionar em 30s, usar pg_terminate_backend(<PID>) — mais agressivo.
```

### Caso C: saturação por volume real de requests

Causa: pico de uso legítimo + pool default do Prisma (`connection_limit` não setado = ~num_cpu \* 2 + 1).

```bash
# 1. Vê quantas conexões cada client está usando
docker exec ktask-postgres psql -U ktask -d ktask -c "
  SELECT application_name, count(*) FROM pg_stat_activity
   WHERE datname='ktask' GROUP BY application_name ORDER BY count DESC;"

# 2. Mitigação imediata: aumentar max_connections do Postgres.
#    NÃO mudar via ALTER SYSTEM em prod sem alinhar — requer restart.
#    Mitigação real: reduzir pool do Prisma se está alto, OU restart da api
#    pra cortar conexões antigas:
docker compose -f /opt/ktask/infra/docker-compose.prod.yml --env-file /opt/ktask/infra/prod.env restart api

# 3. Após restart, monitorar:
watch -n 2 "docker exec ktask-postgres psql -U ktask -d ktask -tAc \"SELECT count(*) FROM pg_stat_activity WHERE datname='ktask'\""
```

### Caso D: disco do volume cheio

Postgres trava quando `pgdata` enche. Sintoma: writes falham, logs com `could not extend file`.

```bash
df -h /var/lib/docker
# Se > 90%: ver o que está enchendo
du -sh /opt/ktask/backups /var/lib/docker/volumes/* 2>/dev/null | sort -h | tail

# Mitigação rápida: apagar backups antigos manualmente (script já guarda só 3,
# mas se acumulou por bug, limpar):
ls -lh /opt/ktask/backups/
# CUIDADO: destrutivo (apaga backup velho)
# Apagar manualmente os mais antigos, mantendo os 3 últimos:
ls -1t /opt/ktask/backups/postgres-*.sql.gz | tail -n +4 | xargs -r rm -v
ls -1t /opt/ktask/backups/minio-*.tar.gz | tail -n +4 | xargs -r rm -v

# Imagens docker antigas (deploy.yml já faz prune, mas vale rodar)
docker image prune -af
```

### Último recurso: restart do Postgres

```bash
# CUIDADO: destrutivo (derruba conexões abertas, ~30s de indisponibilidade,
# api faz crash-restart por dependência). Postmortem obrigatório.
docker compose -f /opt/ktask/infra/docker-compose.prod.yml --env-file /opt/ktask/infra/prod.env restart postgres
# Acompanhar logs até "database system is ready to accept connections"
docker logs ktask-postgres --tail 30 -f
```

Após Postgres voltar, a API reconecta sozinha (Prisma reabre o pool). Se `/readyz` continuar 503 após 1 min, restart da api também.

### Se nada funcionar

- Escalar pro Nicchon — pode ser bug de pool no Prisma que precisa fix de código.
- Considerar rollback se a saturação começou logo após um deploy (runbook 05).

## Pós-incidente

- [ ] Postmortem em `docs/postmortems/`.
- [ ] Coletar a query culpada (se Caso B) e abrir issue pra otimização/índice.
- [ ] Se padrão recorrer: avaliar conectar Prisma com `connection_limit` explícito no `DATABASE_URL`, ou subir `max_connections` do Postgres no compose (`command: -c max_connections=200`).
- [ ] Conferir se backup recente está válido (caso precise restore): `ls -lh /opt/ktask/backups/`.

## Links úteis

- Compose: `/opt/ktask/infra/docker-compose.prod.yml`
- Script de backup: [scripts/ops/backup.sh](../../scripts/ops/backup.sh)
- Comandos Postgres úteis: `\du` (lista roles), `\l+` (lista bancos com tamanho), `\dt+ <schema>.*` (tamanho de tabelas).
