---
title: O que é a Visão Gerencial
description: Tela consolidada para gestores acompanharem cards de todos os quadros num único painel, sem precisar simular conta de outro colaborador.
category: visao-gerencial
slug: introducao
order: 1
tags: [gestor, dashboard, consolidado, filtros, auditoria]
faqLink: 'Como ver tudo que está atrasado na agência?'
updatedAt: 2026-05-15
---

# O que é a Visão Gerencial

> **Quem pode acessar**: usuários com papel **Owner**, **Admin** ou **Gestor** na organização. Demais perfis não veem o link no menu.

## Para que serve

A Visão Gerencial resolve uma dor real de quem coordena equipes no KTask: **ver tudo que está rolando em todos os quadros, sem precisar entrar quadro a quadro nem "simular" a conta de outra pessoa**.

Antes dessa tela, um gestor precisava:

1. Entrar em cada quadro de cliente individualmente.
2. Lembrar de cabeça quem é responsável por quê.
3. Pra acompanhar o que um colaborador específico está fazendo, abrir a sessão como ele (o que não é seguro nem escalável).

Agora você abre **uma tela só** e vê:

- Todos os cards ativos dos quadros aos quais você tem acesso.
- Quem é o responsável de cada um.
- Quando vence cada prazo (com destaque visual pros atrasados).
- A qual cliente cada card pertence.
- Em qual quadro o card está.

## Como acessar

No menu superior, clique em **Visão Gerencial**. Se o link não aparece pra você, é porque seu papel na organização não é gerencial — fale com um admin se precisa do acesso.

## O que a tela mostra

### Métricas no topo

Quatro contadores dinâmicos que **refletem os filtros aplicados**:

- **Cards visíveis** — total que cabem nos filtros atuais.
- **Atrasados** — cards com prazo vencido e não concluídos. Destaque vermelho quando há algum.
- **Colaboradores** — usuários únicos que aparecem como líder ou membro nos cards filtrados.
- **Clientes** — empresas únicas vinculadas aos cards.

### Filtros (combinam em AND)

Os filtros se acumulam — quanto mais você marca, mais específico fica o resultado:

- **Buscar** — texto livre no título do card.
- **Cliente** — multiselect das empresas cadastradas no CRM.
- **Responsável** — multiselect dos membros da Org. Pega cards onde a pessoa é **líder** ou está como **membro**.
- **Quadro** — multiselect dos quadros que você acessa.
- **Prazo** — Atrasados / Vence hoje / Próximos 7 dias / Sem data.

Botão **Limpar** zera tudo de uma vez.

### Tabela de cards

Cada linha mostra:

- **Título** — clique pra abrir o card-modal normal (mesma tela que você usa nos quadros).
- **Cliente** — chip roxo com nome da empresa. Cards sem cliente mostram "—".
- **Responsável** — avatar do líder + membros (até 4 visíveis, overflow `+N`).
- **Prazo** — data formatada. **Vermelho com borda lateral** se atrasado.
- **Coluna** — em qual lista do quadro o card está.
- **Quadro** — chip colorido com nome do quadro de origem.

Quando um card está em **vários fluxos** (multi-fluxo), aparece um discreto "+N fluxos" do lado do título.

## Cards arquivados

Cards arquivados **não aparecem** na visão principal — pra não poluir o painel com trabalho antigo. Pra revisar arquivados, clique em **Arquivados** no canto superior direito.

A tela de arquivados tem layout parecido com a tabela principal, mais um filtro de período (últimos 7/30/90 dias / qualquer período).

## Privacidade

A Visão Gerencial respeita o sistema de privacidade do KTask:

- **Cards públicos** (`PUBLIC`) aparecem normalmente pra qualquer gestor que tenha acesso ao quadro.
- **Cards privados** (`TEAM_ONLY`) só aparecem se o gestor é **líder** ou está na **equipe** do card — mesma regra que vale em qualquer outra tela.

Owner e Admin têm bypass de privacidade no KTask em geral, então veem todos os cards independente da configuração.

## Visualizado por

Dentro de cada card, no modal, agora existe um bloco **Visualizado por** que mostra avatares de quem já abriu o card pelo menos uma vez. Não é vigilância — é só um indicador discreto de "alguém já olhou isso?". Sem contagem de vezes, sem notificação, sem ranking. Borda colorida nos avatares indica papel: azul (líder), verde (membro), cinza (outro).

## O que NÃO está aqui (por enquanto)

- **Kanban com colunas** — está em discussão como configurar colunas unificadas que façam sentido entre clientes muito diferentes. Quando definirmos, vira um toggle.
- **Campo "Prioridade Alta/Média/Baixa"** — KTask usa cores decorativas (`cor do card`) e etiquetas em vez de prioridade fixa. Vamos avaliar com base no uso real se faz falta.
- **Export pra CSV/PDF** — virá num próximo passo se houver demanda.

## Performance

A tela carrega ~1.300 cards em menos de 2 segundos. Filtros são aplicados no servidor (não no navegador) então não há lag mesmo com volume.

## Quando usar

- **De manhã** — abrir a Visão Gerencial filtrando "Atrasados" pra cuidar do que está estourado antes de qualquer coisa.
- **Reuniões 1:1** — filtrar por responsável pra ver tudo da pessoa antes da conversa.
- **Acompanhar um cliente específico** — filtrar pelo cliente pra ver todos os cards relacionados (em todos os quadros) sem trocar de quadro.
- **Triagem semanal** — ver o que vence "Próximos 7 dias" pra distribuir esforço.
