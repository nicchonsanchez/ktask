# 26 — Última interação social do card (parkado)

> **Status:** PARKADO (2026-04-27). Pode ser derivado do `Activity` log
> on-demand sem campo dedicado. Doc captura a discussão.

## Motivação

Ummense expõe "Última interação" no card que é DIFERENTE de `updatedAt`:

- `updatedAt` é qualquer modificação no row (auto-set pelo Prisma)
- "Última interação" é semântica social: alguém comentou, mudou status,
  completou tarefa, mexeu em anexo. Não conta auto-saves técnicos

Caso de uso:

- Filtro "cards parados há 7 dias" sem pegar cards que tiveram só ajuste de prioridade
- Indicador de "card frio" pra alertas
- Coluna em listagens de timesheet

## Por que parkar

1. Já temos `Card.enteredListAt` (mudança de coluna) e o `Activity` log inteiro
2. Pra filtro "parado há X dias", basta query `Activity` agrupada por cardId com `MAX(createdAt) WHERE type IN (CARD_UPDATED, COMMENT_ADDED, ...) < now - 7d`
3. Sem dor concreta — o filtro do header ainda não tem essa opção, mas pode entrar quando precisar
4. Adicionar campo dedicado significa atualizar em N pontos do código (cada vez que cria comment, completa item, etc) — manutenção alta

## Quando reabrir

- Indicador de "card frio" virar prioridade real
- Filtro "parado há X dias" do header for solicitado pela equipe
- Performance da query agregada via Activity virar gargalo (acima de 10k cards/org)

## Estimativa quando rodar

~2-3h:

- Schema: `Card.lastInteractionAt DateTime @default(now())`
- Hooks em CommentService.create, ChecklistItemService.toggle, etc, atualizando o campo (lista de eventos: ~10 ações)
- Filtro no header `cards parados há X dias`
- Coluna no timesheet (doc 18)
