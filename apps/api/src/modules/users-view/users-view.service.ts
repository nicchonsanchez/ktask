import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { MeService } from '@/modules/me/me.service';

const PRIVILEGED_ROLES: ReadonlyArray<TenantContext['role']> = ['OWNER', 'ADMIN', 'GESTOR'];

/**
 * Permite que GESTOR+ visualize os dados pessoais (tarefas, cards recentes,
 * calendário, resumo, atividade recente) de outro membro da mesma org.
 *
 * Reaproveita 100% da lógica do MeService — só valida permissão antes
 * de delegar. Owners/admins/gestores já têm bypass nos boards (ver
 * `board-permissions.ts`), então não precisamos filtrar por
 * BoardAccess: o gestor enxerga tudo da org por design.
 */
@Injectable()
export class UsersViewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly me: MeService,
  ) {}

  private async assertCanView(viewerRole: TenantContext['role']) {
    if (!PRIVILEGED_ROLES.includes(viewerRole)) {
      throw new ForbiddenException('Apenas GESTOR+ pode visualizar dados de outros membros.');
    }
  }

  /**
   * Verifica se o targetUser pertence à mesma org. 404 (não 403) quando
   * não pertence — não confirma a existência do user em outra org.
   */
  private async assertSameOrg(targetUserId: string, organizationId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId: targetUserId, organizationId },
      select: { id: true },
    });
    if (!membership) {
      throw new NotFoundException('Membro não encontrado nesta organização.');
    }
  }

  private async authorize(targetUserId: string, viewer: TenantContext) {
    await this.assertCanView(viewer.role);
    await this.assertSameOrg(targetUserId, viewer.organizationId);
  }

  async getTasks(targetUserId: string, viewer: TenantContext) {
    await this.authorize(targetUserId, viewer);
    return this.me.getTasks(targetUserId, viewer);
  }

  async getRecentCards(targetUserId: string, viewer: TenantContext) {
    await this.authorize(targetUserId, viewer);
    return this.me.getRecentCards(targetUserId, viewer);
  }

  async getCalendar(targetUserId: string, viewer: TenantContext, month?: string) {
    await this.authorize(targetUserId, viewer);
    return this.me.getCalendar(targetUserId, viewer, month);
  }

  async getSummary(targetUserId: string, viewer: TenantContext) {
    await this.authorize(targetUserId, viewer);
    return this.me.getSummary(targetUserId, viewer);
  }

  async getRecentActivity(targetUserId: string, viewer: TenantContext, limit = 10) {
    await this.authorize(targetUserId, viewer);
    return this.me.getRecentActivity(targetUserId, viewer, limit);
  }

  /**
   * Resumo agregado de todos os membros da org. Uma única roundtrip que
   * agrupa counts por userId pra evitar N+1 ao listar 20+ membros em
   * /empresa.
   *
   * Retorna apenas userId e counts — frontend casa com a lista de membros
   * já carregada via /organizations/members.
   */
  async getMembersSummary(viewer: TenantContext) {
    await this.assertCanView(viewer.role);
    const { startOfDayUtc, endOfDayUtc } = this.brtDayBoundaries();

    // Lista de userIds da org
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId: viewer.organizationId },
      select: { userId: true },
    });
    const userIds = memberships.map((m) => m.userId);
    if (userIds.length === 0) return [];

    // Conta por userId em 1 query por bucket (4 queries totais).
    // groupBy retorna um count por user; quem tem zero não aparece e fica zerado no map final.
    const baseCardScope = {
      checklist: {
        card: {
          organizationId: viewer.organizationId,
          isArchived: false,
          deletedAt: null, // soft-delete nested
          board: { isArchived: false },
        },
      },
    } as const;

    const [clOverdue, clToday, tOverdue, tToday] = await Promise.all([
      this.prisma.checklistItem.groupBy({
        by: ['assigneeId'],
        where: {
          assigneeId: { in: userIds },
          isDone: false,
          dueDate: { lt: startOfDayUtc },
          ...baseCardScope,
        },
        _count: { _all: true },
      }),
      this.prisma.checklistItem.groupBy({
        by: ['assigneeId'],
        where: {
          assigneeId: { in: userIds },
          isDone: false,
          dueDate: { gte: startOfDayUtc, lt: endOfDayUtc },
          ...baseCardScope,
        },
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ['assigneeId'],
        where: {
          assigneeId: { in: userIds },
          isDone: false,
          organizationId: viewer.organizationId,
          dueDate: { lt: startOfDayUtc },
        },
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ['assigneeId'],
        where: {
          assigneeId: { in: userIds },
          isDone: false,
          organizationId: viewer.organizationId,
          dueDate: { gte: startOfDayUtc, lt: endOfDayUtc },
        },
        _count: { _all: true },
      }),
    ]);

    const summary = new Map<string, { overdue: number; today: number; pending: number }>();
    for (const uid of userIds) {
      summary.set(uid, { overdue: 0, today: 0, pending: 0 });
    }

    function bump(
      rows: Array<{ assigneeId: string | null; _count: { _all: number } }>,
      key: 'overdue' | 'today' | 'pending',
    ) {
      for (const r of rows) {
        if (!r.assigneeId) continue;
        const cur = summary.get(r.assigneeId);
        if (!cur) continue;
        cur[key] += r._count._all;
      }
    }

    bump(clOverdue, 'overdue');
    bump(clToday, 'today');
    bump(tOverdue, 'overdue');
    bump(tToday, 'today');

    // pending = qualquer item não-feito do user (count separado p/ não duplicar com overdue/today)
    const [clAll, tAll] = await Promise.all([
      this.prisma.checklistItem.groupBy({
        by: ['assigneeId'],
        where: {
          assigneeId: { in: userIds },
          isDone: false,
          ...baseCardScope,
        },
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ['assigneeId'],
        where: {
          assigneeId: { in: userIds },
          isDone: false,
          organizationId: viewer.organizationId,
        },
        _count: { _all: true },
      }),
    ]);
    bump(clAll, 'pending');
    bump(tAll, 'pending');

    return userIds.map((userId) => ({ userId, ...summary.get(userId)! }));
  }

  private brtDayBoundaries(now: Date = new Date()) {
    const BRT_OFFSET_HOURS = -3;
    const localMs = now.getTime() + BRT_OFFSET_HOURS * 3600 * 1000;
    const localDate = new Date(localMs);
    const y = localDate.getUTCFullYear();
    const m = localDate.getUTCMonth();
    const d = localDate.getUTCDate();
    const startOfDayUtc = new Date(Date.UTC(y, m, d, -BRT_OFFSET_HOURS, 0, 0, 0));
    const endOfDayUtc = new Date(startOfDayUtc.getTime() + 24 * 3600 * 1000);
    return { startOfDayUtc, endOfDayUtc };
  }
}
