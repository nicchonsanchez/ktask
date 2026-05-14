---
title: Sub-cards e família
description: Como dividir um card em sub-tarefas, criar sub-cards do zero ou vincular cards existentes como filhos.
category: cards
slug: sub-cards-familia
order: 4
tags: [card, sub-card, familia, hierarquia, subtask]
updatedAt: 2026-05-14
---

# Sub-cards e família

> **Quem pode fazer**: Admin do quadro ou Editor.
> **Tempo estimado**: 3 minutos.

## O que é um sub-card

Sub-card é um card "filho" de outro card. Você usa para **dividir uma tarefa maior em pedaços menores** mantendo a relação visível entre eles. O card pai funciona como uma capa que reúne os filhos.

Exemplo prático — um post para redes sociais:

- **Card pai**: "Post Instagram — Dia das Mães — promoção" (na coluna "Produção")
  - **Sub-card 1**: "Roteiro da copy"
  - **Sub-card 2**: "Arte versão A"
  - **Sub-card 3**: "Arte versão B"
  - **Sub-card 4**: "Aprovação cliente"

Cada sub-card pode estar numa coluna diferente, ter responsável diferente, prazo diferente. Mas, ao abrir qualquer um deles, você vê a **família** completa e navega entre pai, irmãos e filhos.

## Quando faz sentido usar

- **Tarefa com etapas paralelas**: várias coisas podem acontecer ao mesmo tempo (copy + arte + vídeo de um mesmo post).
- **Demanda grande que precisa ser dividida** entre pessoas diferentes.
- **Acompanhar entregáveis distintos** com prazos próprios mas que se reportam a um conjunto.

Quando **não** usar:

- Para listas pequenas tipo "fazer A, B, C" — use **checklist** dentro do mesmo card, mais leve.
- Para tarefas sequenciais simples ("primeiro X, depois Y") — mover entre colunas já resolve.

## Criar um sub-card do zero

1. Abra o card que será o pai.
2. Vá para a aba **Família** `[CONFIRMAR — nome exato da aba no card-family-tab.tsx]`.
3. Clique em **Criar card filho**.
4. Aparece um modal com opções de copiar do pai:
   - **Descrição** — herda a descrição do pai (útil quando o filho compartilha contexto).
   - **Líder** — atribui automaticamente o mesmo líder.
   - **Equipe** — copia os membros.
   - **Etiquetas** — copia as tags.
   - **Data / Prazo** — copia o prazo do pai.
   - **Anexos** — copia os arquivos do pai para o filho.
5. Defina o **título** do filho.
6. Escolha a **coluna** onde o filho vai nascer (pode ser diferente da coluna do pai).
7. Clique em **Criar**.

O sub-card aparece imediatamente na coluna escolhida e fica vinculado ao pai como filho.

## Vincular um card existente como filho

Quando o card que vira filho já existe no quadro:

1. Abra o card que será o pai.
2. Vá para a aba **Família**.
3. Clique em **Tornar filho de...** ou **Vincular card existente** `[CONFIRMAR — texto exato do botão]`.
4. Busque o card existente pelo título ou código.
5. Confirme.

O card escolhido passa a ser filho deste, mantendo todos os outros dados (responsável, prazo, comentários).

> **Atenção**: um card só tem **um pai por vez**. Se você vincular um card que já era filho de outro, o vínculo antigo é substituído.

## Navegar pela família

Na aba **Família** do card aberto, você vê:

- **Pai** (se houver) — no topo, com link clicável.
- **Irmãos** (outros filhos do mesmo pai) — listados.
- **Filhos** — listados em árvore, com indentação. Se um filho também tem filhos (netos), eles aparecem mais indentados.

Clique em qualquer item da árvore para abrir aquele card. A árvore continua visível depois — você pode pular de um membro da família para outro sem perder o contexto.

## Diferença entre "Criar sub-card" e "Vincular existente"

| Cenário                                            | Use                                                                                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| O sub-card ainda não existe                        | **Criar card filho** — você define título e o que herdar                                                                      |
| O card já existe no quadro e você quer reorganizar | **Vincular como filho** — preserva tudo, só ajusta a relação                                                                  |
| Você quer várias cópias do mesmo template          | **Criar card filho** marcando todos os checkboxes de cópia                                                                    |
| O sub-card vai para outro quadro                   | Crie nele lá primeiro e depois vincule como filho (entre quadros: vincular existente) `[CONFIRMAR — funciona entre quadros?]` |

## Desfazer a relação

Para tirar um filho da família sem deletar:

1. Abra o card filho.
2. Na aba **Família**, encontre o pai listado no topo.
3. Clique em **Remover vínculo** ou similar `[CONFIRMAR — opção exata]`.

O card volta a ser independente. O pai não some — só não mostra mais esse filho.

## Próximos passos

- [Anexos e comentários](../cards/anexos-comentarios)
- [Pedir aprovação do cliente](../aprovacoes/pedir-aprovacao-cliente)

## Dúvidas comuns

**Quantos níveis de família dá pra criar?**
Sem limite. Você pode ter pai → filho → neto → bisneto. Na prática, dois níveis (pai + filhos) cobre quase tudo. Três níveis fica difícil de acompanhar.

**Apagar o pai apaga os filhos?**
Não. Os filhos ficam soltos (sem pai) e continuam funcionando. Você pode vincular a outro pai depois.

**Posso ter o mesmo card como filho de dois pais?**
Não. Cada card tem no máximo um pai por vez.

**Os sub-cards aparecem no card pai como checklist?**
Não. Checklist é uma lista interna ao card. Sub-card é um card independente, com modal próprio, comentários próprios, fluxo próprio. Os sub-cards aparecem na aba **Família** do pai.

**Posso ver todos os cards de uma família num só relatório?**
Hoje, abrindo qualquer membro da família a aba mostra a árvore completa. Não há relatório dedicado "todos os descendentes deste card" pela UI `[CONFIRMAR — feature em roadmap?]`.

---

Essa página foi útil? | [Falar com suporte](/ajuda/suporte)
