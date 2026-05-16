---
title: Sincronização automática de status de cards
description: Marca cards como Concluído automaticamente quando todas as presenças chegam em colunas finais — e reverte quando reabrem o trabalho.
category: configuracoes
slug: status-automatico-cards
order: 2
tags: [organizacao, status, finalizado, multi-fluxo, completed, automacao]
faqLink: 'Como marcar cards como concluídos automaticamente?'
updatedAt: 2026-05-15
---

# Sincronização automática de status

> **Quem pode ligar/desligar**: OWNER ou ADMIN da organização, em [Configurações → Organização](/configuracoes/organizacao).

## O que essa configuração faz

Quando ligada, o KTask **mantém o status do card sincronizado com a posição dele nos quadros**. A regra é simples:

| Situação do card                                                              | Ação automática                                    |
| ----------------------------------------------------------------------------- | -------------------------------------------------- |
| **Em vários fluxos**, todas as presenças em colunas finais (ex: "Finalizado") | Status vira **Concluído**                          |
| **Em um único fluxo**, na coluna final                                        | Status vira **Concluído**                          |
| Algum fluxo ainda fora de coluna final                                        | Status permanece como estava (Ativo / Aguardando)  |
| Status atual é **Cancelado**                                                  | **Nunca muda** — cancelamento é decisão definitiva |
| Card estava **Concluído** e alguém moveu de volta pra coluna não-final        | Status volta pra **Ativo**                         |

## Quando faz sentido ligar

- A agência tem cards que circulam em múltiplos quadros (multi-fluxo) e você quer que "Concluído" reflita o trabalho **realmente terminado em todos os lugares**.
- Você quer que a Visão Gerencial → Finalizados liste apenas cards de fato encerrados, sem precisar marcar status manualmente.
- Indicadores e relatórios que filtram por `status=Concluído` precisam ser confiáveis.

## Quando NÃO ligar

- Sua equipe usa "Concluído" e "coluna Finalizado" como **conceitos separados** por algum motivo (ex: "card em Finalizado = entregue, mas Concluído = aprovado pelo cliente").
- Você prefere controle manual completo sobre o status do card.

## Como funciona na prática

### Exemplo 1 — fluxo único

Card "Banner aniversário" está no quadro Marketing, coluna "Em andamento" (status: Ativo).
Você arrasta pra "Finalizado".
→ Status vira **Concluído** automaticamente.

### Exemplo 2 — multi-fluxo, conclusão parcial

Card "Campanha XYZ" está em 3 quadros:

- Marketing: coluna "Finalizado"
- Design: coluna "Finalizado"
- Comercial: coluna "Em andamento"

Status atual: Ativo. Mesmo finalizando em 2 quadros, o status **continua Ativo** porque ainda há trabalho em Comercial.

Quando movem em Comercial pra "Finalizado":
→ Agora todos os fluxos estão finais → Status vira **Concluído**.

### Exemplo 3 — reabertura

Card "Post LinkedIn" estava Concluído (todos os fluxos em Finalizado).
Alguém move um fluxo de volta pra "A fazer".
→ Status volta pra **Ativo** automaticamente.

### Exemplo 4 — cancelamento prevalece

Card cancelado tem status: Cancelado.
Você arrasta pra "Finalizado" por engano.
→ Status **continua Cancelado** — a regra não toca em cards cancelados.

## Onde ver o registro

Cada mudança automática gera uma entrada na timeline do card como **ação do sistema** (sem ator humano). Aparece como "Card concluído automaticamente" ou "Status revertido pra ativo".

## Pontos de cuidado

- **Automações encadeadas**: se você tem automação com gatilho "card concluído" que dispara alguma ação (notif WhatsApp, mover pra outro quadro etc), ela vai disparar quando o status virar Concluído automaticamente — exatamente igual a uma marcação manual. Revise suas automações antes de ligar essa configuração se quiser evitar surpresas.
- **Aplicação retroativa**: ligar o toggle **não** recalcula cards antigos. Só vale daqui pra frente, em qualquer movimentação nova. Se quiser recalcular o histórico, fale com o admin do sistema.
- **Toggle desligado**: você pode desligar a qualquer momento. Cards que já viraram Concluído por causa dele continuam assim — não há "auto-undo" de mudanças passadas.

## Como ligar

1. Acesse [Configurações → Organização](/configuracoes/organizacao).
2. Marque a caixa **"Marcar cards como concluídos automaticamente"**.
3. Salva sozinho. Mudança vale a partir do próximo movimento de card.
