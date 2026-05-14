---
title: Conceito geral de automações
description: Entenda gatilhos, condições e ações — os três blocos que formam uma automação.
category: automacoes
slug: conceito-geral
order: 1
tags: [automacao, trigger, gatilho, condicao, acao, conceito]
updatedAt: 2026-05-14
---

# Conceito geral de automações

> **Quem pode fazer**: Admin do quadro (para criar/editar). Qualquer membro vê o resultado.
> **Tempo estimado de leitura**: 5 minutos.

> **Esta funcionalidade está em evolução.** Se algum passo não bater com o que você vê na tela, fale com o suporte.

## O que é uma automação

Automação é uma regra do tipo **"quando X acontecer, faça Y"**. Você configura uma vez e o sistema repete sempre que a situação se repetir, sem alguém precisar lembrar.

Exemplos do dia a dia:

- Quando um card entra na coluna **Aprovação cliente**, envie um WhatsApp para o cliente com link de aprovação.
- Quando uma aprovação é **reprovada**, mova o card para **Refação** e crie um sub-card "ajustar" para o designer.
- Quando um card fica **mais de 3 dias** parado em **Produção**, comente avisando o líder.
- Quando o cliente **aprova**, mova o card para **Agendamento** e marque a coluna como concluída.

Automações reduzem trabalho manual repetitivo, evitam esquecimento e padronizam o fluxo entre cards.

## Os três blocos: gatilho, condição, ação

Toda automação tem três partes:

1. **Gatilho** (quando) — o evento que dispara a regra.
2. **Condição** (se) — filtros opcionais. Só dispara se o card encaixar.
3. **Ação** (faça) — o que o sistema faz quando o gatilho dispara e a condição passa.

A leitura é literal: **quando** o gatilho acontecer, **se** a condição for verdadeira, **faça** a ação.

### Gatilho

Os gatilhos disponíveis hoje:

- **Card entrou na coluna** — quando um card chega numa coluna específica.
- **Card saiu da coluna** — quando um card deixa uma coluna específica.
- **Tempo na coluna** — quando o card está há X tempo numa coluna.
- **Tempo sem interação** — quando o card está há X tempo sem comentários nem mudanças.
- **Prazo é hoje** — no dia do prazo do card.
- **Prazo atrasou** — quando o prazo passou e o card ainda não foi concluído.
- **Card aprovado** — quando uma aprovação termina com "aprovado".
- **Card reprovado** — quando uma aprovação termina com "pedir ajustes".
- **Item de checklist concluído** — quando um item específico é marcado.
- **Checklist concluído** — quando todos os itens de um checklist foram marcados.

### Condição

Condições filtram o gatilho. Por exemplo, "Card entrou na coluna **Aprovação**" pode disparar a ação **só** se o card tiver a etiqueta "Cliente Premium". Sem essa condição, dispararia para todos os cards.

Você pode combinar várias condições. Se um campo de condição estiver vazio, é como se aquele filtro não existisse.

### Ação

As ações disponíveis hoje:

- **Adicionar etiqueta** ao card.
- **Remover etiqueta** do card.
- **Adicionar itens de checklist** ao card.
- **Adicionar um grupo de checklist** (template) ao card.
- **Definir o líder** do card.
- **Adicionar membros à equipe** do card.
- **Postar comentário** automático na timeline.
- **Mudar o status** do card (Ativo / Concluído / Em espera / Cancelado).
- **Criar card filho** (sub-card) a partir de um template.
- **Mover/atualizar posição** do card no fluxo.
- **Enviar WhatsApp** (via Evolution API, com modelo de mensagem).
- **Definir privacidade** do card (público / só equipe).

Uma automação pode ter **mais de uma ação**, executadas em sequência.

## Como o gatilho conversa com a ação

Quando um card dispara a automação, ele entra como **contexto** para as ações. As ações sabem qual card foi, qual coluna, quem é o líder, qual é o cliente — e podem usar esses dados (por exemplo, o WhatsApp envia para o telefone que está no card).

Isso significa que uma automação não fica presa a um card específico. Você cria a regra uma vez no quadro e ela vale para **todos** os cards daquele quadro que cumprirem o gatilho + condição.

## Onde vivem as automações

Automações pertencem a um **quadro**. Ou seja, uma regra criada no quadro "Cliente Alfa" só funciona para os cards desse quadro. Se você quer a mesma regra em outro quadro, precisa recriar (não há "copiar automação" pronto na UI hoje).

## Ver execuções

Toda vez que uma automação roda, o sistema guarda um registro: qual card disparou, quais ações foram executadas, e se algo falhou. Você vê isso na seção **Execuções** ou **Histórico de automações** do quadro `[CONFIRMAR — nome exato e localização]`.

Em caso de falha (WhatsApp não enviou, por exemplo), o sistema tenta novamente até 3 vezes com intervalos crescentes antes de marcar como falhada definitivamente.

## Próximos passos

- [Criar a primeira automação](../automacoes/criar-primeira-automacao)

## Dúvidas comuns

**Posso desativar uma automação temporariamente sem deletar?**
Sim, cada automação tem um toggle ativo/inativo `[CONFIRMAR — toggle de status na UI]`.

**A automação roda para cards que já existem ou só para novos?**
Para eventos a partir do momento em que ela foi criada. Cards antigos só disparam se a condição se repetir depois.

**Quantas automações dá pra ter num quadro?**
Sem limite técnico. Na prática, mais de 15-20 vira difícil de manter. Se o quadro está muito automatizado, vale revisar regras parecidas que podem virar uma só.

**Duas automações com o mesmo gatilho — qual roda primeiro?**
Ambas rodam, em ordem indeterminada. Evite criar regras que se contradigam (uma adiciona uma etiqueta e a outra remove).

**Uma automação pode disparar outra?**
Sim. A ação de uma automação pode causar o gatilho de outra (cuidado com loops infinitos — o sistema tem proteção, mas o ideal é evitar).

---

Essa página foi útil? | [Falar com suporte](/ajuda/suporte)
