# Runbook 05 — Deploy falhou / como fazer rollback

- **Severidade**: P0 se prod está fora; P1 se prod está de pé mas com bug do novo deploy.
- **Tempo médio de resolução**: ~10 min
- **Última atualização**: 2026-05-13
- **Quem pode executar**: dev com acesso ao GitHub (workflow_dispatch) **ou** SSH na VM. Rollback de release exige confirmação do Nicchon.

## Como o deploy funciona hoje

Fluxo real em [.github/workflows/deploy.yml](../../.github/workflows/deploy.yml) (a doc [tarefas-md/10-deploy-producao.md](../../tarefas-md/10-deploy-producao.md) descreve um fluxo antigo de "git pull + build na VM" — **está desatualizada**, ignorar):

1. Push em `main` dispara workflow `Deploy`.
2. Job `wait-ci`: espera o CI passar.
3. Job `build`: builda e publica `ghcr.io/kharis-edu/ktask-api:<sha>` + `:latest` e `ghcr.io/kharis-edu/ktask-web:<sha>` + `:latest`.
4. Job `deploy`:
   - `scp` do `docker-compose.prod.yml` + `Caddyfile` pra `/opt/ktask/infra/`.
   - SSH como `deploy@178.104.220.28`, faz `docker login ghcr.io` com token efêmero, `compose pull api web`, `compose up -d --remove-orphans`.
   - Espera até 5 min por `ktask-api` + `ktask-web` virarem `healthy`.
   - Smoke test externo: `curl` em `/healthz` da API e `/` do Web esperando `200`.

Rollback é trivial **porque GHCR mantém todas as imagens** taggadas com SHA. Mudar de versão = mudar `IMAGE_TAG` + `compose up -d`.

## Sintomas

- Workflow `Deploy` vermelho no GitHub (qualquer job, mas o `deploy` é o mais comum).
- Workflow verde mas usuário reclamando que algo quebrou — bug do novo deploy.
- `docker ps` mostra `ktask-api` ou `ktask-web` em `Restarting` depois do deploy.
- Smoke test final do workflow falhou (`api=500` ou `web=500`).

## Diagnóstico rápido (5 min)

```bash
# 1. Vê o último workflow Deploy
gh run list --workflow=deploy.yml --limit 5
# Identifica o RUN_ID do que está vermelho.

# 2. Logs do job que falhou
gh run view <RUN_ID> --log-failed | tail -150
# O job `deploy` tem trap que dumpa logs dos containers em falha — procurar
# por "DEPLOY FALHOU" no output.

# 3. Estado real na VM (importante: deploy pode ter falhado MAS containers
#    antigos ainda estão rodando)
ssh -i ~/.ssh/ktask-deploy root@178.104.220.28 \
  "docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' | grep ktask-"
# Olhar a coluna Image: o tag depois dos ":" mostra qual SHA está rodando.

# 4. Confere qual SHA é o esperado
cd /opt/ktask 2>/dev/null || ssh -i ~/.ssh/ktask-deploy root@178.104.220.28 'cat /opt/ktask/infra/prod.env | grep IMAGE_TAG'
# Compara com a coluna Image do passo 3.
```

## Resolução

### Caso A: workflow falhou, prod **continua de pé** com versão anterior

Causa típica: build falhou, ou healthcheck do novo timeout. Compose só troca o container quando o novo está healthy — então prod segue na versão antiga, intacta.

```bash
# 1. Lê o erro
gh run view <RUN_ID> --log-failed | tail -100

# 2. Causas comuns:
#   - "exec format error" / build falhou no GHA -> bug no Dockerfile ou código.
#   - "timeout aguardando healthcheck" -> nova imagem não fica healthy
#     (migration travada, env mal-setada, crash no boot). Olhar logs dumpados no output.
#   - "Smoke test HTTPS" falhou -> healthz interno passa mas externo não.
#     Provavelmente Caddy não recarregou config (raro).

# 3. Fix: corrigir no código + novo commit + push -> dispara deploy de novo.
#    Prod ficou no antigo, sem incidente real.

# Se urgente liberar o pipeline (ex: tem outro PR esperando):
# CUIDADO: destrutivo (cancela o run vermelho)
gh run cancel <RUN_ID>
```

Verificação: `curl -sS https://api.ktask.agenciakharis.com.br/healthz` ainda 200 com versão antiga. Prod intacta.

### Caso B: workflow passou, mas prod tem bug do novo deploy

Cenário clássico de rollback: novo SHA subiu e responde 200, mas tem regressão de comportamento.

**Opção 1: rollback via workflow_dispatch (preferido, é git-rastreado)**

```bash
# 1. Acha o SHA anterior (último deploy bom)
gh run list --workflow=deploy.yml --status=success --limit 5
# Olhar o "ID" + "headSHA" do último que foi bom.

# 2. Dispara deploy com o SHA antigo
gh workflow run deploy.yml --ref main -f image_tag=<SHA_ANTERIOR>
# A imagem GHCR pra esse SHA já existe (nunca foi apagada), então o build é rápido
# (cache hit) e o deploy roda o "pull + up -d" com o tag antigo.

# 3. Acompanha
gh run watch
```

Verificação: smoke test externo passa + comportamento do bug sumiu.

**Opção 2: rollback emergencial direto na VM (mais rápido, mas não git-rastreado)**

Usar quando opção 1 não está disponível (GitHub fora, GHA com problema, etc).

```bash
ssh -i ~/.ssh/ktask-deploy root@178.104.220.28

# 1. Lista as imagens locais (deploy.yml faz prune, então só as em uso ficam,
#    mas o tag :latest e o tag SHA atual estão sempre presentes; pra rollback
#    pra SHA antigo precisa pull)
docker images ghcr.io/kharis-edu/ktask-api --format 'table {{.Tag}}\t{{.CreatedAt}}'

# 2. Pull do SHA antigo (precisa estar logado no GHCR)
# Pegar token de personal access em ~/.gh-token (ou pedir pro Nicchon)
docker login ghcr.io -u <user-gh> --password-stdin < ~/.gh-token
docker pull ghcr.io/kharis-edu/ktask-api:<SHA_ANTERIOR>
docker pull ghcr.io/kharis-edu/ktask-web:<SHA_ANTERIOR>

# 3. Editar IMAGE_TAG no prod.env
nano /opt/ktask/infra/prod.env
# Trocar IMAGE_TAG=latest (ou SHA atual) por IMAGE_TAG=<SHA_ANTERIOR>

# 4. Up
docker compose -f /opt/ktask/infra/docker-compose.prod.yml --env-file /opt/ktask/infra/prod.env up -d
# Compose detecta a tag mudou, recria api+web com a imagem antiga.

# 5. Acompanhar healthcheck
watch -n 2 "docker ps --format 'table {{.Names}}\t{{.Status}}' | grep ktask-"
```

**Importante** após emergencial: depois que a poeira baixa, fazer rollback git (`git revert <commit-ruim>` + `git push origin main`) pra dispararar deploy "oficial" com o estado correto. Caso contrário, próximo push em `main` re-aplica o código com bug.

### Caso C: workflow passou, containers no `Restarting`

Causa: imagem nova subiu, healthcheck inicial passou, mas o api entra em crash loop depois (ex: bug que só dispara em cron de minuto que ainda não tinha rodado).

```bash
# 1. Logs recentes
docker logs ktask-api --tail 200

# 2. Se confirmado crash: rollback (Caso B opção 1 ou 2)
```

### Caso D: workflow `deploy` para no passo "Aguarda CI passar" por 30 min

Causa: CI travou ou está demorando. Job tem `timeout-minutes: 30`.

```bash
# 1. Olhar o CI
gh run list --workflow=ci.yml --limit 3
gh run view <CI_RUN_ID>

# 2. Se CI passou DEPOIS do deploy desistir: re-disparar deploy
gh workflow run deploy.yml --ref main
```

### Se nada funcionar

- Escalar pro Nicchon (WhatsApp +55 31 99376-7301) **antes** de tentar restore de backup. Restore é caminho de mão única e exige autorização explícita.
- Restore de banco (último recurso, **destrutivo**): ver `scripts/ops/backup.sh` — comando de restore documentado no comentário do topo.

## Pós-incidente

- [ ] Postmortem em `docs/postmortems/AAAA-MM-DD-rollback.md` se Caso B ou C (regressão chegou em prod).
- [ ] Confirmar `IMAGE_TAG` no prod.env está alinhado com `main` depois que a poeira baixar (não deixar prod num SHA "fantasma" diferente do que está em `main`).
- [ ] Se foi Caso A recorrente: revisar Dockerfile / healthcheck (talvez `start_period` precise ser maior).
- [ ] Se bug passou pelo CI: revisar cobertura de testes / abrir issue.

## Comandos úteis

```bash
# Lista as últimas runs do Deploy
gh run list --workflow=deploy.yml --limit 10

# Lista as imagens disponíveis no GHCR (do notebook, com gh logado)
gh api '/users/kharis-edu/packages/container/ktask-api/versions' --jq '.[].metadata.container.tags'

# Lista imagens locais na VM
ssh -i ~/.ssh/ktask-deploy root@178.104.220.28 \
  "docker images ghcr.io/kharis-edu/ktask-api --format 'table {{.Tag}}\t{{.CreatedAt}}\t{{.Size}}'"

# Dispara deploy manual com SHA específico
gh workflow run deploy.yml --ref main -f image_tag=<SHA>

# Reverter um commit em main (rollback git, dispara deploy novo)
git revert <SHA_RUIM>
git push origin main
```

## Links úteis

- Workflow: [.github/workflows/deploy.yml](../../.github/workflows/deploy.yml)
- Compose: [infra/docker-compose.prod.yml](../../infra/docker-compose.prod.yml)
- Doc deploy (parcialmente desatualizada): [tarefas-md/10-deploy-producao.md](../../tarefas-md/10-deploy-producao.md)
