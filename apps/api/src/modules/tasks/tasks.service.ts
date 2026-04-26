import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';

import type { CreateTaskRequest, UpdateTaskRequest } from './dto/task.schemas';

/**
 * Tarefas standalone (sem vínculo a card) — versão simples pro MVP da home
 * pessoal. Quem cria atribui pra si por padrão; pode reatribuir pra qualquer
 * membro da Org. Editar/marcar/excluir restrito a quem é assignee, criador
 * ou OWNER/ADMIN da Org.
 */
@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, org: TenantContext, input: CreateTaskRequest) {
    // assigneeId === undefined → caller. null → sem assignee. cuid → outra pessoa.
    let assigneeId: string | null;
    if (input.assigneeId === undefined) {
      assigneeId = userId;
    } else {
      assigneeId = input.assigneeId;
    }

    // Se está atribuindo a alguém (não null), valida que essa pessoa é da Org.
    if (assigneeId) {
      const isMember = await this.prisma.membership.findUnique({
        where: {
          userId_organizationId: { userId: assigneeId, organizationId: org.organizationId },
        },
      });
      if (!isMember) {
        throw new NotFoundException('Usuário designado não pertence à organização.');
      }
    }

    return this.prisma.task.create({
      data: {
        organizationId: org.organizationId,
        text: input.text,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        assigneeId,
        createdById: userId,
      },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });
  }

  async update(userId: string, org: TenantContext, taskId: string, input: UpdateTaskRequest) {
    const task = await this.getOrThrow(taskId, org.organizationId);
    this.assertCanEdit(task, userId, org);

    // Se está mudando assignee, valida membership
    if (input.assigneeId !== undefined && input.assigneeId !== null) {
      const isMember = await this.prisma.membership.findUnique({
        where: {
          userId_organizationId: { userId: input.assigneeId, organizationId: org.organizationId },
        },
      });
      if (!isMember) {
        throw new NotFoundException('Usuário designado não pertence à organização.');
      }
    }

    // Conclusão / des-conclusão é tratada com doneAt + doneById
    const data: Record<string, unknown> = {};
    if (input.text !== undefined) data.text = input.text;
    if (input.dueDate !== undefined) data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
    if (input.assigneeId !== undefined) data.assigneeId = input.assigneeId;
    if (input.isDone !== undefined) {
      data.isDone = input.isDone;
      data.doneAt = input.isDone ? new Date() : null;
      data.doneById = input.isDone ? userId : null;
    }

    return this.prisma.task.update({
      where: { id: taskId },
      data,
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });
  }

  async remove(userId: string, org: TenantContext, taskId: string) {
    const task = await this.getOrThrow(taskId, org.organizationId);
    this.assertCanEdit(task, userId, org);
    await this.prisma.task.delete({ where: { id: taskId } });
    return { ok: true };
  }

  private async getOrThrow(taskId: string, organizationId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.organizationId !== organizationId) {
      throw new NotFoundException('Tarefa não encontrada.');
    }
    return task;
  }

  private assertCanEdit(
    task: { assigneeId: string | null; createdById: string },
    userId: string,
    org: TenantContext,
  ) {
    const isAssignee = task.assigneeId === userId;
    const isCreator = task.createdById === userId;
    const isOrgAdmin = org.role === 'OWNER' || org.role === 'ADMIN';
    if (!isAssignee && !isCreator && !isOrgAdmin) {
      throw new ForbiddenException(
        'Apenas o assignee, o criador ou OWNER/ADMIN podem editar esta tarefa.',
      );
    }
  }
}
