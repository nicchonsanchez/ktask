# Integração: leads do formulário "Sorteio ANEC Summit 2026" → KTask

> Status: **CONCLUÍDO (2026-08-11)**

## Contexto

A LP `agenciakharis.com.br/sorteio-anec/` (WordPress/Elementor) tem um
formulário de inscrição pro sorteio da Kharis no ANEC Summit 2026. Os
leads já caem automaticamente nas tabelas nativas do Elementor Pro
(`e_submissions` / `e_submissions_values`), lidas pelo `kharis-crm-plugin`
já existente no site. Esta tarefa adiciona um segundo destino: um card
por lead no board **"LEADS - Sorteio ANEC Summit"** do KTask, pra dar
visibilidade operacional ao time comercial/marketing.

## Escopo

**Dentro:**

- Criar card automaticamente a cada nova submissão do formulário
  (título = nome do lead, descrição = todos os campos).
- Backfill retroativo dos leads que já existiam antes da integração.
- Reset da senha da conta de serviço `claude-bot@ktask.local` (existia
  a conta, mas a senha não estava disponível em nenhum `.env` local
  nem no `prod.env` do servidor).

**Fora:**

- Líder/membros/tags/checklist no card (a API do KTask cobre isso via
  endpoints separados — não usado aqui).
- Deduplicação automática de leads repetidos (encontrados alguns
  poucos duplicados nos dados reais; não removidos, fica a critério
  do time limpar manualmente se quiser).
- Webhook/API key dedicada — a API do KTask hoje só tem JWT (expira em
  15min). Optou-se por login novo a cada chamada em vez de gerenciar
  refresh token, dado o volume baixo (leads de um sorteio, não um
  fluxo de alto volume).

## Decisões técnicas

- **Auth**: login via `POST /api/v1/auth/login` a cada disparo (mu-plugin)
  ou uma vez só reaproveitado pro loop (script de backfill). Sem cache
  de token entre requisições — simplicidade > otimização, dado o volume.
- **Conta usada**: `claude-bot@ktask.local` (role ADMIN, organizationId
  `cmod1pixl0001o2auxw8gg29c`) — já existia, documentada em
  `briefings/08-architecture-overview.md` como conta de bot pra scripts
  ad-hoc. A senha foi resetada direto no banco (argon2id, mesmos
  parâmetros do `PasswordService`: memoryCost=65536, timeCost=3,
  parallelism=4) porque não havia registro dela em nenhum lugar
  acessível. Hash calculado dentro do próprio container `ktask-api`
  (`docker exec -i ktask-api node -e "...argon2.hash..."`) pra garantir
  compatibilidade exata de versão da lib.
- **Credencial nova**: guardada em
  `/home/agenciak/kharis-secrets/ktask-bot-password.txt` no servidor
  WordPress da Kharis (fora do webroot, permissão 600) — nunca passou
  em texto puro por nenhum log ou terminal durante a troca (pipe
  SSH-para-SSH direto).
- **Board/lista de destino**: board `cmsontj4p0df7t0072aokto0y`
  ("LEADS - Sorteio ANEC Summit"), lista `cmsontj520dfbt007v71k10yi`
  ("A Fazer") — board já existia, criado antes desta tarefa, vazio.
  Backfill original entrou em "Backlog" (`cmsontj520dfat00710ckie86`)
  e foi movido pra "A Fazer" via `PATCH /:cardId/move` (preserva ordem
  cronológica com `afterCardId` encadeado); mu-plugin ajustado pra
  já criar direto em "A Fazer" dali pra frente.
- **Formato da descrição**: ProseMirror doc (`{type:"doc", content:[...]}`),
  um parágrafo por campo com o rótulo em negrito (mark `bold`, padrão
  do TipTap StarterKit usado no editor do KTask). Confirmado lendo
  `apps/web/src/components/editor/rich-editor.tsx` e um exemplo real em
  `importer.service.ts`.
- **`X-Org-Id`**: enviado explicitamente (`cmod1pixl0001o2auxw8gg29c`)
  em vez de depender do fallback "primeira membership do usuário" do
  `TenantGuard`, pra não depender de uma característica implícita da
  conta bot.

## Implementação

- Lógica automática vive no mesmo mu-plugin do WordPress que já manda
  aviso pro WhatsApp:
  `wp-content/mu-plugins/kharis-sorteio-whatsapp-notify.php` (no site,
  não neste repo) — hook `elementor_pro/forms/new_record`, filtrado por
  `form_name === 'Sorteio ANEC Summit 2026'`. Duas ações independentes
  no mesmo hook (WhatsApp + KTask), cada uma falha isolada da outra.
- Backfill foi um script PHP ad-hoc (`wp eval-file`), não versionado —
  rodou uma vez, resultado já está no KTask.

## Retroativo — resultado

50 submissões existentes no formulário até 2026-08-11. Excluídas 3
(`Teste`/`Nick`/`Nicchon TESTE`, e-mails `teste@teste.com` — testes do
próprio time). As 47 restantes têm nomes, escolas e e-mails
institucionais reais e consistentes (nomes de domínio batem com nome
da instituição) — não é spam, o clustering de horários (várias no
mesmo minuto em alguns momentos) é compatível com pessoas preenchendo
ao vivo durante o ANEC Summit. Todas as 47 foram criadas com sucesso,
`startDate` = data/hora real da submissão original.

## Critérios de aceite

- [x] Card criado automaticamente a cada novo envio do formulário (testado
      com card de teste, depois apagado).
- [x] Título do card = nome do lead.
- [x] Descrição contém todos os campos do formulário.
- [x] Card cai na lista "A Fazer" do board correto.
- [x] Retroativo: 47 leads existentes migrados, 0 falhas.
- [x] Senha da conta bot resetada e funcionando (login testado, 200 OK).
- [x] Credencial nova armazenada fora do webroot, nunca exposta em texto
      puro em terminal/log.

## Addendum (2026-08-11) — transferência pro board comercial

Os 47 leads foram transferidos do board "LEADS - Sorteio ANEC Summit"
pro board comercial geral da Kharis (antes nomeado "ALIANÇAS
FRANCESAS", `description` já era "COMERCIAL" — renomeado nesta tarefa
pra "Relações Institucionais Kharis"), na coluna "Novo Lead"
(`cmrp2gzpp05noo307xxtkdufj`), pra entrarem no funil comercial real
(Novo Lead → Ligando → Reunião Agendada → Negociação).

**Mecanismo usado**: API de "flows" (multi-board), não SQL direto —
`POST /:cardId/flows` (vincula) → `PATCH /:cardId/flows/:boardId/primary`
(assume como board primário) → `DELETE /:cardId/flows/:boardId` (antigo,
desvincula). Essa é a rota oficial documentada no próprio controller
pra "card criado no board errado".

**Bug encontrado no próprio KTask**: `setPrimaryFlow` atualiza
`Card.boardId` mas **não** `Card.listId` — o Kanban funciona normal
(lê de `CardPresence`), mas a view de detalhe do card (`GET /:cardId`,
via relação Prisma `list`) lê `Card.listId` direto, então abrir um
card individualmente mostraria a lista/board errados até essa
correção. Sanado com um `UPDATE` pontual nos 47 IDs afetados. Vale
reportar como bug real do backend do KTask — mesma inconsistência
provavelmente afeta qualquer uso futuro de `setPrimaryFlow`.

**Mu-plugin atualizado**: o `$list_id` hardcoded no
`kharis-sorteio-whatsapp-notify.php` foi trocado de "A Fazer" (board
antigo) pra "Novo Lead" (`cmrp2gzpp05noo307xxtkdufj`, board "Relações
Institucionais Kharis") — daqui pra frente, novas inscrições no
formulário já criam o card direto no board comercial certo. Testado
com card de teste (confirmado `boardId`/`listId` corretos), depois
apagado.

## Riscos conhecidos

- Se o board, a lista, ou o `organizationId` mudarem no futuro, os IDs
  hardcoded no mu-plugin (`$list_id`, `$org_id`) precisam ser
  atualizados manualmente — não há lookup dinâmico por nome.
- Token JWT expira em 15min; se a API do KTask ficar fora do ar no
  momento exato de uma submissão, aquele lead não gera card (mas
  continua caindo no CRM via Elementor normalmente — falha isolada).
- Sem retry/fila: falha na chamada HTTP não é reprocessada
  automaticamente.
