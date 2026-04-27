import { Injectable, Logger } from '@nestjs/common';

import { env } from '@/config/env';

/**
 * Helper minimalista pra mandar mensagem de texto via Evolution API.
 *
 * Usa as creds default da Org (em dev/MVP). Em produção a mesma engine
 * pode evoluir pra ler config por Org (Integration.config criptografada).
 *
 * Falhas são logadas mas NÃO propagadas — envio WhatsApp é "best effort":
 * se a Evolution estiver fora, o caller continua funcionando (aprovacao
 * ainda funciona via inbox interno + push; automacao ainda registra run
 * SUCCESS com flag de delivery=false).
 */
@Injectable()
export class WhatsAppHelper {
  private readonly logger = new Logger(WhatsAppHelper.name);

  isEnabled(): boolean {
    return Boolean(
      env.EVOLUTION_DEFAULT_URL && env.EVOLUTION_DEFAULT_API_KEY && env.EVOLUTION_DEFAULT_INSTANCE,
    );
  }

  /**
   * Envia uma mensagem de texto pro número informado (E.164 sem '+').
   * Retorna true se a Evolution aceitou; false se desabilitado ou erro.
   */
  async sendText(phone: string, text: string): Promise<boolean> {
    if (!this.isEnabled()) {
      this.logger.warn('WhatsApp desabilitado (Evolution sem creds) — pulando envio.');
      return false;
    }

    const url = `${env.EVOLUTION_DEFAULT_URL}/message/sendText/${env.EVOLUTION_DEFAULT_INSTANCE}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: env.EVOLUTION_DEFAULT_API_KEY!,
        },
        body: JSON.stringify({ number: phone, text }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.warn(`Evolution sendText ${res.status} pra ${phone}: ${body.slice(0, 200)}`);
        return false;
      }
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Evolution sendText falhou pra ${phone}: ${msg}`);
      return false;
    }
  }
}
