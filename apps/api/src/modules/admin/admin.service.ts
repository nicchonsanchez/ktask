import { ForbiddenException, Injectable } from '@nestjs/common';

import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';

/**
 * Stats agregados da Org pra dashboards de operacao / debug.
 * Acesso restrito a OWNER/ADMIN — endpoints leem dados de todos os usuarios
 * da Org (resumido em contagens, sem expor titulo/nota/conteudo).
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Estatisticas de Time Tracking da Org logada.
   * Foco em counts agregados pra responder "ja temos registros?" / "quem mais usa?".
   */
  async timeTrackingStats(tenant: TenantContext) {
    this.assertAdmin(tenant);
    const orgId = tenant.organizationId;

    const [total, active, bySource, topUsers, lastEntries] = await Promise.all([
      this.prisma.timeEntry.count({ where: { organizationId: orgId } }),
      this.prisma.timeEntry.count({
        where: { organizationId: orgId, endedAt: null },
      }),
      this.prisma.timeEntry.groupBy({
        by: ['source'],
        where: { organizationId: orgId },
        _count: { _all: true },
        _sum: { durationSec: true },
      }),
      this.prisma.timeEntry.groupBy({
        by: ['userId'],
        where: { organizationId: orgId, endedAt: { not: null } },
        _count: { _all: true },
        _sum: { durationSec: true },
        orderBy: { _sum: { durationSec: 'desc' } },
        take: 5,
      }),
      this.prisma.timeEntry.findMany({
        where: { organizationId: orgId },
        orderBy: { startedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          userId: true,
          cardId: true,
          source: true,
          startedAt: true,
          endedAt: true,
          durationSec: true,
          user: { select: { id: true, name: true } },
          card: { select: { id: true, title: true, board: { select: { name: true } } } },
        },
      }),
    ]);

    // resolve nomes dos top users
    const userIds = topUsers.map((u) => u.userId);
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true, avatarUrl: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      total,
      active, // entries em andamento (endedAt null)
      bySource: bySource.map((s) => ({
        source: s.source,
        count: s._count._all,
        totalSec: s._sum.durationSec ?? 0,
      })),
      topUsers: topUsers.map((u) => ({
        user: userMap.get(u.userId) ?? { id: u.userId, name: 'Desconhecido' },
        count: u._count._all,
        totalSec: u._sum.durationSec ?? 0,
      })),
      lastEntries,
    };
  }

  private assertAdmin(tenant: TenantContext) {
    if (tenant.role !== 'OWNER' && tenant.role !== 'ADMIN') {
      throw new ForbiddenException('Apenas OWNER ou ADMIN da organização pode ver stats.');
    }
  }
}
