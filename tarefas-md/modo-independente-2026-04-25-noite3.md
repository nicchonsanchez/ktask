# Modo Independente — 2026-04-25 (noite 3)

## Projeto

- **Nome:** ktask
- **Path:** `c:\xampp\htdocs\Kharis\sistema-gestao-de-tarefas`
- **Repo:** kharis-edu/gestao-de-tarefas
- **Branch:** main (push direto autorizado)
- **Stack:** Next.js 15 + NestJS 11 + Prisma 6 + Postgres 16 + Redis + BullMQ + Socket.IO + Tiptap + dnd-kit
- **Deploy:** GitHub Actions → Hetzner (ktask.agenciakharis.com.br)

## Escopo da noite

Resposta às 6 perguntas-âncora:

1. **Foco:** itens `[ ]` do `tarefas-md/checklist.md`, priorizando **uso interno** (Billing/landing parkados); **nova página inicial estilo Ummense** ([22-pagina-inicial.md](22-pagina-inicial.md)) é a tarefa principal solicitada.
2. **Push direto na main:** sim, com tag `[modo-independente]` em cada commit.
3. **Algo proibido só nesta noite:** nada específico além da denylist universal+projeto.
4. **Onde aviso se travar:** este state file + commits + WhatsApp (`5531993767301`) via Evolution API.
5. **Última vez que usou Claude:** sessão contínua (sem reset da janela rolante).
6. **Pivotagem em bloqueio:** sim, qualquer item `[ ]` do checklist (escopo amplo "uso interno").

## Plano hierárquico

1. Auditar `tarefas-md/checklist.md` — marcar `[x]` no que claramente já está pronto
2. Adicionar entradas no checklist:
   - Subdomínio `dev.ktask.agenciakharis.com.br` (lembrete pra fazer com user acordado)
   - Página inicial nova (etapas 1-6 do `22-pagina-inicial.md`)
3. **Etapa 1 da home:** mover home atual pra `/empresa` (rota + menus)
4. **Etapa 2 da home:** migration `ChecklistItem` (dueDate, assigneeId, description) + endpoints `/me/tasks`, `/me/recent-cards`, `/me/calendar`
5. **Etapa 3 da home:** `HomePage` estática + componentes acoplando nos endpoints
6. **Etapa 4 da home:** interações (atualizar todas pra hoje, adicionar inline, click → abre card pai)
7. **Etapa 5 da home:** `MiniCalendar` com pontos por dia
8. **Etapa 6 da home:** placeholder Eventos (Fase 2)
9. **Backlog se sobrar tempo:** Labels CRUD completo · Capa de card · Bloqueio 10 tentativas · Notificações in-app · Placeholders "Buscar/Filtrar" no header

## Pulos declarados

- Recuperação de senha por e-mail (precisa SMTP configurado — perguntar amanhã)
- Real-time Socket.IO (feature inteira merece sessão própria — frente grande)
- Eventos da home (Fase 2 — placeholder visual só)
- Implantar `dev.ktask...` online (precisa do user acordado pra DNS/SSH/secrets)

## Log

2026-04-25T20:41 — Ativação. Foco: nova página inicial (etapas 1-6 da [22-pagina-inicial.md](22-pagina-inicial.md)). Modelo de retomada: cron LOCAL (Windows Task Scheduler) — porém o registry script foi bloqueado por política, sigo SEM auto-retomada.

2026-04-25T20:50 — Auditoria do checklist concluída e lembretes adicionados (commit `abd2f60`). 11 itens marcados [x] (modal, kanban, anexos, family, time tracking, real-time gateway, etc.).

2026-04-25T20:55 — Etapa 1 da home concluída (commit `8eb4c1a`): /empresa criada com view atual; nav atualizada. /page.tsx continua igual até etapa 3 substituir.

2026-04-25T20:55 — Próximo: Etapa 2 — schema (ChecklistItem + dueDate + assigneeId + description) e endpoints /me/tasks /me/recent-cards /me/calendar.

2026-04-25T21:25 — Etapa 2 (backend) concluída (commit `0611d95`). Migration adiciona FK ChecklistItem.assignee/doneBy, index composto e nova tabela CardVisit. Módulo `me` com 4 endpoints. Hook fire-and-forget no GET /cards/:id pra alimentar visitas. ChecklistItem.dueDate/assigneeId já existiam no schema desde a migration inicial — descoberta agradável. Não criei coluna `description`: `text` já cobre o nome curto e descrição rica vai no card pai. Bate com escopo Ummense.

2026-04-25T21:50 — Etapa 3 (frontend) concluída (commit `a4220ac`). HomePage, TarefasPanel (4 seções com colapsar + barra de progresso + atalho "atualizar todas"), TarefaRow (toggle otimista, formatador de prazo BRT), CardsRecentesCarousel (scroll-x com setas dinâmicas), MiniCalendar (grid 6 semanas + pontos por dia), EventosPanel (placeholder Fase 2). Topbar atualizada na etapa 1. Tipos consistentes entre lib/queries/me.ts e backend.

2026-04-25T21:50 — Próximo: validar deploy. Se subir, etapa 4 (interações de adicionar tarefa inline + filtro do MiniCalendar) e backlog. Pipeline rodando agora.
