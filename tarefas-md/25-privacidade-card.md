# 25 — Privacidade por card (parkado)

> **Status:** PARKADO (2026-04-27). Doc captura a discussão pra retomar
> sem redescobrir. Decisão: não fazer agora — boards já cobrem 90% dos
> casos e não tem dor concreta no uso interno.

## Motivação

Ummense suporta níveis de visibilidade POR CARD além do board:

- `public` — todos do board veem
- `private-team-edit` — só Líder + Equipe veem e editam
- `private-team-view` — só Líder + Equipe veem; ninguém edita exceto líder
- `private-only-lead` — só o Líder vê

CSV exportado preserva esse campo (col 8 do exporter).

## Por que parkar

1. Em equipe interna pequena (5-10 pessoas), 90% dos cards são públicos
2. Quando há sensibilidade, quase sempre o board inteiro é privado já — granularidade por card é raramente útil
3. Adiciona complexidade significativa em queries (todo `findMany` de cards precisa filtrar por privacidade do user atual)
4. Sem caso de uso concreto reportado pela equipe Kharis

## Quando reabrir

- Aparecer um caso real ("essa tarefa de RH é confidencial pro líder")
- KTask virar SaaS com clientes em equipes mistas
- Importer Ummense (doc 16) começar a perder dados sensíveis nessa coluna que façam diferença

## Estimativa quando rodar

~4-6h:

- Schema: `Card.privacy enum (PUBLIC, TEAM_EDIT, TEAM_VIEW, LEAD_ONLY)`
- Filtro em todos os endpoints de listagem (boards, cards, search, indicadores)
- UI: ícone de cadeado no card-mini quando não-public; seletor no modal
- Activity entry quando muda privacidade
