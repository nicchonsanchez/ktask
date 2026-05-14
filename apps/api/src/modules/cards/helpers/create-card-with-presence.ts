import type { Card, Prisma, PrismaClient } from '@prisma/client';

/**
 * Cria um Card com TODAS as invariantes obrigatórias na ordem correta.
 *
 * USE SEMPRE este helper em qualquer caminho novo que crie Card. NÃO
 * chame `tx.card.create()` direto a menos que você tenha lido este
 * comentário inteiro e tenha um motivo documentado.
 *
 * Histórico (postmortem `docs/postmortems/2026-05-13-carrossel-cannes.md`):
 * 3 métodos (`createChild`, `duplicate`, `handleCreateChildCard`)
 * esqueceram parte da sequência entre 2026-04-25 e 2026-05-13, deixando
 * 9 cards "invisíveis" no kanban (existiam no banco mas faltava a row em
 * `CardPresence` que o `GET /boards/:id` consulta). Este helper centraliza
 * pra eliminar a classe inteira de bug.
 *
 * Passos obrigatórios executados (na ordem):
 *
 * 1. Incrementa `Organization.cardSequence` atomicamente (UPDATE...RETURNING
 *    em Postgres). Resultado vira `shortCode` humano-legível ("#412") usado
 *    em URLs (`/c/[code]`) e exibido na UI.
 *
 * 2. INSERT em `Card`. shortCode garantido único por Org via
 *    `@@unique([organizationId, shortCode])`.
 *
 * 3. INSERT em `CardPresence` com PK composta (cardId, boardId). Sem essa
 *    row o card existe mas não aparece no kanban — o `GET /boards/:id` lê
 *    de `CardPresence` (modelo multi-fluxo, ver `tarefas-md/13-cards-multi-fluxo.md`).
 *
 * Idealmente `tx` é um `Prisma.TransactionClient` (todos os 3 passos numa
 * transação). Aceita `PrismaClient` direto pra simplificar chamadas em
 * paths que já lidam com falha tolerável (ex: importer com retry), mas
 * NÃO recomendado pra fluxos críticos da UI.
 *
 * Não emite eventos (`CARD_CREATED`, `Activity`) — responsabilidade do
 * caller, porque cada path tem `payload` próprio (manual vs automation vs
 * duplicate vs importer).
 */
export async function createCardWithPresence(
  tx: Prisma.TransactionClient | PrismaClient,
  input: CreateCardWithPresenceInput,
): Promise<Card> {
  const orgUpdated = await tx.organization.update({
    where: { id: input.organizationId },
    data: { cardSequence: { increment: 1 } },
    select: { cardSequence: true },
  });
  const shortCode = String(orgUpdated.cardSequence);

  const card = await tx.card.create({
    data: {
      organizationId: input.organizationId,
      shortCode,
      boardId: input.boardId,
      listId: input.listId,
      title: input.title,
      description: input.description,
      cardColor: input.cardColor ?? null,
      dueDate: input.dueDate ?? null,
      startDate: input.startDate ?? null,
      estimateMinutes: input.estimateMinutes ?? null,
      position: input.position,
      parentCardId: input.parentCardId ?? null,
      createdById: input.createdById,
      leadId: input.leadId ?? input.createdById,
    },
  });

  await tx.cardPresence.create({
    data: {
      cardId: card.id,
      boardId: input.boardId,
      listId: input.listId,
      position: input.position,
    },
  });

  return card;
}

export interface CreateCardWithPresenceInput {
  organizationId: string;
  boardId: string;
  listId: string;
  title: string;
  position: number;
  createdById: string;

  /** Default: createdById (quem cria vira líder). */
  leadId?: string;

  /** ProseMirror JSON. */
  description?: Prisma.InputJsonValue;

  cardColor?: string | null;
  dueDate?: Date | null;
  startDate?: Date | null;
  estimateMinutes?: number | null;

  /** Família de cards (sub-card de um pai). */
  parentCardId?: string | null;
}
