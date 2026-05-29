import { Injectable, Logger } from '@nestjs/common';
import type { ApprovalDispatchChannel, ApprovalDispatchKind, Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';

/**
 * Helper centralizado pra registrar cada envio de cobranca de aprovacao
 * (inicial, resend manual ou lembrete automatico). 1 linha por (envio,
 * reviewer) — quando lembrete consolidado vai pra 3 reviewers, gera 3 logs.
 *
 * Best-effort: erro ao logar NAO propaga (envio principal nao deve falhar
 * por causa de auditoria). Loga warning e segue.
 */
@Injectable()
export class ApprovalDispatchLogService {
  private readonly logger = new Logger(ApprovalDispatchLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: {
    organizationId: string;
    approvalId: string;
    reviewerUserId: string | null;
    phone: string | null;
    recipientName: string;
    kind: ApprovalDispatchKind;
    channel: ApprovalDispatchChannel;
    success: boolean;
    errorMessage?: string | null;
    preview?: string | null;
  }): Promise<void> {
    try {
      await this.prisma.approvalDispatchLog.create({
        data: {
          organizationId: entry.organizationId,
          approvalId: entry.approvalId,
          reviewerUserId: entry.reviewerUserId,
          phone: entry.phone,
          recipientName: entry.recipientName,
          kind: entry.kind,
          channel: entry.channel,
          success: entry.success,
          errorMessage: entry.errorMessage?.slice(0, 500) ?? null,
          preview: entry.preview?.slice(0, 1000) ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Falha ao logar dispatch approval=${entry.approvalId} reviewer=${entry.reviewerUserId ?? entry.phone}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  /**
   * Atalho pra registrar varios logs em batch (lembrete consolidado).
   * Usa createMany pra performance — sem return data, sem trigger.
   */
  async logMany(
    entries: Array<{
      organizationId: string;
      approvalId: string;
      reviewerUserId: string | null;
      phone: string | null;
      recipientName: string;
      kind: ApprovalDispatchKind;
      channel: ApprovalDispatchChannel;
      success: boolean;
      errorMessage?: string | null;
      preview?: string | null;
    }>,
  ): Promise<void> {
    if (entries.length === 0) return;
    try {
      await this.prisma.approvalDispatchLog.createMany({
        data: entries.map((e) => ({
          organizationId: e.organizationId,
          approvalId: e.approvalId,
          reviewerUserId: e.reviewerUserId,
          phone: e.phone,
          recipientName: e.recipientName,
          kind: e.kind,
          channel: e.channel,
          success: e.success,
          errorMessage: e.errorMessage?.slice(0, 500) ?? null,
          preview: e.preview?.slice(0, 1000) ?? null,
        })) as Prisma.ApprovalDispatchLogCreateManyInput[],
      });
    } catch (err) {
      this.logger.warn(
        `Falha ao logar batch de ${entries.length} dispatches: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }
}
