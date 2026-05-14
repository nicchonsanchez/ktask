---
title: Configurar colunas do quadro
description: Como criar, renomear, reordenar, marcar como inicial/final e arquivar colunas.
category: quadros
slug: configurar-colunas
order: 2
tags: [coluna, configuracao, kanban, lista]
updatedAt: 2026-05-14
---

# Configurar colunas do quadro

> **Quem pode fazer**: Admin do quadro (ou Dono/Administrador/Gestor da organização).
> **Tempo estimado**: 5 minutos.

## O que é uma coluna

Coluna é cada etapa do fluxo dentro de um quadro. Os cards andam da esquerda para a direita conforme avançam. Em quadros novos vêm 3 colunas padrão: **A Fazer**, **Fazendo** e **Concluído**.

Você ajusta isso ao gosto do seu time. Um quadro de redes sociais, por exemplo, pode ter: Briefing → Produção → Aprovação interna → Aprovação do cliente → Agendado → Publicado.

## Criar uma coluna nova

1. Abra o quadro.
2. Role até o fim das colunas existentes (lado direito).
3. Clique em **+ Adicionar coluna** `[CONFIRMAR — texto exato do botão]`.
4. Digite o nome e confirme.

A coluna aparece no fim do quadro. Para mover de lugar, veja [Reordenar colunas](#reordenar-colunas).

## Renomear uma coluna

Existem duas formas:

- **Duplo-clique no nome da coluna**: o nome vira um campo editável. Digite o novo nome e pressione Enter.
- **Botão de lápis ao lado do nome** `[CONFIRMAR — botão Pencil no list-column.tsx]`: clique, edite e confirme.

## Reordenar colunas

Cada coluna tem um pequeno ícone de **alça** (seis pontinhos verticais) no topo. Clique e arraste a coluna para a posição desejada. Os cards vão junto.

> **Dica**: a posição importa para automações que dependem de "coluna seguinte". Se você reorganizar muito o quadro depois de criar automações, confira se elas continuam fazendo sentido.

## Coluna inicial (Backlog) e final

No menu de cada coluna (três pontinhos no topo), há dois marcadores opcionais:

- **Backlog**: marca a coluna como "entrada" do fluxo. Visualmente fica separada das outras, à esquerda. Útil para colunas tipo "Caixa de entrada" ou "Sugestões".
- **Final / Finalizado**: marca a coluna como "saída". Cards nessa coluna costumam acionar automações de fechamento (mover para arquivo, notificar conclusão, etc).

Você pode ter mais de uma coluna marcada como final — por exemplo, "Publicado" e "Cancelado" ambos como saída.

## Arquivar uma coluna

Quando um etapa do fluxo deixa de ser usada, em vez de deletar, arquive — assim o histórico fica preservado.

1. Abra o menu da coluna (três pontinhos no topo).
2. Escolha **Arquivar**.
3. Se a coluna tiver cards, o sistema pergunta o que fazer:
   - **Mover cards para outra coluna**: você escolhe o destino.
   - **Arquivar a coluna junto com os cards**: cards somem da visão ativa mas continuam no banco.

A coluna some do quadro mas continua acessível em "Colunas arquivadas" `[CONFIRMAR — existe lista de arquivadas na UI?]`. Você pode restaurar depois.

## Recomendações de organização

- **Nomes curtos**: "Produção" funciona melhor que "Em produção pela equipe interna".
- **Não exagere no número de colunas**: 4 a 7 colunas é o ideal. Mais que isso o quadro fica difícil de ler no celular.
- **Marque a coluna final**: ajuda relatórios e automações a saberem o que é "concluído".
- **Padronize entre quadros do mesmo tipo**: se vários quadros são de "Redes Sociais", use os mesmos nomes de coluna. Facilita treinar pessoas novas.

## Próximos passos

- [Criar um card](../cards/criar-card)
- [Mover e arrastar cards](../cards/mover-arrastar)
- [Criar a primeira automação](../automacoes/criar-primeira-automacao)

## Dúvidas comuns

**Posso ter coluna sem nenhum card?**
Sim, sem problema.

**Quanto cards cabem por coluna?**
Não há limite técnico, mas acima de 50 cards na mesma coluna a navegação fica pesada. Considere arquivar cards antigos ou dividir em mais colunas.

**Apaguei uma coluna importante por engano. Recupero?**
Se foi arquivada, restaure pela lista de arquivadas. Se foi deletada definitivamente, peça ajuda ao suporte.

**Posso copiar uma coluna inteira para outro quadro?**
Ainda não há essa opção pronta na UI `[CONFIRMAR — feature em roadmap?]`. Por enquanto, recrie manualmente.

**A ordem das colunas afeta automações?**
Sim, indiretamente — automações que usam "movido para a próxima coluna" dependem da ordem atual. Se você reordenar muito, revise as automações afetadas.

---

Essa página foi útil? | [Falar com suporte](/ajuda/suporte)
