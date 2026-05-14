# Runbook 01 — API fora do ar

- **Severidade**: P0 (login e tudo que depende de API param)
- **Tempo médio de resolução**: ~10 min
- **Última atualização**: 2026-05-13
- **Quem pode executar**: qualquer dev com acesso SSH à VM

## Sintomas

- `https://api.ktask.agenciakharis.com.br/healthz` retorna 502/503 ou timeout.
- Web carrega (HTML aparece) mas qualquer ação dá erro (login falha, board não lista, etc).
- Reclamações de usuários: "tudo travou", "não consigo entrar".

## Diagnóstico rápido (5 min)

```bash
# 1. Smoke test externo (do notebook)
curl -sS -o /dev/null -w 'api=%{http_code} web=%{http_code}\n' \
  https://api.ktask.agenciakharis.com.br/healthz \
  https://ktask.agenciakharis.com.br/
# Esperado: api=200 web=200.
# api=502/503 + web=200 -> API caída, Caddy ok. Continua o runbook.
# api=502 + web=502 -> Caddy não consegue alcançar nem web nem api: ver Caso D.

# 2. SSH
ssh -i ~/.ssh/ktask-deploy root@178.104.220.28

# 3. Status dos containers
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.RestartCount}}' --filter 'name=ktask-'
# Esperado: 6 containers Up. Sinais de problema:
#   - ktask-api Restarting        -> Caso A (crash loop)
#   - ktask-api Exited            -> Caso A (parou de subir)
#   - ktask-api Up + unhealthy    -> Caso B (subiu mas não responde)
#   - ktask-postgres Exited/down  -> Caso C (depends_on: API não sobe)

# 4. Últimas linhas do api
docker logs ktask-api --tail 100
# Procurar: stack trace na boot, "PrismaClientInitializationError",
# "ECONNREFUSED", "EADDRINUSE", "out of memory", "migration failed".
```

## Resolução

### Caso A: container em restart loop ou Exited

Causa típica: erro no boot (env mal setada, migration que quebrou, código com bug fatal).

```bash
# 1. Ver o erro no boot
docker logs ktask-api --tail 200 | grep -iE 'error|fatal|crash|migration' | tail -40

# 2. Se for migration travada/falhada (ex: "P3009 migrate found failed migration"):
docker exec ktask-api sh -c "npx prisma migrate status"
# Identifica qual migration. NÃO rodar "migrate resolve --rolled-back" sem alinhar
# com Nicchon — pode mascarar problema. Pra unblock rápido: rollback de deploy
# (ver runbook 05).

# 3. Se for OOM (logs mostram "JavaScript heap out of memory" ou container Killed):
docker stats --no-stream ktask-api
# Memória estourou. Pode ser pico legítimo (muitos cards num org) ou leak.
# Mitigação imediata: restart simples.
docker compose -f /opt/ktask/infra/docker-compose.prod.yml --env-file /opt/ktask/infra/prod.env restart api

# 4. Se for crash genérico sem causa óbvia:
docker compose -f /opt/ktask/infra/docker-compose.prod.yml --env-file /opt/ktask/infra/prod.env up -d api
# (up -d ao invés de restart recria com env recarregada)
```

Verificação: `curl -sS https://api.ktask.agenciakharis.com.br/healthz` retorna `{"status":"ok",...}`.

Se voltou a fazer crash loop em ~30s do restart: passar pro **Caso B** ou rollback (runbook 05).

### Caso B: container Up mas unhealthy / não responde

Causa típica: API subiu mas não consegue falar com Postgres, ou migration travada (rodou minutos sem terminar), ou bug que faz `/healthz` cair.

```bash
# 1. Confirma healthcheck interno
docker inspect -f '{{.State.Health.Status}}' ktask-api
# unhealthy = healthcheck (wget /healthz) está falhando.

# 2. Testa healthz direto de dentro do container
docker exec ktask-api wget -q -O- http://127.0.0.1:4000/healthz
# Vazio/erro = processo Node não está respondendo. Vai pro 4.
# JSON com status:ok = healthz responde MAS o healthcheck do compose
# está demorando. Improvável; provavelmente rede docker.

# 3. Testa readyz (que toca o banco)
docker exec ktask-api wget -q -O- http://127.0.0.1:4000/readyz
# 503 com checks.db=error = não consegue falar com Postgres. Vai pro Caso C.

# 4. Se /healthz não responde nem de dentro: processo Node travado
docker exec ktask-api ps -ef | head -20
# Vê se Node está rodando. Se sim, está travado em algo.
# CUIDADO: destrutivo (mata e recria o container)
docker compose -f /opt/ktask/infra/docker-compose.prod.yml --env-file /opt/ktask/infra/prod.env restart api
```

Verificação: `docker inspect -f '{{.State.Health.Status}}' ktask-api` vira `healthy` em até 1 min.

### Caso C: Postgres inacessível

API depende de Postgres healthy pra subir (`depends_on: postgres: condition: service_healthy`).

```bash
# 1. Status do Postgres
docker ps -a --filter 'name=ktask-postgres'
docker logs ktask-postgres --tail 80

# 2. Healthcheck interno
docker exec ktask-postgres pg_isready -U ktask
# "accepting connections" = ok. "no response" = caído.

# 3. Se caído: tentar restart
docker compose -f /opt/ktask/infra/docker-compose.prod.yml --env-file /opt/ktask/infra/prod.env restart postgres

# 4. Se Postgres está OK mas API ainda não fala com ele: ver runbook 02
# (provavelmente saturação de conexões, não "fora do ar").
```

Após Postgres voltar, API sobe sozinha (compose vai retentando).

### Caso D: api=502 E web=502 ao mesmo tempo

Caddy não está conseguindo alcançar nada. Provavelmente Caddy caiu ou rede docker.

```bash
docker ps --filter 'name=ktask-caddy'
docker logs ktask-caddy --tail 80

# Se Caddy está Up mas erra 502: rede docker pode estar quebrada
docker network inspect ktask-prod_ktask | grep -A2 Containers
# Esperado: ver os 6 containers listados.

# Reinício simples
docker compose -f /opt/ktask/infra/docker-compose.prod.yml --env-file /opt/ktask/infra/prod.env restart caddy
```

### Se nada funcionar

- Considerar **rollback** pro último SHA conhecido bom: runbook 05.
- Escalar pro Nicchon (WhatsApp +55 31 99376-7301).
- Se tempo de queda passou de 15 min: comunicar usuários no canal interno Kharis.

## Pós-incidente

- [ ] Postmortem em `docs/postmortems/AAAA-MM-DD-api-fora.md`.
- [ ] Se foi OOM: abrir issue pra investigar leak ou aumentar limite (compose hoje não tem `mem_limit`).
- [ ] Se foi migration: revisar processo de migration (testar em staging quando existir).
- [ ] Atualizar este runbook com novas hipóteses.

## Links úteis

- Compose: `/opt/ktask/infra/docker-compose.prod.yml`
- Endpoints health: [apps/api/src/modules/health/health.controller.ts](../../apps/api/src/modules/health/health.controller.ts)
- Dockerfile da API: [apps/api/Dockerfile](../../apps/api/Dockerfile) (CMD roda `prisma migrate deploy` antes do `node dist/main.js`)
- Rollback: `05-deploy-falhou-rollback.md`
