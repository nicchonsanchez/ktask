import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { WhatsappOutboxService } from './whatsapp-outbox.service';

/**
 * Cron que processa o WhatsappOutbox. Roda a cada minuto. Cada tick:
 *   1. Busca rows due (sentAt=null, scheduledFor<=now, attempts<3)
 *   2. Agrupa por userId, formata mensagem mesclada
 *   3. Envia via Evolution com throttle entre destinatarios
 *   4. Aplica caps (user 6/h, org 20/h, quiet hours 22h-7h)
 *
 * Errors do helper Evolution sao registrados em lastError e reagendados
 * pra retry em 5min. Apos 3 falhas a row eh ignorada (flag no DB).
 */
@Injectable()
export class WhatsappOutboxScheduler {
  private readonly logger = new Logger(WhatsappOutboxScheduler.name);
  private running = false;

  constructor(private readonly outbox: WhatsappOutboxService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    if (this.running) return; // overlap guard — se um ciclo demorar (jitter+envio), pula
    this.running = true;
    try {
      const result = await this.outbox.processBatch();
      if (result.sent > 0 || result.failed > 0 || result.capped > 0) {
        this.logger.log(
          `WhatsappOutbox: ${result.sent} msgs (${result.rowsCovered} rows), ` +
            `${result.failed} falharam, ${result.capped} adiadas`,
        );
      }
    } catch (err) {
      this.logger.error(
        `WhatsappOutbox tick erro global: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      this.running = false;
    }
  }
}
