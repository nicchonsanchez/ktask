# Runbook 04 — Evolution API fora (WhatsApp não envia)

- **Severidade**: P1 (mensagens automatizadas não saem; app segue funcionando, notificação interna + push continuam)
- **Tempo médio de resolução**: ~15 min
- **Última atualização**: 2026-05-13
- **Quem pode executar**: dev com acesso SSH; reconexão de QR exige o número responsável pela instância

## Contexto

A integração WhatsApp é **best-effort**: o helper [whatsapp.helper.ts](../../apps/api/src/modules/whatsapp/whatsapp.helper.ts) loga falhas com `logger.warn` e retorna `false` — nunca propaga exception. Significa que:

- Card não falha quando WhatsApp não sai.
- Automação ainda registra `AutomationRun` como SUCCESS.
- Usuário só percebe pelo "não chegou no Zap".
- Plantonista descobre via reclamação ou pelos logs do api.

Variáveis de configuração no `/opt/ktask/infra/prod.env`:

- `EVOLUTION_DEFAULT_URL` (ex: `https://evolution.meudominio.com.br`)
- `EVOLUTION_DEFAULT_API_KEY`
- `EVOLUTION_DEFAULT_INSTANCE` (ex: `NicchonSanchez`)

Se qualquer uma vier vazia, `isEnabled()` retorna `false` e o envio é pulado silenciosamente.

## Sintomas

- Reclamação: "não chegou no WhatsApp".
- Logs do api: `Evolution sendText 4xx/5xx pra <numero>` ou `Evolution sendText falhou pra <numero>: <msg>` ou `WhatsApp desabilitado (Evolution sem creds)`.
- `AutomationRun` está sendo registrado como SUCCESS, mas mensagens não chegam.

## Diagnóstico rápido (5 min)

```bash
# 1. SSH
ssh -i ~/.ssh/ktask-deploy root@178.104.220.28

# 2. Confirma se está realmente habilitado
grep -E '^EVOLUTION_' /opt/ktask/infra/prod.env | sed 's/=.*/=<set>/'
# Esperado: ver as 3 variáveis com <set>. Se alguma faltar -> Caso A.

# 3. Procurar erro recente do helper
docker logs ktask-api --since 1h 2>&1 | grep -i 'evolution' | tail -30
# Padrões:
#   "Evolution sendText 401 ..."         -> API key inválida (Caso B)
#   "Evolution sendText 404 ..."         -> instância não existe (Caso C)
#   "Evolution sendText 400 ..."         -> número mal formatado / sem WA / payload ruim (Caso D)
#   "Evolution sendText 5xx ..."         -> Evolution caiu (Caso E)
#   "Evolution sendText falhou ... ENOTFOUND/timeout" -> URL errada ou Evolution offline (Caso E)

# 4. Testar a Evolution direto (puxa as vars do prod.env pra rodar com elas)
set -a; source /opt/ktask/infra/prod.env; set +a
curl -sS -H "apikey: $EVOLUTION_DEFAULT_API_KEY" \
  "$EVOLUTION_DEFAULT_URL/instance/connectionState/$EVOLUTION_DEFAULT_INSTANCE" | head
# Esperado: JSON com state="open". Outros estados:
#   "close"             -> instância desconectada do WhatsApp (Caso C)
#   "connecting"        -> aguardando QR (Caso C)
#   HTTP 401            -> API key (Caso B)
#   HTTP 404            -> instância (Caso C)
#   timeout/ENOTFOUND   -> Evolution fora (Caso E)
```

## Resolução

### Caso A: variáveis Evolution não estão setadas no prod.env

Causa: deploy esqueceu de propagar, ou prod.env foi sobrescrito.

```bash
# 1. Conferir o que tem hoje (sem revelar valor)
grep -E '^EVOLUTION_' /opt/ktask/infra/prod.env

# 2. Pedir pro Nicchon os valores válidos (WhatsApp +55 31 99376-7301)
#    e preencher manualmente no arquivo:
nano /opt/ktask/infra/prod.env
# Setar EVOLUTION_DEFAULT_URL, EVOLUTION_DEFAULT_API_KEY, EVOLUTION_DEFAULT_INSTANCE.
# Salvar (Ctrl+O, Enter, Ctrl+X).

# 3. Recarregar api
docker compose -f /opt/ktask/infra/docker-compose.prod.yml --env-file /opt/ktask/infra/prod.env up -d api

# 4. Confirmar nos logs que sumiu o "WhatsApp desabilitado"
docker logs ktask-api --since 5m 2>&1 | grep -i 'whatsapp'
```

### Caso B: API key inválida (HTTP 401)

Causa: key foi rotacionada do lado do Evolution.

```bash
# 1. Pedir pro Nicchon a nova key
# 2. Atualizar prod.env
nano /opt/ktask/infra/prod.env
# 3. Recarregar (mesmo passo do caso A)
docker compose -f /opt/ktask/infra/docker-compose.prod.yml --env-file /opt/ktask/infra/prod.env up -d api

# 4. Validar
set -a; source /opt/ktask/infra/prod.env; set +a
curl -sS -H "apikey: $EVOLUTION_DEFAULT_API_KEY" \
  "$EVOLUTION_DEFAULT_URL/instance/fetchInstances" | head -40
# Deve listar a instância com a key nova aceita.
```

### Caso C: instância desconectada (state ≠ "open")

Causa: o celular que pareou perdeu sessão (caiu da rede, deslogou, expirou).

```bash
# 1. Pedir QR code novo
set -a; source /opt/ktask/infra/prod.env; set +a
curl -sS -H "apikey: $EVOLUTION_DEFAULT_API_KEY" \
  "$EVOLUTION_DEFAULT_URL/instance/connect/$EVOLUTION_DEFAULT_INSTANCE"
# Retorna JSON com qrcode em base64 (campo "base64" ou "code"), OU URL pra
# rederização do QR. Repassar pro Nicchon (apenas ele pode parear).

# 2. Pedir pro Nicchon (WhatsApp +55 31 99376-7301) escanear o QR no Zap dele.

# 3. Confirmar reconexão
curl -sS -H "apikey: $EVOLUTION_DEFAULT_API_KEY" \
  "$EVOLUTION_DEFAULT_URL/instance/connectionState/$EVOLUTION_DEFAULT_INSTANCE"
# state precisa ser "open".

# 4. Testar envio (PRA NICCHON, não pra cliente). Pegar o número do Nicchon
#    em E.164 sem '+' (5531993767301).
curl -sS -X POST -H "apikey: $EVOLUTION_DEFAULT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"number":"5531993767301","text":"Runbook 04 teste — pode ignorar."}' \
  "$EVOLUTION_DEFAULT_URL/message/sendText/$EVOLUTION_DEFAULT_INSTANCE"
# Esperado: 200/201 com id do message. Nicchon recebe na hora.
```

### Caso D: número específico falhando (HTTP 400 ou 4xx em alguns destinos)

Causa: número alvo bloqueou o nosso WhatsApp, número malformado no banco (sem DDI/DDD), número sem conta no WhatsApp.

```bash
# 1. Pegar o número da log
docker logs ktask-api --since 1h 2>&1 | grep -i 'evolution sendtext' | tail

# 2. Validar formato no banco
docker exec ktask-postgres psql -U ktask -d ktask -c "
  SELECT id, name, phone FROM \"Contact\" WHERE phone LIKE '%<final>%' LIMIT 5;"
# Esperado: phone em E.164 sem '+' (ex: 5511987654321). Sem essa formatação,
# o helper passa pra Evolution e ela rejeita.

# 3. Se for problema de formato: fix manual ou abrir issue pra normalizar
#    no fluxo de cadastro. Não é incidente sistêmico.
```

### Caso E: Evolution VM/container fora

Causa: o serviço Evolution (gerido fora deste repo) está indisponível.

```bash
# 1. Testar conexão TCP
set -a; source /opt/ktask/infra/prod.env; set +a
curl -sS -o /dev/null -w '%{http_code}\n' --max-time 10 "$EVOLUTION_DEFAULT_URL/instance/fetchInstances" \
  -H "apikey: $EVOLUTION_DEFAULT_API_KEY"
# 000 = não conectou. 5xx = caiu. 200 = está de pé (volta pro Caso C/D).

# 2. Contactar Nicchon — Evolution vive em VM separada (não Hetzner do KTask).
#    Restart, rede, ou serviço travado: responsabilidade do dono da Evolution.

# 3. Enquanto Evolution não volta: mensagens param. Notificação interna
#    (sino no app) + push web continuam funcionando normalmente.
#    Avisar usuários afetados se for prolongado.
```

### Se nada funcionar

- Escalar pro Nicchon (WhatsApp +55 31 99376-7301) ou e-mail se WhatsApp dele tb estiver afetado.
- Considerar desativar temporariamente as automações de WhatsApp pra parar de logar warn (`UPDATE "Automation" SET "isActive"=false WHERE ...`) — só se incidente > 4h.

## Pós-incidente

- [ ] Postmortem se ficou > 2h fora ou afetou ciclo de aprovação de cliente.
- [ ] Se foi QR (Caso C) recorrente: avaliar dispositivo dedicado pra instância (não usar Zap pessoal do Nicchon).
- [ ] Se foi número malformado (Caso D) recorrente: abrir issue pra normalizar phone no cadastro de Contact.

## Links úteis

- Helper: [apps/api/src/modules/whatsapp/whatsapp.helper.ts](../../apps/api/src/modules/whatsapp/whatsapp.helper.ts)
- Doc Evolution API: ver pasta de docs Ummense/Evolution interna do operador
- prod.env (chmod 600, root): `/opt/ktask/infra/prod.env`
