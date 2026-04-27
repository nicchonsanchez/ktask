import { randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ApprovalStatus, Prisma } from '@prisma/client';

import { env } from '@/config/env';
import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { BoardAccessService } from '@/modules/boards/board-access.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { EVENT_NAMES } from '@/modules/realtime/events.types';

import type {
  RequestApprovalRequest,
  DecideApprovalRequest,
  UndoApprovalRequest,
} from './dto/approvals.schemas';
import { WhatsAppHelper } from '@/modules/whatsapp/whatsapp.helper';

/**
 * Janela em ms onde o decisor pode desfazer a decisão. 5 minutos é
 * suficiente pra perceber clique acidental sem deixar undo "vivo" pra
 * sempre. Após isso, só admins podem reverter (não implementado neste
 * módulo — undo só é exposto se está dentro da janela).
 */
const UNDO_WINDOW_MS = 5 * 60 * 1000;

/**
 * Tempo de validade do token público do reviewer. 14 dias cobre folgas,
 * férias curtas e clientes que respondem em ritmo "ver no fim de semana".
 * Após expirar, a página pública responde 410 Gone — quem pediu pode
 * criar nova aprovação.
 */
const REVIEWER_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

interface SideEffectsShape {
  movedFromListId?: string;
  movedToListId?: string;
  automationRunIds?: string[];
}

interface ApprovalEventPayload {
  approvalId: string;
  cardId: string;
  organizationId: string;
  boardId: string;
  /** Lista atual do card no momento do evento (após eventual move automático). */
  listId: string;
  decidedById: string | null;
}

/**
 * Evento emitido quando uma aprovação é decidida — consumido pela engine
 * de automações pra disparar trigger CARD_APPROVED ou CARD_REJECTED.
 */
export const APPROVAL_DECIDED_EVENT = 'approval.decided';

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BoardAccessService,
    private readonly notifications: NotificationsService,
    private readonly whatsapp: WhatsAppHelper,
    private readonly events: EventEmitter2,
  ) {}

  // ============================================================
  // Request approval
  // ============================================================
  async request(
    userId: string,
    tenant: TenantContext,
    cardId: string,
    body: RequestApprovalRequest,
  ) {
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: {
        id: true,
        title: true,
        boardId: true,
        listId: true,
        organizationId: true,
        isArchived: true,
      },
    });
    if (!card || card.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Card não encontrado.');
    }
    if (card.isArchived) {
      throw new BadRequestException('Card arquivado — não pode pedir aprovação.');
    }
    await this.access.assertAccess(userId, card.boardId, tenant, 'EDITOR');

    // Não criar duas aprovações pendentes pra mesmo card simultaneamente —
    // simplifica UI e evita race entre decisões concorrentes.
    const pending = await this.prisma.cardApproval.findFirst({
      where: { cardId, status: 'PENDING' },
      select: { id: true },
    });
    if (pending) {
      throw new BadRequestException('Já existe um pedido de aprovação pendente neste card.');
    }

    // Valida userIds dos reviewers internos: precisa ser membro da Org.
    const userReviewerIds = body.reviewers
      .map((r) => r.userId)
      .filter((v): v is string => Boolean(v));
    if (userReviewerIds.length > 0) {
      const memberships = await this.prisma.membership.findMany({
        where: {
          userId: { in: userReviewerIds },
          organizationId: tenant.organizationId,
        },
        select: { userId: true },
      });
      const validIds = new Set(memberships.map((m) => m.userId));
      const missing = userReviewerIds.filter((id) => !validIds.has(id));
      if (missing.length > 0) {
        throw new BadRequestException(`Usuário(s) não são membros da Org: ${missing.join(', ')}`);
      }
    }

    // Valida listas default — precisam ser do mesmo board do card
    if (body.defaultOnApproveListId) {
      await this.assertListInBoard(body.defaultOnApproveListId, card.boardId);
    }
    if (body.defaultOnRejectListId) {
      await this.assertListInBoard(body.defaultOnRejectListId, card.boardId);
    }

    const expiresAt = new Date(Date.now() + REVIEWER_TOKEN_TTL_MS);

    const created = await this.prisma.$transaction(async (tx) => {
      const approval = await tx.cardApproval.create({
        data: {
          cardId,
          organizationId: tenant.organizationId,
          requestedById: userId,
          defaultOnApproveListId: body.defaultOnApproveListId ?? null,
          defaultOnRejectListId: body.defaultOnRejectListId ?? null,
        },
      });

      await tx.cardApprovalReviewer.createMany({
        data: body.reviewers.map((r) => ({
          approvalId: approval.id,
          userId: r.userId ?? null,
          phone: r.phone ?? null,
          externalName: r.externalName ?? null,
          accessToken: this.generateToken(),
          expiresAt,
        })),
      });

      // Marca os reviewers como CardMember role=REVIEWER (idempotente).
      // Garante que o cliente apareça na seção "Equipe" do card.
      if (userReviewerIds.length > 0) {
        for (const reviewerId of userReviewerIds) {
          await tx.cardMember.upsert({
            where: { cardId_userId: { cardId, userId: reviewerId } },
            update: { role: 'REVIEWER' },
            create: { cardId, userId: reviewerId, role: 'REVIEWER' },
          });
        }
      }

      await tx.activity.create({
        data: {
          organizationId: tenant.organizationId,
          boardId: card.boardId,
          cardId,
          actorId: userId,
          type: 'CARD_UPDATED',
          payload: {
            kind: 'approval.requested',
            approvalId: approval.id,
            reviewersCount: body.reviewers.length,
          },
        },
      });

      return approval;
    });

    // Reload com reviewers pra retornar e disparar notificações
    const full = await this.prisma.cardApproval.findUniqueOrThrow({
      where: { id: created.id },
      include: { reviewers: true },
    });

    // Notifica cada reviewer (interno = inbox+push; externo phone-only =
    // só WhatsApp). Fire-and-forget pra não bloquear a resposta.
    void this.notifyReviewers(full, card, body, userId);

    this.events.emit(EVENT_NAMES.CARD_UPDATED, {
      boardId: card.boardId,
      organizationId: tenant.organizationId,
      actorId: userId,
      cardId,
    });

    return full;
  }

  private async assertListInBoard(listId: string, boardId: string) {
    const list = await this.prisma.list.findUnique({
      where: { id: listId },
      select: { boardId: true, isArchived: true },
    });
    if (!list || list.boardId !== boardId || list.isArchived) {
      throw new BadRequestException(
        `Lista ${listId} inválida (não existe, é de outro board ou está arquivada).`,
      );
    }
  }

  private generateToken(): string {
    return randomBytes(24).toString('base64url');
  }

  private async notifyReviewers(
    approval: {
      id: string;
      reviewers: Array<{
        userId: string | null;
        phone: string | null;
        accessToken: string;
        externalName: string | null;
      }>;
    },
    card: { id: string; title: string; boardId: string; organizationId: string },
    body: RequestApprovalRequest,
    requesterId: string,
  ) {
    const requester = await this.prisma.user.findUnique({
      where: { id: requesterId },
      select: { name: true },
    });
    const requesterName = requester?.name ?? 'Alguém';

    // Carrega contexto extra (board/list) pra renderizar Mustache na mensagem
    const cardContext = await this.prisma.card.findUnique({
      where: { id: card.id },
      select: {
        list: { select: { name: true } },
        board: { select: { name: true } },
      },
    });

    for (const reviewer of approval.reviewers) {
      const link = `${env.APP_URL}/aprovar/${reviewer.accessToken}`;

      // Resolve nome do reviewer (user.name ou externalName) pra Mustache
      let reviewerName = reviewer.externalName ?? '';
      if (reviewer.userId && !reviewerName) {
        const u = await this.prisma.user.findUnique({
          where: { id: reviewer.userId },
          select: { name: true },
        });
        reviewerName = u?.name ?? '';
      }
      const reviewerFirstName = reviewerName.split(/\s+/)[0] ?? '';

      // Vars compartilhadas pra render Mustache (mensagem custom + default)
      const vars: Record<string, string> = {
        'card.title': card.title,
        'card.list.name': cardContext?.list.name ?? '',
        'card.board.name': cardContext?.board.name ?? '',
        'requester.name': requesterName,
        'reviewer.name': reviewerName,
        'reviewer.firstName': reviewerFirstName,
        link,
      };

      // Mensagem custom do user (renderizada) ou default
      const renderedMessage = body.message ? renderTemplate(body.message, vars) : undefined;

      // Reviewer interno: notification in-app + push
      if (reviewer.userId) {
        await this.notifications
          .create({
            userId: reviewer.userId,
            organizationId: card.organizationId,
            type: 'CUSTOM',
            title: 'Pedido de aprovação',
            body: `${requesterName} pediu sua aprovação no card "${card.title}"`,
            entityType: 'CardApproval',
            entityId: approval.id,
            url: `/aprovacoes`,
          })
          .catch((err) => {
            this.logger.warn(
              `Falha ao notificar reviewer ${reviewer.userId}: ${err instanceof Error ? err.message : err}`,
            );
          });
      }

      // WhatsApp: tanto pra phone-only quanto pra interno com opt-in.
      if (body.notifyOnWhatsApp) {
        const phone = await this.resolvePhoneForNotification(reviewer);
        if (phone) {
          const text = this.composeWhatsAppMessage({
            customMessage: renderedMessage,
            vars,
          });
          const ok = await this.whatsapp.sendText(phone, text);
          if (ok) {
            await this.prisma.cardApprovalReviewer.updateMany({
              where: {
                approvalId: approval.id,
                ...(reviewer.userId ? { userId: reviewer.userId } : { phone: reviewer.phone }),
              },
              data: { notifiedAt: new Date() },
            });
          }
        }
      }
    }
  }

  private async resolvePhoneForNotification(reviewer: {
    userId: string | null;
    phone: string | null;
  }): Promise<string | null> {
    if (reviewer.phone) return reviewer.phone;
    if (reviewer.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: reviewer.userId },
        select: { phone: true, notifyApprovalsOnWhatsApp: true },
      });
      if (user?.notifyApprovalsOnWhatsApp && user.phone) return user.phone;
    }
    return null;
  }

  /**
   * Compoe mensagem WhatsApp pro reviewer.
   *
   * Sem `customMessage`: usa template padrao com saudacao personalizada
   * pelo primeiro nome do reviewer (fallback "Olá!" se phone-only sem
   * nome). Inclui quem pediu + titulo do card em destaque + link.
   *
   * Com `customMessage`: a mensagem do user ja foi renderizada com Mustache
   * pelo caller. Aqui so embrulhamos com saudacao + link no fim, evitando
   * que o user precise lembrar de incluir o link manualmente.
   */
  private composeWhatsAppMessage(p: {
    customMessage?: string;
    vars: Record<string, string>;
  }): string {
    const firstName = p.vars['reviewer.firstName'] ?? '';
    const requesterName = p.vars['requester.name'] ?? 'Alguém';
    const cardTitle = p.vars['card.title'] ?? '';
    const link = p.vars['link'] ?? '';

    const greeting = firstName ? `Olá, ${firstName}!` : 'Olá!';

    if (p.customMessage) {
      // User escreveu mensagem custom — usamos como corpo principal,
      // adicionando saudacao no topo e link no fim pra garantir o essencial
      return [greeting, '', p.customMessage, '', link].join('\n');
    }

    // Template padrao
    return [
      greeting,
      '',
      `${requesterName} pediu sua aprovação:`,
      '',
      `*${cardTitle}*`,
      '',
      'Acesse o link para aprovar ou reprovar:',
      link,
    ].join('\n');
  }

  // ============================================================
  // Decide (interno e público compartilham essa lógica)
  // ============================================================
  async decideAsUser(
    userId: string,
    tenant: TenantContext,
    approvalId: string,
    body: DecideApprovalRequest,
  ) {
    const approval = await this.prisma.cardApproval.findUnique({
      where: { id: approvalId },
      include: { reviewers: true },
    });
    if (!approval || approval.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Aprovação não encontrada.');
    }
    if (approval.status !== 'PENDING') {
      throw new BadRequestException(
        `Aprovação já foi ${approval.status.toLowerCase()}. Não pode decidir novamente.`,
      );
    }
    // User precisa estar entre os reviewers
    const isReviewer = approval.reviewers.some((r) => r.userId === userId);
    if (!isReviewer) {
      throw new ForbiddenException('Você não é reviewer desta aprovação.');
    }

    return this.applyDecision(approval.id, body, {
      decidedById: userId,
      decidedByExternalName: null,
    });
  }

  async decideByToken(token: string, body: DecideApprovalRequest) {
    const reviewer = await this.prisma.cardApprovalReviewer.findUnique({
      where: { accessToken: token },
      include: {
        approval: { include: { reviewers: true } },
      },
    });
    if (!reviewer) throw new NotFoundException('Token inválido.');
    if (reviewer.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Token expirado.');
    }
    const approval = reviewer.approval;
    if (approval.status !== 'PENDING') {
      throw new BadRequestException(`Aprovação já foi ${approval.status.toLowerCase()}.`);
    }

    return this.applyDecision(approval.id, body, {
      decidedById: reviewer.userId, // pode ser null (phone-only)
      decidedByExternalName: reviewer.userId ? null : reviewer.externalName,
    });
  }

  /**
   * Coração do fluxo de decisão. Roda em transação:
   *   - Atualiza CardApproval.status + decidedAt + note
   *   - Move o card pra defaultOn(Approve|Reject)ListId se setado
   *   - Registra side-effects pra rollback no undo
   *   - Cria activity de aprovação/reprovação
   * Após commit, emite event APPROVAL_DECIDED pra engine disparar trigger.
   */
  private async applyDecision(
    approvalId: string,
    body: DecideApprovalRequest,
    decider: { decidedById: string | null; decidedByExternalName: string | null },
  ) {
    const newStatus: ApprovalStatus = body.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    const updated = await this.prisma.$transaction(async (tx) => {
      // Pega aprovação fresca dentro da tx
      const a = await tx.cardApproval.findUniqueOrThrow({
        where: { id: approvalId },
      });
      if (a.status !== 'PENDING') {
        throw new BadRequestException('Aprovação já foi decidida.');
      }

      const card = await tx.card.findUniqueOrThrow({
        where: { id: a.cardId },
        select: { id: true, listId: true, boardId: true, organizationId: true },
      });

      const sideEffects: SideEffectsShape = {};

      // Move o card pra lista default (se configurada).
      const targetListId =
        newStatus === 'APPROVED' ? a.defaultOnApproveListId : a.defaultOnRejectListId;
      if (targetListId && targetListId !== card.listId) {
        const targetList = await tx.list.findUnique({
          where: { id: targetListId },
          select: { id: true, boardId: true, isArchived: true },
        });
        if (targetList && targetList.boardId === card.boardId && !targetList.isArchived) {
          // posição: final da lista alvo
          const last = await tx.card.findFirst({
            where: { listId: targetListId, isArchived: false },
            orderBy: { position: 'desc' },
            select: { position: true },
          });
          await tx.card.update({
            where: { id: card.id },
            data: {
              listId: targetListId,
              position: (last?.position ?? 0) + 1,
              enteredListAt: new Date(),
            },
          });
          sideEffects.movedFromListId = card.listId;
          sideEffects.movedToListId = targetListId;
        }
      }

      const result = await tx.cardApproval.update({
        where: { id: approvalId },
        data: {
          status: newStatus,
          decidedAt: new Date(),
          decidedById: decider.decidedById,
          decidedByExternalName: decider.decidedByExternalName,
          note: body.note?.trim() || null,
          sideEffects: sideEffects as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.activity.create({
        data: {
          organizationId: a.organizationId,
          boardId: card.boardId,
          cardId: a.cardId,
          actorId: decider.decidedById,
          type: 'CARD_UPDATED',
          payload: {
            kind: newStatus === 'APPROVED' ? 'approval.approved' : 'approval.rejected',
            approvalId,
            decidedByExternalName: decider.decidedByExternalName,
            note: body.note?.trim() || null,
            sideEffects: sideEffects as Record<string, unknown>,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return { approval: result, card };
    });

    // Emite event pra engine + realtime fora da tx (evita lock prolongado).
    const payload: ApprovalEventPayload = {
      approvalId,
      cardId: updated.approval.cardId,
      organizationId: updated.approval.organizationId,
      boardId: updated.card.boardId,
      // listId pode ter mudado se houve move
      listId:
        (updated.approval.sideEffects as SideEffectsShape | null)?.movedToListId ??
        updated.card.listId,
      decidedById: updated.approval.decidedById,
    };
    this.events.emit(APPROVAL_DECIDED_EVENT, {
      ...payload,
      status: newStatus,
    });

    this.events.emit(EVENT_NAMES.CARD_UPDATED, {
      boardId: updated.card.boardId,
      organizationId: updated.approval.organizationId,
      actorId: decider.decidedById ?? undefined,
      cardId: updated.approval.cardId,
    });

    // Notifica o requester
    await this.notifications
      .create({
        userId: updated.approval.requestedById,
        organizationId: updated.approval.organizationId,
        type: 'CUSTOM',
        title: newStatus === 'APPROVED' ? 'Aprovação concedida' : 'Aprovação reprovada',
        body: body.note?.trim() || undefined,
        entityType: 'Card',
        entityId: updated.approval.cardId,
      })
      .catch(() => undefined);

    return updated.approval;
  }

  // ============================================================
  // Undo
  // ============================================================
  async undo(userId: string, tenant: TenantContext, approvalId: string, body: UndoApprovalRequest) {
    const approval = await this.prisma.cardApproval.findUnique({
      where: { id: approvalId },
      select: {
        id: true,
        cardId: true,
        organizationId: true,
        status: true,
        decidedAt: true,
        decidedById: true,
        sideEffects: true,
      },
    });
    if (!approval || approval.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Aprovação não encontrada.');
    }
    if (approval.status === 'PENDING' || approval.status === 'REVERTED') {
      throw new BadRequestException('Não há decisão a desfazer.');
    }
    if (!approval.decidedAt) {
      throw new BadRequestException('Aprovação sem timestamp de decisão.');
    }

    // Quem pode desfazer: o próprio decisor OU OWNER/ADMIN/GESTOR da Org.
    const isPrivileged =
      tenant.role === 'OWNER' || tenant.role === 'ADMIN' || tenant.role === 'GESTOR';
    if (approval.decidedById !== userId && !isPrivileged) {
      throw new ForbiddenException('Sem permissão pra desfazer esta aprovação.');
    }

    // Janela de 5min — após isso, ninguém pode desfazer (intencional:
    // forçar o user a re-iniciar uma nova aprovação se a decisão é antiga).
    const elapsed = Date.now() - approval.decidedAt.getTime();
    if (elapsed > UNDO_WINDOW_MS) {
      throw new BadRequestException('Janela pra desfazer expirou (5min após a decisão).');
    }

    // Verifica se houve ação humana sobre os side-effects pós-decisão.
    // Se sim, bloqueia undo (intervenção humana é "consentimento" ao estado).
    const sideEffects = (approval.sideEffects ?? {}) as SideEffectsShape;
    const movedToListId = sideEffects.movedToListId;
    if (movedToListId) {
      // Olha activities humanas no card APÓS decidedAt que envolvam mover/editar.
      // automationRunId NULL = ação humana; comments na whitelist (não bloqueiam).
      const humanInterference = await this.prisma.activity.findFirst({
        where: {
          cardId: approval.cardId,
          createdAt: { gt: approval.decidedAt },
          automationRunId: null,
          actorId: { not: null },
          type: { in: ['CARD_MOVED', 'CARD_UPDATED', 'CARD_ARCHIVED', 'CARD_COMPLETED'] },
          NOT: {
            payload: { path: ['kind'], equals: 'approval.approved' },
          },
        },
        select: { id: true, type: true, actorId: true },
      });
      if (humanInterference) {
        throw new BadRequestException(
          'Outro usuário interagiu com o card depois da decisão — undo bloqueado.',
        );
      }
    }

    // Desfaz: reverte movimentação se houve, marca como REVERTED.
    const reverted = await this.prisma.$transaction(async (tx) => {
      if (sideEffects.movedFromListId && movedToListId) {
        const card = await tx.card.findUniqueOrThrow({
          where: { id: approval.cardId },
          select: { boardId: true, listId: true },
        });
        // Só reverte se ainda está na lista alvo (defesa em profundidade)
        if (card.listId === movedToListId) {
          const fromList = await tx.list.findUnique({
            where: { id: sideEffects.movedFromListId },
            select: { id: true, isArchived: true },
          });
          if (fromList && !fromList.isArchived) {
            const last = await tx.card.findFirst({
              where: { listId: fromList.id, isArchived: false },
              orderBy: { position: 'desc' },
              select: { position: true },
            });
            await tx.card.update({
              where: { id: approval.cardId },
              data: {
                listId: fromList.id,
                position: (last?.position ?? 0) + 1,
                enteredListAt: new Date(),
              },
            });
          }
        }
      }

      const r = await tx.cardApproval.update({
        where: { id: approvalId },
        data: {
          status: 'REVERTED',
          revertedAt: new Date(),
          revertedById: userId,
          revertReason: body.reason?.trim() || null,
        },
      });

      await tx.activity.create({
        data: {
          organizationId: approval.organizationId,
          cardId: approval.cardId,
          actorId: userId,
          type: 'CARD_UPDATED',
          payload: {
            kind: 'approval.reverted',
            approvalId,
            originalStatus: approval.status,
            reason: body.reason?.trim() || null,
          },
        },
      });

      return r;
    });

    // Realtime
    const card = await this.prisma.card.findUniqueOrThrow({
      where: { id: approval.cardId },
      select: { boardId: true },
    });
    this.events.emit(EVENT_NAMES.CARD_UPDATED, {
      boardId: card.boardId,
      organizationId: approval.organizationId,
      actorId: userId,
      cardId: approval.cardId,
    });

    return reverted;
  }

  // ============================================================
  // Listing
  // ============================================================
  async listPendingForUser(userId: string, tenant: TenantContext) {
    return this.prisma.cardApproval.findMany({
      where: {
        organizationId: tenant.organizationId,
        status: 'PENDING',
        reviewers: { some: { userId } },
      },
      orderBy: { requestedAt: 'desc' },
      include: {
        card: {
          select: {
            id: true,
            title: true,
            boardId: true,
            listId: true,
            board: { select: { id: true, name: true, color: true } },
            list: { select: { id: true, name: true } },
          },
        },
        requestedBy: { select: { id: true, name: true, avatarUrl: true } },
        reviewers: {
          select: {
            id: true,
            userId: true,
            phone: true,
            externalName: true,
            notifiedAt: true,
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    });
  }

  async listForCard(cardId: string, tenant: TenantContext, userId: string) {
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: { boardId: true, organizationId: true },
    });
    if (!card || card.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Card não encontrado.');
    }
    await this.access.assertAccess(userId, card.boardId, tenant, 'VIEWER');

    return this.prisma.cardApproval.findMany({
      where: { cardId, organizationId: tenant.organizationId },
      orderBy: { requestedAt: 'desc' },
      include: {
        requestedBy: { select: { id: true, name: true, avatarUrl: true } },
        decidedBy: { select: { id: true, name: true, avatarUrl: true } },
        revertedBy: { select: { id: true, name: true, avatarUrl: true } },
        defaultApproveList: { select: { id: true, name: true } },
        defaultRejectList: { select: { id: true, name: true } },
        reviewers: {
          select: {
            id: true,
            userId: true,
            phone: true,
            externalName: true,
            notifiedAt: true,
            expiresAt: true,
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    });
  }

  // ============================================================
  // Public (token)
  // ============================================================
  async getPublicView(token: string) {
    const reviewer = await this.prisma.cardApprovalReviewer.findUnique({
      where: { accessToken: token },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        approval: {
          include: {
            card: {
              select: {
                id: true,
                title: true,
                description: true,
                priority: true,
                dueDate: true,
                board: { select: { id: true, name: true, color: true } },
                list: { select: { id: true, name: true } },
              },
            },
            requestedBy: { select: { id: true, name: true, avatarUrl: true } },
            decidedBy: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    });
    if (!reviewer) throw new NotFoundException('Token inválido.');

    const expired = reviewer.expiresAt.getTime() < Date.now();
    return {
      reviewer: {
        id: reviewer.id,
        userId: reviewer.userId,
        externalName: reviewer.externalName,
        user: reviewer.user,
        expiresAt: reviewer.expiresAt,
        expired,
      },
      approval: reviewer.approval,
    };
  }
}

/**
 * Mustache simples (sem dependencia externa). Replica `renderTemplate`
 * da automations.engine pra evitar import cross-module.
 */
function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => vars[key] ?? '');
}
