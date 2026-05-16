import { Inject, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Queue, Worker } from 'bullmq';
import { createHmac, randomUUID } from 'node:crypto';
import IORedis from 'ioredis';

import { env } from '@/config/env';
import { PrismaService } from '@/common/prisma/prisma.service';

/**
 * Eventos despachados pra Service Providers externos (federacao OAuth2/OIDC).
 * Etapa 3 do plano em tarefas-md/51-federacao-idp-para-ogma.md.
 *
 * Adicione novos eventos aqui + emit no service de origem (UsersService,
 * OrganizationsService, etc.).
 */
export const SP_EVENT_NAMES = {
  USUARIO_EMAIL_ALTERADO: 'usuario.email_alterado',
  USUARIO_SENHA_ALTERADA: 'usuario.senha_alterada',
  USUARIO_DESATIVADO: 'usuario.desativado',
  USUARIO_REMOVIDO: 'usuario.removido',
  ORGANIZACAO_ATUALIZADA: 'organizacao.atualizada',
} as const;

export type SpEventName = (typeof SP_EVENT_NAMES)[keyof typeof SP_EVENT_NAMES];

const QUEUE_NAME = 'sp-webhooks-outbound';
const REDIS_TOKEN = Symbol('SP_WEBHOOK_REDIS');
const QUEUE_TOKEN = Symbol('SP_WEBHOOK_QUEUE');

interface JobData {
  serviceProviderId: string;
  url: string;
  /// SHA-256 hex do secret; o secret em plaintext esta na env de bootstrap.
  /// (Esse design vai ser refinado quando rotacionar secret virar feature
  /// completa; por ora o secret eh o webhookSecret armazenado na tabela
  /// quando criou o SP, e copiamos plaintext aqui pra evitar query extra.)
  secret: string;
  event: SpEventName;
  eventId: string;
  payload: Record<string, unknown>;
}

@Injectable()
class WebhookDispatcherService {
  private readonly logger = new Logger(WebhookDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(QUEUE_TOKEN) private readonly queue: Queue,
  ) {}

  /**
   * Lista SPs ativos que escutam um determinado evento e enfileira jobs.
   * Idempotencia: cada job tem `eventId` unico que o SP deve usar pra
   * deduplicar (recebe 2x = ignora a 2a).
   */
  async dispatch(event: SpEventName, payload: Record<string, unknown>): Promise<void> {
    // Busca SPs ativos que tem `event` no escopo.
    const sps = await this.prisma.serviceProvider.findMany({
      where: { ativo: true, escopo: { has: event } },
    });

    if (sps.length === 0) return;

    const eventId = randomUUID();
    await Promise.all(
      sps.map((sp) =>
        this.queue.add(
          event,
          {
            serviceProviderId: sp.id,
            url: sp.webhookUrl,
            secret: sp.secretHash, // ver nota em JobData
            event,
            eventId,
            payload,
          } as JobData,
          { jobId: `${event}-${eventId}-${sp.id}` },
        ),
      ),
    );

    this.logger.debug(`Despacha ${event} (eventId=${eventId}) pra ${sps.length} SP(s).`);
  }

  // Bridge: eventos internos (EventEmitter2) viram dispatch outbound.
  @OnEvent(SP_EVENT_NAMES.USUARIO_EMAIL_ALTERADO)
  async onEmailAlterado(payload: { userId: string; emailAntigo: string; emailNovo: string }) {
    await this.dispatch(SP_EVENT_NAMES.USUARIO_EMAIL_ALTERADO, payload);
  }

  @OnEvent(SP_EVENT_NAMES.USUARIO_SENHA_ALTERADA)
  async onSenhaAlterada(payload: { userId: string; revogarSessoes: boolean }) {
    await this.dispatch(SP_EVENT_NAMES.USUARIO_SENHA_ALTERADA, payload);
  }

  @OnEvent(SP_EVENT_NAMES.USUARIO_DESATIVADO)
  async onDesativado(payload: { userId: string; motivo: string | null }) {
    await this.dispatch(SP_EVENT_NAMES.USUARIO_DESATIVADO, payload);
  }

  @OnEvent(SP_EVENT_NAMES.USUARIO_REMOVIDO)
  async onRemovido(payload: { userId: string }) {
    await this.dispatch(SP_EVENT_NAMES.USUARIO_REMOVIDO, payload);
  }

  @OnEvent(SP_EVENT_NAMES.ORGANIZACAO_ATUALIZADA)
  async onOrgAtualizada(payload: { organizationId: string; slug: string }) {
    await this.dispatch(SP_EVENT_NAMES.ORGANIZACAO_ATUALIZADA, payload);
  }
}

@Injectable()
class WebhookWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookWorkerService.name);
  private worker: Worker | null = null;

  constructor(@Inject(REDIS_TOKEN) private readonly redis: IORedis) {}

  onModuleInit() {
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const data = job.data as JobData;
        const body = JSON.stringify({
          event: data.event,
          eventId: data.eventId,
          timestamp: new Date().toISOString(),
          payload: data.payload,
        });
        const signature = createHmac('sha256', data.secret).update(body).digest('hex');

        const res = await fetch(data.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Event-Id': data.eventId,
            'X-Event-Name': data.event,
            'X-Hub-Signature-256': `sha256=${signature}`,
            'User-Agent': 'KTask-Webhook-Dispatcher/1.0',
          },
          body,
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
          throw new Error(
            `SP ${data.serviceProviderId} retornou ${res.status}: ${await res.text()}`,
          );
        }
      },
      {
        connection: this.redis,
        concurrency: 5,
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.warn(
        `Webhook job ${job?.id} falhou: ${err.message} (tentativa ${job?.attemptsMade ?? '?'})`,
      );
    });

    this.logger.log(`Worker ${QUEUE_NAME} iniciado.`);
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}

@Module({
  providers: [
    {
      provide: REDIS_TOKEN,
      useFactory: () =>
        new IORedis(env.REDIS_URL, {
          maxRetriesPerRequest: null,
        }),
    },
    {
      provide: QUEUE_TOKEN,
      inject: [REDIS_TOKEN],
      useFactory: (redis: IORedis) =>
        new Queue(QUEUE_NAME, {
          connection: redis,
          defaultJobOptions: {
            attempts: 5,
            backoff: { type: 'exponential', delay: 60_000 }, // 1min, 2min, 4min, 8min, 16min
            removeOnComplete: { age: 7 * 24 * 3600, count: 1_000 },
            removeOnFail: { age: 30 * 24 * 3600 },
          },
        }),
    },
    WebhookDispatcherService,
    WebhookWorkerService,
  ],
  exports: [WebhookDispatcherService],
})
export class WebhooksOutboundModule {}

export { WebhookDispatcherService };
