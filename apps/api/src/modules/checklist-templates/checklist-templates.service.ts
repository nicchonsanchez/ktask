import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';
import { computeInsertPosition } from '@/common/util/position';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { BoardAccessService } from '@/modules/boards/board-access.service';
import { EVENT_NAMES } from '@/modules/realtime/events.types';

interface CreateInput {
  title: string;
  items: string[];
}
interface UpdateInput {
  title?: string;
  items?: string[];
}

@Injectable()
export class ChecklistTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BoardAccessService,
    private readonly events: EventEmitter2,
  ) {}

  async list(tenant: TenantContext) {
    return this.prisma.checklistTemplate.findMany({
      where: { organizationId: tenant.organizationId },
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        createdBy: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  async create(userId: string, tenant: TenantContext, input: CreateInput) {
    return this.prisma.checklistTemplate.create({
      data: {
        organizationId: tenant.organizationId,
        title: input.title,
        items: input.items as unknown as Prisma.InputJsonValue,
        createdById: userId,
      },
    });
  }

  /**
   * Cria um template a partir de um checklist existente. Copia título e
   * todos os items (textos), ignorando estado (isDone, dueDate, assignee).
   */
  async saveFromChecklist(
    userId: string,
    tenant: TenantContext,
    input: { checklistId: string; title?: string },
  ) {
    const checklist = await this.prisma.checklist.findUnique({
      where: { id: input.checklistId },
      include: {
        card: true,
        items: { orderBy: { position: 'asc' } },
      },
    });
    if (!checklist || checklist.card.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Checklist não encontrada.');
    }
    await this.access.assertAccess(userId, checklist.card.boardId, tenant, 'EDITOR');

    const items = checklist.items.map((i) => i.text).filter((t) => t.length > 0);
    if (items.length === 0) {
      throw new BadRequestException('Checklist vazia — nada pra salvar como template.');
    }

    return this.prisma.checklistTemplate.create({
      data: {
        organizationId: tenant.organizationId,
        title: input.title?.trim() || checklist.title,
        items: items as unknown as Prisma.InputJsonValue,
        createdById: userId,
      },
    });
  }

  async update(userId: string, tenant: TenantContext, id: string, input: UpdateInput) {
    const tpl = await this.prisma.checklistTemplate.findUnique({ where: { id } });
    if (!tpl || tpl.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Template não encontrado.');
    }
    // Só o criador ou OWNER/ADMIN da Org pode editar
    if (tpl.createdById !== userId && tenant.role !== 'OWNER' && tenant.role !== 'ADMIN') {
      throw new BadRequestException('Sem permissão pra editar este template.');
    }
    return this.prisma.checklistTemplate.update({
      where: { id },
      data: {
        title: input.title,
        items: input.items as unknown as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async remove(userId: string, tenant: TenantContext, id: string) {
    const tpl = await this.prisma.checklistTemplate.findUnique({ where: { id } });
    if (!tpl || tpl.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Template não encontrado.');
    }
    if (tpl.createdById !== userId && tenant.role !== 'OWNER' && tenant.role !== 'ADMIN') {
      throw new BadRequestException('Sem permissão pra remover este template.');
    }
    await this.prisma.checklistTemplate.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Aplica um template num card — cria nova Checklist no card com o título e
   * items do template. Não duplica se já existir checklist com mesmo nome
   * (renomeia: "Tarefas (2)").
   */
  async applyToCard(
    userId: string,
    tenant: TenantContext,
    input: { templateId: string; cardId: string },
  ) {
    const tpl = await this.prisma.checklistTemplate.findUnique({ where: { id: input.templateId } });
    if (!tpl || tpl.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Template não encontrado.');
    }
    const card = await this.prisma.card.findUnique({ where: { id: input.cardId } });
    if (!card || card.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Card não encontrado.');
    }
    await this.access.assertAccess(userId, card.boardId, tenant, 'EDITOR');

    const items = (tpl.items as unknown as string[]) || [];

    // Resolve título único — se já existe checklist com esse nome, sufixa "(2)"
    const existing = await this.prisma.checklist.findMany({
      where: { cardId: card.id, title: { startsWith: tpl.title } },
      select: { title: true },
    });
    let title = tpl.title;
    if (existing.some((e) => e.title === tpl.title)) {
      // procura próximo sufixo livre
      let n = 2;
      while (existing.some((e) => e.title === `${tpl.title} (${n})`)) n++;
      title = `${tpl.title} (${n})`;
    }

    // Position no fim do card
    const last = await this.prisma.checklist.findFirst({
      where: { cardId: card.id },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = computeInsertPosition(last?.position ?? null, null);

    const created = await this.prisma.$transaction(async (tx) => {
      const checklist = await tx.checklist.create({
        data: {
          cardId: card.id,
          title,
          position,
        },
      });
      let basePos = 1;
      await tx.checklistItem.createMany({
        data: items.map((text) => ({
          checklistId: checklist.id,
          text,
          position: basePos++,
        })),
      });
      return checklist;
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: card.boardId,
        cardId: card.id,
        actorId: userId,
        type: 'CHECKLIST_CREATED',
        payload: {
          checklistId: created.id,
          title,
          fromTemplateId: tpl.id,
          itemsCount: items.length,
        },
      },
    });

    this.events.emit(EVENT_NAMES.CARD_UPDATED, {
      boardId: card.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      cardId: card.id,
    });

    return created;
  }
}
