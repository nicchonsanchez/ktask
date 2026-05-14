---
title: Criar a primeira automação
description: Passo a passo para configurar uma automação simples — exemplo "quando card entra na coluna Aprovação, atribuir designer e enviar WhatsApp".
category: automacoes
slug: criar-primeira-automacao
order: 2
tags: [automacao, criar, exemplo, passo-a-passo]
updatedAt: 2026-05-14
---

# Criar a primeira automação

> **Quem pode fazer**: Admin do quadro.
> **Tempo estimado**: 5 minutos.

> **Esta funcionalidade está em evolução.** Algumas ações da lista podem estar marcadas como "em breve" na sua tela. Se algum passo não bater com o que você vê, fale com o suporte.

> **Antes de seguir**, leia [Conceito geral de automações](../automacoes/conceito-geral) se ainda não conhece os blocos (gatilho, condição, ação).

## O exemplo que vamos montar

Vamos criar a seguinte automação no quadro **Redes Sociais — Cliente Alfa**:

> **Quando** um card entrar na coluna "Aprovação cliente", **se** o card tem a etiqueta "Cliente Alfa", **faça**:
>
> 1. Definir a equipe — adicionar o designer Maria.
> 2. Postar um comentário "Pedido de aprovação enviado".
> 3. Enviar WhatsApp para o cliente usando o modelo "Aprovação banner".

É um caso comum no dia a dia: card chega na fase de aprovação, alguém precisa ser avisado, e o cliente precisa receber o link de aprovação.

## Passo a passo

### 1. Abrir a tela de automações do quadro

1. Abra o quadro **Redes Sociais — Cliente Alfa**.
2. No menu do quadro (geralmente no canto superior direito), clique em **Automações** `[CONFIRMAR — caminho exato no menu do quadro]`.
3. Clique em **+ Nova automação**.

Aparece o formulário de criação, organizado em **etapas**: gatilho → condições → ações.

### 2. Definir o gatilho

1. **Nome da automação**: dê um nome que faça sentido para o time. Ex: "Avisar cliente quando entra em Aprovação".
2. **Tipo do gatilho**: escolha **Card entrou na coluna**.
3. **Coluna**: selecione **Aprovação cliente** no dropdown.

Pronto, o gatilho está configurado: a regra vai disparar sempre que **qualquer card** entrar nessa coluna.

### 3. Adicionar condições (opcional)

Vamos restringir para só cards do Cliente Alfa:

1. Em **Condições**, clique em **Adicionar condição**.
2. Escolha **Tem etiqueta** (ou nome similar) `[CONFIRMAR — nome exato da condição]`.
3. Selecione a etiqueta **Cliente Alfa**.

Se o quadro inteiro for de um único cliente, você pode pular as condições — o filtro fica naturalmente pelo próprio escopo do quadro.

### 4. Configurar as ações

As ações rodam **em sequência**, na ordem em que você adicionou. Vamos adicionar três:

#### Ação 1 — Adicionar membro à equipe

1. Clique em **+ Adicionar ação**.
2. Escolha **Adicionar membros à equipe**.
3. Selecione **Maria (Designer)** na lista.

#### Ação 2 — Postar comentário automático

1. Clique em **+ Adicionar ação** de novo.
2. Escolha **Postar comentário**.
3. No campo de texto, escreva: `Pedido de aprovação enviado ao cliente.`

#### Ação 3 — Enviar WhatsApp

1. Clique em **+ Adicionar ação** mais uma vez.
2. Escolha **Enviar WhatsApp**.
3. Selecione o **destino**: o telefone do contato vinculado ao card. `[CONFIRMAR — como o destino é definido na UI: campo do card, número fixo, contato vinculado]`
4. Selecione o **modelo de mensagem**: **Aprovação banner**. Se ainda não existe, crie primeiro em **Configurações → Modelos de mensagem** e volte aqui.

### 5. Conferir o resumo e salvar

Antes de salvar, role até o resumo no fim do formulário. Ele mostra a regra em linguagem natural:

> **Quando** card entrar em "Aprovação cliente", **se** card tem etiqueta "Cliente Alfa", **faça**: adicionar Maria à equipe, postar comentário "Pedido de aprovação enviado ao cliente.", enviar WhatsApp com modelo "Aprovação banner".

Se está correto, clique em **Salvar automação**. A regra fica **ativa imediatamente** — o próximo card que entrar na coluna já dispara.

## Testar a automação

Para confirmar que está funcionando:

1. Crie um card de teste com a etiqueta "Cliente Alfa".
2. Arraste para a coluna **Aprovação cliente**.
3. Confira:
   - Maria foi adicionada à equipe (avatar no card).
   - Um comentário automático apareceu na timeline.
   - Você (ou o telefone configurado) recebeu o WhatsApp.

Se algo falhou, abra a aba **Execuções** do quadro: cada execução fica registrada com status e detalhes do erro.

## Editar ou desativar depois

- **Editar**: na lista de automações, clique na regra para abrir o mesmo formulário. Salve depois de mudar.
- **Desativar temporariamente**: use o toggle ativo/inativo na linha da automação.
- **Apagar**: opção no menu (três pontinhos) da automação.

Cards já criados continuam onde estão — a alteração só afeta eventos a partir da mudança.

## Próximos passos

- [Configurar modelos de mensagem WhatsApp](#) `[CONFIRMAR — existe tutorial planejado?]`
- [Conceito geral de automações](../automacoes/conceito-geral) (relembrar os blocos)

## Dúvidas comuns

**Esqueci de adicionar uma ação. Tem como inserir no meio?**
Sim. Edite a automação, adicione a ação nova e arraste para a posição correta na lista. A ordem afeta o resultado quando uma ação depende de outra.

**Como sei se uma automação realmente disparou?**
Veja a aba **Execuções** do quadro. Cada disparo fica registrado com data, card, status (sucesso / falhou / parcial) e o que cada ação fez.

**Uma automação rodou várias vezes para o mesmo card. É bug?**
Provavelmente o card entrou e saiu da coluna várias vezes (cada entrada é um gatilho). Se isso atrapalha, adicione uma condição que impeça disparo duplicado (ex: "se o card ainda não tem a etiqueta X").

**O WhatsApp não enviou. Onde vejo o erro?**
Na aba **Execuções**, a execução aparece com status falhou e mensagem de erro (telefone inválido, instância Evolution offline, etc).

**Posso copiar uma automação para outro quadro?**
Hoje não há "copiar automação" entre quadros na UI `[CONFIRMAR — feature em roadmap?]`. Recrie manualmente no destino.

---

Essa página foi útil? | [Falar com suporte](/ajuda/suporte)
