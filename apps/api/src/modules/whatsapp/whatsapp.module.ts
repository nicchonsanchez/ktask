import { Global, Module } from '@nestjs/common';

import { WhatsAppHelper } from './whatsapp.helper';

/**
 * Modulo global de envio de WhatsApp via Evolution API. Marcado @Global
 * porque varios modulos (Approvals, Automations, futuras notifs) dependem
 * dele e nao tem sentido importar em cada um.
 */
@Global()
@Module({
  providers: [WhatsAppHelper],
  exports: [WhatsAppHelper],
})
export class WhatsAppModule {}
