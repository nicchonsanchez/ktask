# Checklist — KTask

Rastreador vivo do progresso. Atualizar a cada entrega relevante.

Legenda: `[ ]` a fazer · `[~]` em andamento · `[x]` concluído · `[-]` descartado/adiado

---

## Decisões travadas

- [x] Nome do produto: **KTask**
- [x] Referências principais: Ummense (funcionalidade) + Trello (UX)
- [x] Uso interno primeiro, SaaS sem data
- [x] Multi-tenancy lógica desde o dia zero (`organizationId` em tudo)
- [x] Stack: monorepo pnpm+Turborepo, Next.js 15, NestJS 11, Prisma 6, Postgres 16, Redis 7, BullMQ, Socket.IO, S3-compatible
- [x] Auth própria (JWT access 15min + refresh httpOnly)
- [x] Integração WhatsApp via Evolution API
- [x] Papéis Org: OWNER / ADMIN / GESTOR / MEMBER / GUEST
- [x] Papéis Board: ADMIN / EDITOR / COMMENTER / VIEWER
- [x] Teto por rank nas promoções
- [x] Editor MVP simples (bold/italic/listas/links/menções); Tiptap completo na v1
- [x] UI em pt-BR (Dono / Administrador / Gestor / Membro / Convidado)
- [x] Cloud: Vercel (web) + AWS App Runner (api/workers) + RDS + ElastiCache + S3 + SES + SSM
- [x] Domínio prod: `ktask.agenciakharis.com.br` | API: `api.ktask.agenciakharis.com.br`
- [x] Docker nos containers (App Runner + dev local com Docker Compose)
- [x] DNS via Cloudflare (free)
- [x] Paleta primária: violet-700 (#6D28D9) no light / violet-600 (#7C3AED) no dark; accent teal #2EE8B8
- [x] Fonte: Inter
- [x] Ícones: Lucide
- [x] Evolution creds: `.env.local` em dev; SSM + `Integration.config` criptografado em prod

## Decisões pendentes

- [ ] 2FA obrigatório pro OWNER?
- [ ] Política exata de senha (sugestão: mín 10 + check pwned)
- [ ] Como é criado o primeiro OWNER? (Seed CLI / página de setup única)
- [ ] Analytics de produto: PostHog? Mixpanel? Nada?
- [ ] Região AWS: `sa-east-1` (São Paulo) confirmada?
- [ ] Vercel plano: Hobby ou Pro ($20/mês)?
- [ ] Sentry: já tem conta Kharis ou cria nova?
- [ ] WhatsApp: Baileys (via Evolution padrão) ou Cloud API oficial no futuro?

## Itens parkados (sem data, revisitar depois)

- [-] Billing / Stripe / planos
- [-] Cadastro público / landing
- [-] SSO SAML
- [-] Importadores Trello/Ummense
- [-] i18n (en, es)
- [-] Política de privacidade / Termos de Uso / DPA
- [-] App mobile nativo (PWA cobre)
- [-] Timeline / Gantt

---

## Documentação

- [x] `README.md` (raiz)
- [x] `.gitignore`
- [x] `tarefas-md/00-visao-geral.md`
- [x] `tarefas-md/01-requisitos-funcionais.md`
- [x] `tarefas-md/02-requisitos-nao-funcionais.md`
- [x] `tarefas-md/03-entidades-e-dominio.md`
- [x] `tarefas-md/04-fluxos-principais.md`
- [x] `tarefas-md/05-stack-e-arquitetura.md`
- [x] `tarefas-md/06-roadmap-mvp.md`
- [x] `tarefas-md/07-design-system.md`
- [x] `tarefas-md/08-infra-e-deploy.md`
- [x] `tarefas-md/09-engine-automacoes.md`
- [x] `tarefas-md/checklist.md`
- [ ] `tarefas-md/10-api-contracts.md` (antes de codar os módulos)
- [ ] `tarefas-md/11-wireframes.md` ou Figma (antes do primeiro fluxo de UI complexo)

---

## Fase 0 — Fundação

Bootstrap do monorepo e infra local.

- [x] Estrutura de pastas do monorepo (`apps/web`, `apps/api`, `packages/*`)
- [x] `package.json` raiz + `pnpm-workspace.yaml` + `turbo.json`
- [x] Configs compartilhadas (`packages/config-eslint`, `packages/config-tsconfig`)
- [x] `apps/api` — NestJS 11 com health check, logger Pino, config module, Prisma
- [x] `apps/web` — Next.js 15 App Router com Tailwind + tokens de design (07) + tema light/dark + toggle
- [x] `packages/contracts` — Zod schemas compartilhados (auth, users, organizations, roles com teto de rank)
- [x] `packages/ui` — base shadcn + wrappers KTask (Button, Card, Input, Dialog, Label, Badge)
- [x] `infra/docker-compose.yml` (Postgres 16 na porta **5433**, Redis 7, MinIO, Mailpit)
- [x] Prisma inicial com models `User`, `Organization`, `Membership`, `Invitation`, `Session`
- [x] Primeira migration + seed (Org "Kharis" + OWNER desenvolvimento@agenciakharis.com.br)
- [x] GitHub Actions CI: lint, typecheck, test, build
- [x] Husky + lint-staged
- [x] `.env.example` completo (raiz + apps/api + apps/web)
- [x] Dockerfile multi-stage pra App Runner
- [x] README dev com instruções completas
- [x] Validação live: `/healthz` e `/readyz` retornando 200 com DB check verde

## Fase 1 — MVP

Ver detalhes em `06-roadmap-mvp.md`.

### Auth ✅

- [x] Login e-mail/senha com argon2id
- [x] Refresh token httpOnly + rotação
- [x] Logout + logout all sessions
- [ ] Recuperação de senha por e-mail
- [x] Bloqueio após 10 tentativas — por IP via `@Throttle` (15min). Por-conta fica como follow-up (precisa contador no Redis ou DB).
- [x] Guards: JwtAuthGuard global, TenantGuard por controller, BoardAccessService
- [x] Testes unitários AuthService (12/12)
- [x] Validado live (login/refresh/logout, /me)

### Organização ✅

- [x] CRUD Organization (getCurrent, update)
- [x] Convite por e-mail (Invitation com token hash, 7d TTL)
- [x] Aceitar convite vinculado ao user autenticado
- [x] Gerenciar membros (listar, alterar papel com teto por rank, remover)
- [x] 13 testes unitários cobrindo regras de rank
- [x] Validado live

### Quadros / Listas / Cards ✅ core

- [x] Criar/listar/arquivar/restaurar quadro; 3 listas default
- [x] BoardMember ADMIN implícito pro criador
- [x] Visibility PRIVATE/ORGANIZATION
- [x] Listas com reordenação (move com afterListId)
- [x] Cards: criar rápido, editar, mover entre listas, arquivar/restaurar
- [x] Prioridade, dueDate, startDate, estimateMinutes
- [x] Descrição JSON (ProseMirror-ready, editor simples no MVP)
- [x] Atribuir/remover membros
- [x] Adicionar/remover labels
- [x] Labels CRUD — módulo `labels` (controller + service) + `LabelPicker` UI
- [x] Checklists CRUD (módulo `checklists` + `ChecklistBlock` UI)
- [x] Anexos com URL pré-assinada S3/MinIO (módulo `attachments` + `storage` com MinIO)
- [x] Capa de card — botão "Definir como capa" no `AttachmentRow` + banner no card-modal (capa no kanban fica como follow-up — requer relation Prisma)
- [x] Duplicar card (`DuplicateCardDialog` + `duplicateCard` service)
- [x] Activity log em todas operações (BOARD_CREATED, CARD_MOVED, etc)

### Web UI ⏳ em andamento

- [x] Tela de login com react-hook-form + Zod
- [x] Layout autenticado com Topbar (logo, theme toggle, avatar, logout)
- [x] RequireAuth client guard
- [x] Home dashboard (Org atual, papel, membros)
- [x] API client com auto-refresh 401
- [x] Zustand store pra session + TanStack Query
- [x] Lista de quadros (`apps/web/src/app/(app)/quadros/page.tsx`)
- [x] Tela do quadro (Kanban com dnd-kit) (`b/[boardId]/page.tsx` + `list-column.tsx` + `card-item.tsx`)
- [x] Cabeçalho do fluxo (avatars, privacidade, gear, menu) — ver `15-cabecalho-fluxo.md`
- [x] Modal de card (`card-modal.tsx` redesigned em 22 — Ummense-inspired)
- [x] Formulário de convite de membro (`configuracoes/membros/page.tsx`)
- [x] Tela de "aceitar convite" (`(auth)/convite/[token]/page.tsx`)

#### Prefigurados pendentes (UI presente, lógica em outra tarefa)

- [x] Busca por palavra no header do fluxo (filtro client-side por título)
- [x] Botão "Filtrar" no header do fluxo — popover com filtros avançados (entregue)

### Interação

- [x] Comentários com menções `@` (`MentionTextarea` + backend `resolveMentions`)
- [x] Notificações in-app (sininho com contador + lista) — `notifications-bell.tsx` + módulo `notifications`
- [x] Busca global (`Ctrl+K`) — `SearchHost` no layout
- [x] Activity log por card (30 últimas em GET /cards/:id)

### Real-time

- [x] Gateway Socket.IO com JWT no handshake (`realtime.gateway.ts`)
- [x] Canais `board:{id}`, `user:{id}` (auditar cobertura completa numa sessão dedicada)
- [x] Presença no quadro (avatares online com bolinha verde — commit 8984129)
- [x] Eventos: card.created/moved/updated, list._, comment._, notification.\* (auditar `events.types.ts` + emissões)
- [x] Reconexão com re-sync (invalidação completa em vez de delta — commit 368df58)

### Qualidade

- [ ] Cobertura de testes ≥ 60% backend
- [ ] Testes e2e (Playwright): F-01, F-03, F-04, F-08b
- [ ] Design tokens aplicados, light/dark funcional
- [ ] A11y passando em Axe em páginas principais
- [ ] Deploy staging automatizado

## Fase 2 — v1 (Automações + WhatsApp)

Ver `09-engine-automacoes.md` (engine geral) e `23-automacoes-coluna.md` (UX + catálogo de automações por coluna estilo Ummense).

- [ ] Schema `Automation`, `AutomationRun` (escopo LIST/BOARD/ORG)
- [ ] Engine core: dispatcher, worker, registry de handlers
- [ ] Template renderer (Mustache) + resolver de paths
- [ ] Anti-loop (chainDepth ≤ 5) + rate limit por Org
- [ ] UI: ícone de robô fixo no header da coluna + modal "Automações da coluna" com 3 tabs (Detalhes/Automações/Avançado)
- [ ] UI wizard 3 passos para criar automação (gatilho → ações → revisar)
- [ ] Biblioteca de receitas (10 templates pré-prontos)
- [ ] Log de execuções com retentar
- [ ] Integração Evolution API (CRUD Integration, teste de conexão)
- [ ] MessageTemplate + WhatsAppMessage

### Catálogo de automações por coluna (18 — ver `23-automacoes-coluna.md`)

**Fluxo (3)**

- [ ] Vincular a um novo fluxo (replica card em outro board)
- [ ] Desvincular do fluxo atual
- [ ] Atualizar posição no fluxo (sincroniza estado entre boards)

**Card (4)**

- [ ] Criar card filho (template configurável)
- [ ] Alterar status do card (Finalizado / Reativado / Privado)
- [ ] Inserir ou preencher campos personalizados
- [ ] Salvar versão da descrição (snapshot pra auditoria)

**Tags (2)**

- [ ] Inserir tags
- [ ] Remover tags

**Tarefas (2)**

- [ ] Inserir tarefas (itens de checklist a partir de template)
- [ ] Inserir grupo de tarefas (checklist completo de template salvo)

**Equipe (5)**

- [ ] Definir líder do card
- [ ] Adicionar equipe no card
- [ ] Publicar no feed do CONECTA → adaptar pra "criar comentário automático"
- [ ] Enviar WhatsApp (Evolution API)
- [ ] Configurar disparo de e-mail (SMTP/SES)

**Sinalizar (4)**

- [ ] Cards com marcos para hoje (badge/notificação)
- [ ] Cards com marcos atrasados
- [ ] Tempo excedido na coluna (X horas/dias parado)
- [ ] Tempo sem interação (relógio = última atividade no card)

### Triggers necessários

- [ ] `CARD_ENTERED` (default da maioria)
- [ ] `CARD_LEFT`
- [ ] `TIME_IN_LIST` (cron periódico)
- [ ] `TIME_NO_INTERACTION` (cron)
- [ ] `DUE_DATE_TODAY` (cron diário)
- [ ] `DUE_DATE_OVERDUE` (cron diário)

- [ ] Campos personalizados (tipos core: text, number, date, select, multiselect, email, phone, user)
- [ ] **Cards multi-fluxo** (`CardPresence` M:N) — placeholder visual da aba existe; ver [13-cards-multi-fluxo.md](13-cards-multi-fluxo.md)
- [x] **Família de cards** (pai/filho com UI completa) — `card-family-tab.tsx` + endpoints de family/parent; ver [17-familia-cards.md](17-familia-cards.md)
- [x] **Time tracking** (cronômetro de cards + entradas manuais + histórico) — módulo `time-tracking` + `timer-widget` + popover ver [18-time-tracking.md](18-time-tracking.md)
- [x] **Aprovações por cliente** (role REVIEWER + branching) — entregue 2026-04-26 (commits 383f7ac + 2668dcd + c900dd9); ver [14-aprovacoes-cliente.md](14-aprovacoes-cliente.md)
- [ ] **Contatos externos / CRM lite** (Contact + CardContact + agenda + bloco no card) — ver [19-contatos-externos.md](19-contatos-externos.md)
- [ ] **Identificador curto do card** (`Card.shortCode` por Org) — ver [24-shortcode-card.md](24-shortcode-card.md)
- [x] **Importer Ummense CSV** (V1: auto-resolve por nome) — entregue commits c16070d/61ad5f4; ver [16-importer-ummense.md](16-importer-ummense.md)
- [ ] **Importer Ummense V2: wizard com mapeamento manual** — 3 passos (arquivo+board / mapeamento de membros e colunas com fuzzy match e persistência / confirmação); ~10-12h; ver [28-importer-ummense-wizard.md](28-importer-ummense-wizard.md)
- [ ] **Lia: AI que ouve reunião e cria cards** (~78h v1) — ver [27-lia-meeting-ai.md](27-lia-meeting-ai.md)
- [-] Privacidade por card (4 níveis estilo Ummense) — parkado, ver [25-privacidade-card.md](25-privacidade-card.md)
- [-] Última interação social do card — parkado, ver [26-ultima-interacao.md](26-ultima-interacao.md)
- [ ] SLA por lista + alertas
- [~] Templates de checklist (entregue commit ae2af26); templates de quadro/card pendentes
- [ ] View Lista (tabela)
- [ ] API Tokens + endpoints REST documentados (OpenAPI)

## Fase 3 — v1.5 (Formulários + Views + Reports)

- [ ] Formulários públicos (slug, campos, submissão → card)
- [ ] Webhook de entrada (Evolution recebe mensagem → comentário/card)
- [ ] Webhooks de saída (configuráveis)
- [ ] View Calendário
- [ ] Dashboard por quadro (throughput, cycle time, SLA cumprido)
- [ ] Relatórios de time tracking
- [ ] Dry-run de automação
- [ ] Trigger `SCHEDULED` (cron)

---

## Operacional

- [ ] Provisionar AWS (ver seção 10 do doc 08)
- [ ] Vercel projeto criado + domínio custom
- [ ] Cloudflare DNS
- [ ] Sentry projetos (web + api + worker)
- [ ] GitHub Actions secrets
- [ ] Primeiro deploy manual em staging
- [ ] Primeiro deploy em produção
- [ ] Teste de restore de backup (após 30d)
- [ ] Runbook de incidente (quando atingir uso interno amplo)

---

## Workflow & colaboração com Claude

- [ ] **Migrar cron de retomada do Modo Independente da máquina local pra agente remoto na nuvem (Anthropic CCR + GitHub).** Hoje (2026-04-25) optei por cron local via Windows Task Scheduler porque não precisa `/web-setup` e usa `git` local que já está autenticado. Migrar quando: (a) precisar rodar Modo Independente com notebook desligado / em viagem, OU (b) ficar incômodo deixar a máquina ligada toda noite. Pré-requisito: rodar `/web-setup` no Claude Code e autorizar GitHub. Detalhes técnicos do protocolo no `feedback_modo_independente.md` (memória).

---

## Exclusão de fluxo (board) — doc 29

Hoje só tem `archive` (soft delete). Falta hard delete com opções pros
cards (deletar todos / desvincular / mover pra outro / deletar só
órfãos). Plano completo: [29-exclusao-de-fluxo.md](29-exclusao-de-fluxo.md).

- [x] Verificar invariantes de `CardPresence` no schema (card pode ficar sem presença?) — `Card.boardId` é NOT NULL, schema em transição multi-fluxo
- [x] Migration `BOARD_DELETED` no enum `ActivityType`
- [x] Endpoint GET `/v1/boards/:id/delete-preview` (contagens)
- [x] Endpoint POST `/v1/boards/:id/delete` — V1 com `archive-cascade` e `delete-all`
- [x] UI: `delete-board-dialog.tsx` com preview + confirmação por nome pro `delete-all`
- [ ] **V2:** estratégias `move` / `unlink` / `delete-orphans` (envolvem reassignment de `Card.boardId`)

---

## Drawer de fluxos arquivados — doc 30

Hoje não existe UI pra reativar fluxo arquivado (só endpoint solto). Plano
completo: [30-fluxos-arquivados-drawer.md](30-fluxos-arquivados-drawer.md).

- [ ] V1.1 doc 29: persistir `archivedCardIds` no payload da Activity `BOARD_ARCHIVED`
- [ ] Migration: adicionar `BOARD_RESTORED` no enum `ActivityType`
- [ ] Endpoint `GET /v1/boards/archived` (GESTOR+ via `ORG_ROLES_WITH_BOARD_BYPASS`)
- [ ] `POST /v1/boards/:id/restore` aceita `{ restoreCascadedCards?: boolean }` (default true) — restaura cards usando `archivedCardIds` do payload
- [ ] Frontend: `archived-boards-drawer.tsx` com lista, contagens, botão restaurar
- [ ] Frontend: botão "Arquivados (N)" no header de `/quadros`, só pra GESTOR+ e quando N > 0

---

## Importer multi-fluxo — doc 31

Cards já importados em outro board são silenciosamente pulados em vez de
ganharem `CardPresence` no novo board. Plano: [31-importer-multi-fluxo.md](31-importer-multi-fluxo.md).

- [x] `importCard` (legado): substituir skip por upsert de `CardPresence`
- [x] `importCardWithMapping` (wizard V2): mesma lógica + suporte ao `forceCompleted` na presence nova
- [x] `ImportReport` ganha `linkedToFlow: number` separado de `created`/`skipped`
- [x] Frontend wizard mostra `linkedToFlow` no relatório final

---

## Aprovação WhatsApp: card completo — doc 32

Página `/aprovar/[token]` mostrava só título + board + lista. Recipient
externo precisa ver tudo pra decidir. Plano: [32-aprovacao-card-completo.md](32-aprovacao-card-completo.md).

- [x] Backend `getPublicView()` retorna descrição, anexos (com URL pública), comentários, atividades, checklists, membros, líder, labels
- [x] Frontend `/aprovar/[token]` renderiza descrição (RichEditor read-only), seções colapsáveis (anexos, checklists, histórico)
- [x] Aviso de privacidade no doc: link expõe todo o conteúdo do card

---

## Automação WhatsApp: contato como destinatário — doc 33

Action `SEND_WHATSAPP` ganhou 2 novos modos: **Contato do card** (dinâmico,
fan-out pra todos os CardContact) e **Contato fixo** (Contact específico
do CRM). Plano: [33-automacao-whatsapp-contato.md](33-automacao-whatsapp-contato.md).

- [x] Frontend: 2 novos `ModeBtn` no `SendWhatsAppConfig`
- [x] Frontend: dropdown de `Contact` filtrado por phone válido
- [x] Frontend: variáveis scoped por modo (`{{contact.*}}` vs `{{recipient.*}}`)
- [x] Backend: `handleSendWhatsApp` lida com `useCardContacts` e `contactId`, sanitiza phone livre, fan-out + Activity de resumo
- [x] Card sem contatos vinculados: log "sem contatos" e não envia
- [x] Contato sem phone válido: registrado em `attempts[]` + Activity de resumo
- [ ] **V2 (backlog)**: 1 AutomationRun por contato (hoje 1 run com `attempts[]` no result)

---

## Cadastro via convite + mailer — doc 34

Convite estava quebrado: email não era enviado e link redirecionava pra
login pra usuário sem conta. Plano: [34-cadastro-via-convite.md](34-cadastro-via-convite.md).

- [x] Backend `previewByRawToken` retorna `userExists: boolean`
- [x] Backend `POST /v1/auth/signup-from-invite` (público, rate-limit 10/15min)
- [x] Backend `AuthService.signupFromInvite`: cria User+Membership+marca convite em transação, retorna tokens
- [x] Frontend `/convite/[token]` com form de cadastro inline quando `userExists=false`
- [x] **Mailer integrado**: `MailService` com nodemailer + SMTP da Kharis (mail.agenciakharis.com.br:465 SSL)
- [x] **Email automático**: `InvitationsService.create` dispara email com link tokenizado fire-and-forget (link copiável continua sendo fallback se SMTP cair)
- [x] Recuperação de senha por e-mail (decisão pendente do checklist) **— infra pronta**, falta endpoint/UI

---

## Convite por WhatsApp — doc 35

Approach A: campo telefone opcional no form de convite, dispara nos 2 canais.
Plano: [35-convite-whatsapp.md](35-convite-whatsapp.md).

- [x] Migration `Invitation.phone` (TEXT NULL)
- [x] Schema contracts: `InviteMemberRequestSchema` aceita `phone`
- [x] Backend: `InvitationsService` sanitiza phone, persiste, dispara WhatsApp em paralelo ao email (Promise.allSettled, fire-and-forget)
- [x] Mensagem WhatsApp inclui o e-mail do convite explicitamente
- [x] Frontend: campo "WhatsApp (opcional)" no form de convite

---

## Configuração condicional das automações — doc 26

Cada automação pode ter um filtro extra (AND-only) que precisa passar antes
da action rodar. Field/operator/value: tags (containsAny, notContainsAny,
containsAll, notContainsAll), priority (is/isNot/isAny/isNotAny), lead
(is/isNot/isAny/isSet/isNotSet), dueDate (overdue/dueToday/dueWithinDays/
dueAfterDays/hasDueDate/noDueDate). Plano:
[26-automacoes-condicional.md](26-automacoes-condicional.md).

- [x] Schema: `Automation.conditions Json?` + migration
- [x] Backend: `condition.types.ts` com `evaluateConditions()` (AND), 16 unit tests verdes
- [x] Backend: integração na engine — falha das condições registra `AutomationRun` SKIPPED com motivo
- [x] DTO Zod: `discriminatedUnion` por `field`, max 10 condições por automação
- [x] Frontend: `ConditionsBuilder` com seleção field/operator/value específicos
- [x] Frontend: integrado no `CreateAutomationForm` + persistência no PATCH/POST
- [x] Frontend: resumo da condição no `AutomationRow` (linha sutil com ícone Filter)

---

## Pra fazer com user acordado (decisões + acessos)

- [ ] **Subdomínio dev online (`dev.ktask.agenciakharis.com.br`)** — ambiente de teste online separado da prod. Envolve: DNS Cloudflare (registro A), Caddyfile na VM Hetzner, docker-compose.prod.yml estendido com containers de dev, banco `ktask_dev` separado, .env.dev, GitHub Actions workflow novo (deploy em push pra branch `dev`). Bate em SSH + Caddyfile prod + secrets — exige user acordado pra acompanhar. Estimativa: 2-3h dedicadas.
- [ ] **Recuperação de senha por e-mail** — precisa SMTP configurado (Mailpit em dev, SES ou SMTP real em prod). Decidir provedor antes.
- [x] **Bloqueio após 10 tentativas (IP + conta)** — IP via Throttle + conta via failedLoginCount/lockedUntil (commits 9294657)
- [ ] **Decisões pendentes do checklist** (2FA OWNER, política de senha, primeiro OWNER, Analytics, AWS region, Vercel plan, Sentry, WhatsApp Cloud API).

---

## Página inicial nova (visão pessoal — estilo Ummense)

Plano completo: [22-pagina-inicial.md](22-pagina-inicial.md). Etapas:

- [ ] **Etapa 1** — mover home atual pra `/empresa` (rota + menus)
- [ ] **Etapa 2** — migration `ChecklistItem` (dueDate, assigneeId, description) + endpoints `/me/tasks`, `/me/recent-cards`, `/me/calendar`
- [ ] **Etapa 3** — `HomePage` estática com layout 2 colunas + componentes acoplando nos endpoints
- [ ] **Etapa 4** — interações (atualizar todas pra hoje, adicionar inline, click → abre card pai)
- [ ] **Etapa 5** — `MiniCalendar` com pontos por dia
- [ ] **Etapa 6** — placeholder Eventos (Fase 2)
