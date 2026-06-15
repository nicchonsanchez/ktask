import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Automation,
  AutomationOutbox,
  AutomationOutboxScope,
  AutomationTrigger,
} from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';

import { AutomationsEngine } from './automations.engine';

/**
 * Tentativas máximas antes de declarar dead-letter. Sequência de backoff
 * abaixo é `BACKOFF_MS[attempt - 1]` — após `MAX_ATTEMPTS` a row vai pra
 * AutomationFailure e `processedAt` é setado pra sair do polling.
 */
const MAX_ATTEMPTS = 3;
/** Backoff por tentativa (ms): 30s, 2min, 10min. */
const BACKOFF_MS = [30_000, 120_000, 600_000];

/** Tamanho do lote do polling do cron — evita varrer outbox inteiro em 1 query. */
const BATCH_SIZE = 50;

/** Idade mínima de um run RUNNING pra sweeper considerar abandonado (ms). */
const ABANDONED_RUN_AGE_MS = 5 * 60_000;

type TxClient = Prisma.TransactionClient | PrismaService;

export interface EnqueueTriggerInput {
  organizationId: string;
  trigger: AutomationTrigger;
  cardId: string;
  scopeKind: AutomationOutboxScope;
  scopeId: string;
  /** Default 0. Herdar do parent quando vier de cadeia (chainDepth + 1). */
  chainDepth?: number;
}

/**
 * Serviço de outbox transacional pra triggers de automação.
 *
 * Resolve o problema do EventEmitter2 fire-and-forget: triggers eram
 * perdidos quando o processo morria entre o COMMIT e a execução do
 * handler `@OnEvent({ async: true })`. Agora o trigger é persistido na
 * MESMA transação que altera o estado do card/checklist — se a TXN
 * commita, o trigger existe; se não commita, nada aconteceu.
 *
 * Processamento em 2 caminhos complementares:
 *   - PUSH: caller chama `processOne(outboxId)` fire-and-forget após o
 *     COMMIT (latência baixa, ~ms).
 *   - PULL: cron @Every5s pega rows com `processedAt IS NULL` e
 *     `nextAttemptAt <= now()` usando `FOR UPDATE SKIP LOCKED` pra
 *     suportar múltiplos workers no futuro.
 *
 * Retry: 3 tentativas com backoff 30s/2min/10min. Após esgotar, cria
 * AutomationFailure (dead-letter) com snapshot pra reprocessamento manual.
 */
@Injectable()
export class AutomationsOutboxService {
  private readonly logger = new Logger(AutomationsOutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    // forwardRef pra quebrar ciclo: Engine usa Outbox (pra encadear),
    // Outbox usa Engine (pra rodar handler).
    @Inject(forwardRef(() => AutomationsEngine))
    private readonly engine: AutomationsEngine,
  ) {}

  /**
   * Persiste um trigger pra processamento posterior. Aceita
   * `Prisma.TransactionClient` quando chamado dentro de uma TXN — esse é
   * o uso esperado (atomicidade com a mudança que disparou o trigger).
   *
   * Retorna a row criada pro caller poder chamar `processOne(row.id)`
   * fire-and-forget após o COMMIT.
   */
  async enqueue(tx: TxClient, input: EnqueueTriggerInput): Promise<AutomationOutbox> {
    return tx.automationOutbox.create({
      data: {
        organizationId: input.organizationId,
        trigger: input.trigger,
        cardId: input.cardId,
        scopeKind: input.scopeKind,
        scopeId: input.scopeId,
        chainDepth: input.chainDepth ?? 0,
      },
    });
  }

  /**
   * Atalho pro caso comum de trigger CARD_MOVED: enfileira CARD_LEFT na
   * origem + CARD_ENTERED no destino numa só chamada. Mantém a
   * semântica do antigo `onCardMoved` mas agora transacional.
   */
  async enqueueCardMoved(
    tx: TxClient,
    params: {
      organizationId: string;
      cardId: string;
      fromListId: string;
      toListId: string;
      chainDepth?: number;
    },
  ): Promise<{ leftId: string; enteredId: string }> {
    const [left, entered] = await Promise.all([
      this.enqueue(tx, {
        organizationId: params.organizationId,
        trigger: 'CARD_LEFT',
        cardId: params.cardId,
        scopeKind: 'LIST',
        scopeId: params.fromListId,
        chainDepth: params.chainDepth,
      }),
      this.enqueue(tx, {
        organizationId: params.organizationId,
        trigger: 'CARD_ENTERED',
        cardId: params.cardId,
        scopeKind: 'LIST',
        scopeId: params.toListId,
        chainDepth: params.chainDepth,
      }),
    ]);
    return { leftId: left.id, enteredId: entered.id };
  }

  /**
   * PUSH path: processa 1 entry pelo ID. Chamado fire-and-forget logo
   * após o COMMIT da TXN que enfileirou. Latência ~ms.
   *
   * Erros não propagam — se o push falhar (Redis down, processo
   * sobrecarregado, race), o cron pega no próximo ciclo.
   */
  async processOne(outboxId: string): Promise<void> {
    try {
      const row = await this.prisma.automationOutbox.findUnique({
        where: { id: outboxId },
      });
      if (!row || row.processedAt) return; // já processado ou inexistente
      await this.runEntry(row);
    } catch (err) {
      this.logger.warn(
        `processOne(${outboxId}) falhou: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * PULL path: cron busca outbox pendente cujo `nextAttemptAt <= now()`
   * usando `FOR UPDATE SKIP LOCKED` (suporta multi-worker no futuro).
   *
   * Roda em loop curto até esvaziar o batch — evita que um cron tick que
   * pega 50 rows fique 5min processando e bloqueie o próximo.
   */
  async processPending(): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;

    // Loop até esgotar o batch atual. Defensivo: max 5 batches por tick
    // pra não monopolizar event loop em caso de surto.
    for (let i = 0; i < 5; i++) {
      const ids = await this.lockBatch();
      if (ids.length === 0) break;

      for (const id of ids) {
        const row = await this.prisma.automationOutbox.findUnique({ where: { id } });
        if (!row || row.processedAt) continue;
        try {
          await this.runEntry(row);
          processed++;
        } catch {
          // runEntry já trata erro internamente (marca attempt/lastError);
          // catch aqui é só pra não derrubar o batch inteiro.
          failed++;
        }
      }
    }

    return { processed, failed };
  }

  /**
   * Conta entries no outbox ainda não processadas (independente de
   * `nextAttemptAt`). Usado pelo heartbeat do scheduler — se há rows
   * pendentes mas `processPending` não pega nenhuma, algo na query
   * temporal (`nextAttemptAt <= NOW()`) está mascarando: foi assim que
   * o bug de TZ mismatch ficou invisível até virar incidente.
   */
  async countPending(): Promise<number> {
    return this.prisma.automationOutbox.count({ where: { processedAt: null } });
  }

  /**
   * Lock + claim de até BATCH_SIZE rows pendentes. Usa `FOR UPDATE SKIP
   * LOCKED` pra não bloquear workers concorrentes (cada um pega um
   * subset disjunto). Não altera a row aqui — só seleciona; mutações
   * acontecem em `runEntry`.
   *
   * Retorna só os IDs — fetch completo é feito row-a-row depois pra
   * minimizar tempo segurando o lock.
   */
  private async lockBatch(): Promise<string[]> {
    // $queryRaw com tagged template — Prisma binda parâmetros seguros.
    //
    // CUIDADO TZ: `nextAttemptAt` eh `timestamp without time zone`. Prisma
    // grava ISO UTC ("13:31:19Z"), o Postgres faz STRIP do Z e armazena
    // como "13:31:19" cru. Quando comparado com NOW() (timestamptz), o
    // Postgres reinterpreta o sem-tz no TZ da sessao — se a sessao for
    // America/Sao_Paulo, "13:31:19" vira "13:31:19 BRT" = "16:31:19 UTC",
    // que parece estar 3h no futuro. Cron silenciosamente nunca achava
    // nada due. Workaround: comparar contra NOW() AT TIME ZONE 'UTC' pra
    // forcar a interpretacao no mesmo TZ em que foi gravado. Solucao
    // estrutural seria migrar todos os datetime pra timestamptz.
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "AutomationOutbox"
      WHERE "processedAt" IS NULL
        AND "nextAttemptAt" <= (NOW() AT TIME ZONE 'UTC')
      ORDER BY "createdAt" ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    `;
    return rows.map((r) => r.id);
  }

  /**
   * Executa o trigger de 1 outbox row. Encapsula:
   *   - Resolução das automações ativas que casam (scope + trigger).
   *   - Execução de cada uma via `engine.executeFromOutbox` (que cria
   *     AutomationRun + roda handler + atualiza status).
   *   - Em sucesso: marca outbox.processedAt = now.
   *   - Em erro: incrementa attempts, agenda próximo retry. Após
   *     MAX_ATTEMPTS, cria AutomationFailure pra cada automação que
   *     falhou e marca processedAt pra sair do polling.
   */
  private async runEntry(row: AutomationOutbox): Promise<void> {
    try {
      // Busca automações ativas que casam com (scope, trigger). Mesmo
      // filtro que o antigo `dispatchTrigger` usava.
      const scopeWhere =
        row.scopeKind === 'LIST'
          ? { listId: row.scopeId }
          : row.scopeKind === 'CHECKLIST'
            ? { scopeChecklistId: row.scopeId }
            : { scopeChecklistItemId: row.scopeId };

      const automations = await this.prisma.automation.findMany({
        where: {
          ...scopeWhere,
          trigger: row.trigger,
          isActive: true,
          organizationId: row.organizationId,
        },
      });

      // Sem automação ativa: noop com sucesso (não é erro).
      if (automations.length === 0) {
        await this.markProcessed(row.id);
        return;
      }

      // Roda cada automação. Erros individuais NÃO abortam as outras —
      // coletamos e, no final, decidimos se a outbox row é "sucesso total"
      // ou "tem que reagendar pra retry".
      const failures: Array<{ automation: Automation; error: Error }> = [];
      for (const automation of automations) {
        try {
          await this.engine.executeFromOutbox(automation, row.cardId, row.chainDepth);
        } catch (err) {
          failures.push({ automation, error: err instanceof Error ? err : new Error(String(err)) });
        }
      }

      if (failures.length === 0) {
        await this.markProcessed(row.id);
        return;
      }

      // Pelo menos 1 falhou. Estratégia: incrementa attempts da OUTBOX
      // (não da automação individual) e reagenda. Quando attempts atinge
      // MAX_ATTEMPTS, materializa AutomationFailure pra cada automação
      // que ainda estava falhando.
      await this.handleAttemptFailure(row, failures);
    } catch (err) {
      // Erro fora do loop de automações (ex: query de automation falhou).
      // Trata como falha global da row — incrementa attempts uma vez.
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`runEntry(${row.id}) erro global: ${error.message}`);
      await this.handleAttemptFailure(row, []);
      throw error; // propaga pro caller (processPending conta como failed)
    }
  }

  private async markProcessed(outboxId: string): Promise<void> {
    await this.prisma.automationOutbox.update({
      where: { id: outboxId },
      data: { processedAt: new Date() },
    });
  }

  /**
   * Incrementa `attempts` e calcula `nextAttemptAt`. Quando esgotar
   * `MAX_ATTEMPTS`, materializa dead-letter e marca processedAt.
   *
   * `failures` é a lista de (automation, error) que falharam nesta
   * tentativa — usada só pra gravar AutomationFailure quando esgotar.
   * Quando vazia (erro fora do loop), só incrementa attempts.
   */
  private async handleAttemptFailure(
    row: AutomationOutbox,
    failures: Array<{ automation: Automation; error: Error }>,
  ): Promise<void> {
    const newAttempts = row.attempts + 1;
    const lastError = failures.length > 0 ? failures.map((f) => f.error.message).join(' | ') : null;

    if (newAttempts >= MAX_ATTEMPTS) {
      // Dead-letter: marca row como processada (pra sair do polling) e
      // cria AutomationFailure pra cada automação que ainda falhava.
      await this.prisma.$transaction(async (tx) => {
        await tx.automationOutbox.update({
          where: { id: row.id },
          data: {
            attempts: newAttempts,
            processedAt: new Date(),
            lastError,
          },
        });

        if (failures.length > 0) {
          await tx.automationFailure.createMany({
            data: failures.map((f) => ({
              organizationId: row.organizationId,
              automationId: f.automation.id,
              cardId: row.cardId,
              trigger: row.trigger,
              actionType: f.automation.actionType,
              attempts: newAttempts,
              errorMessage: f.error.message.slice(0, 4000),
              errorStack: f.error.stack?.slice(0, 8000) ?? null,
              payloadSnapshot: {
                outboxId: row.id,
                trigger: row.trigger,
                scopeKind: row.scopeKind,
                scopeId: row.scopeId,
                cardId: row.cardId,
                chainDepth: row.chainDepth,
              } as Prisma.InputJsonValue,
            })),
          });
        }
      });
      this.logger.warn(
        `Dead-letter outbox=${row.id} trigger=${row.trigger} card=${row.cardId} failures=${failures.length}`,
      );
      return;
    }

    // Ainda tem tentativa: agenda próxima com backoff.
    const delay = BACKOFF_MS[newAttempts - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1]!;
    await this.prisma.automationOutbox.update({
      where: { id: row.id },
      data: {
        attempts: newAttempts,
        nextAttemptAt: new Date(Date.now() + delay),
        lastError,
      },
    });
  }

  /**
   * Sweeper de runs travados em RUNNING. Acionado por cron a cada 5min.
   *
   * Marca como ABANDONED qualquer AutomationRun em RUNNING há mais de
   * `ABANDONED_RUN_AGE_MS` (5min). Não reprocessa automaticamente — só
   * marca pra dar visibilidade no painel admin. O reprocessamento
   * acontece via outbox normal: se o evento original veio pelo outbox,
   * a row dele continua pendente (não foi marcada processedAt) e o
   * polling vai retomar.
   *
   * Triggers temporais (TIME_IN_LIST etc) não passam pelo outbox —
   * pra esses, o ABANDONED ficaria sem reprocessamento automático.
   * Acceptable: o próprio scheduler temporal vai re-disparar no
   * próximo tick (já tem idempotência por dueDate/enteredListAt).
   */
  async sweepAbandonedRuns(): Promise<{ abandoned: number }> {
    const threshold = new Date(Date.now() - ABANDONED_RUN_AGE_MS);
    const result = await this.prisma.automationRun.updateMany({
      where: { status: 'RUNNING', startedAt: { lt: threshold } },
      data: { status: 'ABANDONED', finishedAt: new Date(), error: 'Run abandonada pelo sweeper' },
    });
    if (result.count > 0) {
      this.logger.warn(`Sweeper marcou ${result.count} runs como ABANDONED`);
    }
    return { abandoned: result.count };
  }
}
