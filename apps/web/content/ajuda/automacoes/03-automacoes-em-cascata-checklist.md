---
title: Automações em cascata no checklist
description: Configure automações que vêm pré-anexadas a cada lista de tarefas e a cada item criados pela automação-pai. Útil pra evitar configurar item por item depois.
category: automacoes
slug: automacoes-em-cascata-checklist
order: 3
tags: [automacao, checklist, cascata, robo, sub-automacao]
faqLink: 'Como fazer item de checklist disparar automação automaticamente?'
updatedAt: 2026-05-20
---

# Automações em cascata no checklist

> **Quando usar**: quando uma automação que cria checklist no card também deveria pré-configurar automações nos itens criados, sem precisar de alguém configurar item por item depois.

## O contexto

Imagina o cenário comum:

1. Você criou uma automação **"Quando card entra em A fazer → cria checklist 'Aprovação' com itens (Aprovar copy, Aprovar design, Publicar)"**.
2. Você também queria que **cada item, quando marcado, disparasse uma ação automática** (ex: enviar WhatsApp pro responsável, postar comentário, mudar tag).

**Antes**: a checklist era criada, mas os itens vinham "limpos". Alguém precisava abrir cada card e adicionar automação manualmente em cada item. Inviável.

**Agora**: dentro da automação-pai, você pode configurar **2 níveis de sub-automação** que vêm pré-anexadas:

- **Automação da lista** — quando o checklist inteiro chegar a 100% (CHECKLIST_COMPLETED), dispara uma ação.
- **Automação por item** — quando UM item específico for marcado (CHECKLIST_ITEM_DONE), dispara uma ação.

## Como configurar

### Sub-automação da lista

Dentro do formulário de uma automação com ação **"Adicionar tarefas em uma lista"** ou **"Criar nova lista de tarefas"**:

1. Localize o campo **"Nome da lista de tarefas"**.
2. Ao lado do label, clique no ícone de **robô** (🤖 representado pelo ícone `Bot`).
3. Escolha a ação no popover:
   - Postar comentário
   - Adicionar / Remover etiquetas
   - Mudar status do card
   - Marcar prazo: hoje / atrasado
   - Enviar WhatsApp (pro líder do card ou pra um telefone fixo)
4. Configure o que a ação precisa (texto do comentário, etiquetas, etc).
5. Salve.

Quando essa automação rodar e criar o checklist, **uma sub-automação será criada junto**, com trigger `CHECKLIST_COMPLETED` e escopo daquele checklist específico.

### Sub-automação por item

Dentro do mesmo formulário, na lista de itens:

1. Em cada item de checklist, você verá 4 ícones à direita do campo de texto:
   - 👤 Responsável
   - 🚩 Prazo
   - ⚡ Prioridade
   - 🤖 **Automação** (novo)
2. Clique no robô do item desejado.
3. Configure ação + apelido opcional (ex: "Notificar líder no WhatsApp").
4. Salve.

Quando a automação rodar e criar aquele item, **uma sub-automação será criada com trigger `CHECKLIST_ITEM_DONE` e escopo daquele item específico**.

## Exemplo prático

Você quer criar uma automação que:

- Quando o card entra em **"A fazer"**:
- Cria checklist **"Entrega de post"** com itens:
  - **Aprovar copy** → quando marcado, posta comentário "@líder copy aprovada ✅"
  - **Aprovar design** → quando marcado, envia WhatsApp pra cliente
  - **Publicar** → quando marcado, muda status do card pra concluído
- E quando o checklist inteiro chegar a 100%, **arquiva o card**.

Tudo isso configurado no MESMO formulário, em UMA automação-pai. Nenhuma intervenção manual depois.

## Limites e regras

- **Triggers fixos por escopo**:
  - Lista: só `CHECKLIST_COMPLETED` (quando 100% concluída).
  - Item: só `CHECKLIST_ITEM_DONE` (quando aquele item é marcado).
- **Ações suportadas no editor compacto** (popover do robô):
  - Postar comentário
  - Adicionar / Remover etiquetas
  - Mudar status do card
  - Marcar prazo (hoje / atrasado)
  - Enviar WhatsApp (líder do card ou telefone fixo)
- **Ações mais complexas** (ex: mover card pra outra coluna, criar card filho com campos preenchidos): hoje só pelo fluxo manual depois que o item/lista existir. O backend já suporta, só o editor compacto que limita.
- **Compatibilidade**: automações criadas ANTES dessa feature continuam funcionando normalmente. Só não vão criar sub-automações até serem editadas.
- **Edição da automação-pai**: ao editar, mudanças nas sub-automações só valem pra **execuções FUTURAS**. Checklists/itens já criados em execuções anteriores não mudam.

## Onde aparecem as sub-automações criadas

Cada execução da automação-pai cria 1 row de `Automation` extra por sub-automação configurada. Você pode ver essas automações na tela de automações do quadro (filtradas por checklist ou item) — elas têm o mesmo `createdBy` da automação-pai.

## Quando NÃO usar

- Se você só quer disparar uma ação UMA vez quando o checklist for criado (não quando ele for concluído nem quando algum item for marcado), **não** use sub-automação — coloque a ação direto no nível da automação-pai (encadeie ações ou use ações múltiplas).
- Se você precisa de lógica diferente por execução (ex: a 1ª vez é X, a 2ª é Y), use automações independentes em vez de sub-automações em cascata.

## Performance

Quando você usa sub-automação por item, a engine cria 1 INSERT por item (em vez do batch otimizado). Em checklists com 5-20 itens isso é imperceptível. Pra checklists muito grandes (50+ itens), considere usar só `listAutomation` (uma sub-automação pra lista inteira) em vez de configurar item por item.
