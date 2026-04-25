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

2026-04-25T20:41 — Ativação. Foco: nova página inicial (etapas 1-6 da [22-pagina-inicial.md](22-pagina-inicial.md)). Modelo de retomada: cron LOCAL (Windows Task Scheduler).
