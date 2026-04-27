import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';

import type {
  CreateMessageTemplateRequest,
  UpdateMessageTemplateRequest,
  MessageTemplateType,
} from './dto/message-template.schemas';

@Injectable()
export class MessageTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lista modelos da Org. GUEST nao ve nada (lista vazia). Filtro opcional
   * por type pra evitar cross-pollination entre WhatsApp e comment no
   * autocomplete do form.
   */
  async list(userId: string, tenant: TenantContext, type?: MessageTemplateType) {
    if (tenant.role === 'GUEST') return [];
    void userId;
    return this.prisma.messageTemplate.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...(type ? { type } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  async create(userId: string, tenant: TenantContext, input: CreateMessageTemplateRequest) {
    this.assertNotGuest(tenant);
    return this.prisma.messageTemplate.create({
      data: {
        organizationId: tenant.organizationId,
        name: input.name,
        body: input.body,
        type: input.type,
        createdById: userId,
      },
      include: {
        createdBy: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  async update(
    userId: string,
    tenant: TenantContext,
    id: string,
    input: UpdateMessageTemplateRequest,
  ) {
    this.assertNotGuest(tenant);
    const existing = await this.findOrThrow(id, tenant);
    this.assertCanEdit(existing.createdById, userId, tenant);
    return this.prisma.messageTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
      },
      include: {
        createdBy: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  async remove(userId: string, tenant: TenantContext, id: string) {
    this.assertNotGuest(tenant);
    const existing = await this.findOrThrow(id, tenant);
    this.assertCanEdit(existing.createdById, userId, tenant);
    await this.prisma.messageTemplate.delete({ where: { id } });
    return { ok: true };
  }

  // ---------------- helpers ----------------

  private async findOrThrow(id: string, tenant: TenantContext) {
    const tpl = await this.prisma.messageTemplate.findUnique({ where: { id } });
    if (!tpl || tpl.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Modelo não encontrado.');
    }
    return tpl;
  }

  private assertNotGuest(tenant: TenantContext) {
    if (tenant.role === 'GUEST') {
      throw new ForbiddenException('Convidados não podem criar/editar modelos.');
    }
  }

  /**
   * Edit/delete: criador OU OWNER/ADMIN da Org. MEMBER comum não mexe em
   * modelos de outros pra evitar pisar nas configurações compartilhadas.
   */
  private assertCanEdit(creatorId: string, userId: string, tenant: TenantContext) {
    if (creatorId === userId) return;
    if (tenant.role === 'OWNER' || tenant.role === 'ADMIN') return;
    throw new ForbiddenException('Sem permissão para editar este modelo.');
  }
}
