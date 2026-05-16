import { Injectable, Logger } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';

/**
 * Tipo do client/tx aceito pelo helper. Recebe tanto o PrismaService
 * normal quanto um tx (TransactionClient) — pra ser chamado de dentro
 * de transacoes existentes (move/link/unlink) sem abrir tx aninhada.
 */
type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Sincronizacao automatica de Card.status baseada nas presences.
 *
 * Regra (opt-in por Org via Organization.autoCompleteCardWhenAllFinal):
 *   - Card com status=CANCELED: nunca muda (terminal).
 *   - Card sem presence ativa: nao avalia (caso edge — cards "fantasma").
 *   - Todas as presences ativas em coluna isFinalList=true E status atual
 *     != COMPLETED → set COMPLETED.
 *   - Pelo menos uma presence ativa em coluna isFinalList=false E status
 *     atual == COMPLETED → set ACTIVE (caso reverso, "reabrindo trabalho").
 *
 * Activity log eh gravada quando ha mudanca (actorId=null indica "sistema"
 * pra auditoria distinguir de acao humana).
 */
@Injectable()
export class CardStatusSyncService {
  private readonly logger = new Logger(CardStatusSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Avalia o status de 1 card e aplica mudanca se necessario.
   * Retorna o status final apos a avaliacao (sem mudanca = retorna o atual).
   */
  async evaluate(
    cardId: string,
    opts: { db?: DbClient } = {},
  ): Promise<'ACTIVE' | 'COMPLETED' | 'WAITING' | 'CANCELED' | null> {
    const db = opts.db ?? this.prisma;

    const card = await db.card.findUnique({
      where: { id: cardId },
      select: {
        id: true,
        status: true,
        boardId: true,
        organizationId: true,
      },
    });

    if (!card) return null;

    // Card model nao tem relacao direta Organization (so FK denormalizada),
    // entao carregamos a Org separado pra checar o flag.
    const org = await db.organization.findUnique({
      where: { id: card.organizationId },
      select: { autoCompleteCardWhenAllFinal: true },
    });
    if (!org?.autoCompleteCardWhenAllFinal) return card.status;
    // Regra do user: CANCELED eh terminal, nunca muda automaticamente.
    if (card.status === 'CANCELED') return card.status;

    const presences = await db.cardPresence.findMany({
      where: { cardId, removedAt: null },
      select: { list: { select: { isFinalList: true } } },
    });
    // Card sem presence ativa nao tem como ser avaliado. Pula.
    if (presences.length === 0) return card.status;

    const allFinal = presences.every((p) => p.list.isFinalList === true);

    let nextStatus: typeof card.status | null = null;
    if (allFinal && card.status !== 'COMPLETED') {
      nextStatus = 'COMPLETED';
    } else if (!allFinal && card.status === 'COMPLETED') {
      // Caso reverso: card voltou pra coluna nao-final em algum fluxo
      // (alguem reabriu o trabalho). Status volta pra ACTIVE.
      nextStatus = 'ACTIVE';
    }

    if (!nextStatus) return card.status;

    await db.card.update({
      where: { id: cardId },
      data: {
        status: nextStatus,
        // completedAt sincroniza com status. COMPLETED → carimba; reverso
        // (ACTIVE) → limpa pra cards listados em "concluidos da semana"
        // nao confundirem o gestor.
        completedAt: nextStatus === 'COMPLETED' ? new Date() : null,
      },
    });

    await db.activity.create({
      data: {
        organizationId: card.organizationId,
        boardId: card.boardId,
        cardId: card.id,
        actorId: null, // sistema, nao usuario
        type: nextStatus === 'COMPLETED' ? 'CARD_COMPLETED' : 'CARD_UPDATED',
        payload: {
          kind: 'card.status.autoSync',
          fromStatus: card.status,
          toStatus: nextStatus,
          reason: allFinal ? 'allPresencesInFinalLists' : 'presenceReopenedFromFinal',
        } as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `Card ${cardId}: status ${card.status} → ${nextStatus} (auto-sync, ${allFinal ? 'all-final' : 'reopened'})`,
    );

    return nextStatus;
  }
}
