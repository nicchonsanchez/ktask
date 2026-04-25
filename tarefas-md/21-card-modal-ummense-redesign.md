# Card Modal — redesign inspirado no Ummense mobile

## Escopo

Aplicar 6 padroes visuais do Ummense mobile (prints em `tarefas-md/img/WhatsApp Image 2026-04-25 at 15.*.jpeg`) ao popup de detalhe de card (`apps/web/src/components/board/card-modal.tsx`).

### Dentro do escopo

- Header com titulo grande + pill do codigo do card + acoes enxutas
- Substituir sidebar vertical de abas (`CardSidebarTabs`, 72px) por tabs horizontais com underline e overflow-x
- Linha unica "Equipe" estilo Ummense (label + LeadPicker como coroa + avatares stacked + `+` + cadeado)
- Refinar linhas de propriedade (Descricao/Tags/Anexos): placeholder mais convidativo, divisores sutis, sem cards pesados
- FAB radial preparado na area de timesheet (registro manual + time tracking) — botoes ainda disabled enquanto feature nao chega
- Limpeza visual: divisores `border-border/40`, mais respiro vertical, accent azul (primary) so em ativos/CTAs

### Fora do escopo

- Implementar a feature de Timesheet em si (continua placeholder)
- Implementar Conecta / Campos personalizados / U-drive — sao tabs do Ummense que nao temos
- Trocar o componente Dialog do Radix
- Mexer em RichEditor / TimelineFeed por dentro

## Etapas

1. Header: pill do codigo (#`shortCode` ou id formatado) abaixo do titulo, titulo `text-2xl sm:text-3xl`, eyebrow some
2. Tabs horizontais: novo componente `CardTabsBar` (substitui `CardSidebarTabs` no layout principal); underline na ativa, scroll-x; deletar arquivo antigo
3. MembersInline: simplificar — `Equipe` label + LeadPicker visual (anel azul + coroa quando ha lead) + avatares + `+` + cadeado, tudo em uma linha
4. Blocks: reduzir peso — heading sem caps/uppercase, padding maior, divisores `border-border/40` separando blocks ao inves de gap+heading
5. FAB radial: criar `TimesheetFab` (placeholder dentro de uma nova area) com botoes "Registro manual" e "Time tracking" disabled
6. Visual: globais — reduzir bordas, espacar respiro, ajustar status badge no header

## Criterios de aceite

- [ ] Modal abre em mobile e desktop sem overflow horizontal
- [ ] Titulo do card domina visualmente; codigo do card aparece como pill abaixo
- [ ] Tabs horizontais navegam entre Inicio/Fluxos/Familia (Arquivos/Calendario continuam em breve)
- [ ] Linha de Equipe ocupa uma so linha quando cabe; quebra natural em mobile
- [ ] Sem regressoes em LeadPicker, TeamPicker, RichEditor, ChecklistBlock, AttachmentsBlock, TimelineFeed
- [ ] Nenhum emoji na UI

## Riscos / decisoes

- **Tabs horizontais em desktop tambem?** Sim. Linear/Asana usam tabs horizontais em modais grandes; mantem consistencia com mobile e libera 72px de largura util
- **Codigo do card**: nao temos `shortCode` no schema. Usar `card.id.slice(-8).toUpperCase()` por enquanto — ja vem como id curto do Prisma. Se quiser formato Ummense (`20260425000378`), adicionar campo depois
- **CardSidebarTabs deletado**: arquivo nao tem outros consumidores
- **FAB radial**: vai dentro de uma area Timesheet placeholder porque nao temos a tab ainda; deixa preparado
