import { randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { CardStatus, Prisma } from '@prisma/client';
import {
  RESPONSIBILITY_CATEGORIES,
  RESPONSIBILITY_CATEGORY_LABELS,
  type ResponsibilityCategory,
  type ResponsibilityPreviewDto,
  type ResponsibilitySample,
  type ResponsibilityTransferResultDto,
  type TransferResponsibilitiesInput,
} from '@ktask/contracts';

import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { NotificationsService } from '@/modules/notifications/notifications.service';

import {
  configMentionsUser,
  higherBoardRole,
  replaceUserInConfig,
  type BoardRoleKey,
} from './responsibility-config';

/**
 * Doc 55 — transfere as responsabilidades PENDENTES de um membro para outro.
 *
 * Muda de dono so o que ainda esta em aberto (cards ativos/aguardando,
 * tarefas nao concluidas, aprovacoes pendentes, acesso aos fluxos e
 * automacoes que citam a pessoa). Historico fica com quem fez.
 *
 * Tudo numa transacao. Nao notifica por card (seria uma enxurrada): uma
 * notificacao de resumo pra quem assume. Atividades por card com
 * origin SYSTEM, pra nao contar como "acoes" do admin no Desempenho.
 */

const OPEN_CARD: CardStatus[] = ['ACTIVE', 'WAITING'];
const SAMPLE_SIZE = 5;

const ACTION_LABELS: Record<string, string> = {
  SET_LEAD: 'Definir responsável',
  ADD_TEAM: 'Adicionar à equipe',
  INSERT_CHECKLIST_ITEMS: 'Criar tarefas',
  INSERT_CHECKLIST_GROUP: 'Criar lista de tarefas',
  CREATE_CHILD_CARD: 'Criar card filho',
};

type Tx = Prisma.TransactionClient;

@Injectable()
export class ResponsibilityTransferService {
  private readonly logger = new Logger(ResponsibilityTransferService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // -------------------------------------------------------------------------
  // Permissoes
  // -------------------------------------------------------------------------

  private async assertCanTransferFrom(tenant: TenantContext, fromUserId: string) {
    if (tenant.role !== 'OWNER' && tenant.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Apenas Dono ou Administrador pode transferir responsabilidades.',
      );
    }
    const m = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId: fromUserId, organizationId: tenant.organizationId },
      },
      select: { role: true, user: { select: { id: true, name: true } } },
    });
    if (!m) throw new NotFoundException('Membro não encontrado nesta organização.');
    if (tenant.role === 'ADMIN' && m.role === 'OWNER') {
      throw new ForbiddenException(
        'Administrador não pode transferir responsabilidades de um Dono.',
      );
    }
    return m.user;
  }

  private async assertTarget(tenant: TenantContext, fromUserId: string, toUserId: string) {
    if (toUserId === fromUserId) {
      throw new BadRequestException('Escolha outra pessoa para assumir.');
    }
    const m = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId: toUserId, organizationId: tenant.organizationId },
      },
      select: { user: { select: { id: true, name: true, suspendedAt: true } } },
    });
    if (!m) throw new BadRequestException('Quem assume precisa ser membro desta organização.');
    if (m.user.suspendedAt) {
      throw new BadRequestException('Quem assume está com a conta suspensa.');
    }
    return { id: m.user.id, name: m.user.name };
  }

  // -------------------------------------------------------------------------
  // Consultas (compartilhadas entre previa e execucao)
  // -------------------------------------------------------------------------

  private cardsLeadWhere(orgId: string, userId: string): Prisma.CardWhereInput {
    return { organizationId: orgId, leadId: userId, deletedAt: null, status: { in: OPEN_CARD } };
  }

  private cardsMemberWhere(orgId: string, userId: string): Prisma.CardMemberWhereInput {
    return {
      userId,
      card: { organizationId: orgId, deletedAt: null, status: { in: OPEN_CARD } },
    };
  }

  private checklistItemsWhere(orgId: string, userId: string): Prisma.ChecklistItemWhereInput {
    return {
      assigneeId: userId,
      isDone: false,
      checklist: { card: { organizationId: orgId, deletedAt: null } },
    };
  }

  private tasksWhere(orgId: string, userId: string): Prisma.TaskWhereInput {
    return { organizationId: orgId, assigneeId: userId, isDone: false };
  }

  private reviewersWhere(orgId: string, userId: string): Prisma.CardApprovalReviewerWhereInput {
    return { userId, approval: { organizationId: orgId, status: 'PENDING' } };
  }

  private requestedWhere(orgId: string, userId: string): Prisma.CardApprovalWhereInput {
    return { organizationId: orgId, requestedById: userId, status: 'PENDING' };
  }

  private boardsWhere(orgId: string, userId: string): Prisma.BoardMemberWhereInput {
    return { userId, board: { organizationId: orgId } };
  }

  private async automationsMentioning(db: Tx | PrismaService, orgId: string, userId: string) {
    const all = await db.automation.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        actionType: true,
        actionConfig: true,
        isActive: true,
        board: { select: { name: true } },
        list: { select: { name: true, board: { select: { name: true } } } },
      },
    });
    return all.filter((a) => configMentionsUser(a.actionConfig, userId));
  }

  // -------------------------------------------------------------------------
  // Previa
  // -------------------------------------------------------------------------

  async preview(tenant: TenantContext, fromUserId: string): Promise<ResponsibilityPreviewDto> {
    const user = await this.assertCanTransferFrom(tenant, fromUserId);
    const org = tenant.organizationId;
    const db = this.prisma;

    const [
      leadCount,
      leadSamples,
      memberCount,
      memberSamples,
      itemCount,
      itemSamples,
      taskCount,
      taskSamples,
      reviewCount,
      reviewSamples,
      requestedCount,
      requestedSamples,
      boardCount,
      boardSamples,
      automations,
      goals,
    ] = await Promise.all([
      db.card.count({ where: this.cardsLeadWhere(org, fromUserId) }),
      db.card.findMany({
        where: this.cardsLeadWhere(org, fromUserId),
        select: { id: true, title: true, board: { select: { name: true } } },
        orderBy: { updatedAt: 'desc' },
        take: SAMPLE_SIZE,
      }),
      db.cardMember.count({ where: this.cardsMemberWhere(org, fromUserId) }),
      db.cardMember.findMany({
        where: this.cardsMemberWhere(org, fromUserId),
        select: { card: { select: { id: true, title: true, board: { select: { name: true } } } } },
        take: SAMPLE_SIZE,
      }),
      db.checklistItem.count({ where: this.checklistItemsWhere(org, fromUserId) }),
      db.checklistItem.findMany({
        where: this.checklistItemsWhere(org, fromUserId),
        select: {
          id: true,
          text: true,
          checklist: { select: { card: { select: { title: true } } } },
        },
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }],
        take: SAMPLE_SIZE,
      }),
      db.task.count({ where: this.tasksWhere(org, fromUserId) }),
      db.task.findMany({
        where: this.tasksWhere(org, fromUserId),
        select: { id: true, text: true },
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }],
        take: SAMPLE_SIZE,
      }),
      db.cardApprovalReviewer.count({ where: this.reviewersWhere(org, fromUserId) }),
      db.cardApprovalReviewer.findMany({
        where: this.reviewersWhere(org, fromUserId),
        select: { id: true, approval: { select: { card: { select: { title: true } } } } },
        take: SAMPLE_SIZE,
      }),
      db.cardApproval.count({ where: this.requestedWhere(org, fromUserId) }),
      db.cardApproval.findMany({
        where: this.requestedWhere(org, fromUserId),
        select: { id: true, card: { select: { title: true } } },
        take: SAMPLE_SIZE,
      }),
      db.boardMember.count({ where: this.boardsWhere(org, fromUserId) }),
      db.boardMember.findMany({
        where: this.boardsWhere(org, fromUserId),
        select: { id: true, role: true, board: { select: { name: true } } },
        orderBy: { board: { name: 'asc' } },
        take: SAMPLE_SIZE,
      }),
      this.automationsMentioning(db, org, fromUserId),
      db.performanceGoal.findMany({
        where: { organizationId: org, scopeType: 'USER', scopeId: fromUserId, deletedAt: null },
        select: { id: true, name: true },
      }),
    ]);

    const s = (id: string, label: string, context: string | null = null): ResponsibilitySample => ({
      id,
      label,
      context,
    });

    const byKey: Record<
      ResponsibilityCategory,
      { count: number; samples: ResponsibilitySample[] }
    > = {
      cardsLead: {
        count: leadCount,
        samples: leadSamples.map((c) => s(c.id, c.title, c.board?.name ?? null)),
      },
      cardsMember: {
        count: memberCount,
        samples: memberSamples.map((m) => s(m.card.id, m.card.title, m.card.board?.name ?? null)),
      },
      checklistItems: {
        count: itemCount,
        samples: itemSamples.map((i) => s(i.id, i.text, i.checklist.card.title)),
      },
      tasks: { count: taskCount, samples: taskSamples.map((t) => s(t.id, t.text)) },
      approvalsToReview: {
        count: reviewCount,
        samples: reviewSamples.map((r) => s(r.id, r.approval.card.title)),
      },
      approvalsRequested: {
        count: requestedCount,
        samples: requestedSamples.map((a) => s(a.id, a.card.title)),
      },
      boards: {
        count: boardCount,
        samples: boardSamples.map((b) => s(b.id, b.board.name)),
      },
      automations: {
        count: automations.length,
        samples: automations
          .slice(0, SAMPLE_SIZE)
          .map((a) =>
            s(
              a.id,
              ACTION_LABELS[a.actionType] ?? a.actionType,
              [a.board?.name ?? a.list?.board?.name, a.list?.name, a.isActive ? null : 'inativa']
                .filter(Boolean)
                .join(' · ') || null,
            ),
          ),
      },
    };

    return {
      user: { id: user.id, name: user.name },
      categories: RESPONSIBILITY_CATEGORIES.map((key) => ({ key, ...byKey[key] })),
      personalGoals: goals,
    };
  }

  // -------------------------------------------------------------------------
  // Execucao
  // -------------------------------------------------------------------------

  async transfer(
    actorUserId: string,
    tenant: TenantContext,
    fromUserId: string,
    input: TransferResponsibilitiesInput,
  ): Promise<ResponsibilityTransferResultDto> {
    const from = await this.assertCanTransferFrom(tenant, fromUserId);
    const to = await this.assertTarget(tenant, fromUserId, input.toUserId);
    const org = tenant.organizationId;
    const want = new Set(input.categories);

    const counts = Object.fromEntries(RESPONSIBILITY_CATEGORIES.map((k) => [k, 0])) as Record<
      ResponsibilityCategory,
      number
    >;
    /** cardId -> o que mudou nele (pra atividade na timeline). */
    const touched = new Map<
      string,
      { lead: boolean; member: boolean; tasks: number; approvals: number }
    >();
    const touch = (cardId: string) => {
      let t = touched.get(cardId);
      if (!t) {
        t = { lead: false, member: false, tasks: 0, approvals: 0 };
        touched.set(cardId, t);
      }
      return t;
    };

    await this.prisma.$transaction(
      async (tx) => {
        if (want.has('cardsLead')) {
          const cards = await tx.card.findMany({
            where: this.cardsLeadWhere(org, from.id),
            select: { id: true },
          });
          const ids = cards.map((c) => c.id);
          if (ids.length) {
            await tx.card.updateMany({
              where: { id: { in: ids }, deletedAt: null },
              data: { leadId: to.id },
            });
            // Convencao do sistema: o responsavel tambem e membro do card.
            await tx.cardMember.createMany({
              data: ids.map((cardId) => ({ cardId, userId: to.id })),
              skipDuplicates: true,
            });
            ids.forEach((id) => (touch(id).lead = true));
          }
          counts.cardsLead = ids.length;
        }

        if (want.has('cardsMember')) {
          const rows = await tx.cardMember.findMany({
            where: this.cardsMemberWhere(org, from.id),
            select: { cardId: true, role: true },
          });
          if (rows.length) {
            await tx.cardMember.createMany({
              data: rows.map((r) => ({ cardId: r.cardId, userId: to.id, role: r.role })),
              skipDuplicates: true,
            });
            await tx.cardMember.deleteMany({
              where: { userId: from.id, cardId: { in: rows.map((r) => r.cardId) } },
            });
            rows.forEach((r) => (touch(r.cardId).member = true));
          }
          counts.cardsMember = rows.length;
        }

        if (want.has('checklistItems')) {
          const items = await tx.checklistItem.findMany({
            where: this.checklistItemsWhere(org, from.id),
            select: { id: true, checklist: { select: { cardId: true } } },
          });
          if (items.length) {
            await tx.checklistItem.updateMany({
              where: { id: { in: items.map((i) => i.id) }, assigneeId: from.id, isDone: false },
              data: { assigneeId: to.id },
            });
            items.forEach((i) => touch(i.checklist.cardId).tasks++);
          }
          counts.checklistItems = items.length;
        }

        if (want.has('tasks')) {
          const r = await tx.task.updateMany({
            where: this.tasksWhere(org, from.id),
            data: { assigneeId: to.id },
          });
          counts.tasks = r.count;
        }

        if (want.has('approvalsToReview')) {
          const rows = await tx.cardApprovalReviewer.findMany({
            where: this.reviewersWhere(org, from.id),
            select: { id: true, approvalId: true, approval: { select: { cardId: true } } },
          });
          for (const r of rows) {
            const already = await tx.cardApprovalReviewer.findFirst({
              where: { approvalId: r.approvalId, userId: to.id },
              select: { id: true },
            });
            if (already) {
              await tx.cardApprovalReviewer.delete({ where: { id: r.id } });
            } else {
              // Token novo: o link antigo (abre sem login) deixa de valer.
              await tx.cardApprovalReviewer.update({
                where: { id: r.id },
                data: {
                  userId: to.id,
                  accessToken: randomBytes(24).toString('base64url'),
                  notifiedAt: null,
                },
              });
            }
            touch(r.approval.cardId).approvals++;
          }
          counts.approvalsToReview = rows.length;
        }

        if (want.has('approvalsRequested')) {
          const rows = await tx.cardApproval.findMany({
            where: this.requestedWhere(org, from.id),
            select: { id: true, cardId: true },
          });
          if (rows.length) {
            await tx.cardApproval.updateMany({
              where: { id: { in: rows.map((r) => r.id) }, status: 'PENDING' },
              data: { requestedById: to.id },
            });
            rows.forEach((r) => touch(r.cardId).approvals++);
          }
          counts.approvalsRequested = rows.length;
        }

        if (want.has('boards')) {
          const rows = await tx.boardMember.findMany({
            where: this.boardsWhere(org, from.id),
            select: { boardId: true, role: true },
          });
          for (const r of rows) {
            const existing = await tx.boardMember.findUnique({
              where: { boardId_userId: { boardId: r.boardId, userId: to.id } },
              select: { role: true },
            });
            if (!existing) {
              await tx.boardMember.create({
                data: { boardId: r.boardId, userId: to.id, role: r.role },
              });
            } else {
              const role = higherBoardRole(existing.role as BoardRoleKey, r.role as BoardRoleKey);
              if (role !== existing.role) {
                await tx.boardMember.update({
                  where: { boardId_userId: { boardId: r.boardId, userId: to.id } },
                  data: { role },
                });
              }
            }
          }
          counts.boards = rows.length;
        }

        if (want.has('automations')) {
          const list = await this.automationsMentioning(tx, org, from.id);
          for (const a of list) {
            await tx.automation.update({
              where: { id: a.id },
              data: {
                actionConfig: replaceUserInConfig(
                  a.actionConfig,
                  from.id,
                  to.id,
                ) as Prisma.InputJsonValue,
              },
            });
          }
          counts.automations = list.length;
        }

        // Timeline de cada card afetado (origin SYSTEM: nao conta no Desempenho).
        if (touched.size) {
          const cards = await tx.card.findMany({
            where: { id: { in: [...touched.keys()] }, deletedAt: null },
            select: { id: true, boardId: true },
          });
          await tx.activity.createMany({
            data: cards.map((c) => ({
              organizationId: org,
              boardId: c.boardId,
              cardId: c.id,
              actorId: actorUserId,
              type: 'CARD_UPDATED' as const,
              origin: 'SYSTEM' as const,
              payload: {
                kind: 'responsibility_transfer',
                via: 'responsibility-transfer',
                fromUserId: from.id,
                fromName: from.name,
                toUserId: to.id,
                toName: to.name,
                ...touched.get(c.id)!,
              } as Prisma.InputJsonValue,
            })),
          });
        }

        await tx.activity.create({
          data: {
            organizationId: org,
            actorId: actorUserId,
            type: 'MEMBER_RESPONSIBILITIES_TRANSFERRED',
            payload: {
              targetUserId: from.id,
              fromUserId: from.id,
              fromName: from.name,
              toUserId: to.id,
              toName: to.name,
              counts,
            } as unknown as Prisma.InputJsonValue,
          },
        });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    // Uma notificacao de resumo (in-app; sem eventKey = sem WhatsApp).
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total > 0 && to.id !== actorUserId) {
      const actor = await this.prisma.user.findUnique({
        where: { id: actorUserId },
        select: { name: true },
      });
      const parts = RESPONSIBILITY_CATEGORIES.filter((k) => counts[k] > 0).map(
        (k) => `${RESPONSIBILITY_CATEGORY_LABELS[k]}: ${counts[k]}`,
      );
      await this.notifications
        .create({
          userId: to.id,
          organizationId: org,
          type: 'ASSIGNED',
          title: `${actor?.name ?? 'Alguém'} transferiu para você as responsabilidades de ${from.name}`,
          body: parts.join(' · '),
          url: '/',
        })
        .catch((err) =>
          this.logger.warn(
            `Falha ao notificar transferencia: ${err instanceof Error ? err.message : err}`,
          ),
        );
    }

    return { from: { id: from.id, name: from.name }, to, counts };
  }
}
