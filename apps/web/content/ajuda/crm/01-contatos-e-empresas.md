---
title: Contatos e empresas
description: Como cadastrar pessoas e empresas no CRM, vincular contatos a usuários do KTask e ligar pessoas a empresas.
category: crm
slug: contatos-e-empresas
order: 1
tags: [crm, contato, empresa, pessoa, vinculo]
updatedAt: 2026-05-14
---

# Contatos e empresas

> **Quem pode fazer**: Membro da organização (todos os papéis exceto Convidado).
> **Tempo estimado**: 5 minutos.

## O que é o CRM do KTask

O CRM (Customer Relationship Management) do KTask é um cadastro leve de **pessoas** e **empresas** com as quais o time interage — clientes, fornecedores, prospects. Não é um CRM de vendas completo com funil e oportunidades; é o suficiente para:

- Vincular um card a um cliente (saber de quem é a demanda).
- Pré-preencher contato em aprovações ("enviar para o WhatsApp dele").
- Reunir, por contato, o histórico de cards que ele participou.

Pessoas e empresas vivem no mesmo cadastro: **Contato**. A diferença é o **tipo**: `Pessoa` ou `Empresa`. Uma pessoa pode estar vinculada a uma empresa (ex: João trabalha na Padaria Boa Massa).

## Cadastrar uma pessoa

1. Na topbar, clique em **Contatos**.

   Aparece a lista de todos os contatos (pessoas + empresas) da organização.

2. Clique em **+ Novo contato**.

3. Escolha o tipo: **Pessoa**.

4. Preencha:
   - **Nome** (obrigatório).
   - **E-mail** (opcional, ajuda na busca e em vínculos com usuários).
   - **Telefone WhatsApp** (opcional, formato internacional `+55DDDNNNNNNNNN`).
   - **Empresa** (opcional): comece a digitar — se a empresa já existe, selecione; se não, dá para criar na hora.
   - **Cargo / observações** (opcional).
   - **Foto / avatar** (opcional).

5. Salve.

## Cadastrar uma empresa

Mesmo processo, mas escolhendo o tipo **Empresa**:

1. **Contatos** na topbar → **+ Novo contato** → **Empresa**.
2. Preencha:
   - **Nome da empresa** (obrigatório).
   - **E-mail genérico** (opcional, tipo `contato@empresa.com.br`).
   - **Telefone** (opcional).
   - **Site, endereço, observações** (opcional).
3. Salve.

> **Atalho**: a tela `Empresas` na topbar é a mesma lista de Contatos com o filtro `tipo = Empresa` já aplicado. É um atalho para quem quer ir direto para a lista de empresas.

## Vincular uma pessoa a uma empresa

Você pode fazer isso em três momentos:

- **Ao criar a pessoa**: campo Empresa no formulário (descrito acima).
- **Editando depois**: abra a pessoa, edite, escolha a empresa no campo Empresa, salve.
- **Pela empresa**: abra a empresa, vá para a aba de membros/funcionários `[CONFIRMAR — nome exato da aba]`, adicione pessoas existentes ou crie novas já vinculadas.

Uma pessoa tem **uma empresa** por vez. Se trocar de empresa, basta editar o campo.

Empresas mostram a lista de pessoas vinculadas como "funcionários" ou "membros da empresa" `[CONFIRMAR — texto exato]`. Útil para enxergar todos os interlocutores de um cliente num lugar só.

## Vincular um contato a um usuário do KTask

Quando um contato do CRM também é **membro da organização** no KTask (ou seja, tem login próprio), você pode amarrar os dois:

1. Abra o contato.
2. Procure a seção **Vínculo com usuário** ou similar `[CONFIRMAR — texto exato]`.
3. Selecione o usuário correspondente da organização.
4. Salve.

A partir daí:

- Nome, e-mail, telefone e foto do contato **passam a ser herdados do usuário** (read-only). Se a pessoa atualizar a foto no perfil dela, o contato atualiza junto.
- O contato aparece com um **badge "membro"** na lista, diferenciando dos contatos puros (sem conta).

> **Sugestão automática**: quando o e-mail ou telefone do contato bate com algum usuário da organização, o sistema mostra um aviso sugerindo o vínculo. Você aceita com um clique.

## Buscar contatos

A lista de contatos tem busca por:

- **Nome**.
- **E-mail**.
- **Telefone**.
- **Empresa**.

Use o campo de busca no topo da lista. Resultado é instantâneo, conforme você digita.

## Onde os contatos aparecem nos cards

Em um card, você pode:

- **Vincular contatos** ao card (ex: o cliente da demanda).
- Usar o contato como **destino de aprovação** sem precisar redigitar telefone.
- Ver, no perfil do contato, **a lista de cards** em que ele participou — histórico completo.

## Próximos passos

- [Pedir aprovação do cliente](../aprovacoes/pedir-aprovacao-cliente)
- [Criar a primeira automação](../automacoes/criar-primeira-automacao)

## Dúvidas comuns

**Posso ter duas pessoas com o mesmo nome?**
Sim. O sistema diferencia pelo identificador interno, não pelo nome. Para evitar confusão, use e-mail ou empresa como distinção visual.

**Posso ter empresas duplicadas?**
Tecnicamente sim, mas evite. Antes de criar, busque na lista — se já existe, edite a existente em vez de criar outra.

**O cliente vai aparecer no Contatos automaticamente quando eu pedir aprovação no WhatsApp avulso?**
Não. O modo "WhatsApp avulso" registra a aprovação mas não cria o contato. Para cadastrar, vá em Contatos e crie manualmente.

**Apaguei um contato que estava vinculado a cards. Os cards quebram?**
Não. Os cards mantêm referência ao histórico, mas o contato desaparece do vínculo ativo. Pessoa apagada some da busca mas o nome continua aparecendo no histórico do card.

**Empresa pode ter outra empresa como "empresa-mãe"?**
Não na UI atual. Hierarquia entre empresas (matriz → filiais) não é suportada hoje.

---

Essa página foi útil? | [Falar com suporte](/ajuda/suporte)
