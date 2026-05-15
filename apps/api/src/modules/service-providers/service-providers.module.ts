import { Module } from '@nestjs/common';

import { CryptoModule } from '@/common/crypto/crypto.module';
import { PrismaModule } from '@/common/prisma/prisma.module';

import { ServiceProvidersController } from './service-providers.controller';
import { ServiceProvidersService } from './service-providers.service';

/**
 * Modulo de Service Providers da federacao OAuth2/OIDC (KTask como IdP).
 *
 * Ver tarefas-md/51-federacao-idp-para-ogma.md.
 */
@Module({
  imports: [PrismaModule, CryptoModule],
  controllers: [ServiceProvidersController],
  providers: [ServiceProvidersService],
  exports: [ServiceProvidersService],
})
export class ServiceProvidersModule {}
