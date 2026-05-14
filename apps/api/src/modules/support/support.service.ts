import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ContactType, type Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';
import { createCardWithPresence } from '@/modules/cards/helpers/create-card-with-presence';
import { WhatsAppHelper } from '@/modules/whatsapp/whatsapp.helper';
import { env } from '@/config/env';

import {
  CATEGORY_LABELS,
  type CreateSupportTicketDto,
  type SupportCategory,
} from './dto/create-support-ticket.schema';
import { SupportBootstrapService } from './support-bootstrap.service';

export interface CreateTicketResponse {
  ticketCode: string;
  message: string;
}

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bootstrap: SupportBootstrapService,
    private readonly whatsapp: WhatsAppHelper,
  ) {}

  async createTicket(dto: CreateSupportTicketDto): Promise<CreateTicketResponse> {
    if (dto.website) {
      this.logger.warn(`Honeypot acionado em ticket de suporte (email=${dto.email}).`);
      throw new BadRequestException('Dados inválidos.');
    }

    const ctx = await this.bootstrap.getContext();
    const categoriaLabel = CATEGORY_LABELS[dto.categoria];

    const lastCard = await this.prisma.card.findFirst({
      where: { listId: ctx.intakeListId, isArchived: false, completedAt: null },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = (lastCard?.position ?? 0) + 1024;

    const snippet = dto.mensagem.slice(0, 40).trim();
    const title = `[Suporte] ${categoriaLabel}: ${snippet}${dto.mensagem.length > 40 ? '…' : ''}`;
    const description = buildDescription(dto, categoriaLabel);

    const card = await this.prisma.$transaction(async (tx) => {
      const created = await createCardWithPresence(tx, {
        organizationId: ctx.organizationId,
        boardId: ctx.boardId,
        listId: ctx.intakeListId,
        title,
        description,
        position,
        createdById: ctx.ownerUserId,
      });

      const contact = await this.upsertContact(tx, ctx.organizationId, dto);
      await tx.cardContact.create({
        data: { cardId: created.id, contactId: contact.id },
      });

      await tx.activity.create({
        data: {
          organizationId: ctx.organizationId,
          boardId: ctx.boardId,
          cardId: created.id,
          actorId: ctx.ownerUserId,
          type: 'CARD_CREATED',
          payload: {
            cardId: created.id,
            title: created.title,
            listId: ctx.intakeListId,
            source: 'support_form',
            categoria: dto.categoria,
          },
        },
      });

      return created;
    });

    // shortCode é nullable no schema (importer Ummense pode não setar), mas
    // o helper SEMPRE preenche em criações via API. Fallback pro id é defensivo.
    const ticketCode = card.shortCode ?? card.id;

    // Notificação fora da transação — falha de Evolution não invalida o ticket.
    void this.notifyOperator(ticketCode, dto, categoriaLabel).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Notificação de novo ticket #${ticketCode} falhou: ${msg}`);
    });

    return {
      ticketCode: `#${ticketCode}`,
      message: 'Recebemos sua mensagem. Em breve entraremos em contato.',
    };
  }

  /**
   * Procura Contact existente pelo (organizationId, email) — schema não tem
   * @@unique nessas colunas, então usamos findFirst + decisão manual. Se já
   * existe: completa nome/telefone se vazios e anexa "Origem: formulário…"
   * no note (idempotente). Se não existe: cria como PERSON.
   */
  private async upsertContact(
    tx: Prisma.TransactionClient,
    organizationId: string,
    dto: CreateSupportTicketDto,
  ) {
    const today = new Date().toISOString().slice(0, 10);
    const originNote = `Origem: formulário de suporte em ${today}. URL: ${dto.urlOrigem || 'não informada'}.`;

    const existing = await tx.contact.findFirst({
      where: {
        organizationId,
        email: dto.email,
        type: ContactType.PERSON,
        deletedAt: null,
      },
    });

    if (existing) {
      const update: Prisma.ContactUpdateInput = {};
      if (!existing.name && dto.nome) update.name = dto.nome;
      if (!existing.phone && dto.telefone) update.phone = dto.telefone;
      if (!existing.note?.includes('formulário de suporte')) {
        update.note = existing.note ? `${existing.note}\n${originNote}` : originNote;
      }
      if (Object.keys(update).length > 0) {
        return tx.contact.update({ where: { id: existing.id }, data: update });
      }
      return existing;
    }

    return tx.contact.create({
      data: {
        organizationId,
        type: ContactType.PERSON,
        name: dto.nome,
        email: dto.email,
        phone: dto.telefone || null,
        note: originNote,
      },
    });
  }

  private async notifyOperator(
    shortCode: string,
    dto: CreateSupportTicketDto,
    categoriaLabel: string,
  ): Promise<void> {
    const phone = env.SUPPORT_NOTIFY_WHATSAPP;
    if (!phone) return;

    const snippet = dto.mensagem.length > 200 ? `${dto.mensagem.slice(0, 200)}…` : dto.mensagem;
    const contactLine = `${dto.nome} <${dto.email}>${dto.telefone ? ` · ${dto.telefone}` : ''}`;
    const text = [
      `Novo ticket de suporte #${shortCode}`,
      `Categoria: ${categoriaLabel}`,
      `De: ${contactLine}`,
      ``,
      snippet,
      ``,
      `Abrir: ${env.APP_URL}/c/${shortCode}`,
    ].join('\n');

    await this.whatsapp.sendText(phone, text);
  }
}

/**
 * Monta o description do card em TipTap JSON. Cada linha de metadado vira
 * um <p> próprio pra renderizar bem no comments/description renderer.
 */
function buildDescription(
  dto: CreateSupportTicketDto,
  categoriaLabel: string,
): Prisma.InputJsonValue {
  const metaLines: string[] = [];
  metaLines.push(`Nome: ${dto.nome}`);
  metaLines.push(`E-mail: ${dto.email}`);
  if (dto.telefone) metaLines.push(`Telefone: ${dto.telefone}`);
  metaLines.push(`Categoria: ${categoriaLabel}`);
  if (dto.urlOrigem) metaLines.push(`URL de origem: ${dto.urlOrigem}`);

  const messageParagraphs = dto.mensagem
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => ({
      type: 'paragraph' as const,
      content: [{ type: 'text' as const, text: block }],
    }));

  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Mensagem' }],
      },
      ...(messageParagraphs.length > 0
        ? messageParagraphs
        : [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: dto.mensagem }],
            },
          ]),
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Contato' }],
      },
      ...metaLines.map((line) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: line }],
      })),
    ],
  } satisfies Prisma.InputJsonValue;
}

// re-export pra type-check ext.
export type { SupportCategory };
