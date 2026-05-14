import { randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ApprovalStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { env } from '@/config/env';
import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { BoardAccessService } from '@/modules/boards/board-access.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { EVENT_NAMES } from '@/modules/realtime/events.types';
import { StorageService } from '@/modules/storage/storage.service';

import type {
  RequestApprovalRequest,
  DecideApprovalRequest,
  UndoApprovalRequest,
  CancelApprovalRequest,
  ResendApprovalRequest,
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
  addedLabelIds?: string[];
  removedLabelIds?: string[];
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
    private readonly storage: StorageService,
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
          // Persiste mensagem original digitada pelo requester pra que o
          // reenvio (resend) use o mesmo texto que o cliente ja recebeu.
          message: body.message ?? null,
          defaultOnApproveListId: body.defaultOnApproveListId ?? null,
          defaultOnRejectListId: body.defaultOnRejectListId ?? null,
          onApproveActions: body.onApproveActions
            ? (body.onApproveActions as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          onRejectActions: body.onRejectActions
            ? (body.onRejectActions as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
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

    // Conta envios efetivos pra atualizar lastNotifiedAt/notifyCount no fim.
    let dispatched = 0;

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
            variant: 'initial',
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
            dispatched += 1;
          }
        }
      }
    }

    // Marca o envio agregado no approval (usado pra rate-limit do resend +
    // exibicao "Enviado ha Xmin" na UI).
    if (dispatched > 0) {
      await this.prisma.cardApproval.update({
        where: { id: approval.id },
        data: { lastNotifiedAt: new Date(), notifyCount: { increment: 1 } },
      });
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
        select: { phone: true },
      });
      // Para pedidos de aprovacao direcionados: o reviewer foi selecionado
      // explicitamente, entao notifica se tem phone. O opt-in
      // (notifyApprovalsOnWhatsApp) vale apenas pra notificacoes automaticas
      // de fundo (cron de lembretes) — nao pra eventos solicitados pelo user.
      if (user?.phone) return user.phone;
    }
    return null;
  }

  /**
   * Compoe mensagem WhatsApp pro reviewer. 3 variantes:
   *
   * - `initial`: pedido recem-criado. Se `customMessage` veio (user
   *    digitou texto), usa ela como corpo principal; senao usa template
   *    padrao "X pediu sua aprovacao".
   * - `reminder`: lembrete (resend). Mostra titulo do card + fluxo em
   *    destaque + link. Nao usa customMessage (evita repetir a mensagem
   *    original do request).
   * - `canceled`: aviso de cancelamento. Inclui motivo se houver. Nao
   *    inclui link (nao tem o que clicar — pagina publica responde
   *    "cancelado").
   *
   * Asteriscos (`*texto*`) sao a marcacao de negrito do WhatsApp.
   * Citacao (`> ...`) aparece com barra cinza na lateral no WhatsApp.
   * Todas terminam com "Esta e uma mensagem automatica" pra deixar claro
   * que nao e humano digitando.
   */
  private composeWhatsAppMessage(p: {
    variant: 'initial' | 'reminder' | 'canceled';
    customMessage?: string;
    cancelReason?: string | null;
    vars: Record<string, string>;
  }): string {
    const firstName = p.vars['reviewer.firstName'] ?? '';
    const requesterName = p.vars['requester.name'] ?? 'Alguém';
    const cardTitle = p.vars['card.title'] ?? '';
    const boardName = p.vars['card.board.name'] ?? '';
    const link = p.vars['link'] ?? '';

    const greeting = firstName ? `Olá, ${firstName}!` : 'Olá!';
    const automatedFooter = '\n\n> Esta é uma mensagem automática.';

    if (p.variant === 'reminder') {
      const lines = [
        'LEMBRETE',
        'Sua aprovação ainda está *pendente*:',
        '',
        `📋 Card: *${cardTitle}*`,
        `📁 Fluxo: ${boardName}`,
        '',
        'Acesse e confira:',
        link,
      ];
      return lines.join('\n') + automatedFooter;
    }

    if (p.variant === 'canceled') {
      const lines = [
        greeting,
        '',
        'O pedido de aprovação foi *cancelado* pela equipe.',
        '',
        `📋 Card: *${cardTitle}*`,
        `📁 Fluxo: ${boardName}`,
      ];
      if (p.cancelReason && p.cancelReason.trim()) {
        lines.push('', `Motivo: ${p.cancelReason.trim()}`);
      }
      lines.push('', 'Se tiver dúvida, fale com seu contato na equipe.');
      return lines.join('\n') + automatedFooter;
    }

    // variant === 'initial'
    if (p.customMessage) {
      const lines = [
        greeting,
        '',
        p.customMessage,
        '',
        `📋 Card: *${cardTitle}*`,
        `📁 Fluxo: ${boardName}`,
        '',
        'Acesse e decida:',
        link,
      ];
      return lines.join('\n') + automatedFooter;
    }

    const lines = [
      greeting,
      '',
      `*${requesterName}* pediu sua aprovação:`,
      '',
      `📋 Card: *${cardTitle}*`,
      `📁 Fluxo: ${boardName}`,
      '',
      'Acesse e decida:',
      link,
    ];
    return lines.join('\n') + automatedFooter;
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
      if (approval.status === 'CANCELED') {
        throw new BadRequestException('Pedido cancelado pela equipe — não pode decidir.');
      }
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
      if (approval.status === 'CANCELED') {
        throw new BadRequestException('Pedido de aprovação cancelado pela equipe.');
      }
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

      // Aplica acoes default: add/remove tags configurados no pedido.
      // Valida que os labels pertencem ao mesmo board do card e estao na Org.
      const actions = (newStatus === 'APPROVED' ? a.onApproveActions : a.onRejectActions) as {
        addTagIds?: string[];
        removeTagIds?: string[];
      } | null;
      const addTagIds = Array.isArray(actions?.addTagIds) ? actions!.addTagIds : [];
      const removeTagIds = Array.isArray(actions?.removeTagIds) ? actions!.removeTagIds : [];

      if (addTagIds.length > 0) {
        const validLabels = await tx.label.findMany({
          where: {
            id: { in: addTagIds },
            organizationId: a.organizationId,
            OR: [{ boardId: card.boardId }, { boardId: null }],
          },
          select: { id: true },
        });
        if (validLabels.length > 0) {
          await tx.cardLabel.createMany({
            data: validLabels.map((l) => ({ cardId: card.id, labelId: l.id })),
            skipDuplicates: true,
          });
          sideEffects.addedLabelIds = validLabels.map((l) => l.id);
        }
      }
      if (removeTagIds.length > 0) {
        const removed = await tx.cardLabel.deleteMany({
          where: { cardId: card.id, labelId: { in: removeTagIds } },
        });
        if (removed.count > 0) {
          sideEffects.removedLabelIds = removeTagIds;
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

    // Quando a aprovacao moveu o card pra outra lista, emite CARD_MOVED
    // pra UI Kanban animar a transicao em tempo real. CARD_UPDATED sozinho
    // nao desloca o card visualmente.
    const sideEff = updated.approval.sideEffects as SideEffectsShape | null;
    if (sideEff?.movedToListId && sideEff?.movedFromListId) {
      // Pega posicao final no destino (foi setada na update da tx acima).
      const movedCard = await this.prisma.card.findUnique({
        where: { id: updated.approval.cardId },
        select: { position: true },
      });
      this.events.emit(EVENT_NAMES.CARD_MOVED, {
        boardId: updated.card.boardId,
        organizationId: updated.approval.organizationId,
        actorId: decider.decidedById ?? undefined,
        cardId: updated.approval.cardId,
        fromListId: sideEff.movedFromListId,
        toListId: sideEff.movedToListId,
        position: movedCard?.position ?? 0,
      });
    }

    // Notifica o requester com contexto: quem decidiu + titulo do card +
    // nota opcional. Antes era so titulo generico ("Aprovacao concedida")
    // sem nada no body — usuario nao sabia a qual card se referia.
    const cardWithTitle = await this.prisma.card.findUnique({
      where: { id: updated.approval.cardId },
      select: { title: true },
    });
    let deciderName: string | null = decider.decidedByExternalName;
    if (!deciderName && decider.decidedById) {
      const u = await this.prisma.user.findUnique({
        where: { id: decider.decidedById },
        select: { name: true },
      });
      deciderName = u?.name ?? null;
    }
    const verb = newStatus === 'APPROVED' ? 'aprovou' : 'reprovou';
    const cardTitle = cardWithTitle?.title ?? 'card';
    const subject = deciderName ?? 'Alguém';
    const note = body.note?.trim();
    const summary = `${subject} ${verb} o card "${cardTitle}"${note ? ` — ${note}` : ''}`;

    await this.notifications
      .create({
        userId: updated.approval.requestedById,
        organizationId: updated.approval.organizationId,
        type: 'CUSTOM',
        title: newStatus === 'APPROVED' ? 'Aprovação concedida' : 'Aprovação reprovada',
        body: summary,
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
  // Cancel
  // ============================================================
  /**
   * Cancela um pedido de aprovacao PENDING. Status vai pra CANCELED,
   * tokens dos reviewers sao expirados (pagina publica passa a exibir
   * "cancelado"), reviewers internos recebem notificacao in-app, e os
   * que tem phone recebem WhatsApp de aviso.
   *
   * Permissao: requester OU OWNER/ADMIN/GESTOR da Org.
   *
   * Sem rate-limit: cancelar e operacao rara e definitiva.
   */
  async cancel(
    userId: string,
    tenant: TenantContext,
    approvalId: string,
    body: CancelApprovalRequest,
  ) {
    const approval = await this.prisma.cardApproval.findUnique({
      where: { id: approvalId },
      select: {
        id: true,
        cardId: true,
        organizationId: true,
        requestedById: true,
        status: true,
        message: true,
        card: { select: { id: true, title: true, boardId: true, organizationId: true } },
        reviewers: {
          select: {
            id: true,
            userId: true,
            phone: true,
            externalName: true,
            accessToken: true,
          },
        },
      },
    });
    if (!approval || approval.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Aprovação não encontrada.');
    }
    if (approval.status !== 'PENDING') {
      throw new BadRequestException(
        `Aprovação já foi ${approval.status.toLowerCase()} — não pode ser cancelada.`,
      );
    }
    const isPrivileged =
      tenant.role === 'OWNER' || tenant.role === 'ADMIN' || tenant.role === 'GESTOR';
    if (approval.requestedById !== userId && !isPrivileged) {
      throw new ForbiddenException('Sem permissão pra cancelar este pedido.');
    }

    const reason = body.reason?.trim() || null;

    const canceled = await this.prisma.$transaction(async (tx) => {
      // Marca CANCELED + auditoria.
      const c = await tx.cardApproval.update({
        where: { id: approvalId },
        data: {
          status: 'CANCELED',
          canceledAt: new Date(),
          canceledById: userId,
          cancelReason: reason,
        },
      });
      // Expira tokens dos reviewers — decideByToken e getPublicView passam
      // a tratar como cancelado (ja barram com status !== PENDING).
      await tx.cardApprovalReviewer.updateMany({
        where: { approvalId },
        data: { expiresAt: new Date() },
      });
      await tx.activity.create({
        data: {
          organizationId: approval.organizationId,
          boardId: approval.card.boardId,
          cardId: approval.cardId,
          actorId: userId,
          type: 'CARD_UPDATED',
          payload: {
            kind: 'approval.canceled',
            approvalId,
            reason,
          },
        },
      });
      return c;
    });

    // Notifica reviewers (fire-and-forget). Inclui WhatsApp de cancelamento
    // pros que tem phone + notificacao in-app pros internos.
    void this.notifyReviewersAboutCancellation(approval, reason);

    // Realtime: card modal aberto em outras abas se atualiza.
    this.events.emit(EVENT_NAMES.CARD_UPDATED, {
      boardId: approval.card.boardId,
      organizationId: approval.organizationId,
      actorId: userId,
      cardId: approval.cardId,
    });

    return canceled;
  }

  private async notifyReviewersAboutCancellation(
    approval: {
      id: string;
      cardId: string;
      organizationId: string;
      card: { title: string; boardId: string };
      reviewers: Array<{
        userId: string | null;
        phone: string | null;
        externalName: string | null;
      }>;
    },
    cancelReason: string | null,
  ) {
    // Contexto board pro template
    const board = await this.prisma.board.findUnique({
      where: { id: approval.card.boardId },
      select: { name: true },
    });
    const boardName = board?.name ?? '';

    for (const reviewer of approval.reviewers) {
      // Resolve nome
      let reviewerName = reviewer.externalName ?? '';
      if (reviewer.userId && !reviewerName) {
        const u = await this.prisma.user.findUnique({
          where: { id: reviewer.userId },
          select: { name: true },
        });
        reviewerName = u?.name ?? '';
      }
      const reviewerFirstName = reviewerName.split(/\s+/)[0] ?? '';

      const vars: Record<string, string> = {
        'card.title': approval.card.title,
        'card.board.name': boardName,
        'reviewer.name': reviewerName,
        'reviewer.firstName': reviewerFirstName,
        link: '',
      };

      // In-app pros internos.
      if (reviewer.userId) {
        await this.notifications
          .create({
            userId: reviewer.userId,
            organizationId: approval.organizationId,
            type: 'CUSTOM',
            title: 'Pedido de aprovação cancelado',
            body: `O pedido de aprovação do card "${approval.card.title}" foi cancelado pela equipe.`,
            entityType: 'CardApproval',
            entityId: approval.id,
            url: `/aprovacoes`,
          })
          .catch((err) => {
            this.logger.warn(
              `Falha notif cancelamento ${reviewer.userId}: ${err instanceof Error ? err.message : err}`,
            );
          });
      }

      // WhatsApp pros que tem phone (resolve user.phone se interno).
      const phone = await this.resolvePhoneForNotification(reviewer);
      if (phone) {
        const text = this.composeWhatsAppMessage({
          variant: 'canceled',
          cancelReason,
          vars,
        });
        await this.whatsapp.sendText(phone, text);
      }
    }
  }

  // ============================================================
  // Resend (lembrete WhatsApp + in-app pros revisores)
  // ============================================================
  /**
   * Reenvia notificacao pros revisores de um pedido PENDING.
   *
   * Opts:
   *   - reviewerId omitido/null: reenvia pra TODOS os revisores
   *     (default da UI quando o pedido tem 2+ revisores e o user
   *     escolhe "Reenviar para todos").
   *   - reviewerId setado: reenvia so pra aquele revisor especifico.
   *
   * Rate-limit:
   *   - Cooldown de 30s entre reenvios (anti-burst acidental).
   *   - Cap total de 10 envios por pedido (initial + 9 reenvios).
   *     Cliente que nao responde apos 10 lembretes precisa de outra
   *     abordagem, nao mais lembretes.
   *
   * Permissao: requester OU OWNER/ADMIN/GESTOR.
   */
  async resend(
    userId: string,
    tenant: TenantContext,
    approvalId: string,
    body: ResendApprovalRequest,
  ) {
    const approval = await this.prisma.cardApproval.findUnique({
      where: { id: approvalId },
      select: {
        id: true,
        cardId: true,
        organizationId: true,
        requestedById: true,
        status: true,
        lastNotifiedAt: true,
        notifyCount: true,
        card: { select: { id: true, title: true, boardId: true, organizationId: true } },
        reviewers: {
          select: {
            id: true,
            userId: true,
            phone: true,
            externalName: true,
            accessToken: true,
          },
        },
      },
    });
    if (!approval || approval.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Aprovação não encontrada.');
    }
    if (approval.status !== 'PENDING') {
      throw new BadRequestException(
        `Aprovação já foi ${approval.status.toLowerCase()} — não pode ser reenviada.`,
      );
    }
    const isPrivileged =
      tenant.role === 'OWNER' || tenant.role === 'ADMIN' || tenant.role === 'GESTOR';
    if (approval.requestedById !== userId && !isPrivileged) {
      throw new ForbiddenException('Sem permissão pra reenviar este pedido.');
    }

    // Rate-limit: cooldown 30s
    if (approval.lastNotifiedAt) {
      const sinceMs = Date.now() - approval.lastNotifiedAt.getTime();
      if (sinceMs < 30_000) {
        const waitSec = Math.ceil((30_000 - sinceMs) / 1000);
        throw new BadRequestException(`Aguarde ${waitSec}s antes de reenviar.`);
      }
    }
    // Rate-limit: cap total
    if (approval.notifyCount >= 10) {
      throw new BadRequestException(
        'Limite de 10 envios atingido para este pedido. Cancele e crie um novo se ainda for necessário.',
      );
    }

    // Resolve reviewers alvo
    const targetReviewers = body.reviewerId
      ? approval.reviewers.filter((r) => r.id === body.reviewerId)
      : approval.reviewers;
    if (targetReviewers.length === 0) {
      throw new BadRequestException('Revisor não encontrado neste pedido.');
    }

    // Contexto board pro template
    const board = await this.prisma.board.findUnique({
      where: { id: approval.card.boardId },
      select: { name: true },
    });
    const boardName = board?.name ?? '';

    let dispatched = 0;
    for (const reviewer of targetReviewers) {
      const link = `${env.APP_URL}/aprovar/${reviewer.accessToken}`;

      let reviewerName = reviewer.externalName ?? '';
      if (reviewer.userId && !reviewerName) {
        const u = await this.prisma.user.findUnique({
          where: { id: reviewer.userId },
          select: { name: true },
        });
        reviewerName = u?.name ?? '';
      }
      const reviewerFirstName = reviewerName.split(/\s+/)[0] ?? '';
      const vars: Record<string, string> = {
        'card.title': approval.card.title,
        'card.board.name': boardName,
        'reviewer.name': reviewerName,
        'reviewer.firstName': reviewerFirstName,
        link,
      };

      // In-app pros internos (toast "pedido ainda pendente"-style)
      if (reviewer.userId) {
        await this.notifications
          .create({
            userId: reviewer.userId,
            organizationId: approval.organizationId,
            type: 'CUSTOM',
            title: 'Lembrete: aprovação pendente',
            body: `Você tem um pedido de aprovação pendente no card "${approval.card.title}".`,
            entityType: 'CardApproval',
            entityId: approval.id,
            url: `/aprovacoes`,
          })
          .catch((err) => {
            this.logger.warn(
              `Falha lembrete in-app ${reviewer.userId}: ${err instanceof Error ? err.message : err}`,
            );
          });
      }

      // WhatsApp
      const phone = await this.resolvePhoneForNotification(reviewer);
      if (phone) {
        const text = this.composeWhatsAppMessage({ variant: 'reminder', vars });
        const ok = await this.whatsapp.sendText(phone, text);
        if (ok) {
          await this.prisma.cardApprovalReviewer.update({
            where: { id: reviewer.id },
            data: { notifiedAt: new Date() },
          });
          dispatched += 1;
        }
      }
    }

    // Atualiza contadores agregados do approval mesmo que so in-app tenha
    // sido emitida (notifyCount conta "envios" no sentido amplo).
    const updated = await this.prisma.cardApproval.update({
      where: { id: approvalId },
      data: {
        lastNotifiedAt: new Date(),
        notifyCount: { increment: 1 },
      },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: approval.organizationId,
        boardId: approval.card.boardId,
        cardId: approval.cardId,
        actorId: userId,
        type: 'CARD_UPDATED',
        payload: {
          kind: 'approval.resent',
          approvalId,
          reviewerId: body.reviewerId ?? null,
          targetCount: targetReviewers.length,
          dispatchedWhatsapp: dispatched,
        },
      },
    });

    this.events.emit(EVENT_NAMES.CARD_UPDATED, {
      boardId: approval.card.boardId,
      organizationId: approval.organizationId,
      actorId: userId,
      cardId: approval.cardId,
    });

    return updated;
  }

  // ============================================================
  // Remove reviewer individual
  // ============================================================
  /**
   * Remove um revisor de um pedido PENDING sem cancelar o pedido inteiro.
   * Util quando o operador adicionou alguem errado (telefone errado etc).
   *
   * Bloqueia se for o ultimo revisor — nesse caso o operador deve cancelar
   * o pedido inteiro (usa cancel).
   *
   * Permissao: requester OU OWNER/ADMIN/GESTOR.
   */
  async removeReviewer(
    userId: string,
    tenant: TenantContext,
    approvalId: string,
    reviewerId: string,
  ) {
    const approval = await this.prisma.cardApproval.findUnique({
      where: { id: approvalId },
      select: {
        id: true,
        cardId: true,
        organizationId: true,
        requestedById: true,
        status: true,
        card: { select: { boardId: true } },
        reviewers: { select: { id: true, userId: true, externalName: true } },
      },
    });
    if (!approval || approval.organizationId !== tenant.organizationId) {
      throw new NotFoundException('Aprovação não encontrada.');
    }
    if (approval.status !== 'PENDING') {
      throw new BadRequestException('Só pedidos pendentes permitem remover revisor.');
    }
    const isPrivileged =
      tenant.role === 'OWNER' || tenant.role === 'ADMIN' || tenant.role === 'GESTOR';
    if (approval.requestedById !== userId && !isPrivileged) {
      throw new ForbiddenException('Sem permissão pra remover revisor.');
    }

    const reviewer = approval.reviewers.find((r) => r.id === reviewerId);
    if (!reviewer) {
      throw new NotFoundException('Revisor não encontrado neste pedido.');
    }
    if (approval.reviewers.length <= 1) {
      throw new BadRequestException(
        'Não é possível remover o último revisor — cancele o pedido inteiro.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.cardApprovalReviewer.delete({ where: { id: reviewerId } });
      await tx.activity.create({
        data: {
          organizationId: approval.organizationId,
          boardId: approval.card.boardId,
          cardId: approval.cardId,
          actorId: userId,
          type: 'CARD_UPDATED',
          payload: {
            kind: 'approval.reviewer_removed',
            approvalId,
            reviewerId,
            reviewerUserId: reviewer.userId,
            reviewerExternalName: reviewer.externalName,
          },
        },
      });
    });

    this.events.emit(EVENT_NAMES.CARD_UPDATED, {
      boardId: approval.card.boardId,
      organizationId: approval.organizationId,
      actorId: userId,
      cardId: approval.cardId,
    });

    return { id: reviewerId, removed: true };
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
        canceledBy: { select: { id: true, name: true, avatarUrl: true } },
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
  /**
   * Doc 32: aprovador externo precisa ver TUDO do card pra decidir
   * com responsabilidade — descricao rica, anexos, timeline, checklists,
   * membros, labels. Antes era so titulo + board + lista + prioridade.
   *
   * Privacidade: o token tokenizado expoe TODO o conteudo do card pra
   * quem tem o link. Aceitavel pela natureza do fluxo (cliente decide
   * com base no contexto), mas solicitante deve evitar pedir aprovacao
   * de cards com info sensivel da equipe (comentarios internos).
   */
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
                cardColor: true,
                startDate: true,
                dueDate: true,
                completedAt: true,
                estimateMinutes: true,
                board: { select: { id: true, name: true, color: true } },
                list: { select: { id: true, name: true } },
                lead: { select: { id: true, name: true, avatarUrl: true } },
                labels: {
                  select: {
                    label: { select: { id: true, name: true, color: true } },
                  },
                },
                members: {
                  select: {
                    role: true,
                    user: { select: { id: true, name: true, avatarUrl: true } },
                  },
                },
                checklists: {
                  select: {
                    id: true,
                    title: true,
                    position: true,
                    items: {
                      select: {
                        id: true,
                        text: true,
                        isDone: true,
                        position: true,
                        dueDate: true,
                      },
                      orderBy: { position: 'asc' },
                    },
                  },
                  orderBy: { position: 'asc' },
                },
                attachments: {
                  where: { embedded: false },
                  select: {
                    id: true,
                    fileName: true,
                    mimeType: true,
                    sizeBytes: true,
                    storageKey: true,
                    kind: true,
                    externalUrl: true,
                    createdAt: true,
                  },
                  orderBy: { createdAt: 'desc' },
                  take: 50,
                },
                comments: {
                  where: { deletedAt: null },
                  select: {
                    id: true,
                    body: true,
                    editedAt: true,
                    createdAt: true,
                    author: { select: { id: true, name: true, avatarUrl: true } },
                  },
                  orderBy: { createdAt: 'desc' },
                  take: 50,
                },
                activities: {
                  select: {
                    id: true,
                    type: true,
                    payload: true,
                    createdAt: true,
                    actor: { select: { id: true, name: true, avatarUrl: true } },
                  },
                  orderBy: { createdAt: 'desc' },
                  take: 50,
                },
              },
            },
            requestedBy: { select: { id: true, name: true, avatarUrl: true } },
            decidedBy: { select: { id: true, name: true, avatarUrl: true } },
            canceledBy: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    });
    if (!reviewer) throw new NotFoundException('Token inválido.');

    const expired = reviewer.expiresAt.getTime() < Date.now();

    // Hidrata URL publica pros anexos com storageKey (igual hydrateCoverInListResult
    // de boards.service). externalUrl (links) usa diretamente.
    const card = reviewer.approval.card;
    const attachmentsHydrated = card.attachments.map((a) => ({
      ...a,
      publicUrl: a.externalUrl ?? this.tryPublicUrl(a.storageKey),
    }));

    return {
      reviewer: {
        id: reviewer.id,
        userId: reviewer.userId,
        externalName: reviewer.externalName,
        user: reviewer.user,
        expiresAt: reviewer.expiresAt,
        expired,
      },
      approval: {
        ...reviewer.approval,
        card: { ...card, attachments: attachmentsHydrated },
      },
    };
  }

  /** Wrap em try/catch porque storage pode estar nao-configurado em dev. */
  private tryPublicUrl(key: string): string | null {
    try {
      return this.storage.publicUrlFor(key);
    } catch {
      return null;
    }
  }
}

/**
 * Mustache simples (sem dependencia externa). Replica `renderTemplate`
 * da automations.engine pra evitar import cross-module.
 */
function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => vars[key] ?? '');
}
