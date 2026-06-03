import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { applySoftDelete, getRawClient } from './soft-delete.extension';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });
    // Proxy substitui `this` na DI do Nest. Reads de Card/List ganham
    // filtro `deletedAt: null` automatico; raw client fica acessivel via
    // `this.raw` (TrashService, cron de purge).
    return applySoftDelete(this);
  }

  /**
   * Cliente Prisma sem o filtro de soft-delete. Use APENAS quando precisa
   * enxergar registros na lixeira (TrashService.list, cron de auto-purge).
   * Qualquer outro caso deve usar `this` direto pra evitar vazamento de
   * cards/listas excluidos em listings publicos.
   */
  get raw(): PrismaClient {
    return getRawClient(this);
  }

  /**
   * Em dev, o Postgres do docker-compose pode estar aceitando conexões mas
   * ainda não aceitando auth imediatamente depois do start. Também em prod,
   * reinícios do RDS podem causar janelas curtas de indisponibilidade.
   * Fazemos até 5 tentativas com backoff de 2s.
   */
  async onModuleInit() {
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.$connect();
        if (attempt > 1) {
          this.logger.log(`Conectado ao Postgres na tentativa ${attempt}.`);
        }
        return;
      } catch (err) {
        if (attempt === maxAttempts) {
          this.logger.error(
            `Falha ao conectar ao Postgres após ${maxAttempts} tentativas: ${String(err)}`,
          );
          throw err;
        }
        this.logger.warn(
          `Conexão com Postgres falhou (tentativa ${attempt}/${maxAttempts}). Tentando novamente em 2s...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
