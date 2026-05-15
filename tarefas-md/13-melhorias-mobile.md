# Melhorias mobile nas páginas principais

> Auditoria UX/UI mobile (320–428px) rendeu 12 problemas. Este plano cobre os 8 aprovados imediatamente + 2 grandes (kanban + modal de card) aguardando decisão do Nicchon.

## Escopo

### Dentro (8 fixes diretos)

1. **Página pública `/aprovar/[token]`** — badges/avatares espremidos, anexos `size-12` estouram. **Crítico** (cliente externo, 99% mobile).
2. **Timesheet table** ([apps/web/src/components/time-tracking/timesheet-table.tsx](apps/web/src/components/time-tracking/timesheet-table.tsx)) — 9 colunas, scroll horizontal agressivo. Transformar em card layout no mobile. **Crítico**.
3. **Topbar** ([apps/web/src/components/topbar.tsx](apps/web/src/components/topbar.tsx)) — 5 ícones lado a lado em 320px (Search, Timer, Sino, Theme, User). Colapsar Theme + Timer dentro de menu hambúrguer/drawer existente; manter visíveis: Search, Sino, Avatar do user.
4. **Home `/`** — MiniCalendar some pra baixo no mobile. Mover pra cima (ou drawer).
5. **Drawer da topbar mobile** — adicionar `max-h-[calc(100vh-52px)]` + `overflow-y-auto` pra não cobrir conteúdo / teclado virtual.
6. **Header do board** ([apps/web/src/components/board/board-header.tsx](apps/web/src/components/board/board-header.tsx)) — nome + tabs + avatars + menu se espremem. `flex-col` no mobile.
7. **Página /aprovacoes** ([apps/web/src/app/(app)/aprovacoes/page.tsx](<apps/web/src/app/(app)/aprovacoes/page.tsx>)) — botões da row quebram em 2-3 linhas. Usar `flex-col sm:flex-row` + `w-full sm:w-auto`.
8. **Container do app** — garantir `px-4 sm:px-6` explícito onde fizer diferença (verificar Tailwind config + componentes que não usam `container`).

### Fora (aguardando decisão do Nicchon)

- **Kanban scroll horizontal** ([apps/web/src/app/(app)/b/[boardId]/page.tsx](apps/web/src/app/%28app%29/b/%5BboardId%5D/page.tsx)) — opções: (a) carousel com snap, (b) lista vertical agrupada, (c) manter mas otimizar. Recomendado: **(a)**. Custo: 3-4h.
- **Modal de card** ([apps/web/src/components/board/card-modal.tsx](apps/web/src/components/board/card-modal.tsx)) — opções: (a) sticky header/footer, (b) drawer mobile, (c) abas. Recomendado: **(a) + (c)**. Custo: ~3h.

## Etapas

Ordem de execução (do impacto maior → menor):

1. `/aprovar/[token]` mobile (cliente externo)
2. Timesheet card layout
3. Topbar reduzir ícones
4. Home: MiniCalendar primeiro
5. Drawer max-h
6. Header do board flex-col
7. /aprovacoes botões
8. Container padding

Cada etapa: 1 commit pequeno. Após todos, 1 push.

## Critérios de aceite

- [ ] Página pública abre em 360px sem scroll horizontal e sem badges cortados.
- [ ] Timesheet mostra lista de cards (não table) em <640px; tabela em ≥640px.
- [ ] Topbar mobile mostra ≤3 ícones na linha principal; o resto entra no drawer.
- [ ] Home mobile: MiniCalendar visível **antes** de scrollar.
- [ ] Drawer não cobre teclado nem header.
- [ ] Board header empilha em <640px.
- [ ] /aprovacoes botões não se sobrepõem nem quebram em 3+ linhas.
- [ ] Typecheck + lint verdes.

## Riscos / decisões

- **Breakpoint padrão**: usar `sm:` (640px) como divisor mobile/tablet. Consistente com o resto do projeto.
- **Timesheet card layout** muda a forma da página; reutilizar dados de `useQuery(timeTrackingQueries.timesheet)` direto, sem refazer.
- **Topbar reduzir ícones**: não remover funcionalidade — só mover Theme/Timer pra drawer/menu. Search permanece visível porque é alto uso.
- **Container `px-4 sm:px-6`**: cuidar pra não duplicar com `container` do Tailwind (que já tem padding default). Verificar antes.

## Follow-ups (kanban + card-modal)

Aguardando confirmação do Nicchon nos 2 itens grandes. Quando decidir, abrir tarefa separada com plano detalhado.
