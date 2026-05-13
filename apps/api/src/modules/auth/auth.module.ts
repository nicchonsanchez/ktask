import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';

import { env } from '@/config/env';
import { UsersModule } from '@/modules/users/users.module';
import { OrganizationsModule } from '@/modules/organizations/organizations.module';
import { MailModule } from '@/modules/mail/mail.module';
import { WhatsAppModule } from '@/modules/whatsapp/whatsapp.module';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    OrganizationsModule,
    MailModule,
    WhatsAppModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: env.JWT_ACCESS_SECRET,
      signOptions: { expiresIn: env.JWT_ACCESS_TTL as unknown as number },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, { provide: APP_GUARD, useClass: JwtAuthGuard }],
  exports: [AuthService],
})
export class AuthModule {}
