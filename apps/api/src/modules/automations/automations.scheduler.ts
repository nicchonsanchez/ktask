import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Automation } from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';
import { AutomationsEngine } from './automations.engine';
import { AutomationsOutboxService } from './automations.outbox.service';

/**
 * Scheduler de triggers temporais — Fase D.
 *
 * Roda em-process via @nestjs/schedule. Pra cada trigger temporal,
 * varre as automações ativas do tipo, lista cards candidatos e dispara
 * `engine.executeAutomationDirect` se nenhum AutomationRun bem-sucedido
 * existir pra (automation, card) no ciclo atual.
 *
 * Idempotência:
 *   - TIME_IN_LIST / TIME_NO_INTERACTION: deduplicado por (automation, card,
 *     enteredListAt/updatedAt) — se já rodou após a referência temporal,
 *     skip.
 *   - DUE_DATE_TODAY / DUE_DATE_OVERDUE: deduplicado por (automation, card,
 *     dueDate) — se já rodou pra esse mesmo dueDate, skip.
 *
 * Granularidade:
 *   - Triggers de minuto (TIME_IN_LIST, TIME_NO_INTERACTION): cron a cada
 *     minuto, mas só dispara se config.minutes for atingido.
 *   - Triggers de dia (DUE_DATE_TODAY, DUE_DATE_OVERDUE): cron horário,
 *     compara em fuso BRT (America/Sao_Paulo).
 */
@Injectable()
export class AutomationsScheduler {
  private readonly logger = new Logger(AutomationsScheduler.name);

  /**
   * Flag in-memory pra evitar re-entrada do processador da outbox.
   * `@Cron` pode disparar enquanto a execução anterior ainda está rodando
   * (5s pode não bastar pra um batch grande). Em multi-instância, o
   * `FOR UPDATE SKIP LOCKED` da query cobre o isolamento; essa flag é só
   * pra evitar overlap dentro do mesmo processo.
   */
  private outboxProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AutomationsEngine,
    private readonly outbox: AutomationsOutboxService,
  ) {}

  /**
   * Pull worker do AutomationOutbox. Roda a cada 5s; busca rows com
   * `processedAt IS NULL` e `nextAttemptAt <= now()` em batch de 50,
   * usando `FOR UPDATE SKIP LOCKED` pra suportar multi-worker.
   *
   * É a rede de proteção: o caminho "push" (chamado fire-and-forget logo
   * após o COMMIT do caller) cobre o caso feliz. Quando o push falha
   * (processo sobrecarregado, race) ou a row precisa de retry (erro
   * transitório com backoff), esse cron é quem garante eventual delivery.
   */
  @Cron(CronExpression.EVERY_5_SECONDS)
  async runOutboxPoll() {
    if (this.outboxProcessing) return; // skip se anterior ainda rola
    this.outboxProcessing = true;
    try {
      const result = await this.outbox.processPending();
      if (result.processed > 0 || result.failed > 0) {
        this.logger.log(`Outbox poll: ${result.processed} processadas, ${result.failed} falharam`);
      }
      // Heartbeat a cada minuto + sentinela de pendencia. Se tem rows
      // pendentes mas o PULL nao processa, algo na query temporal esta
      // mascarando entries due (foi assim que o bug de TZ ficou meses
      // invisivel). Log force visibilidade.
      const now = Date.now();
      if (now - this.lastHeartbeatAt > 60_000) {
        const pendingCount = await this.outbox.countPending();
        if (pendingCount > 0) {
          this.logger.warn(
            `Outbox heartbeat: ${pendingCount} pendentes acumulados (PULL não pegou; verifique TZ / nextAttemptAt)`,
          );
        }
        this.lastHeartbeatAt = now;
      }
    } catch (err) {
      this.logger.error(`Outbox poll erro global: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.outboxProcessing = false;
    }
  }

  private lastHeartbeatAt = 0;

  /**
   * Sweeper de runs travados em RUNNING. Roda a cada 5min. Marca como
   * ABANDONED qualquer run em RUNNING há mais de 5min — sinaliza que o
   * processo morreu durante a execução. NÃO reprocessa automaticamente:
   * pra triggers via outbox, a row dela permanece pendente e o poll
   * acima retoma; pra triggers temporais, o próximo tick do scheduler
   * temporal já lida via idempotência (alreadyRan).
   */
  @Cron('0 */5 * * * *') // a cada 5 minutos
  async runAbandonedSweeper() {
    try {
      await this.outbox.sweepAbandonedRuns();
    } catch (err) {
      this.logger.error(`Sweeper erro: ${err instanceof Error ? err.message : err}`);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async runTimeInList() {
    const automations = await this.prisma.automation.findMany({
      where: { trigger: 'TIME_IN_LIST', isActive: true },
    });
    if (automations.length === 0) return;

    const now = Date.now();
    for (const automation of automations) {
      try {
        await this.processTimeInList(automation, now);
      } catch (err) {
        this.logger.error(
          `runTimeInList falhou em automação ${automation.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async runTimeNoInteraction() {
    const automations = await this.prisma.automation.findMany({
      where: { trigger: 'TIME_NO_INTERACTION', isActive: true },
    });
    if (automations.length === 0) return;

    const now = Date.now();
    for (const automation of automations) {
      try {
        await this.processTimeNoInteraction(automation, now);
      } catch (err) {
        this.logger.error(
          `runTimeNoInteraction falhou em automação ${automation.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async runDueDateToday() {
    const automations = await this.prisma.automation.findMany({
      where: { trigger: 'DUE_DATE_TODAY', isActive: true },
    });
    if (automations.length === 0) return;

    const { start, end } = todayRangeBRT();
    for (const automation of automations) {
      try {
        await this.processDueDateRange(automation, start, end);
      } catch (err) {
        this.logger.error(
          `runDueDateToday falhou em automação ${automation.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async runDueDateOverdue() {
    const automations = await this.prisma.automation.findMany({
      where: { trigger: 'DUE_DATE_OVERDUE', isActive: true },
    });
    if (automations.length === 0) return;

    const { start } = todayRangeBRT();
    for (const automation of automations) {
      try {
        await this.processOverdue(automation, start);
      } catch (err) {
        this.logger.error(
          `runDueDateOverdue falhou em automação ${automation.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  // ---------------- Processadores por trigger ----------------

  /**
   * TIME_IN_LIST: dispara quando card está na coluna há >= triggerConfig.minutes,
   * computado a partir de `enteredListAt`. Idempotente por (automation,
   * card, enteredListAt) — se já rodou após enteredListAt, skip.
   */
  private async processTimeInList(automation: Automation, nowMs: number) {
    const triggerConfig = automation.triggerConfig as { minutes?: number };
    const triggerMinutes =
      typeof triggerConfig?.minutes === 'number' && triggerConfig.minutes > 0
        ? triggerConfig.minutes
        : 0;
    if (triggerMinutes <= 0) return;

    const threshold = new Date(nowMs - triggerMinutes * 60_000);
    if (!automation.listId) return;
    const cards = await this.prisma.card.findMany({
      where: {
        listId: automation.listId,
        organizationId: automation.organizationId,
        isArchived: false,
        completedAt: null,
        enteredListAt: { lte: threshold },
      },
      select: { id: true, enteredListAt: true },
    });
    if (cards.length === 0) return;

    for (const card of cards) {
      const alreadyRan = await this.prisma.automationRun.findFirst({
        where: {
          automationId: automation.id,
          cardId: card.id,
          startedAt: { gte: card.enteredListAt },
          status: { in: ['SUCCESS', 'RUNNING'] },
        },
        select: { id: true },
      });
      if (alreadyRan) continue;
      await this.engine.executeAutomationDirect(automation, card.id);
    }
  }

  /**
   * TIME_NO_INTERACTION: dispara quando card está sem update há >=
   * config.minutes (usa Card.updatedAt). Idempotente por (automation,
   * card, updatedAt).
   */
  private async processTimeNoInteraction(automation: Automation, nowMs: number) {
    const triggerConfig = automation.triggerConfig as { minutes?: number };
    const triggerMinutes =
      typeof triggerConfig?.minutes === 'number' && triggerConfig.minutes > 0
        ? triggerConfig.minutes
        : 0;
    if (triggerMinutes <= 0) return;

    const threshold = new Date(nowMs - triggerMinutes * 60_000);
    if (!automation.listId) return;
    const cards = await this.prisma.card.findMany({
      where: {
        listId: automation.listId,
        organizationId: automation.organizationId,
        isArchived: false,
        completedAt: null,
        updatedAt: { lte: threshold },
      },
      select: { id: true, updatedAt: true },
    });
    if (cards.length === 0) return;

    for (const card of cards) {
      const alreadyRan = await this.prisma.automationRun.findFirst({
        where: {
          automationId: automation.id,
          cardId: card.id,
          startedAt: { gte: card.updatedAt },
          status: { in: ['SUCCESS', 'RUNNING'] },
        },
        select: { id: true },
      });
      if (alreadyRan) continue;
      await this.engine.executeAutomationDirect(automation, card.id);
    }
  }

  /**
   * DUE_DATE_TODAY: dispara para cards com dueDate no dia atual (BRT).
   * Idempotente por (automation, card) com run >= início do dia BRT.
   */
  private async processDueDateRange(automation: Automation, start: Date, end: Date) {
    if (!automation.listId) return;
    const cards = await this.prisma.card.findMany({
      where: {
        listId: automation.listId,
        organizationId: automation.organizationId,
        isArchived: false,
        completedAt: null,
        dueDate: { gte: start, lt: end },
      },
      select: { id: true },
    });
    if (cards.length === 0) return;

    for (const card of cards) {
      const alreadyRan = await this.prisma.automationRun.findFirst({
        where: {
          automationId: automation.id,
          cardId: card.id,
          startedAt: { gte: start },
          status: { in: ['SUCCESS', 'RUNNING'] },
        },
        select: { id: true },
      });
      if (alreadyRan) continue;
      await this.engine.executeAutomationDirect(automation, card.id);
    }
  }

  /**
   * DUE_DATE_OVERDUE: cards com dueDate < início do dia atual (BRT).
   * Idempotente: dispara apenas 1x por dia por card (run >= início do dia).
   */
  private async processOverdue(automation: Automation, todayStart: Date) {
    if (!automation.listId) return;
    const cards = await this.prisma.card.findMany({
      where: {
        listId: automation.listId,
        organizationId: automation.organizationId,
        isArchived: false,
        completedAt: null,
        dueDate: { lt: todayStart, not: null },
      },
      select: { id: true },
    });
    if (cards.length === 0) return;

    for (const card of cards) {
      const alreadyRan = await this.prisma.automationRun.findFirst({
        where: {
          automationId: automation.id,
          cardId: card.id,
          startedAt: { gte: todayStart },
          status: { in: ['SUCCESS', 'RUNNING'] },
        },
        select: { id: true },
      });
      if (alreadyRan) continue;
      await this.engine.executeAutomationDirect(automation, card.id);
    }
  }
}

/**
 * Calcula início e fim do dia atual em BRT (America/Sao_Paulo, UTC-3
 * sem DST). Retorna instantes UTC equivalentes ao 00:00 e 24:00 do
 * dia local. Não usa Intl pra evitar custo por chamada.
 */
function todayRangeBRT(): { start: Date; end: Date } {
  const now = new Date();
  // BRT é UTC-3 sem DST. 00:00 BRT = 03:00 UTC do mesmo dia.
  const utc = new Date(now.getTime());
  const brtMs = utc.getTime() - 3 * 60 * 60_000;
  const brt = new Date(brtMs);
  const y = brt.getUTCFullYear();
  const m = brt.getUTCMonth();
  const d = brt.getUTCDate();
  // 00:00 BRT desse dia em UTC
  const start = new Date(Date.UTC(y, m, d, 3, 0, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60_000);
  return { start, end };
}
