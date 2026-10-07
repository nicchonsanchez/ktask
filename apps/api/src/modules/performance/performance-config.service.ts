import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canViewPerformanceReport,
  performanceConfigLevel,
  CONCLUSION_CATEGORIES,
  type PerformanceArea,
  type PerformanceBoardConfigDto,
  type PerformanceBoardSummaryDto,
  type PerformanceColumnCategory,
  type PerformanceColumnConfig,
  type PerformanceConfigVersionDto,
  type TransitionOverride,
  type UpsertBoardPerformanceConfigRequest,
} from '@ktask/contracts';

import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';

// jsonb reordena chaves: compara numa forma canonica (ordem fixa).
function canonicalColumns(v: unknown): string {
  const arr = (Array.isArray(v) ? v : []) as PerformanceColumnConfig[];
  return JSON.stringify(
    arr
      .map((c) => [
        c.listId,
        c.category ?? null,
        c.progressOrder ?? null,
        c.counted,
        c.meetingScheduled === true,
      ])
      .sort((x, y) => String(x[0]).localeCompare(String(y[0]))),
  );
}
function canonicalOverrides(v: unknown): string {
  const arr = (Array.isArray(v) ? v : []) as TransitionOverride[];
  return JSON.stringify(
    arr
      .map((o) => [o.fromListId, o.toListId, o.movementClass])
      .sort((x, y) => `${x[0]}>${x[1]}`.localeCompare(`${y[0]}>${y[1]}`)),
  );
}

/**
 * Doc 52 (D8) — configuracao gerencial dos fluxos, em tela central.
 * So OWNER/ADMIN. Nao altera Board/List/Card: so grava a interpretacao,
 * em versoes imutaveis (salvar = versao nova).
 */
@Injectable()
export class PerformanceConfigService {
  constructor(private readonly prisma: PrismaService) {}

  assertCanManage(tenant: TenantContext) {
    if (!canViewPerformanceReport(tenant.role)) {
      throw new ForbiddenException('Apenas Dono e Administrador acessam o Desempenho da Equipe.');
    }
  }

  private toVersionDto(v: {
    id: string;
    effectiveFrom: Date;
    columns: Prisma.JsonValue;
    transitionOverrides: Prisma.JsonValue;
    note: string | null;
    createdAt: Date;
    createdBy: { id: string; name: string } | null;
  }): PerformanceConfigVersionDto {
    return {
      id: v.id,
      effectiveFrom: v.effectiveFrom.toISOString(),
      columns: (Array.isArray(v.columns) ? v.columns : []) as unknown as PerformanceColumnConfig[],
      transitionOverrides: (Array.isArray(v.transitionOverrides)
        ? v.transitionOverrides
        : []) as unknown as TransitionOverride[],
      note: v.note,
      createdAt: v.createdAt.toISOString(),
      createdBy: v.createdBy,
    };
  }

  /** Lista de fluxos ativos com o status da configuracao. */
  async listBoards(tenant: TenantContext): Promise<PerformanceBoardSummaryDto[]> {
    this.assertCanManage(tenant);
    const now = new Date();
    const boards = await this.prisma.board.findMany({
      where: { organizationId: tenant.organizationId, isArchived: false },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        color: true,
        performanceConfig: {
          select: {
            area: true,
            contactLoggingEnabled: true,
            versions: {
              where: { effectiveFrom: { lte: now } },
              orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
              take: 1,
              select: { id: true, effectiveFrom: true, columns: true },
            },
          },
        },
      },
    });

    const conclusionIds = new Set<string>();
    const parsed = boards.map((b) => {
      const v = b.performanceConfig?.versions[0] ?? null;
      const columns = (Array.isArray(v?.columns)
        ? v!.columns
        : []) as unknown as PerformanceColumnConfig[];
      for (const c of columns) {
        if (c.category && CONCLUSION_CATEGORIES.includes(c.category)) conclusionIds.add(c.listId);
      }
      return { b, v, columns };
    });
    const lists = conclusionIds.size
      ? await this.prisma.list.findMany({
          where: { id: { in: [...conclusionIds] } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(lists.map((l) => [l.id, l.name]));

    return parsed.map(({ b, v, columns }) => ({
      board: { id: b.id, name: b.name, color: b.color },
      area: (b.performanceConfig?.area as PerformanceArea | null) ?? null,
      contactLoggingEnabled: b.performanceConfig?.contactLoggingEnabled ?? false,
      level: performanceConfigLevel(columns),
      conclusionLists: columns
        .filter((c) => c.category && CONCLUSION_CATEGORIES.includes(c.category))
        .map((c) => ({
          id: c.listId,
          name: nameById.get(c.listId) ?? '(coluna removida)',
          category: c.category as PerformanceColumnCategory,
        })),
      currentVersion: v ? { id: v.id, effectiveFrom: v.effectiveFrom.toISOString() } : null,
    }));
  }

  private async getBoardOrThrow(tenant: TenantContext, boardId: string) {
    const board = await this.prisma.board.findFirst({
      where: { id: boardId, organizationId: tenant.organizationId },
      select: { id: true, name: true, color: true },
    });
    if (!board) throw new NotFoundException('Fluxo não encontrado.');
    return board;
  }

  /**
   * Ids de colunas que aparecem em movimentacoes do fluxo (inclui colunas
   * hoje arquivadas/excluidas — ex.: "Novo Lead" no Relacoes Institucionais).
   */
  private async historyLists(boardId: string) {
    return this.prisma.$queryRaw<
      Array<{ listId: string; name: string | null; moves: bigint; firstAt: Date }>
    >`
      SELECT x."listId", MAX(x.name) AS name, COUNT(*)::bigint AS moves, MIN(x."createdAt") AS "firstAt"
      FROM (
        SELECT payload->>'fromListId' AS "listId", payload->>'fromListName' AS name, "createdAt"
        FROM "Activity" WHERE "boardId" = ${boardId} AND type = 'CARD_MOVED'
        UNION ALL
        SELECT payload->>'toListId', payload->>'toListName', "createdAt"
        FROM "Activity" WHERE "boardId" = ${boardId} AND type = 'CARD_MOVED'
      ) x
      WHERE x."listId" IS NOT NULL
      GROUP BY x."listId"
    `;
  }

  async getBoardConfig(tenant: TenantContext, boardId: string): Promise<PerformanceBoardConfigDto> {
    this.assertCanManage(tenant);
    const board = await this.getBoardOrThrow(tenant, boardId);

    const [lists, history, config] = await Promise.all([
      this.prisma.list.findMany({
        where: { boardId },
        orderBy: { position: 'asc' },
        select: {
          id: true,
          name: true,
          position: true,
          isFinalList: true,
          isBacklog: true,
          isArchived: true,
          deletedAt: true,
        },
      }),
      this.historyLists(boardId),
      this.prisma.boardPerformanceConfig.findUnique({
        where: { boardId },
        select: {
          area: true,
          contactLoggingEnabled: true,
          versions: {
            orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
            select: {
              id: true,
              effectiveFrom: true,
              columns: true,
              transitionOverrides: true,
              note: true,
              createdAt: true,
              createdBy: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    const movesById = new Map(history.map((h) => [h.listId, Number(h.moves)]));
    const known = new Set(lists.map((l) => l.id));

    const out: PerformanceBoardConfigDto['lists'] = [];
    // Atuais primeiro (ordem do board); arquivadas/lixeira so se tem historico.
    for (const l of lists) {
      const status = l.deletedAt ? 'TRASHED' : l.isArchived ? 'ARCHIVED' : 'ACTIVE';
      const moves = movesById.get(l.id) ?? 0;
      if (status !== 'ACTIVE' && moves === 0) continue;
      out.push({
        id: l.id,
        name: l.name,
        position: l.position,
        isFinalList: l.isFinalList,
        isBacklog: l.isBacklog,
        status,
        movesInHistory: moves,
      });
    }
    // Colunas que so existem no historico (lista removida definitivamente).
    for (const h of history) {
      if (known.has(h.listId)) continue;
      out.push({
        id: h.listId,
        name: h.name ?? '(coluna removida)',
        position: null,
        isFinalList: false,
        isBacklog: false,
        status: 'HISTORY_ONLY',
        movesInHistory: Number(h.moves),
      });
    }

    const now = Date.now();
    const versions = (config?.versions ?? []).map((v) => this.toVersionDto(v));
    const current = versions.find((v) => new Date(v.effectiveFrom).getTime() <= now) ?? null;
    const firstAt = history.reduce<Date | null>(
      (min, h) => (!min || h.firstAt < min ? h.firstAt : min),
      null,
    );

    return {
      board,
      area: (config?.area as PerformanceArea | null) ?? null,
      contactLoggingEnabled: config?.contactLoggingEnabled ?? false,
      lists: out,
      currentVersion: current,
      versions,
      historyStartsAt: firstAt ? firstAt.toISOString() : null,
    };
  }

  /** Salva = nova versao imutavel (+ atualiza area/registro de contato). */
  async upsertBoardConfig(
    userId: string,
    tenant: TenantContext,
    boardId: string,
    body: UpsertBoardPerformanceConfigRequest,
  ): Promise<PerformanceBoardConfigDto> {
    this.assertCanManage(tenant);
    await this.getBoardOrThrow(tenant, boardId);

    // Colunas aceitas: qualquer lista do fluxo (inclusive arquivada/lixeira)
    // ou que aparece no historico de movimentacoes dele.
    const [lists, history] = await Promise.all([
      this.prisma.list.findMany({ where: { boardId }, select: { id: true } }),
      this.historyLists(boardId),
    ]);
    const valid = new Set([...lists.map((l) => l.id), ...history.map((h) => h.listId)]);
    const referenced = [
      ...body.columns.map((c) => c.listId),
      ...body.transitionOverrides.flatMap((o) => [o.fromListId, o.toListId]),
    ];
    const invalid = referenced.filter((id) => !valid.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException('Configuração cita colunas que não pertencem a este fluxo.');
    }

    const now = new Date();
    let effectiveFrom = now;
    if (body.effectiveFrom) {
      effectiveFrom = new Date(body.effectiveFrom);
      if (effectiveFrom.getTime() > now.getTime() + 60_000) {
        throw new BadRequestException('A vigência não pode começar no futuro.');
      }
    }

    // Normaliza: so guarda colunas com algo configurado (categoria, ordem
    // ou counted=false). Evita versao "inflada" sem informacao.
    const columns = body.columns.filter(
      (c) =>
        c.category !== null ||
        c.progressOrder !== null ||
        c.counted === false ||
        c.meetingScheduled === true,
    );

    await this.prisma.$transaction(async (tx) => {
      const config = await tx.boardPerformanceConfig.upsert({
        where: { boardId },
        create: {
          organizationId: tenant.organizationId,
          boardId,
          area: body.area ?? null,
          contactLoggingEnabled: body.contactLoggingEnabled ?? false,
        },
        update: {
          ...(body.area !== undefined ? { area: body.area } : {}),
          ...(body.contactLoggingEnabled !== undefined
            ? { contactLoggingEnabled: body.contactLoggingEnabled }
            : {}),
        },
        select: { id: true },
      });

      // Mudou so area/registro de contato (classificacao identica a versao
      // vigente e sem retroatividade): nao cria versao nova.
      if (!body.effectiveFrom) {
        const latest = await tx.boardPerformanceConfigVersion.findFirst({
          where: { configId: config.id, effectiveFrom: { lte: now } },
          orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
          select: { columns: true, transitionOverrides: true },
        });
        if (
          latest &&
          canonicalColumns(latest.columns) === canonicalColumns(columns) &&
          canonicalOverrides(latest.transitionOverrides) ===
            canonicalOverrides(body.transitionOverrides)
        ) {
          return;
        }
      }

      await tx.boardPerformanceConfigVersion.create({
        data: {
          configId: config.id,
          organizationId: tenant.organizationId,
          boardId,
          effectiveFrom,
          columns: columns as unknown as Prisma.InputJsonValue,
          transitionOverrides: body.transitionOverrides as unknown as Prisma.InputJsonValue,
          note: body.note?.trim() || null,
          createdById: userId,
        },
      });
    });

    return this.getBoardConfig(tenant, boardId);
  }
}
