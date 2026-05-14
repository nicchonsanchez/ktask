---
title: Perfil e equipe
description: Como ajustar seus dados pessoais, gerenciar membros da organização, convites e papéis.
category: configuracoes
slug: perfil-e-equipe
order: 1
tags: [configuracao, perfil, equipe, membros, convite, papel]
updatedAt: 2026-05-14
---

# Perfil e equipe

> **Quem pode fazer**:
>
> - **Perfil próprio**: qualquer pessoa logada.
> - **Convidar e gerenciar membros**: Dono ou Administrador da organização.
>   **Tempo estimado**: 5 minutos.

## Editar seu perfil

1. Clique no seu **avatar** no canto direito da topbar.
2. Escolha **Configurações** → **Perfil**.

Você pode ajustar:

- **Nome de exibição**: como aparece para o resto do time em cards, comentários, menções.
- **Foto** (avatar): JPG, PNG ou WEBP, até 5 MB. Aparece arredondada na UI.
- **WhatsApp**: telefone no formato internacional (`+55DDDNNNNNNNNN`). Necessário se você quer receber notificações por WhatsApp.
- **Senha**: digite a senha atual + nova senha. Mínimo de 8 caracteres.

Mudanças são salvas com botão **Salvar**.

## Preferências de notificação

Na mesma tela de Perfil, você define quais notificações quer receber:

- **Receber pedidos de aprovação por WhatsApp**: liga/desliga o envio de mensagens automáticas quando alguém te coloca como aprovador. Exige telefone preenchido.
- **Notificações push do navegador**: ativa/desativa avisos no canto da tela mesmo com o KTask fechado. Veja a próxima seção.

## Push notifications (avisos no navegador)

Para receber notificações no canto do computador/celular mesmo sem o KTask aberto:

1. Em **Configurações → Perfil**, encontre a seção **Notificações push** ou **Dispositivos**.
2. Clique em **Ativar nesse dispositivo**.
3. O navegador pede permissão. Aceite.

Cada dispositivo onde você ativa aparece na lista, com:

- **Nome do dispositivo / navegador** (ex: "Chrome no Windows").
- **Data em que foi ativado**.
- Botão **Remover** para desativar só aquele dispositivo (útil quando você muda de computador e quer parar de receber no antigo).

## Gerenciar a equipe (admins)

Se você é Dono ou Administrador da organização:

1. Clique no avatar → **Configurações** → **Membros**.

Você vê três blocos:

### Membros ativos

Lista de todas as pessoas com conta na organização, com:

- Nome, e-mail, foto.
- Papel atual (Dono, Administrador, Gestor, Membro, Convidado).
- Data de entrada.

Clique numa pessoa para abrir o detalhe. Lá você pode:

- **Mudar o papel** (com respeito à regra de hierarquia — veja [Papéis e permissões](#papéis-e-permissões)).
- **Remover da organização** (com confirmação).

### Convites pendentes

Pessoas que receberam convite mas ainda não criaram conta. Para cada:

- **Reenviar**: gera o link novamente (útil se o original expirou).
- **Revogar**: invalida o convite. A pessoa não consegue mais aceitar.

### Convidar nova pessoa

Clique em **+ Convidar membro** e preencha:

- **E-mail** (obrigatório).
- **WhatsApp** (opcional, mas recomendado se você quer ela receber link de aprovação por lá).
- **Papel** que vai assumir (Administrador, Gestor, Membro ou Convidado — não dá pra convidar como Dono).

Ao salvar, o sistema **gera um link de convite copiável**. Hoje, o e-mail **não** é enviado automaticamente — você copia o link e manda pela mensagem (WhatsApp, e-mail, Slack). É proposital para essa versão do sistema.

## Papéis e permissões

A organização tem 5 papéis, do mais alto para o mais baixo:

| Papel             | O que pode fazer                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Dono** (OWNER)  | Tudo. Único papel que pode transferir a propriedade ou deletar a organização.                                             |
| **Administrador** | Convidar e gerenciar membros, configurar integrações, ver todos os quadros, criar/editar automações em qualquer quadro.   |
| **Gestor**        | Ver todos os quadros e operar como Admin do quadro em qualquer um. **Não** pode mexer em membros, integrações ou billing. |
| **Membro**        | Criar quadros. Acessa apenas quadros em que é membro explícito.                                                           |
| **Convidado**     | Acessa apenas quadros em que foi explicitamente adicionado. Não cria quadros. Bom para clientes externos com conta.       |

**Regra de teto**: cada papel só atribui papéis **iguais ou inferiores ao seu**. Um Administrador não promove ninguém a Dono. Um Gestor não promove ninguém a Admin.

**Regra do último Dono**: não dá para rebaixar o **último** Dono da organização. Antes de rebaixar, transfira para outra pessoa.

## Próximos passos

- [Criar um quadro](../quadros/criar-quadro)
- [Importar do Ummense](../importacao/importar-do-ummense)

## Dúvidas comuns

**Perdi acesso à minha conta. Posso recuperar pelo perfil?**
Não pelo perfil — só pela tela de login → **Esqueci minha senha**. Veja [Criar conta e aceitar convite](../comecar/criar-conta-aceitar-convite).

**Quero remover alguém que saiu da empresa. O que acontece com os cards dela?**
Os cards continuam onde estão. Comentários e ações antigas mantêm o nome (com indicação "ex-membro"). A pessoa some das menções e atribuições futuras.

**O e-mail do convite não vai sozinho. Por quê?**
É proposital nessa versão: você copia o link gerado e envia pelo canal de sua preferência (WhatsApp, e-mail, Slack). O envio automático vai chegar em versão futura.

**Convidei como Gestor mas a pessoa está vendo como Administrador. Por quê?**
Confira no detalhe do membro qual papel está marcado. Se a pessoa também é Dono ou Administrador de outra organização, a confusão pode estar no contexto — peça para ela confirmar qual organização está ativa no canto superior.

**Como transfiro a propriedade (Dono) para outra pessoa?**
Atualmente requer ação do Dono atual em **Configurações → Membros → detalhe do membro alvo → Transferir propriedade** `[CONFIRMAR — opção exata]`. A ação é irreversível na hora — confirme com cuidado.

---

Essa página foi útil? | [Falar com suporte](/ajuda/suporte)
