import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { BoardAccessService } from '@/modules/boards/board-access.service';

import type {
  CreateContactRequest,
  UpdateContactRequest,
  ListContactsQuery,
  LinkContactRequest,
} from './dto/contacts.schemas';

const PRIVILEGED_ROLES: ReadonlyArray<TenantContext['role']> = ['OWNER', 'ADMIN', 'GESTOR'];

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BoardAccessService,
  ) {}

  private assertPrivileged(tenant: TenantContext) {
    if (!PRIVILEGED_ROLES.includes(tenant.role)) {
      throw new ForbiddenException('Apenas GESTOR+ pode gerenciar contatos.');
    }
  }

  // ==================================================
  // CRUD da agenda
  // ==================================================
  async list(tenant: TenantContext, query: ListContactsQuery) {
    const where: Prisma.ContactWhereInput = {
      organizationId: tenant.organizationId,
      deletedAt: null,
      ...(query.type ? { type: query.type } : {}),
      ...(query.parentId ? { parentId: query.parentId } : {}),
      ...(query.hasCards === true ? { cards: { some: {} } } : {}),
      ...(query.hasCards === false ? { cards: { none: {} } } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q } },
              { document: { contains: query.q } },
            ],
          }
        : {}),
    };
    return this.prisma.contact.findMany({
      where,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: {
        parent: { select: { id: true, name: true, type: true } },
        _count: { select: { cards: true, children: true } },
      },
    });
  }

  async create(userId: string, tenant: TenantContext, body: CreateContactRequest) {
    this.assertPrivileged(tenant);

    if (body.parentId) {
      const parent = await this.prisma.contact.findUnique({
        where: { id: body.parentId },
        select: { organizationId: true, type: true, deletedAt: true },
      });
      if (!parent || parent.organizationId !== tenant.organizationId || parent.deletedAt) {
        throw new BadRequestException('Empresa pai não encontrada.');
      }
      if (parent.type !== 'COMPANY') {
        throw new BadRequestException('Pai deve ser uma empresa (COMPANY).');
      }
      if (body.type === 'COMPANY') {
        throw new BadRequestException('Empresas não podem ter pai.');
      }
    }

    const contact = await this.prisma.contact.create({
      data: {
        organizationId: tenant.organizationId,
        type: body.type,
        name: body.name,
        email: body.email ?? null,
        phone: body.phone ?? null,
        document: body.document ?? null,
        note: body.note ?? null,
        parentId: body.parentId ?? null,
      },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        actorId: userId,
        type: 'CONTACT_CREATED',
        payload: { contactId: contact.id, name: contact.name, type: contact.type },
      },
    });

    return this.attachUserMatch(contact, tenant.organizationId);
  }

  async getOne(tenant: TenantContext, id: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true, type: true } },
        children: {
          where: { deletedAt: null },
          select: { id: true, name: true, type: true, email: true, phone: true },
          orderBy: { name: 'asc' },
        },
        cards: {
          take: 50,
          orderBy: { createdAt: 'desc' },
          include: {
            card: {
              select: {
                id: true,
                shortCode: true,
                title: true,
                boardId: true,
                completedAt: true,
                isArchived: true,
                board: { select: { id: true, name: true, color: true } },
                list: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!contact || contact.organizationId !== tenant.organizationId || contact.deletedAt) {
      throw new NotFoundException('Contato não encontrado.');
    }
    return this.attachUserMatch(contact, tenant.organizationId);
  }

  async update(userId: string, tenant: TenantContext, id: string, body: UpdateContactRequest) {
    this.assertPrivileged(tenant);
    const existing = await this.prisma.contact.findUnique({ where: { id } });
    if (!existing || existing.organizationId !== tenant.organizationId || existing.deletedAt) {
      throw new NotFoundException('Contato não encontrado.');
    }

    if (body.parentId !== undefined && body.parentId !== null) {
      if (body.parentId === id)
        throw new BadRequestException('Contato não pode ser pai de si mesmo.');
      const parent = await this.prisma.contact.findUnique({
        where: { id: body.parentId },
        select: { organizationId: true, type: true, deletedAt: true },
      });
      if (!parent || parent.organizationId !== tenant.organizationId || parent.deletedAt) {
        throw new BadRequestException('Empresa pai não encontrada.');
      }
      if (parent.type !== 'COMPANY') {
        throw new BadRequestException('Pai deve ser uma empresa.');
      }
    }

    const updated = await this.prisma.contact.update({
      where: { id },
      data: {
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.email !== undefined ? { email: body.email ?? null } : {}),
        ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
        ...(body.document !== undefined ? { document: body.document ?? null } : {}),
        ...(body.note !== undefined ? { note: body.note ?? null } : {}),
        ...(body.parentId !== undefined ? { parentId: body.parentId } : {}),
      },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        actorId: userId,
        type: 'CONTACT_UPDATED',
        payload: {
          contactId: updated.id,
          changes: body as Record<string, unknown>,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return this.attachUserMatch(updated, tenant.organizationId);
  }

  async remove(userId: string, tenant: TenantContext, id: string) {
    if (tenant.role !== 'OWNER' && tenant.role !== 'ADMIN') {
      throw new ForbiddenException('Apenas ADMIN+ pode remover contatos.');
    }
    const existing = await this.prisma.contact.findUnique({ where: { id } });
    if (!existing || existing.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Contato não encontrado.');
    }
    if (existing.deletedAt) return { ok: true }; // idempotente

    await this.prisma.contact.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        actorId: userId,
        type: 'CONTACT_DELETED',
        payload: { contactId: id, name: existing.name },
      },
    });

    return { ok: true };
  }

  // ==================================================
  // Vinculo card <-> contato
  // ==================================================
  async listForCard(userId: string, tenant: TenantContext, cardId: string) {
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: { boardId: true, organizationId: true },
    });
    if (!card || card.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Card não encontrado.');
    }
    await this.access.assertAccess(userId, card.boardId, tenant, 'VIEWER');

    const links = await this.prisma.cardContact.findMany({
      where: { cardId },
      orderBy: { createdAt: 'asc' },
      include: {
        contact: {
          include: { parent: { select: { id: true, name: true, type: true } } },
        },
      },
    });
    const contacts = await Promise.all(
      links.map(async (l) => this.attachUserMatch(l.contact, tenant.organizationId)),
    );
    return contacts;
  }

  async linkToCard(
    userId: string,
    tenant: TenantContext,
    cardId: string,
    body: LinkContactRequest,
  ) {
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: { boardId: true, organizationId: true },
    });
    if (!card || card.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Card não encontrado.');
    }
    await this.access.assertAccess(userId, card.boardId, tenant, 'EDITOR');

    let contactId: string;

    if ('contactId' in body) {
      const exists = await this.prisma.contact.findUnique({
        where: { id: body.contactId },
        select: { organizationId: true, deletedAt: true },
      });
      if (!exists || exists.organizationId !== tenant.organizationId || exists.deletedAt) {
        throw new NotFoundException('Contato não encontrado.');
      }
      contactId = body.contactId;
    } else {
      // cria-e-vincula
      this.assertPrivileged(tenant);
      const created = await this.prisma.contact.create({
        data: {
          organizationId: tenant.organizationId,
          type: body.type,
          name: body.name,
          email: body.email ?? null,
          phone: body.phone ?? null,
          document: body.document ?? null,
          note: body.note ?? null,
          parentId: body.parentId ?? null,
        },
      });
      contactId = created.id;
      await this.prisma.activity.create({
        data: {
          organizationId: tenant.organizationId,
          actorId: userId,
          type: 'CONTACT_CREATED',
          payload: { contactId, name: created.name, type: created.type, viaCard: cardId },
        },
      });
    }

    await this.prisma.cardContact.upsert({
      where: { cardId_contactId: { cardId, contactId } },
      update: {},
      create: { cardId, contactId },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: card.boardId,
        cardId,
        actorId: userId,
        type: 'CARD_CONTACT_LINKED',
        payload: { cardId, contactId },
      },
    });

    return this.getOne(tenant, contactId);
  }

  async unlinkFromCard(userId: string, tenant: TenantContext, cardId: string, contactId: string) {
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: { boardId: true, organizationId: true },
    });
    if (!card || card.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Card não encontrado.');
    }
    await this.access.assertAccess(userId, card.boardId, tenant, 'EDITOR');

    await this.prisma.cardContact
      .delete({ where: { cardId_contactId: { cardId, contactId } } })
      .catch(() => undefined); // idempotente

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId: card.boardId,
        cardId,
        actorId: userId,
        type: 'CARD_CONTACT_UNLINKED',
        payload: { cardId, contactId },
      },
    });

    return { ok: true };
  }

  // ==================================================
  // Cross-reference Contact <-> User (por email ou phone)
  // ==================================================
  /**
   * Anexa `userMatch: { id, name, avatarUrl } | null` ao contato. Match
   * por email (case-insensitive) ou phone (digits-only). Se ambos existem,
   * email tem prioridade. So olha Users ATIVOS e da Org corrente.
   */
  private async attachUserMatch<T extends { email: string | null; phone: string | null }>(
    contact: T,
    organizationId: string,
  ): Promise<T & { userMatch: { id: string; name: string; avatarUrl: string | null } | null }> {
    if (!contact.email && !contact.phone) {
      return { ...contact, userMatch: null };
    }
    const phoneDigits = contact.phone ? contact.phone.replace(/\D/g, '') : null;
    const orConditions: Prisma.UserWhereInput[] = [];
    if (contact.email) {
      orConditions.push({ email: { equals: contact.email, mode: 'insensitive' } });
    }
    if (phoneDigits && phoneDigits.length >= 10) {
      orConditions.push({ phone: phoneDigits });
    }
    if (orConditions.length === 0) {
      return { ...contact, userMatch: null };
    }
    const user = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        memberships: { some: { organizationId } },
        OR: orConditions,
      },
      select: { id: true, name: true, avatarUrl: true },
    });
    return { ...contact, userMatch: user };
  }
}
