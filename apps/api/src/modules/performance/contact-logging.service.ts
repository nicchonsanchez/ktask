import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  INTERACTION_TYPE_LABELS,
  interactionOutcome,
  isOrgAdmin,
  type CardInteractionDto,
  type CardInteractionsResponse,
  type InteractionInput,
  type InteractionType,
} from '@ktask/contracts';

import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { BoardAccessService } from '@/modules/boards/board-access.service';
import { ChecklistsService } from '@/modules/checklists/checklists.service';

const FOLLOW_UP_CHECKLIST_TITLE = 'Follow-ups';

/** Rotulo legivel: "Ligação · Não respondeu" (ou rotulo livre de "Outro"). */
export function interactionLabel(type: string, outcome: string, customLabel?: string | null) {
  const t = type as InteractionType;
  const typeLabel =
    t === 'OTHER' && customLabel ? customLabel : (INTERACTION_TYPE_LABELS[t] ?? type);
  const out = INTERACTION_TYPE_LABELS[t] ? interactionOutcome(t, outcome) : null;
  return out ? `${typeLabel} · ${out.label}` : typeLabel;
}

/**
 * Regra multi-fluxo (D9): entre os fluxos ATIVOS do card com o registro de
 * contato ligado, usa o fluxo pelo qual o card foi aberto; senao o primario;
 * senao o primeiro em ordem alfabetica. Null = desligado pra este card.
 */
export function pickContactBoard(
  enabled: ReadonlyArray<{ boardId: string; name: string }>,
  primaryBoardId: string,
  contextBoardId?: string | null,
): string | null {
  if (enabled.length === 0) return null;
  if (contextBoardId && enabled.some((b) => b.boardId === contextBoardId)) return contextBoardId;
  if (enabled.some((b) => b.boardId === primaryBoardId)) return primaryBoardId;
  return [...enabled].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))[0]!.boardId;
}

/**
 * Doc 52 (Fase 3, D9) — registro de contato comercial no card, feito junto
 * com um comentario. Nao altera o comportamento do comentario: o registro e
 * validado ANTES (erro barra tudo) e gravado logo DEPOIS do comentario.
 */
@Injectable()
export class ContactLoggingService {
  private readonly logger = new Logger(ContactLoggingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BoardAccessService,
    private readonly checklists: ChecklistsService,
  ) {}

  private async resolveBoard(
    organizationId: string,
    cardId: string,
    contextBoardId?: string | null,
  ): Promise<string | null> {
    const card = await this.prisma.card.findFirst({
      where: { id: cardId, organizationId, deletedAt: null },
      select: {
        boardId: true,
        presences: {
          where: { removedAt: null },
          select: {
            boardId: true,
            board: {
              select: {
                name: true,
                isArchived: true,
                performanceConfig: { select: { contactLoggingEnabled: true } },
              },
            },
          },
        },
      },
    });
    if (!card) return null;
    const enabled = card.presences
      .filter((p) => !p.board.isArchived && p.board.performanceConfig?.contactLoggingEnabled)
      .map((p) => ({ boardId: p.boardId, name: p.board.name }));
    return pickContactBoard(enabled, card.boardId, contextBoardId);
  }

  private toDto(i: {
    id: string;
    commentId: string | null;
    boardId: string;
    type: string;
    outcome: string;
    customLabel: string | null;
    occurredAt: Date;
    followUpItemId: string | null;
    user: { id: string; name: string } | null;
  }): CardInteractionDto {
    return {
      id: i.id,
      commentId: i.commentId,
      boardId: i.boardId,
      type: i.type as InteractionType,
      outcome: i.outcome,
      customLabel: i.customLabel,
      occurredAt: i.occurredAt.toISOString(),
      user: i.user,
      followUpItemId: i.followUpItemId,
    };
  }

  /** Habilita os botoes no composer + selos dos comentarios. */
  async listForCard(
    userId: string,
    tenant: TenantContext,
    cardId: string,
    contextBoardId?: string,
  ): Promise<CardInteractionsResponse> {
    await this.access.assertCardAccess(userId, cardId, tenant, 'VIEWER');
    const [boardId, items] = await Promise.all([
      this.resolveBoard(tenant.organizationId, cardId, contextBoardId),
      this.prisma.cardInteraction.findMany({
        where: { cardId, organizationId: tenant.organizationId, deletedAt: null },
        orderBy: { occurredAt: 'desc' },
        select: {
          id: true,
          commentId: true,
          boardId: true,
          type: true,
          outcome: true,
          customLabel: true,
          occurredAt: true,
          followUpItemId: true,
          user: { select: { id: true, name: true } },
        },
      }),
    ]);
    return { enabled: !!boardId, boardId, items: items.map((i) => this.toDto(i)) };
  }

  /**
   * Valida o registro ANTES de o comentario ser criado. Retorna o fluxo
   * onde sera gravado. Erros aqui impedem o comentario (atomicidade logica).
   */
  async prepare(
    userId: string,
    tenant: TenantContext,
    cardId: string,
    input: InteractionInput,
  ): Promise<{ boardId: string }> {
    const boardId = await this.resolveBoard(tenant.organizationId, cardId, input.boardId);
    if (!boardId) {
      throw new BadRequestException('Registro de contato não está habilitado para este fluxo.');
    }
    if (input.contactId) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: input.contactId, organizationId: tenant.organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!contact) throw new BadRequestException('Contato não encontrado.');
    }
    if (input.followUpDate) {
      // Tarefa de follow-up exige poder editar o card (mesma regra do checklist).
      await this.access.assertCardAccess(userId, cardId, tenant, 'EDITOR');
    }
    return { boardId };
  }

  /** Grava o registro ligado ao comentario recem-criado (+ follow-up opcional). */
  async createForComment(
    userId: string,
    tenant: TenantContext,
    params: { cardId: string; commentId: string; boardId: string; input: InteractionInput },
  ): Promise<CardInteractionDto> {
    const { cardId, commentId, boardId, input } = params;
    const label = interactionLabel(input.type, input.outcome, input.customLabel);

    const created = await this.prisma.$transaction(async (tx) => {
      const interaction = await tx.cardInteraction.create({
        data: {
          organizationId: tenant.organizationId,
          cardId,
          boardId,
          userId,
          type: input.type,
          outcome: input.outcome,
          customLabel: input.type === 'OTHER' ? (input.customLabel ?? null) : null,
          commentId,
          contactId: input.contactId ?? null,
        },
        select: {
          id: true,
          commentId: true,
          boardId: true,
          type: true,
          outcome: true,
          customLabel: true,
          occurredAt: true,
          followUpItemId: true,
          user: { select: { id: true, name: true } },
        },
      });
      await tx.activity.create({
        data: {
          organizationId: tenant.organizationId,
          boardId,
          cardId,
          actorId: userId,
          type: 'COMMERCIAL_ACTIVITY_LOGGED',
          payload: {
            interactionId: interaction.id,
            commentId,
            type: input.type,
            outcome: input.outcome,
            customLabel: interaction.customLabel,
            label,
          } as Prisma.InputJsonValue,
        },
      });
      return interaction;
    });

    // Follow-up: tarefa pra quem registrou, reaproveitando o ChecklistsService
    // (activity + notificacao + Home). Falha aqui nao desfaz o registro.
    if (input.followUpDate) {
      try {
        const itemId = await this.createFollowUp(userId, tenant, cardId, label, input.followUpDate);
        await this.prisma.cardInteraction.update({
          where: { id: created.id },
          data: { followUpItemId: itemId },
        });
        created.followUpItemId = itemId;
      } catch (err) {
        this.logger.error(
          `Follow-up nao criado (interaction ${created.id}): ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return this.toDto(created);
  }

  private async createFollowUp(
    userId: string,
    tenant: TenantContext,
    cardId: string,
    label: string,
    date: string,
  ): Promise<string> {
    const existing = await this.prisma.checklist.findFirst({
      where: { cardId, title: FOLLOW_UP_CHECKLIST_TITLE },
      select: { id: true },
    });
    const checklistId =
      existing?.id ??
      (await this.checklists.create(userId, tenant, { cardId, title: FOLLOW_UP_CHECKLIST_TITLE }))
        .id;
    const item = await this.checklists.addItem(userId, tenant, checklistId, {
      text: `Retornar contato (${label})`,
      assigneeId: userId,
      // Meio-dia UTC (= manhã no Brasil): cai no dia escolhido na Home.
      dueDate: `${date}T15:00:00.000Z`,
    });
    return item.id;
  }

  /** Corrige tipo/resultado (autor ou Dono/Admin/Gestor). Auditado na timeline. */
  async update(
    userId: string,
    tenant: TenantContext,
    id: string,
    patch: { type: InteractionType; outcome: string; customLabel?: string },
  ): Promise<CardInteractionDto> {
    if (!interactionOutcome(patch.type, patch.outcome)) {
      throw new BadRequestException('Resultado inválido para este tipo de registro.');
    }
    const current = await this.getOwnedOrThrow(userId, tenant, id);
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.cardInteraction.update({
        where: { id },
        data: {
          type: patch.type,
          outcome: patch.outcome,
          customLabel: patch.type === 'OTHER' ? (patch.customLabel ?? null) : null,
        },
        select: {
          id: true,
          commentId: true,
          boardId: true,
          type: true,
          outcome: true,
          customLabel: true,
          occurredAt: true,
          followUpItemId: true,
          user: { select: { id: true, name: true } },
        },
      });
      await tx.activity.create({
        data: {
          organizationId: tenant.organizationId,
          boardId: current.boardId,
          cardId: current.cardId,
          actorId: userId,
          type: 'COMMERCIAL_ACTIVITY_UPDATED',
          payload: {
            interactionId: id,
            from: interactionLabel(current.type, current.outcome, current.customLabel),
            to: interactionLabel(u.type, u.outcome, u.customLabel),
          },
        },
      });
      return u;
    });
    return this.toDto(updated);
  }

  /** Soft delete (autor ou Dono/Admin/Gestor). O comentario nao e apagado. */
  async remove(userId: string, tenant: TenantContext, id: string) {
    const current = await this.getOwnedOrThrow(userId, tenant, id);
    await this.prisma.$transaction([
      this.prisma.cardInteraction.update({ where: { id }, data: { deletedAt: new Date() } }),
      this.prisma.activity.create({
        data: {
          organizationId: tenant.organizationId,
          boardId: current.boardId,
          cardId: current.cardId,
          actorId: userId,
          type: 'COMMERCIAL_ACTIVITY_DELETED',
          payload: {
            interactionId: id,
            label: interactionLabel(current.type, current.outcome, current.customLabel),
          },
        },
      }),
    ]);
    return { ok: true };
  }

  private async getOwnedOrThrow(userId: string, tenant: TenantContext, id: string) {
    const current = await this.prisma.cardInteraction.findFirst({
      where: { id, organizationId: tenant.organizationId, deletedAt: null },
      select: {
        id: true,
        userId: true,
        cardId: true,
        boardId: true,
        type: true,
        outcome: true,
        customLabel: true,
      },
    });
    if (!current) throw new NotFoundException('Registro não encontrado.');
    if (current.userId !== userId && !isOrgAdmin(tenant.role)) {
      throw new ForbiddenException('Só quem registrou (ou Dono/Admin/Gestor) pode alterar.');
    }
    await this.access.assertCardAccess(userId, current.cardId, tenant, 'COMMENTER');
    return current;
  }
}
