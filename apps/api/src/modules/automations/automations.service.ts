import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { BoardAccessService } from '@/modules/boards/board-access.service';

import type { CreateAutomationRequest, UpdateAutomationRequest } from './dto/automation.schemas';

/**
 * CRUD de automações por coluna (Fase A).
 *
 * Permissões:
 *   - Listar: VIEWER no board
 *   - Criar/atualizar/excluir: EDITOR no board
 *
 * Engine de execução (dispatcher + handlers + anti-loop) entra em
 * commit posterior. Por enquanto, automações são só armazenadas e
 * podem ser ativadas/desativadas, mas nada acontece quando o trigger
 * dispara — UI precisa indicar "Engine em desenvolvimento" enquanto
 * isso.
 */
@Injectable()
export class AutomationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BoardAccessService,
  ) {}

  async listByList(userId: string, tenant: TenantContext, listId: string) {
    const list = await this.prisma.list.findUnique({
      where: { id: listId },
      select: { id: true, boardId: true, organizationId: true },
    });
    if (!list || list.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Lista não encontrada.');
    }
    await this.access.assertAccess(userId, list.boardId, tenant, 'VIEWER');

    return this.prisma.automation.findMany({
      where: { listId, organizationId: tenant.organizationId },
      orderBy: { createdAt: 'asc' },
      include: {
        createdBy: { select: { id: true, name: true, avatarUrl: true } },
        _count: { select: { runs: true } },
      },
    });
  }

  async create(
    userId: string,
    tenant: TenantContext,
    listId: string,
    input: CreateAutomationRequest,
  ) {
    const list = await this.prisma.list.findUnique({
      where: { id: listId },
      select: { id: true, boardId: true, organizationId: true },
    });
    if (!list || list.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Lista não encontrada.');
    }
    await this.access.assertAccess(userId, list.boardId, tenant, 'EDITOR');

    return this.prisma.automation.create({
      data: {
        organizationId: tenant.organizationId,
        listId,
        boardId: list.boardId,
        trigger: input.trigger,
        triggerConfig: (input.triggerConfig ?? {}) as Prisma.InputJsonValue,
        actionType: input.actionType,
        actionConfig: (input.actionConfig ?? {}) as Prisma.InputJsonValue,
        label: input.label ?? null,
        isActive: input.isActive ?? true,
        conditions:
          input.conditions !== undefined && input.conditions !== null
            ? (input.conditions as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        createdById: userId,
      },
      include: {
        createdBy: { select: { id: true, name: true, avatarUrl: true } },
        _count: { select: { runs: true } },
      },
    });
  }

  async update(
    userId: string,
    tenant: TenantContext,
    automationId: string,
    input: UpdateAutomationRequest,
  ) {
    const automation = await this.getOneOrThrow(automationId, tenant.organizationId);
    if (automation.boardId) {
      await this.access.assertAccess(userId, automation.boardId, tenant, 'EDITOR');
    }
    return this.prisma.automation.update({
      where: { id: automationId },
      data: {
        trigger: input.trigger,
        triggerConfig:
          input.triggerConfig !== undefined
            ? (input.triggerConfig as Prisma.InputJsonValue)
            : undefined,
        actionType: input.actionType,
        actionConfig:
          input.actionConfig !== undefined
            ? (input.actionConfig as Prisma.InputJsonValue)
            : undefined,
        label: input.label !== undefined ? input.label : undefined,
        isActive: input.isActive,
        conditions:
          input.conditions === undefined
            ? undefined
            : input.conditions === null
              ? Prisma.JsonNull
              : (input.conditions as unknown as Prisma.InputJsonValue),
      },
    });
  }

  async remove(userId: string, tenant: TenantContext, automationId: string) {
    const automation = await this.getOneOrThrow(automationId, tenant.organizationId);
    if (automation.boardId) {
      await this.access.assertAccess(userId, automation.boardId, tenant, 'EDITOR');
    }
    await this.prisma.automation.delete({ where: { id: automationId } });
    return { ok: true };
  }

  /**
   * Lista as últimas runs de uma automação. Pra log/auditoria na aba
   * "Avançado" do dialog de automações.
   */
  async listRuns(userId: string, tenant: TenantContext, automationId: string, limit = 50) {
    const automation = await this.getOneOrThrow(automationId, tenant.organizationId);
    if (automation.boardId) {
      await this.access.assertAccess(userId, automation.boardId, tenant, 'VIEWER');
    }
    return this.prisma.automationRun.findMany({
      where: { automationId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      include: {
        card: { select: { id: true, title: true } },
      },
    });
  }

  private async getOneOrThrow(automationId: string, organizationId: string) {
    const automation = await this.prisma.automation.findUnique({
      where: { id: automationId },
    });
    if (!automation) throw new NotFoundException('Automação não encontrada.');
    if (automation.organizationId !== organizationId) {
      throw new ForbiddenException('Acesso negado.');
    }
    return automation;
  }
}
