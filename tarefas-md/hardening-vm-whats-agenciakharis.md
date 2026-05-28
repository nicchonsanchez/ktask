# Hardening da VM `whats.agenciakharis.com.br`

**Data**: 2026-05-18 (sessão Claude + Nicchon)
**VM**: Hetzner Cloud `46.224.4.17`, hostname `portainer-ubuntu-4gb-fsn1-2`, Falkenstein DE
**Especs**: 4GB RAM (CX22 prov.), Ubuntu 24.04.3 LTS, 75GB SSD
**Uptime atual**: 198 dias sem reboot

## Escopo

Auditoria de segurança e endurecimento da VM compartilhada que hospeda Evolution API, Baserow, n8n, Portainer, Traefik, Postgres, Redis (Docker Swarm). Inclui:

- Fechar superfície de ataque exposta (portas, sshd, brute force)
- Rotacionar credenciais fracas (master key Evolution 12 chars)
- Cleanup de leftovers (Chatwoot orfão, get-docker.sh)
- Plano de capacidade (RAM em 91%, sem swap)
- Documentação do estado atual pra runbooks futuros

**Fora de escopo:**

- Migrar serviços pra outras VMs
- Refactor arquitetural do que está rodando
- Trocar Postgres compartilhado por bancos isolados (avaliação futura)

## Inventário do que roda na VM

| Stack         | Container                                 | Imagem                                                    | Banco                     | Volume                           |
| ------------- | ----------------------------------------- | --------------------------------------------------------- | ------------------------- | -------------------------------- |
| Evolution     | `evolution_api_2`                         | `evoapicloud/evolution-api:v2.3.2`                        | `evolution_api_2` (128MB) | `eapi2_instances`, `eapi2_store` |
| Baserow       | `baserow`                                 | `baserow/baserow:1.33.4`                                  | `baserow` (23MB)          | `baserow_data`                   |
| n8n           | `n8n_worker`, `n8n_webhook`, `n8n_editor` | `n8nio/n8n:latest`                                        | `n8n_fila` (10MB)         | —                                |
| Postgres      | `postgres`                                | `postgres:16.4`                                           | (host de todas acima)     | `postgres_data`                  |
| Redis         | `redis`                                   | `redis:latest`                                            | —                         | `redis_data`                     |
| Portainer     | `portainer`, `portainer_agent`            | `portainer/portainer-ce:2.33.0`, `portainer/agent:2.33.0` | —                         | `portainer_data`                 |
| Reverse proxy | `traefik`                                 | `traefik:v2.11`                                           | —                         | `certificados`                   |
| **ÓRFÃO**     | — (sem container)                         | —                                                         | `chatwoot` (7.5MB)        | `chatwoot_data` (vazio)          |
| **SUSPEITO**  | —                                         | —                                                         | `ev2docker` (7.4MB)       | —                                |

Networks overlay: `agent_network`, `digital_network`, `kharis_network`, `traefik_public` (+ `ingress`).

Tudo orquestrado por Docker Swarm + Portainer.

## Achados de segurança

### P0 — Ação imediata recomendada

**P0.1. Brute force ativo sem mitigação**

- **Sintoma**: 6+ IPs tentando login root/user/dev/mc/grid em sequência últimas 24h (`lastb`, `journalctl -u ssh`)
- **Risco real**: baixo no momento — `PermitRootLogin without-password` rejeita root via senha. Mas custa CPU/RAM e logs.
- **Risco crescente**: se algum dia for criado usuário com senha fraca, brute force pega.
- **Mitigação**: instalar `fail2ban` com jail SSH (ban automático após 5 falhas em 10min).
- **IPs atualmente atacando** (snapshot 2026-05-18 17:00-17:07 UTC):
  - `178.105.125.134` — brute force root (5+ tentativas)
  - `193.32.162.13` — brute force `user` (6+ tentativas)
  - `157.254.192.75` — brute force `dev`, `rancher` (3+ tentativas)
  - `186.96.145.241`, `86.102.113.210`, `193.32.162.35` — diversos

**P0.2. Porta 2377 (Docker Swarm management) exposta publicamente**

- **Sintoma**: `ss -tlnp` mostra `LISTEN *:2377` (dockerd)
- **Risco**: porta de controle do Swarm cluster. Atacante pode tentar comandar via API mTLS (auth necessária, mas é vetor adicional).
- **Mitigação**: firewall Hetzner Cloud (no painel) bloqueando 2377, 7946, 4789 vindos da internet. Manter aberto só 22 (ssh), 80, 443 (Traefik).

**P0.3. Master key da Evolution: 12 caracteres**

- **Sintoma**: `AUTHENTICATION_API_KEY` no env do container `evolution_api_2` tem 12 chars
- **Risco**: força bruta da chave em horas/dias. Acesso total ao WhatsApp da empresa.
- **Mitigação**: rotação pra chave de 64 chars random. Coordenar com KTask (`EVOLUTION_DEFAULT_API_KEY` no `prod.env`) e qualquer outro consumidor (n8n, painel admin novo).
- **Bloqueado por**: usuário ainda precisa cadastrar master key atual no painel admin novo antes de rodarmos rotação.

### P1 — Esta semana

**P1.1. `PasswordAuthentication yes` no sshd**

- **Sintoma**: `sshd -T | grep password` → `passwordauthentication yes`
- **Risco efetivo**: baixo (não tem usuário não-root com shell), mas é defesa em profundidade.
- **Mitigação**: setar `PasswordAuthentication no` em `/etc/ssh/sshd_config.d/50-hardening.conf` + reload sshd.

**P1.2. ufw / firewall de host inativo**

- **Sintoma**: `ufw status` → inactive. `iptables INPUT policy: ACCEPT`, zero regras.
- **Risco**: se Docker resolver expor algo, fica público sem filtro. Defense in depth ausente.
- **Mitigação**: configurar `ufw` permitindo só 22, 80, 443 no host. OU usar Firewall do Hetzner Cloud (mais limpo, sem mexer no iptables que Docker mexe).
- **Recomendação**: Hetzner Firewall (gerenciado externamente, não interfere com iptables do Docker).

**P1.3. Pubkey legacy ssh-dss sendo testada**

- **Sintoma**: várias tentativas `userauth_pubkey: signature algorithm ssh-dss not in PubkeyAcceptedAlgorithms` no journalctl
- **Origem**: bot ou cliente legacy. Sshd já rejeita corretamente (DSA é desabilitado por padrão no OpenSSH moderno).
- **Ação**: nenhuma — já mitigado. Anotar pra contexto.

**P1.4. Postgres compartilhado entre 6 bancos com senha única**

- **Sintoma**: container `postgres` único hospeda `evolution_api_2`, `baserow`, `n8n_fila`, `chatwoot`, `ev2docker`, `postgres`. Senha de superuser `postgres` é a mesma.
- **Risco**: comprometer credencial dá acesso a tudo, blast radius enorme.
- **Mitigação parcial**: criar usuário por aplicação com permissão só ao seu banco (`evolution_user`, `baserow_user`, `n8n_user`). Cada app usa DSN próprio. Senha de `postgres` superuser fica só pra admin.
- **Custo**: requer mudança nos `.env` dos stacks. Mais trabalho — agendar como P1 baixo.

**P1.5. Sem backup automatizado dos volumes / Postgres**

- **Sintoma**: `crontab -l` vazio. Nenhum job de `pg_dump` ou snapshot rotativo.
- **Risco**: perda de dados em incidente. Hetzner snapshots manuais são única coisa.
- **Mitigação**: cron diário `pg_dumpall` → `/var/backups/postgres-YYYY-MM-DD.sql.gz` (rotação 7 dias). Snapshot Hetzner semanal (script via API).

### P2 — Próxima janela de manutenção

**P2.1. 198 dias sem reboot + 64 pacotes pendentes**

- **Sintoma**: `uptime` 198 dias, MOTD diz "System restart required", `apt list --upgradable | wc -l` = 64
- **Detalhe**: dos 64, **0 são security updates** (verificado). São features e libs. Menos urgente do que parecia.
- **Ação**: `apt upgrade` durante janela + reboot. ~30s downtime de tudo na VM. Pode agendar pra madrugada.

**P2.2. RAM em 91% sem swap**

- **Sintoma**: 3.4Gi/3.7Gi usado. 0B swap configurado. Já houve 2 OOM kills nos logs do boot.
- **Risco**: instabilidade aleatória — Linux mata processo "errado" quando memória estoura.
- **Mitigação A** (rápida): criar arquivo swap de 4GB (`/swapfile`). Reversível.
- **Mitigação B** (estrutural): upgrade da VM Hetzner pra CX32 (8GB RAM, ~€2-3 a mais por mês).
- **Recomendação**: A agora + avaliar B depois de outras otimizações.

**P2.3. Chatwoot órfão**

- **Sintoma**: volume `chatwoot_data` vazio + database `chatwoot` no postgres (7.5MB), zero containers Chatwoot rodando.
- **Origem**: stack desligada em algum momento sem cleanup completo.
- **Ação**: confirmar com Nicchon se pode descartar. Se sim: `DROP DATABASE chatwoot` + `docker volume rm chatwoot_data`.

**P2.4. Database `ev2docker` suspeito**

- **Sintoma**: 7.4MB, nome sugere "Evolution v2 Docker" — possivelmente leftover de migração / preview.
- **Ação**: inspecionar tabelas. Se for órfão como chatwoot, dropar.

**P2.5. Diretório `/root/portainer` e `get-docker.sh` em `/root`**

- **Sintoma**: `portainer.yaml` (config inicial) e `get-docker.sh` (script de instalação) ficaram em `/root` após setup.
- **Risco**: nenhum direto, mas indica setup manual sem automação. Documenta a história.
- **Ação**: mover pra `/opt/setup-history/` ou descartar. Cosmético.

**P2.6. Sem monitoramento / alerta**

- **Sintoma**: nada notifica quando OOM, disk full, container caído, brute force ativo.
- **Mitigação**: instalar `node_exporter` + Grafana Cloud free tier OU alerta básico via cron + curl pra webhook do KTask.

**P2.7. Logs do sshd não rotacionam por tempo limitado**

- `lastb` começa em 2026-05-01 (17 dias). `journalctl` retentem ~30 dias. Suficiente pra forense de curto prazo. Não-bloqueante.

## Plano de ação proposto (ordem de execução)

### Etapa 1 — Bloqueio do brute force (P0.1) — **5 min, sem downtime**

1. Instalar fail2ban: `apt update && apt install -y fail2ban`
2. Criar `/etc/fail2ban/jail.d/sshd.conf` com bantime 1h, maxretry 5, findtime 10min
3. `systemctl enable --now fail2ban`
4. Verificar `fail2ban-client status sshd`

### Etapa 2 — Firewall Hetzner Cloud (P0.2 + P1.2) — **5 min painel, sem downtime**

1. No painel Hetzner Cloud → Firewalls → Create
2. Regra inbound: TCP 22 (SSH), TCP 80, TCP 443 (qualquer origem)
3. Bloquear default (drop) pra tudo mais
4. Aplicar à VM `46.224.4.17`
5. Verificar `ss -tlnp` ainda mostra os listens, mas `nmap` externo só consegue 22/80/443

### Etapa 3 — sshd hardening (P1.1) — **2 min, conexões ativas mantidas**

1. Criar `/etc/ssh/sshd_config.d/50-hardening.conf`:
   ```
   PasswordAuthentication no
   KbdInteractiveAuthentication no
   X11Forwarding no
   MaxAuthTries 3
   ```
2. `sshd -t` (testa sintaxe)
3. `systemctl reload ssh` (recarga sem matar sessões ativas)
4. Validar com nova conexão

### Etapa 4 — Swap de emergência (P2.2A) — **2 min, sem downtime**

1. `fallocate -l 4G /swapfile && chmod 600 /swapfile`
2. `mkswap /swapfile && swapon /swapfile`
3. Adicionar em `/etc/fstab`: `/swapfile none swap sw 0 0`
4. Validar com `free -h`

### Etapa 5 — Backup automático Postgres (P1.5) — **15 min, sem downtime**

1. Criar `/usr/local/bin/pg-backup.sh` com `pg_dumpall` + gzip + rotação 7 dias
2. Cron diário 04:00 BRT (07:00 UTC)
3. Testar manualmente uma vez
4. **Futuro**: enviar pra S3 ou similar pra ter cópia off-site

### Etapa 6 — Rotação da master key Evolution (P0.3) — **10 min, ~30s downtime Evolution**

1. **Pré**: Nicchon cadastra key atual no painel admin novo (não bloqueia, mas já registra)
2. Gerar nova key 64 chars: `openssl rand -hex 32`
3. Atualizar `AUTHENTICATION_API_KEY` no stack Evolution via Portainer (UI)
4. Atualizar `EVOLUTION_DEFAULT_API_KEY` em `/opt/ktask/infra/prod.env` na VM do KTask
5. Atualizar consumidores: painel admin novo (substituir), n8n credenciais Evolution (se usar)
6. Restart Evolution: `docker service update --force evolution_api_2_evolution_api_2`
7. Restart KTask api: `docker compose -f /opt/ktask/infra/docker-compose.prod.yml --env-file /opt/ktask/infra/prod.env up -d api`
8. Testar envio: `curl ...` direto

### Etapa 7 — Cleanup chatwoot + ev2docker (P2.3 + P2.4) — **5 min**

1. Confirmar com Nicchon que ambos podem sair
2. Backup dos 2 bancos antes (`pg_dump chatwoot`, `pg_dump ev2docker`)
3. `DROP DATABASE chatwoot; DROP DATABASE ev2docker;`
4. `docker volume rm chatwoot_data`

### Etapa 8 — Updates + reboot (P2.1) — **agendado, ~3min downtime**

1. Janela: madrugada (03:00-04:00 BRT)
2. Snapshot Hetzner antes
3. `apt update && apt upgrade -y`
4. `reboot`
5. Validar todos os containers voltaram: `docker service ls`
6. Testar Evolution + KTask integração

### Etapa 9 — Usuários Postgres por aplicação (P1.4) — **30 min, ~5min downtime cada stack**

Item maior, agendar separadamente. Migração de cada stack pra usar usuário próprio em vez de `postgres` superuser.

## Critérios de aceite

- [ ] `fail2ban-client status sshd` mostra IPs banidos
- [ ] `nmap 46.224.4.17` de outro host só responde 22/80/443
- [ ] `sshd -T | grep password` retorna `passwordauthentication no`
- [ ] `free -h` mostra 4G de swap
- [ ] `/usr/local/bin/pg-backup.sh` rodou 1x manualmente e gerou arquivo válido
- [ ] Master key da Evolution tem 64 chars
- [ ] KTask consegue enviar WhatsApp após rotação (curl test)
- [ ] `docker service ls` mostra todos os services healthy após reboot
- [ ] `apt list --upgradable | wc -l` = 0 ou só não-críticos

## Riscos / decisões

- **Por que Hetzner Firewall e não ufw?** ufw mexe em iptables que Docker já manipula — pode quebrar Docker networking. Hetzner Firewall opera fora da VM (no hypervisor), zero interferência.
- **Por que swap antes de upgrade de VM?** Swap resolve OOM imediato. Upgrade é decisão de custo recorrente que merece análise de capacity (avaliar consumo real, não chute).
- **Por que não desligar root SSH completamente?** Não tem outro usuário com shell. Antes precisamos criar usuário não-root com sudo, daí desabilitamos `PermitRootLogin`. Etapa P2 ou P3.
- **Por que manter Ramiro fora do acesso por enquanto?** Acesso dele era por senha root (não-rastreável). Quando ele precisar voltar, pedir pubkey dele e criar usuário próprio (`ramiro` com sudo). Audit trail melhor.
- **Por que rotacionar master key Evolution antes de Hetzner Firewall?** A key trafega em todo request `/instance/sendText`. Quem snifou tráfego HTTP no passado pode já ter. Rotacionar elimina exposição passada.

## Estado pós-hardening (objetivo)

```
Servidor:
- ufw/Hetzner Firewall: só 22, 80, 443 públicos
- sshd: só pubkey, root-without-password, MaxAuthTries 3
- fail2ban: ban automático
- Updates aplicados, kernel atualizado
- Swap 4GB

Aplicação:
- Master key Evolution 64 chars (rotacionada)
- Backup diário Postgres
- Sem orfãos (chatwoot, ev2docker)

Monitoramento (opcional, P3):
- Alerta de container down
- Alerta de OOM
- Alerta de brute force escalando
```

## Histórico

- 2026-05-18 17:00 UTC — Nicchon resetou senha root via painel Hetzner. Claude ganhou SSH (pubkey `evolution-audit-claude-2026-05-16`). Ramiro perdeu acesso (acessava por senha).
- 2026-05-18 17:15 UTC — Recon inicial concluída, master key extraída, plano de hardening escrito.
- 2026-05-18 17:30 UTC — **Etapa 1 (fail2ban) executada.** 15+ IPs banidos em 5min. Brute force ativo neutralizado.
- 2026-05-18 17:35 UTC — **Etapa 3 (sshd hardening) executada.** `/etc/ssh/sshd_config.d/50-hardening.conf` com `PasswordAuthentication no`, `KbdInteractiveAuthentication no`, `X11Forwarding no`, `MaxAuthTries 3`. Reload sem matar sessões.
- 2026-05-18 17:40 UTC — **Etapa 4 (swap 4GB) executada.** `/swapfile` ativo + `/etc/fstab` persistente. Pressão de RAM mitigada.
- 2026-05-19 12:25 UTC — **Cleanup de instâncias órfãs.** Identificado bug original "problema do Ramiro": instância `Kharis` (`bd367de0...`) tinha linha em `Instance` sem dir em `/evolution/instances/` → Manager UI dava "instância não existe" ao deletar. Backup `evolution-pre-cleanup-2026-05-19-1225.sql.gz` (27MB). `DELETE FROM "Instance" WHERE id IN ('bd367de0-b627-48d3-a98e-f2c6801ef7ac', '9076d170-d360-4f12-aa00-cf60993d488e')` removeu Kharis fantasma + Nick (stuck connecting desde 2026-03-27, abandonada). FKs CASCADE cuidaram das filhas (1 Session, 2 Settings). `VACUUM ANALYZE` em Instance/Session/Setting/Label limpou dead tuples (de 16/29/9/17 → 0/0/0/0). Dir `/evolution/instances/9076d170...` (Nick) removido. **Restam 3 instâncias ativas**: NicchonPessoal, NicchonSanchez, KharisWhatsapp.

## Instâncias restantes (estado em 2026-05-19)

| Nome           | UUID                                   | Owner JID    | State     | Observação                                                                                           |
| -------------- | -------------------------------------- | ------------ | --------- | ---------------------------------------------------------------------------------------------------- |
| NicchonPessoal | `09921181-b18c-4bbf-85fc-b929202e00f4` | 553193767301 | open      | WhatsApp pessoal Nicchon (final 7301)                                                                |
| NicchonSanchez | `1a490df5-e76f-4ece-b7fb-01200aaffc6a` | 553189116860 | open      | WA Nicchon final 6860, usado por KTask                                                               |
| KharisWhatsapp | `36e241a2-2efb-49fc-8877-f4653560994f` | 558001815000 | **close** | Número 0800 da Kharis. **Banido pelo WhatsApp** — mantido pra eventual re-pareamento com novo número |
