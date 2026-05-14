---
title: Pedir aprovação do cliente
description: Como configurar uma aprovação no card, escolher quem aprova e enviar o link para o cliente.
category: aprovacoes
slug: pedir-aprovacao-cliente
order: 1
tags: [aprovacao, cliente, entrega, revisor, link]
faqLink: 'Como funciona um link de aprovação de cliente?'
updatedAt: 2026-05-14
---

# Pedir aprovação do cliente

> **Quem pode fazer**: Admin do quadro ou Editor.
> **Tempo estimado**: 2 minutos.

## Como funciona uma aprovação

Aprovação é um pedido formal de "ok" ou "ajuste" para uma entrega. Você marca um card como **aguardando aprovação**, define **quem** precisa aprovar, e o sistema:

- Notifica a pessoa por WhatsApp e/ou e-mail com um **link direto** do card.
- Mostra o card na fila de **Aprovações** dela.
- Quando ela decide (aprovar ou pedir ajuste), o sistema registra a decisão na timeline do card e pode disparar automações (mover o card, criar tarefas de refação, etc).

A aprovação não exige que o aprovador tenha conta no KTask. O link de aprovação funciona sem login, basta que ele clique.

## Quem pode aprovar

Três modos de revisor:

1. **Membro interno**: alguém da sua organização que já tem conta. Aprovação aparece tanto pelo link quanto dentro do KTask, na fila dele.
2. **Contato externo via WhatsApp salvo**: alguém que já está cadastrado como contato no CRM (ex: o cliente da Kharis). Você seleciona pela busca; o telefone vem preenchido.
3. **WhatsApp avulso**: você digita nome e telefone na hora. Útil quando o aprovador não está no CRM ainda.

> **Importante**: o link é **único por revisor**. Cada pessoa recebe o seu, e o sistema sabe quem aprovou pelo token do link. Mesmo um revisor interno pode usar o link público (sem precisar logar).

## Passo a passo

1. Abra o card que precisa de aprovação.
2. Clique em **Pedir aprovação** `[CONFIRMAR — nome exato do botão no request-approval-dialog.tsx]`.
3. No modal, escolha o **modo do revisor**:
   - **Membro interno** → busca por nome ou e-mail dentro da organização.
   - **WhatsApp de contato existente** → busca o contato no CRM.
   - **WhatsApp avulso** → digita o nome + telefone no formato internacional (ex: `+5531999999999`, mínimo 10 dígitos).
4. (Opcional) Adicione mais revisores repetindo o passo 3. A regra padrão é "primeiro a votar ganha" — basta um aprovar ou reprovar para a decisão valer.
5. Escreva uma **mensagem opcional** que vai junto no WhatsApp (ex: "Aprovação do banner Dia das Mães, prazo apertado").
6. Clique em **Enviar pedido**.

O sistema gera os links, envia as mensagens e marca o card como "aguardando aprovação".

## O que o revisor recebe

No WhatsApp, chega uma mensagem com:

- Título do card.
- Sua mensagem opcional.
- Um **link** que abre direto a página de aprovação (sem precisar login).

Na página, ele vê o card resumido (descrição, anexos relevantes) e três botões: **Aprovar**, **Pedir ajustes** e **Comentar sem decidir**. Veja [Link público para o cliente](../aprovacoes/link-publico-cliente) para a perspectiva do cliente.

## Acompanhar o status

Depois de enviar, o card mostra uma seção de **Aprovações** com:

- Lista de revisores convidados.
- Status de cada um (Pendente / Aprovou / Pediu ajustes).
- Data e horário de cada decisão.
- Comentários que o revisor deixou junto.

Você também recebe notificação na hora em que alguém decide.

## Cancelar ou reverter

Se o pedido foi enviado por engano:

- **Cancelar pedido inteiro**: na seção de Aprovações do card, há a opção **Cancelar aprovação** `[CONFIRMAR — texto exato]`. Isso invalida todos os links pendentes.
- **Remover um revisor específico**: também pela seção de Aprovações.

Se um revisor já decidiu e a decisão foi errada (ex: clicou em "reprovar" sem querer):

- **Pelo próprio revisor**: ele tem uma janela de 5 minutos para usar o botão **Desfazer** na própria tela. Se houver interação posterior no card (comentário, edição), a janela fecha antes.
- **Por administradores**: Dono, Administrador ou Gestor da organização podem reverter a decisão a qualquer momento (com efeito colateral registrado na timeline).

## Próximos passos

- [Link público para o cliente](../aprovacoes/link-publico-cliente)
- [Criar a primeira automação](../automacoes/criar-primeira-automacao)

## Dúvidas comuns

**Preciso adicionar o cliente como membro do KTask para ele aprovar?**
Não. O link público funciona sem login. Adicionar como membro só faz sentido se ele for participar ativamente do quadro (comentar regularmente, criar cards), não só aprovar.

**Posso exigir que mais de uma pessoa aprove?**
Hoje a regra é "primeiro a votar ganha". Aprovação múltipla obrigatória (quorum) não está disponível na UI `[CONFIRMAR — feature em roadmap]`. Como contorno, você pode pedir verbalmente e só clicar quando ambas confirmarem.

**O link expira?**
Sim. O link é válido enquanto a aprovação estiver pendente. Quando alguém decide, os outros links ficam inválidos.

**O cliente reclamou que não chegou WhatsApp. O que faço?**
Confira: telefone digitado corretamente (formato `+55DDDNNNNNNNNN`), o número aceita mensagens da nossa instância Evolution, e o aparelho dele tem internet. Se persistir, **copie o link** do revisor (botão "Copiar link" na seção de Aprovações) e envie por outro canal.

**Posso adicionar instruções específicas para cada revisor?**
Hoje a mensagem opcional é única para todos. Para instruções individuais, mande complementar por outro canal ou comente no próprio card antes de enviar o pedido.

---

Essa página foi útil? | [Falar com suporte](/ajuda/suporte)
