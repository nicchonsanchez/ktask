import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';

/**
 * Janela default de retencao na lixeira. Cards/listas com `deletedAt` mais
 * antigo que isso sao excluidos fisicamente pelo cron de auto-purge.
 */
export const TRASH_RETENTION_DAYS = 90;

interface ListTrashParams {
  cursor?: string;
  limit?: number;
  search?: string;
  boardId?: string;
}

@Injectable()
export class TrashService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lista cards na lixeira da org. Usa `prisma.raw` pra bypassar o filtro
   * automatico `deletedAt: null` da extension.
   */
  async listCards(tenant: TenantContext, params: ListTrashParams) {
    const raw = this.prisma.raw;
    const limit = Math.max(1, Math.min(params.limit ?? 50, 100));
    const cards = await raw.card.findMany({
      where: {
        organizationId: tenant.organizationId,
        deletedAt: { not: null },
        ...(params.boardId ? { boardId: params.boardId } : {}),
        ...(params.search
          ? { title: { contains: params.search, mode: 'insensitive' as const } }
          : {}),
      },
      orderBy: { deletedAt: 'desc' },
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      include: {
        list: { select: { id: true, name: true, deletedAt: true } },
        board: { select: { id: true, name: true } },
        deletedBy: { select: { id: true, name: true, email: true } },
      },
    });

    const hasMore = cards.length > limit;
    const items = hasMore ? cards.slice(0, limit) : cards;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

    return {
      items: items.map((c) => ({
        ...c,
        purgeAt: this.purgeDate(c.deletedAt),
      })),
      nextCursor,
    };
  }

  async listLists(tenant: TenantContext, params: ListTrashParams) {
    const raw = this.prisma.raw;
    const limit = Math.max(1, Math.min(params.limit ?? 50, 100));
    const lists = await raw.list.findMany({
      where: {
        organizationId: tenant.organizationId,
        deletedAt: { not: null },
        ...(params.boardId ? { boardId: params.boardId } : {}),
        ...(params.search
          ? { name: { contains: params.search, mode: 'insensitive' as const } }
          : {}),
      },
      orderBy: { deletedAt: 'desc' },
      take: limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      include: {
        board: { select: { id: true, name: true } },
        deletedBy: { select: { id: true, name: true, email: true } },
        // UI mostra esse count como "Cards vivos" e usa pra decidir se libera
        // o botao de exclusao permanente (lista com card vivo bloqueia). O
        // filtro `deletedAt: null` casa com a regra do backend
        // (lists.service.deletePermanent). Sem o filtro o count incluia
        // cards trashed e a UI mentia.
        _count: { select: { cards: { where: { deletedAt: null } } } },
      },
    });

    const hasMore = lists.length > limit;
    const items = hasMore ? lists.slice(0, limit) : lists;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

    return {
      items: items.map((l) => ({
        ...l,
        purgeAt: this.purgeDate(l.deletedAt),
      })),
      nextCursor,
    };
  }

  /**
   * Contadores globais pra badge da sidebar e header da pagina de lixeira.
   */
  async counts(tenant: TenantContext) {
    const raw = this.prisma.raw;
    const [cards, lists] = await Promise.all([
      raw.card.count({
        where: { organizationId: tenant.organizationId, deletedAt: { not: null } },
      }),
      raw.list.count({
        where: { organizationId: tenant.organizationId, deletedAt: { not: null } },
      }),
    ]);
    return { cards, lists, total: cards + lists };
  }

  private purgeDate(deletedAt: Date | null): string | null {
    if (!deletedAt) return null;
    const d = new Date(deletedAt.getTime());
    d.setDate(d.getDate() + TRASH_RETENTION_DAYS);
    return d.toISOString();
  }
}
