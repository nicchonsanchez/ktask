---
title: Mover e arrastar cards
description: Como mover cards entre colunas pelo mouse, pelo teclado ou pelo toque no celular.
category: cards
slug: mover-arrastar
order: 2
tags: [card, mover, drag, drop, teclado, mobile]
updatedAt: 2026-05-14
---

# Mover e arrastar cards

> **Quem pode fazer**: Admin do quadro ou Editor.
> **Tempo estimado**: 1 minuto para aprender.

## Por que mover um card

O fluxo do trabalho é representado pelas colunas. Quando uma tarefa avança de etapa (do briefing para a produção, da produção para a aprovação), você arrasta o card para a próxima coluna. Mover o card também pode disparar **automações** que a equipe configurou — por exemplo, atribuir um responsável, enviar uma mensagem ou criar um checklist.

> **Atenção (clientes externos)**: se você é cliente da Kharis recebendo um link de aprovação, **não precisa mover cards**. Quando você clica em Aprovar ou Reprovar, uma automação move o card sozinha para a próxima etapa. Veja [Link público para o cliente](../aprovacoes/link-publico-cliente).

## Arrastar com o mouse (desktop)

1. Posicione o cursor sobre o card.
2. Pressione o botão do mouse e mantenha pressionado.
3. Arraste o card para a coluna desejada, na posição desejada.
4. Solte o botão.

O card aparece imediatamente no novo lugar — sem precisar recarregar. Outras pessoas conectadas no mesmo quadro veem o movimento em tempo real.

> **Calibração do clique**: o arrasto só dispara depois de o cursor andar **6 pixels** com o botão pressionado. Isso evita arrastar sem querer ao clicar para abrir o card. Se você só quer abrir, o clique normal continua funcionando.

## Mover entre posições na mesma coluna

Funciona igual: arraste o card para cima ou para baixo dentro da coluna. A posição é guardada — quando você recarregar o quadro, o card continua onde você deixou.

A ordem dos cards numa coluna não tem regra do sistema. Use como seu time preferir (mais urgente em cima, mais antigos embaixo, ordem alfabética, etc).

## Mover pelo teclado (acessibilidade)

Para quem prefere não usar o mouse, o KTask aceita movimento por teclado:

1. **Tab** até chegar ao card que você quer mover.
2. Pressione **Espaço** para "pegar" o card.
3. Use as **setas** (esquerda/direita/cima/baixo) para mover entre colunas e posições.
4. **Espaço** novamente para "soltar" o card no destino.
5. **Esc** cancela o movimento.

`[CONFIRMAR — Nicchon: validar combinações de tecla exatas, o KeyboardSensor do dnd-kit é padrão mas pode estar customizado]`

## No celular (toque)

A PWA do KTask aceita arrastar por toque, com uma diferença importante:

1. Toque no card e **segure por 250 ms** (cerca de meio segundo). Você vai sentir o card "destacar".
2. Sem soltar, arraste para a coluna ou posição desejada.
3. Solte.

A pausa de 250 ms existe para diferenciar de um clique normal (que abre o card). Se você soltar antes, o card abre em vez de mover.

> **Dica**: o quadro pode ficar largo no celular. Você pode rolar horizontalmente com o dedo para enxergar as colunas mais distantes. Para arrastar para uma coluna fora da tela, segure o card e leve para a borda — o quadro rola automaticamente.

## Quando o card volta ao lugar sozinho

Se ao soltar você vê o card "voltar" para a posição antiga, geralmente é por um dos motivos:

- **Sem permissão**: você é Comentarista ou Observador no quadro, ou a coluna de destino tem restrição. Aparece um aviso curto avisando.
- **Sem internet**: a ação não chegou ao servidor. Confira a conexão e tente de novo.
- **Conflito com outra pessoa**: alguém moveu o mesmo card em outra direção quase ao mesmo tempo. O servidor resolveu pela última ação registrada.

## Próximos passos

- [Anexos e comentários](../cards/anexos-comentarios)
- [Sub-cards e família](../cards/sub-cards-familia)
- [Conceito geral de automações](../automacoes/conceito-geral)

## Dúvidas comuns

**Posso mover vários cards de uma vez?**
Não há "selecionar vários" hoje `[CONFIRMAR — feature em roadmap?]`. Cada card vai por vez.

**Movi um card e disparou automação que eu não queria. Como reverto?**
Mova o card de volta para a coluna anterior. Algumas automações têm efeito reversível (mover de volta cancela). Outras, como envio de WhatsApp, não — uma vez enviada, a mensagem foi. Se isso for crítico, fale com quem configurou a automação.

**Movi para a coluna errada. O cliente recebeu notificação?**
Depende da automação. Se a automação envia WhatsApp ao entrar na coluna, sim — a mensagem foi. Avise o cliente direto pelo comentário do card explicando.

**Tem como bloquear movimento de um card?**
Hoje não há "trava" de card individual. Você pode restringir editores no quadro inteiro, mas não num card específico.

**Vejo o card piscando ou pulando. É bug?**
Pode ser sincronização de tempo real com outra pessoa mexendo no mesmo card. Espere alguns segundos e recarregue se persistir.

---

Essa página foi útil? | [Falar com suporte](/ajuda/suporte)
