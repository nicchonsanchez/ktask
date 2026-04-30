import { Global, Module } from '@nestjs/common';

import { MailService } from './mail.service';

/**
 * Doc 34: modulo global de email — qualquer modulo pode injetar MailService
 * sem precisar adicionar import. Uso esperado: invitations, password
 * recovery, notifications externas.
 */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
