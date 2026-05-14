# Runbooks de incidentes — KTask

Passo-a-passo executável às 3h da manhã. Assume Linux/Docker básico e acesso SSH na VM de prod. Não assume conhecimento profundo do código.

## Onde estamos

- Prod: Hetzner CX23, `178.104.220.28`. 6 containers em Docker Compose (ver `infra/docker-compose.prod.yml`).
- Domínios: `ktask.agenciakharis.com.br` (Web), `api.ktask.agenciakharis.com.br` (API + WS), `cdn.ktask.agenciakharis.com.br` (MinIO).
- Acesso: `ssh -i ~/.ssh/ktask-deploy root@178.104.220.28` (interativo, root) ou `ssh -i ~/.ssh/ktask-ci deploy@178.104.220.28` (sem sudo, só `/opt/ktask`).

## Severidade

| Nível | Definição                                                   | Resposta esperada                                        |
| ----- | ----------------------------------------------------------- | -------------------------------------------------------- |
| P0    | Usuário sem serviço (login, API, ou Web inacessíveis)       | Imediata. Plantonista age agora. Postmortem obrigatório. |
| P1    | Impacto parcial (1 fluxo importante quebrado, ex: WhatsApp) | Em até 1h. Postmortem obrigatório.                       |
| P2    | Degradado mas contornável (lento, erro intermitente)        | Em até 4h em horário comercial.                          |
| P3    | Sem impacto imediato (alerta preventivo, backup falhou)     | Próximo dia útil.                                        |

## Tabela de runbooks

| #   | Cenário                                          | Severidade típica | Tempo médio |
| --- | ------------------------------------------------ | ----------------- | ----------- |
| 01  | API fora do ar (502/503, container caído)        | P0                | ~10 min     |
| 02  | Postgres com conexões saturadas / lento          | P0–P1             | ~15 min     |
| 03  | Cron/scheduler parou (notificações + automações) | P1                | ~10 min     |
| 04  | Evolution API fora (WhatsApp não envia)          | P1                | ~15 min     |
| 05  | Deploy falhou / rollback                         | P0–P1             | ~10 min     |

## Quando abrir postmortem

Sempre que rodar um P0 ou P1. Arquivo em `docs/postmortems/AAAA-MM-DD-titulo.md`. Estrutura mínima: o que aconteceu, impacto (quem foi afetado e por quanto tempo), causa raiz, o que funcionou, o que falhou, ação corretiva (issue aberta).

## Quem está de plantão

Hoje: **Nicchon** (WhatsApp +55 31 99376-7301). Futuro: rotação a definir.

## Disco cheio (transversal, vale pra qualquer runbook)

Antes de mexer em qualquer container, em qualquer incidente, vale conferir disco:

```bash
df -h /                       # uso geral
df -h /var/lib/docker         # onde Docker mora
docker system df              # imagens/volumes/cache do Docker
du -sh /opt/ktask/backups     # backups locais (RETAIN=3, mas vale conferir)
```

Se `/` estiver acima de 85%: rodar `docker image prune -af` (limpa imagens não usadas; o `deploy.yml` já faz isso, mas vale repetir). Se ainda apertado: olhar `/opt/ktask/backups` — se acumulou mais que 3 de cada tipo, o script de backup pode ter falhado.

## Convenções

- Comandos com `# CUIDADO: destrutivo` exigem confirmação antes de rodar (em P0, ainda assim confirmar).
- Senhas nunca aparecem no runbook. Estão em `/opt/ktask/infra/prod.env` (chmod 600, dono root). Se precisar consultar: `sudo cat /opt/ktask/infra/prod.env | grep <CHAVE>`.
- Container names usam o prefixo `ktask-` (ex: `ktask-api`, `ktask-postgres`). O nome do _service_ no compose é mais curto (ex: `api`, `postgres`) e só funciona via `docker compose exec <service>`.

## Como criar novo runbook

1. Copiar `_TEMPLATE.md` pra `NN-titulo-curto.md`.
2. Preencher seções (severidade, sintomas, diagnóstico, resolução).
3. Adicionar linha na tabela acima.
4. Commit numa branch separada + PR (pra revisão por outro humano antes de virar fonte de verdade).

## Comandos universais úteis

```bash
# Logs ao vivo
docker logs ktask-api --tail 200 -f
docker logs ktask-web --tail 200 -f
docker logs ktask-caddy --tail 200 -f
docker logs ktask-postgres --tail 100 -f
docker logs ktask-redis --tail 100 -f
docker logs ktask-minio --tail 100 -f

# Status + recursos
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.RestartCount}}'
docker stats --no-stream

# Reiniciar um serviço (não-destrutivo, mantém volumes)
docker compose -f /opt/ktask/infra/docker-compose.prod.yml --env-file /opt/ktask/infra/prod.env restart api

# Smoke test externo (do notebook, sem SSH)
curl -sS -o /dev/null -w 'web=%{http_code} api=%{http_code}\n' \
  https://ktask.agenciakharis.com.br/ \
  https://api.ktask.agenciakharis.com.br/healthz
```
