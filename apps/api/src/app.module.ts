import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { env } from './config/env';
import { PrismaModule } from './common/prisma/prisma.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { BoardsModule } from './modules/boards/boards.module';
import { ListsModule } from './modules/lists/lists.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { CardsModule } from './modules/cards/cards.module';
import { ChecklistsModule } from './modules/checklists/checklists.module';
import { CommentsModule } from './modules/comments/comments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { SearchModule } from './modules/search/search.module';
import { StorageModule } from './modules/storage/storage.module';
import { TimeTrackingModule } from './modules/time-tracking/time-tracking.module';
import { MeModule } from './modules/me/me.module';
import { LabelsModule } from './modules/labels/labels.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { AutomationsModule } from './modules/automations/automations.module';
import { AdminModule } from './modules/admin/admin.module';
import { PushModule } from './modules/push/push.module';
import { ChecklistTemplatesModule } from './modules/checklist-templates/checklist-templates.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { ImporterModule } from './modules/importer/importer.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.LOG_LEVEL,
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        transport:
          env.NODE_ENV === 'development'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  singleLine: true,
                  translateTime: 'SYS:HH:MM:ss.l',
                  ignore: 'pid,hostname,req,res',
                  messageFormat: '{context} · {msg}',
                },
              }
            : undefined,
        serializers: {
          req: (req: { id: string; method: string; url: string }) => ({
            id: req.id,
            method: req.method,
            url: req.url,
          }),
          res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
        },
      },
    }),
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    PrismaModule,
    CryptoModule,
    UsersModule,
    AuthModule,
    OrganizationsModule,
    BoardsModule,
    ListsModule,
    CardsModule,
    ChecklistsModule,
    AttachmentsModule,
    CommentsModule,
    NotificationsModule,
    RealtimeModule,
    SearchModule,
    StorageModule,
    TimeTrackingModule,
    MeModule,
    LabelsModule,
    TasksModule,
    AutomationsModule,
    AdminModule,
    PushModule,
    ChecklistTemplatesModule,
    WhatsAppModule,
    ApprovalsModule,
    ContactsModule,
    ImporterModule,
    HealthModule,
  ],
  providers: [
    // Guard global do throttler — sem isso, o decorator @Throttle não tem efeito.
    // Limit padrão é 100 req/60s por IP (config no ThrottlerModule.forRoot acima);
    // endpoints sensíveis (ex: auth/login) podem aplicar limites mais restritos
    // via @Throttle({ default: { ttl, limit } }).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
