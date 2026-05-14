# Runbook NN — Título do incidente

- **Severidade**: P0 (crítico, usuário sem serviço) | P1 (impacto parcial) | P2 (degradado, contornável) | P3 (sem impacto imediato)
- **Tempo médio de resolução**: ~Xmin (estimativa, ajustar após uso real)
- **Última atualização**: AAAA-MM-DD
- **Quem pode executar**: qualquer dev | apenas com acesso ops | exige autorização do Nicchon

## Sintomas

O que o usuário vê / o que o monitoramento alerta. Sintomas observáveis sem entrar no servidor.

- Sintoma 1
- Sintoma 2

## Diagnóstico rápido (5 min)

Comandos em ordem; abaixo de cada um, o que o output significa.

```bash
# 1. Confere se o domínio responde
curl -sS -o /dev/null -w '%{http_code}\n' --max-time 10 https://api.ktask.agenciakharis.com.br/healthz
# Esperado: 200. 502/503 = API caída. 522/timeout = problema de rede/Caddy.

# 2. SSH na VM (chave pessoal, root)
ssh -i ~/.ssh/ktask-deploy root@178.104.220.28

# 3. Status dos containers
docker ps --format 'table {{.Names}}\t{{.Status}}'
# Esperado: 6 containers Up (ktask-postgres, ktask-redis, ktask-minio, ktask-api, ktask-web, ktask-caddy).
# Restarting/Exited em algum = ponto de partida do diagnóstico.
```

## Resolução

### Caso A: hipótese mais provável

1. Passo 1: comando + output esperado.
2. Passo 2.
3. Verificação: como saber que voltou ao normal (curl, log limpo, etc).

### Caso B: próxima hipótese

1. Passo 1.
2. Passo 2.

### Se nada funcionar

- Escalar pro Nicchon (WhatsApp +55 31 99376-7301).
- Considerar rollback (ver `05-deploy-falhou-rollback.md`).
- Se P0, comunicar usuários (canal interno Kharis).

## Pós-incidente

- [ ] Registrar postmortem em `docs/postmortems/` se P0/P1.
- [ ] Abrir issue se a correção foi tática (gambiarra) e precisa fix definitivo.
- [ ] Atualizar este runbook com novas hipóteses descobertas.

## Links úteis

- Logs do api: `docker logs ktask-api --tail 200 -f`
- Compose: `/opt/ktask/infra/docker-compose.prod.yml`
- Env de prod: `/opt/ktask/infra/prod.env` (chmod 600, root-only)
