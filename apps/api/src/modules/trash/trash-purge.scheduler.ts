import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '@/common/prisma/prisma.service';
import { StorageService } from '@/modules/storage/storage.service';

import { TRASH_RETENTION_DAYS } from './trash.service';

/**
 * Auto-purge fisico do que esta na lixeira ha mais de 90 dias.
 * Roda 03:30 UTC diariamente (00:30 BRT) — horario de baixa atividade.
 *
 * Estrategia: deleta em batches de 100 pra nao segurar locks longos.
 * Card.delete cascateia pra CardMember/CardLabel/Checklist+Items/
 * Attachments/Comments/Activities via FK ON DELETE CASCADE no schema.
 */
@Injectable()
export class TrashPurgeScheduler {
  private readonly logger = new Logger(TrashPurgeScheduler.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Cron('30 3 * * *', { timeZone: 'UTC' })
  async purge() {
    if (this.running) {
      this.logger.warn('Auto-purge anterior ainda rodando — pulando este tick.');
      return;
    }
    this.running = true;
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - TRASH_RETENTION_DAYS);

      const raw = this.prisma.raw;
      let purgedCards = 0;
      let purgedLists = 0;
      let purgedFiles = 0;

      // Cards primeiro: se uma lista vencida tem cards filhos vencidos, o
      // CASCADE da FK list -> card ja resolveria, mas deletar cards primeiro
      // mantem a contagem precisa pro log.
      while (true) {
        const batch = await raw.card.findMany({
          where: { deletedAt: { lte: cutoff } },
          select: { id: true },
          take: 100,
        });
        if (batch.length === 0) break;
        const cardIds = batch.map((c) => c.id);

        // Coleta storageKeys dos attachments ANTES do DELETE — CASCADE apaga
        // as linhas mas nao chama o S3. Sem isso, arquivos ficam orfanados
        // pra sempre (e o bucket acumula cobranca sem propósito).
        const attachments = await this.prisma.attachment.findMany({
          where: { cardId: { in: cardIds } },
          select: { storageKey: true },
        });
        const keys = attachments.map((a) => a.storageKey).filter(Boolean);

        await raw.card.deleteMany({ where: { id: { in: cardIds } } });
        purgedCards += cardIds.length;

        if (keys.length > 0) {
          await this.storage.deleteObjects(keys);
          purgedFiles += keys.length;
        }
      }

      while (true) {
        const batch = await raw.list.findMany({
          where: { deletedAt: { lte: cutoff } },
          select: { id: true },
          take: 100,
        });
        if (batch.length === 0) break;
        await raw.list.deleteMany({ where: { id: { in: batch.map((l) => l.id) } } });
        purgedLists += batch.length;
      }

      if (purgedCards > 0 || purgedLists > 0) {
        this.logger.log(
          `Auto-purge concluido: ${purgedCards} card(s), ${purgedLists} lista(s), ${purgedFiles} arquivo(s) S3 com deletedAt <= ${cutoff.toISOString()}`,
        );
      }
    } catch (err) {
      this.logger.error(`Auto-purge falhou: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }
}
