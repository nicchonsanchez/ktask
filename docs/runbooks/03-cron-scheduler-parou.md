# Runbook 03 — Cron/scheduler do ktask-api parou de executar

> **Nota**: o briefing original chamava este runbook de "Filas BullMQ travadas". O pacote `bullmq` está em `apps/api/package.json` mas hoje **nenhum** `new Queue` / `@Processor` / `BullModule.registerQueue` existe no código. Todo agendamento roda **in-process** via `@nestjs/schedule` (cron dentro do processo Node do `ktask-api`). Quando BullMQ for adotada, abrir runbook separado e renumerar.

- **Severidade**: P1 (degradação silenciosa: usuário não vê erro, só não recebe o que deveria)
- **Tempo médio de resolução**: ~10 min
- **Última atualização**: 2026-05-13
- **Quem pode executar**: dev com acesso SSH

## Sintomas

- Ninguém recebeu notificação de prazo hoje (cron diário às 11:00 UTC = 8:00 BRT, ver [notifications.scheduler.ts](../../apps/api/src/modules/notifications/notifications.scheduler.ts)).
- Automações time-based pararam de disparar (4 crons em [automations.scheduler.ts](../../apps/api/src/modules/automations/automations.scheduler.ts): 2× a cada minuto, 2× a cada hora).
- WhatsApp programado por automação não saiu. Card que deveria vencer não recebeu DUE_SOON.
- Painel/Inbox sem notificações novas em > 24h sem motivo aparente.

Observação importante: API pode estar "saudável" externamente (`/healthz` retorna 200), e ainda assim o cron pode ter parado se houve restart constante ou uma exception não capturada num handler de cron.

## Diagnóstico rápido (5 min)

```bash
# 1. SSH
ssh -i ~/.ssh/ktask-deploy root@178.104.220.28

# 2. Uptime do api
docker inspect -f 'Started: {{.State.StartedAt}}  Restarts: {{.RestartCount}}' ktask-api
# Se startedAt < 1 min atrás: api acabou de reiniciar -> cron ainda não rodou (caso A).
# Se RestartCount > 5 nas últimas horas: cron pode estar dropando (caso A).

# 3. Procurar evidência de execução nos logs
docker logs ktask-api --since 30m 2>&1 | grep -iE 'scheduler|cron|automation' | tail -30
# Esperado ao menos:
#   - automations.scheduler tickando (a cada minuto) com algo tipo
#     "AutomationsScheduler" ou similar (se LOG_LEVEL=debug). Em info, pode
#     estar silencioso — então olhar pelo timer de minuto:
docker logs ktask-api --since 5m 2>&1 | grep -iE 'evaluating|triggered|automation' | tail

# 4. Procurar exceptions recentes
docker logs ktask-api --since 1h 2>&1 | grep -iE 'error|unhandled|exception|fatal' | tail -30

# 5. Conferir se notifications foram criadas hoje (consulta direta no banco)
docker exec ktask-postgres psql -U ktask -d ktask -c "
  SELECT type, count(*)
    FROM \"Notification\"
   WHERE \"createdAt\" >= now() - interval '24 hours'
   GROUP BY type ORDER BY count DESC;"
# Se DUE_SOON está zerado E hoje passou das 8:00 BRT: cron de prazo não rodou.

# 6. Conferir runs de automação recentes
docker exec ktask-postgres psql -U ktask -d ktask -c "
  SELECT status, count(*) FROM \"AutomationRun\"
   WHERE \"createdAt\" >= now() - interval '2 hours'
   GROUP BY status;"
# Esperado: alguma quantidade > 0 nas últimas 2h (se há automações ativas).
# Tudo zero por horas = scheduler parou.
```

## Resolução

### Caso A: api reiniciou no meio do dia e perdeu a janela do cron

Causa: deploy ou restart fez o api subir depois das 8:00 BRT — `@Cron('0 11 * * *')` não dispara retroativo. As notificações DUE_SOON daquele dia foram perdidas (próximas 24h voltam ao normal).

Mitigação: aceitar a perda do dia E garantir que o api fique de pé. Re-disparo manual exige código (não há endpoint de "rodar agora"). Se for crítico:

```bash
# Disparar cron manualmente via container (não há comando dedicado — abre um shell
# Node e chama o método). Isso requer alinhar com Nicchon antes — modifica estado.
# Alternativa preferida: deixar pra amanhã. Documentar no postmortem.
```

Verificação: olhar amanhã 8:01 BRT que DUE_SOON apareceu. Se não: voltar pro Caso B.

### Caso B: cron silenciosamente parou (api de pé mas timers congelados)

Causa: exception não tratada dentro de um cron pode parar o `setInterval` interno do `@nestjs/schedule`, ou um `await` que não retorna (deadlock). Sintoma: api `healthy`, sem crash, mas timers parados.

```bash
# 1. Forçar restart da api (recria timers)
docker compose -f /opt/ktask/infra/docker-compose.prod.yml --env-file /opt/ktask/infra/prod.env restart api

# 2. Acompanhar boot
docker logs ktask-api -f
# Esperar pelas linhas do Nest informando "Application is running on..." + "Nest application successfully started".

# 3. Confirmar healthz
curl -sS https://api.ktask.agenciakharis.com.br/healthz | head

# 4. Esperar 1 minuto e confirmar que os crons de minuto rodaram
docker exec ktask-postgres psql -U ktask -d ktask -c "
  SELECT max(\"createdAt\") AS ultimo_run FROM \"AutomationRun\";"
# Esperado: timestamp dos últimos 60s (se houver automações ativas).
```

### Caso C: cron rodando mas falhando silenciosamente

Causa: handler do cron pega exception interna mas loga e segue, sem completar. Visível como "scheduler tickando, mas zero efeito".

```bash
# 1. Procurar warnings/errors dos schedulers
docker logs ktask-api --since 2h 2>&1 | grep -iE 'scheduler|notify|automation' | grep -iE 'warn|error' | tail

# 2. Se aparece algo como "Daily due check: 0 due-today + 0 overdue cards processados"
#    -> cron rodou, é o esperado pra dia sem prazos. Não é incidente.

# 3. Se há erro consistente (ex: query do scheduler quebrando), abrir issue +
#    pedir fix de código. Mitigação local: nenhuma — precisa correção.
```

### Caso D: WhatsApp não saiu, mas notificação interna foi criada

Causa: notification do scheduler está rodando, mas envio Evolution está falhando. Não é problema do cron — é runbook 04.

```bash
docker logs ktask-api --since 2h 2>&1 | grep -i 'evolution' | tail
# Se há "Evolution sendText 4xx/5xx" ou "Evolution sendText falhou" -> runbook 04.
```

### Se nada funcionar

- Escalar pro Nicchon — pode ser bug de scheduler que precisa fix de código.
- Considerar rollback se a parada começou logo após deploy (runbook 05).

## Pós-incidente

- [ ] Postmortem em `docs/postmortems/` se afetou notificação de prazo dum cliente externo (P1).
- [ ] Verificar se houve exception não-capturada em algum scheduler. Se sim, abrir issue pra envolver os handlers em `try/catch` + log estruturado.
- [ ] Avaliar se vale subir um monitor passivo (consulta SQL a cada hora "houve AutomationRun?" → alerta) — fora do escopo de runbook, abrir issue.

## Por que não há fila ainda

Decisão consciente: nada hoje justifica a complexidade operacional de uma fila BullMQ (worker separado, monitoramento de stalled/failed jobs, etc). O scheduler in-process roda dentro do mesmo processo da API, então:

- Vantagem: zero overhead, se a api está de pé, o cron está de pé.
- Desvantagem: se a api restart no horário do cron diário, perde aquele dia.
- Quando reavaliar: quando volume de WhatsApp programado passar de ~100/dia ou quando precisar paralelizar processamento de automação em múltiplos workers.

## Links úteis

- Scheduler de notificação diária: [apps/api/src/modules/notifications/notifications.scheduler.ts](../../apps/api/src/modules/notifications/notifications.scheduler.ts)
- Scheduler de automações: [apps/api/src/modules/automations/automations.scheduler.ts](../../apps/api/src/modules/automations/automations.scheduler.ts)
- Helper de WhatsApp: [apps/api/src/modules/whatsapp/whatsapp.helper.ts](../../apps/api/src/modules/whatsapp/whatsapp.helper.ts)
