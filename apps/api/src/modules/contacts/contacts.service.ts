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

const READONLY_WHEN_LINKED = ['name', 'email', 'phone'] as const;

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
      ...(query.hasCards === true ? { cards: { some: { card: { deletedAt: null } } } } : {}),
      ...(query.hasCards === false ? { cards: { none: { card: { deletedAt: null } } } } : {}),
      ...(query.linkStatus === 'linked' ? { userId: { not: null } } : {}),
      ...(query.linkStatus === 'unlinked' ? { userId: null } : {}),
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
        user: { select: { id: true, name: true, email: true, phone: true, avatarUrl: true } },
        _count: {
          select: {
            cards: { where: { card: { deletedAt: null } } },
            children: true,
          },
        },
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

    // Atalho atômico: cria + linka pra User existente em 1 chamada.
    // Reaproveita validações/regras do linkToUser (membership, unique, etc).
    if (body.linkToUserId) {
      return this.linkToUser(userId, tenant, contact.id, body.linkToUserId);
    }

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
          where: { card: { deletedAt: null } },
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

    // Quando o Contact está vinculado a um User, name/email/phone são
    // read-only no CRM — fonte autoritativa é o User (editável só via
    // /perfil ou /equipe).
    if (existing.userId) {
      for (const k of READONLY_WHEN_LINKED) {
        if (body[k] !== undefined) {
          throw new BadRequestException(
            `O campo "${k}" é gerenciado pelo usuário vinculado. Edite em "Meu perfil" ou na página de equipe.`,
          );
        }
      }
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

    // Limpa userId junto com o soft-delete: senao a relacao User.linkedContact
    // continua apontando pro contato morto e o User fica preso a ele, o que
    // bloqueia criar novo Contact pro mesmo User com erro "ja tem outro
    // contato vinculado".
    await this.prisma.contact.update({
      where: { id },
      data: { deletedAt: new Date(), userId: null },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        actorId: userId,
        type: 'CONTACT_DELETED',
        payload: { contactId: id, name: existing.name, previousUserId: existing.userId },
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

    // Auto-vincular empresa-pai: se a pessoa tem parentId e o card ainda
    // não tem nenhuma empresa vinculada, traz a empresa-pai junto.
    // Regra conservadora — se já existe qualquer empresa no card, respeita
    // a escolha manual e não toca.
    const linked = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { type: true, parentId: true },
    });
    if (linked?.type === 'PERSON' && linked.parentId) {
      const hasCompany = await this.prisma.cardContact.findFirst({
        where: { cardId, contact: { type: 'COMPANY', deletedAt: null } },
        select: { contactId: true },
      });
      if (!hasCompany) {
        const parent = await this.prisma.contact.findUnique({
          where: { id: linked.parentId },
          select: { id: true, organizationId: true, deletedAt: true, type: true },
        });
        if (
          parent &&
          parent.type === 'COMPANY' &&
          parent.organizationId === tenant.organizationId &&
          !parent.deletedAt
        ) {
          await this.prisma.cardContact.upsert({
            where: { cardId_contactId: { cardId, contactId: parent.id } },
            update: {},
            create: { cardId, contactId: parent.id },
          });
          await this.prisma.activity.create({
            data: {
              organizationId: tenant.organizationId,
              boardId: card.boardId,
              cardId,
              actorId: userId,
              type: 'CARD_CONTACT_LINKED',
              payload: { cardId, contactId: parent.id, viaParentOf: contactId },
            },
          });
        }
      }
    }

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
  // Vínculo Contact <-> User (FK direto, 1:1)
  // ==================================================
  async linkToUser(actorId: string, tenant: TenantContext, contactId: string, userId: string) {
    this.assertPrivileged(tenant);

    const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact || contact.organizationId !== tenant.organizationId || contact.deletedAt) {
      throw new NotFoundException('Contato não encontrado.');
    }
    if (contact.userId === userId) {
      // Idempotente — já vinculado
      return this.getOne(tenant, contactId);
    }
    if (contact.userId) {
      throw new BadRequestException('Este contato já está vinculado a outro usuário.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        suspendedAt: true,
        linkedContact: { select: { id: true } },
      },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    // Confirma que o user pertence à mesma Org via Membership
    const member = await this.prisma.membership.findFirst({
      where: { userId, organizationId: tenant.organizationId },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('Usuário não pertence à organização.');
    if (user.linkedContact) {
      throw new BadRequestException(`Usuário "${user.name}" já tem outro contato vinculado.`);
    }

    // Sync inicial: copia identidade do User pro Contact no momento do
    // vínculo. UI prefere `contact.user.*` quando disponível, mas leituras
    // SQL sem JOIN ainda encontram dados coerentes.
    const updated = await this.prisma.contact.update({
      where: { id: contactId },
      data: {
        userId,
        name: user.name,
        email: user.email ?? null,
        phone: user.phone ?? null,
      },
    });
    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        actorId,
        type: 'CONTACT_LINKED_TO_USER',
        payload: { contactId, userId },
      },
    });
    return this.getOne(tenant, updated.id);
  }

  async unlinkFromUser(actorId: string, tenant: TenantContext, contactId: string) {
    this.assertPrivileged(tenant);
    const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact || contact.organizationId !== tenant.organizationId || contact.deletedAt) {
      throw new NotFoundException('Contato não encontrado.');
    }
    if (!contact.userId) {
      return this.getOne(tenant, contactId); // idempotente
    }
    const previousUserId = contact.userId;
    await this.prisma.contact.update({ where: { id: contactId }, data: { userId: null } });
    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        actorId,
        type: 'CONTACT_UNLINKED_FROM_USER',
        payload: { contactId, userId: previousUserId },
      },
    });
    return this.getOne(tenant, contactId);
  }

  /**
   * Sugere Contacts para vincular a um User, casando por email (priori-
   * dade) ou phone. Usado pela UI de "criar User" pra evitar duplicatas
   * quando a pessoa já existia como Contact externo.
   */
  async suggestionsForUser(tenant: TenantContext, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    const phoneDigits = user.phone ? user.phone.replace(/\D/g, '') : null;
    const or: Prisma.ContactWhereInput[] = [];
    if (user.email) or.push({ email: { equals: user.email, mode: 'insensitive' } });
    if (phoneDigits && phoneDigits.length >= 8) or.push({ phone: phoneDigits });
    if (or.length === 0) return [];
    return this.prisma.contact.findMany({
      where: {
        organizationId: tenant.organizationId,
        deletedAt: null,
        userId: null, // ainda não vinculados
        OR: or,
      },
      take: 5,
      orderBy: { updatedAt: 'desc' },
    });
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
