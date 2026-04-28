import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import type { Prisma, ContactType } from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';

import type {
  ImportUmmenseRequest,
  ImportPreviewRequest,
  ImportExecuteRequest,
} from './dto/importer.schemas';

/**
 * Importer de fluxo Ummense. Apesar da extensao .csv do export, o
 * arquivo e na verdade um JSON array de arrays:
 *   [[<header...>], [<row1...>], [<row2...>], ...]
 * Header tem 24 colunas. Mapeamento completo em
 * `tarefas-md/16-importer-ummense.md`.
 *
 * Idempotencia: shortCode unico por Org. Re-import pula cards ja
 * existentes (com warning).
 */

const HEADER_INDEX = {
  nome: 0,
  identificador: 1,
  fluxos: 2,
  colunaAtual: 3,
  dataInicio: 4,
  descricao: 5,
  status: 6,
  privacidade: 7,
  lider: 8,
  equipe: 9,
  contatos: 10,
  emailsContatos: 11,
  tags: 12,
  arquivos: 13,
  cardPai: 14,
  cardsFilhos: 15,
  feed: 16,
  anotacoes: 17,
  registros: 18,
  respostaFormulario: 19,
  dataEntrega: 20,
  ultimaInteracao: 21,
  criadoEm: 22,
  finalizadoEm: 23,
} as const;

export interface ImportReport {
  totalRows: number;
  created: number;
  skipped: number;
  errors: Array<{ row: number; cardName: string; reason: string }>;
  createdContacts: number;
  createdLabels: number;
  createdLists: number;
  warnings: string[];
  /** Modo dry-run: nada foi commitado. */
  dryRun: boolean;
}

/**
 * Sugestao de match pra um nome do CSV. `score` 0-1, com 1 = match
 * exato. Acima de 0.7 = pre-selecionar; abaixo = "Ignorar" default.
 */
export interface MatchSuggestion {
  /** Nome como veio do CSV. */
  sourceName: string;
  /** Candidato sugerido (User ou List existente do KTask) ou null. */
  candidate: { id: string; name: string } | null;
  score: number;
  /** Mapping previamente salvo na Org (forca esse target sem fuzzy). */
  savedTargetId?: string | null;
  /** Coluna salva anteriormente como "Marcar como Finalizado". So vale
   * pra kind='list'. Quando true, frontend pre-seleciona type='complete'. */
  savedAsComplete?: boolean;
}

export interface ImportPreviewResult {
  /** Nome do board que sera usado/criado (se boardId nao informado). */
  detectedBoardName: string;
  /** Membros unicos mencionados no CSV (lider + equipe). */
  members: MatchSuggestion[];
  /** Colunas unicas mencionadas no CSV. */
  lists: MatchSuggestion[];
  /** Total de cards no CSV. */
  totalRows: number;
  /** Avisos: ex. "30% dos nomes sem match — confirma o board destino?" */
  warnings: string[];
}

@Injectable()
export class ImporterService {
  private readonly logger = new Logger(ImporterService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================================================
  // V2 Wizard: preview + execute
  // ==================================================

  /**
   * Extrai entidades unicas (membros + colunas) do CSV, faz fuzzy match
   * com KTask, carrega mapeamentos previamente salvos da Org.
   * NAO persiste nada — so devolve sugestao pra UI montar o passo 2.
   */
  async preview(tenant: TenantContext, body: ImportPreviewRequest): Promise<ImportPreviewResult> {
    if (tenant.role !== 'OWNER' && tenant.role !== 'ADMIN') {
      throw new ForbiddenException('Apenas OWNER/ADMIN pode importar fluxos.');
    }

    const rows = this.parseAndValidateCsv(body.csv);
    const detectedBoardName = rows[0]?.[HEADER_INDEX.fluxos]?.trim() || 'Importado do Ummense';

    // Coleta nomes unicos
    const memberNamesSet = new Set<string>();
    const listNamesSet = new Set<string>();
    for (const row of rows) {
      const lider = row[HEADER_INDEX.lider]?.trim();
      if (lider) memberNamesSet.add(lider);
      const equipe = (row[HEADER_INDEX.equipe] ?? '')
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const name of equipe) memberNamesSet.add(name);

      const list = row[HEADER_INDEX.colunaAtual]?.trim();
      if (list) listNamesSet.add(list);
    }

    // Carrega candidatos do KTask
    const orgUsers = await this.prisma.user.findMany({
      where: { memberships: { some: { organizationId: tenant.organizationId } } },
      select: { id: true, name: true },
    });
    const orgLists = body.boardId
      ? await this.prisma.list.findMany({
          where: { boardId: body.boardId, isArchived: false },
          select: { id: true, name: true },
        })
      : [];

    // Carrega mapeamentos salvos
    const savedMappings = await this.prisma.orgImportMapping.findMany({
      where: { organizationId: tenant.organizationId },
      select: { kind: true, sourceName: true, targetId: true },
    });
    const savedByKey = new Map<string, string | null>();
    for (const m of savedMappings) savedByKey.set(`${m.kind}:${m.sourceName}`, m.targetId);

    function buildSuggestion(
      sourceName: string,
      kind: 'user' | 'list',
      candidates: Array<{ id: string; name: string }>,
    ): MatchSuggestion {
      const savedKey = `${kind}:${sourceName}`;
      const hasSaved = savedByKey.has(savedKey);
      const savedTargetId = hasSaved ? (savedByKey.get(savedKey) ?? null) : undefined;

      // Se ha mapping salvo, force ele (mesmo se null = ignorar)
      if (hasSaved) {
        // Sentinel especial '__COMPLETE__' = coluna marcada como
        // "Finalizado" — frontend pre-seleciona type='complete'.
        if (savedTargetId === '__COMPLETE__') {
          return { sourceName, candidate: null, score: 1.0, savedAsComplete: true };
        }
        const candidate = savedTargetId
          ? (candidates.find((c) => c.id === savedTargetId) ?? null)
          : null;
        return { sourceName, candidate, score: 1.0, savedTargetId };
      }

      // Senao, fuzzy match
      let best: { id: string; name: string } | null = null;
      let bestScore = 0;
      for (const c of candidates) {
        const score = ImporterService.fuzzyScore(sourceName, c.name);
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      return {
        sourceName,
        candidate: bestScore >= 0.7 ? best : null,
        score: bestScore,
      };
    }

    const members = Array.from(memberNamesSet)
      .sort()
      .map((name) => buildSuggestion(name, 'user', orgUsers));
    const lists = Array.from(listNamesSet)
      .sort()
      .map((name) => buildSuggestion(name, 'list', orgLists));

    const warnings: string[] = [];
    const memberIgnoreRate =
      members.filter((m) => !m.candidate).length / Math.max(1, members.length);
    if (memberIgnoreRate > 0.3 && members.length > 3) {
      warnings.push(
        `${Math.round(memberIgnoreRate * 100)}% dos nomes não bateram com membros do KTask. Confirma o board/Org destino?`,
      );
    }
    if (body.boardId && lists.length > 0) {
      const listIgnoreRate = lists.filter((l) => !l.candidate).length / lists.length;
      if (listIgnoreRate > 0.5) {
        warnings.push(
          `${Math.round(listIgnoreRate * 100)}% das colunas não existem no board destino. Marque "Criar nova" pra cada uma ou escolha outro board.`,
        );
      }
    }

    return {
      detectedBoardName,
      members,
      lists,
      totalRows: rows.length,
      warnings,
    };
  }

  /**
   * Executa import com mapeamento explicito. Nomes do CSV viram IDs
   * concretos via `body.members` e `body.lists`. Nomes nao mapeados
   * (undefined) sao "ignorar" implicito (cards sem esse member; listas
   * sao criadas com nome do CSV).
   *
   * Persiste mapeamentos novos em OrgImportMapping pra acelerar
   * proximo import.
   */
  async executeWithMapping(
    userId: string,
    tenant: TenantContext,
    body: ImportExecuteRequest,
  ): Promise<ImportReport> {
    if (tenant.role !== 'OWNER' && tenant.role !== 'ADMIN') {
      throw new ForbiddenException('Apenas OWNER/ADMIN pode importar fluxos.');
    }

    const rows = this.parseAndValidateCsv(body.csv);

    // Resolve board
    let board: { id: string; name: string };
    if (body.boardId) {
      const found = await this.prisma.board.findUnique({
        where: { id: body.boardId },
        select: { id: true, name: true, organizationId: true },
      });
      if (!found || found.organizationId !== tenant.organizationId) {
        throw new BadRequestException('Board destino não encontrado nesta Org.');
      }
      board = { id: found.id, name: found.name };
    } else {
      const name =
        body.createBoardName?.trim() ||
        rows[0]?.[HEADER_INDEX.fluxos]?.trim() ||
        'Importado do Ummense';
      board = await this.upsertBoard(tenant.organizationId, userId, name);
    }

    const report: ImportReport = {
      totalRows: rows.length,
      created: 0,
      skipped: 0,
      errors: [],
      createdContacts: 0,
      createdLabels: 0,
      createdLists: 0,
      warnings: [],
      dryRun: false,
    };

    // Pre-resolve mapping de listas: cria nova quando type=create
    const listsByName = new Map<string, string>();
    const ignoredListNames = new Set<string>();
    /// Colunas marcadas como "Finalizado" — cards delas serao criados
    /// com completedAt setado. listId pra eles vem da ultima lista do
    /// board (resolvida abaixo).
    const completeListNames = new Set<string>();
    for (const [sourceName, target] of Object.entries(body.lists)) {
      if (target.type === 'existing') {
        listsByName.set(sourceName, target.listId);
      } else if (target.type === 'create') {
        const last = await this.prisma.list.findFirst({
          where: { boardId: board.id },
          orderBy: { position: 'desc' },
          select: { position: true },
        });
        const created = await this.prisma.list.create({
          data: {
            organizationId: tenant.organizationId,
            boardId: board.id,
            name: target.name,
            position: (last?.position ?? 0) + 1024,
          },
          select: { id: true },
        });
        listsByName.set(sourceName, created.id);
        report.createdLists++;
      } else if (target.type === 'complete') {
        completeListNames.add(sourceName);
      } else if (target.type === 'ignore') {
        ignoredListNames.add(sourceName);
      }
    }

    // Pra colunas type='complete', resolve a "ultima lista" do board
    // (depois das listas de 'create' acima ja terem sido inseridas).
    // Cards vao fisicamente pra essa lista mas com completedAt setado,
    // entao aparecem so no drawer "Finalizados".
    let completeFallbackListId: string | null = null;
    if (completeListNames.size > 0) {
      const lastList = await this.prisma.list.findFirst({
        where: { boardId: board.id, isArchived: false },
        orderBy: { position: 'desc' },
        select: { id: true, position: true },
      });
      if (lastList) {
        completeFallbackListId = lastList.id;
      } else {
        // Board sem lista: cria uma minima pra hospedar os cards completados
        const created = await this.prisma.list.create({
          data: {
            organizationId: tenant.organizationId,
            boardId: board.id,
            name: 'Concluído',
            position: 1024,
          },
          select: { id: true },
        });
        completeFallbackListId = created.id;
        report.createdLists++;
      }
      // Mapeia cada nome 'complete' pra essa lista
      for (const name of completeListNames) {
        listsByName.set(name, completeFallbackListId);
      }
    }

    // Members map: sourceName -> userId | null (ignore)
    const userByName = new Map<string, string | null>(Object.entries(body.members));

    // Cache de labels e contatos (auto-create no MVP)
    const labelsByName = new Map<string, string>();
    const contactsByName = new Map<string, string>();
    const cardIdByShortCode = new Map<string, string>();

    // 1a passada: cria cards
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const cardName = row[HEADER_INDEX.nome] || '(sem nome)';
      const listSourceName = row[HEADER_INDEX.colunaAtual]?.trim() || '';
      if (ignoredListNames.has(listSourceName)) {
        report.skipped++;
        continue;
      }
      try {
        const created = await this.importCardWithMapping({
          row,
          tenant,
          userId,
          boardId: board.id,
          listsByName,
          labelsByName,
          contactsByName,
          userByName,
          report,
          forceCompleted: completeListNames.has(listSourceName),
        });
        if (created) {
          cardIdByShortCode.set(created.shortCode, created.id);
          report.created++;
        } else {
          report.skipped++;
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        report.errors.push({ row: i + 2, cardName, reason });
        this.logger.warn(`Import row ${i + 2} ("${cardName}"): ${reason}`);
      }
    }

    // 2a passada: vincula pais
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const myShortCode = row[HEADER_INDEX.identificador];
      const parentShortCode = row[HEADER_INDEX.cardPai]?.trim();
      if (!myShortCode || !parentShortCode) continue;
      const myId = cardIdByShortCode.get(myShortCode);
      if (!myId) continue;
      let parentId = cardIdByShortCode.get(parentShortCode);
      if (!parentId) {
        const existing = await this.prisma.card.findUnique({
          where: {
            organizationId_shortCode: {
              organizationId: tenant.organizationId,
              shortCode: parentShortCode,
            },
          },
          select: { id: true },
        });
        parentId = existing?.id;
      }
      if (parentId) {
        await this.prisma.card.update({
          where: { id: myId },
          data: { parentCardId: parentId },
        });
      } else {
        report.warnings.push(
          `Card "${row[HEADER_INDEX.nome]}" referencia pai shortCode=${parentShortCode} que nao foi encontrado.`,
        );
      }
    }

    // Persiste mapeamentos novos pra reuso
    await this.persistMappings(tenant.organizationId, body);

    return report;
  }

  /**
   * Persiste mapping no OrgImportMapping pra reuso futuro. UPSERT por
   * (orgId, kind, sourceName) — sobrescreve se ja existe.
   */
  private async persistMappings(organizationId: string, body: ImportExecuteRequest): Promise<void> {
    const ops: Array<Promise<unknown>> = [];

    for (const [sourceName, targetUserId] of Object.entries(body.members)) {
      ops.push(
        this.prisma.orgImportMapping.upsert({
          where: {
            organizationId_kind_sourceName: {
              organizationId,
              kind: 'user',
              sourceName,
            },
          },
          create: { organizationId, kind: 'user', sourceName, targetId: targetUserId },
          update: { targetId: targetUserId },
        }),
      );
    }

    for (const [sourceName, target] of Object.entries(body.lists)) {
      // 'create' nao persiste — quando a lista existir no proximo import,
      // vira match exato (existing). 'ignore' e 'existing' persistem.
      // 'complete' persiste com sentinel '__COMPLETE__' pra ser
      // re-detectado no preview do proximo import.
      if (target.type === 'existing') {
        ops.push(
          this.prisma.orgImportMapping.upsert({
            where: {
              organizationId_kind_sourceName: {
                organizationId,
                kind: 'list',
                sourceName,
              },
            },
            create: { organizationId, kind: 'list', sourceName, targetId: target.listId },
            update: { targetId: target.listId },
          }),
        );
      } else if (target.type === 'ignore') {
        ops.push(
          this.prisma.orgImportMapping.upsert({
            where: {
              organizationId_kind_sourceName: {
                organizationId,
                kind: 'list',
                sourceName,
              },
            },
            create: { organizationId, kind: 'list', sourceName, targetId: null },
            update: { targetId: null },
          }),
        );
      } else if (target.type === 'complete') {
        ops.push(
          this.prisma.orgImportMapping.upsert({
            where: {
              organizationId_kind_sourceName: {
                organizationId,
                kind: 'list',
                sourceName,
              },
            },
            create: { organizationId, kind: 'list', sourceName, targetId: '__COMPLETE__' },
            update: { targetId: '__COMPLETE__' },
          }),
        );
      }
    }

    await Promise.all(ops);
  }

  /**
   * Cria card usando o mapping resolvido. Variante do `importCard`
   * usado pelo legado, mas em vez de fuzzy/normalize na hora, recebe
   * Maps ja resolvidas com targetId concreto (ou null = ignorar).
   */
  private async importCardWithMapping(args: {
    row: string[];
    tenant: TenantContext;
    userId: string;
    boardId: string;
    listsByName: Map<string, string>;
    labelsByName: Map<string, string>;
    contactsByName: Map<string, string>;
    userByName: Map<string, string | null>;
    report: ImportReport;
    /** Se true, cria card com completedAt setado (coluna 'complete'). */
    forceCompleted?: boolean;
  }): Promise<{ id: string; shortCode: string } | null> {
    const {
      row,
      tenant,
      userId,
      boardId,
      listsByName,
      labelsByName,
      contactsByName,
      userByName,
      report,
      forceCompleted = false,
    } = args;

    const shortCode = row[HEADER_INDEX.identificador]?.trim();
    if (!shortCode) return null;

    // Idempotencia
    const existing = await this.prisma.card.findUnique({
      where: { organizationId_shortCode: { organizationId: tenant.organizationId, shortCode } },
      select: { id: true },
    });
    if (existing) return null;

    // Resolve lista via mapping; fallback: cria com nome do CSV
    const listSourceName = row[HEADER_INDEX.colunaAtual]?.trim() || 'A fazer';
    let listId = listsByName.get(listSourceName);
    if (!listId) {
      const last = await this.prisma.list.findFirst({
        where: { boardId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      const created = await this.prisma.list.create({
        data: {
          organizationId: tenant.organizationId,
          boardId,
          name: listSourceName,
          position: (last?.position ?? 0) + 1024,
        },
        select: { id: true },
      });
      listId = created.id;
      listsByName.set(listSourceName, listId);
      report.createdLists++;
    }

    // Datas
    const dataInicio = this.parseDateBR(row[HEADER_INDEX.dataInicio]);
    const dataEntrega = this.parseDateBR(row[HEADER_INDEX.dataEntrega]);
    const criadoEm = this.parseDateBR(row[HEADER_INDEX.criadoEm]);
    const finalizadoEm = this.parseDateBR(row[HEADER_INDEX.finalizadoEm]);
    /// completed se: (a) status do CSV = 'completed' OU (b) coluna foi
    /// mapeada como 'complete' no wizard (forceCompleted)
    const isCompleted = forceCompleted || row[HEADER_INDEX.status]?.trim() === 'completed';

    // Lider via mapping
    const leaderName = row[HEADER_INDEX.lider]?.trim();
    const leaderId = leaderName ? (userByName.get(leaderName) ?? null) : null;

    // Position
    const lastInList = await this.prisma.card.findFirst({
      where: { listId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = (lastInList?.position ?? 0) + 1024;

    const descriptionDoc = this.htmlToProseMirror(row[HEADER_INDEX.descricao] ?? '');

    const card = await this.prisma.card.create({
      data: {
        organizationId: tenant.organizationId,
        shortCode,
        boardId,
        listId,
        title: row[HEADER_INDEX.nome] ?? '(sem nome)',
        description: descriptionDoc as unknown as Prisma.InputJsonValue,
        leadId: leaderId ?? userId,
        createdById: userId,
        completedById: isCompleted ? (leaderId ?? userId) : null,
        completedAt: isCompleted ? (finalizadoEm ?? new Date()) : null,
        dueDate: dataEntrega,
        enteredListAt: dataInicio ?? new Date(),
        createdAt: criadoEm ?? undefined,
        position,
      },
      select: { id: true, shortCode: true },
    });

    // Equipe via mapping
    const equipeNames = (row[HEADER_INDEX.equipe] ?? '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    const memberIds = new Set<string>();
    if (leaderId) memberIds.add(leaderId);
    for (const name of equipeNames) {
      const id = userByName.get(name);
      if (id) memberIds.add(id);
    }
    if (memberIds.size > 0) {
      await this.prisma.cardMember.createMany({
        data: Array.from(memberIds).map((uid) => ({ cardId: card.id, userId: uid })),
        skipDuplicates: true,
      });
    }

    // Tags (auto-create) — comportamento V1 mantido
    const tagNames = (row[HEADER_INDEX.tags] ?? '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const tagName of tagNames) {
      let labelId = labelsByName.get(tagName);
      if (!labelId) {
        const existingLabel = await this.prisma.label.findFirst({
          where: { organizationId: tenant.organizationId, boardId, name: tagName },
          select: { id: true },
        });
        if (existingLabel) {
          labelId = existingLabel.id;
        } else {
          const createdLabel = await this.prisma.label.create({
            data: {
              organizationId: tenant.organizationId,
              boardId,
              name: tagName,
              color: this.randomLabelColor(),
            },
            select: { id: true },
          });
          labelId = createdLabel.id;
          report.createdLabels++;
        }
        labelsByName.set(tagName, labelId);
      }
      await this.prisma.cardLabel
        .create({ data: { cardId: card.id, labelId } })
        .catch(() => undefined);
    }

    // Contatos (auto-create)
    const contactNames = (row[HEADER_INDEX.contatos] ?? '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    const contactEmails = (row[HEADER_INDEX.emailsContatos] ?? '').split('|').map((s) => s.trim());
    for (let i = 0; i < contactNames.length; i++) {
      const name = contactNames[i]!;
      const email = contactEmails[i] || null;
      let contactId = contactsByName.get(name);
      if (!contactId) {
        const existingContact = await this.prisma.contact.findFirst({
          where: {
            organizationId: tenant.organizationId,
            name: { equals: name, mode: 'insensitive' },
            deletedAt: null,
          },
          select: { id: true },
        });
        if (existingContact) {
          contactId = existingContact.id;
        } else {
          const type: ContactType =
            name.split(' ').length >= 2 || /[a-z]/.test(name[0] ?? '') ? 'PERSON' : 'COMPANY';
          const createdContact = await this.prisma.contact.create({
            data: {
              organizationId: tenant.organizationId,
              type,
              name,
              email: email || null,
            },
            select: { id: true },
          });
          contactId = createdContact.id;
          report.createdContacts++;
        }
        contactsByName.set(name, contactId);
      }
      await this.prisma.cardContact
        .create({ data: { cardId: card.id, contactId } })
        .catch(() => undefined);
    }

    // CardPresence
    await this.prisma.cardPresence
      .create({
        data: {
          cardId: card.id,
          boardId,
          listId,
          position,
          completedAt: isCompleted ? (finalizadoEm ?? new Date()) : null,
          completedById: isCompleted ? (leaderId ?? userId) : null,
        },
      })
      .catch(() => undefined);

    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId,
        cardId: card.id,
        actorId: userId,
        type: 'CARD_CREATED',
        payload: { via: 'ummense-import-v2', cardId: card.id, title: row[HEADER_INDEX.nome] },
      },
    });

    return { id: card.id, shortCode: card.shortCode! };
  }

  /**
   * Parser + validacao basica do CSV. Reuso entre preview e execute.
   */
  private parseAndValidateCsv(csv: string): string[][] {
    let parsed: string[][];
    try {
      parsed = JSON.parse(csv) as string[][];
    } catch (err) {
      throw new BadRequestException(
        `Arquivo inválido. Esperava JSON array de arrays. ${err instanceof Error ? err.message : ''}`,
      );
    }
    if (!Array.isArray(parsed) || parsed.length < 2) {
      throw new BadRequestException('Arquivo vazio ou sem registros (esperava header + 1+ cards).');
    }
    const [header, ...rows] = parsed;
    if (!header || header.length < 24) {
      throw new BadRequestException(
        `Header inválido: esperava 24 colunas, veio ${header?.length ?? 0}.`,
      );
    }
    return rows;
  }

  /**
   * Fuzzy score 0-1 entre 2 nomes:
   *   1.0 = match exato (normalizado)
   *   0.85 = um contem o outro
   *   0.7-0.8 = Levenshtein distance <= 2 chars (fora ratio)
   *   0.6 = iniciais batem ("T. Bueno" vs "Thiago Bueno")
   *   0 = sem match
   */
  static fuzzyScore(a: string, b: string): number {
    const norm = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]/gu, '') // emojis
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
    const na = norm(a);
    const nb = norm(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1.0;

    if (na.includes(nb) || nb.includes(na)) return 0.85;

    // Iniciais: "T. Bueno" -> ['t', 'bueno'] vs "Thiago Bueno" -> ['thiago', 'bueno']
    const partsA = na.split(' ');
    const partsB = nb.split(' ');
    const lastA = partsA[partsA.length - 1];
    const lastB = partsB[partsB.length - 1];
    const firstA = partsA[0]?.replace(/[^a-z]/g, '');
    const firstB = partsB[0]?.replace(/[^a-z]/g, '');
    if (lastA && lastA === lastB && firstA && firstB && firstA[0] === firstB[0]) {
      return 0.7;
    }

    // Levenshtein
    const dist = ImporterService.levenshtein(na, nb);
    const maxLen = Math.max(na.length, nb.length);
    if (dist <= 2 && maxLen > 0) return 0.75 - (dist / maxLen) * 0.1;

    return 0;
  }

  /**
   * Levenshtein distance (DP iterativa, sem dep externa).
   */
  private static levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const v0 = new Array<number>(b.length + 1);
    const v1 = new Array<number>(b.length + 1);
    for (let i = 0; i <= b.length; i++) v0[i] = i;
    for (let i = 0; i < a.length; i++) {
      v1[0] = i + 1;
      for (let j = 0; j < b.length; j++) {
        const cost = a[i] === b[j] ? 0 : 1;
        v1[j + 1] = Math.min(v1[j]! + 1, v0[j + 1]! + 1, v0[j]! + cost);
      }
      for (let j = 0; j <= b.length; j++) v0[j] = v1[j]!;
    }
    return v1[b.length]!;
  }

  // ==================================================
  // Legado: importUmmenseFlow (auto-resolve por nome)
  // ==================================================

  async importUmmenseFlow(
    userId: string,
    tenant: TenantContext,
    body: ImportUmmenseRequest,
  ): Promise<ImportReport> {
    if (tenant.role !== 'OWNER' && tenant.role !== 'ADMIN') {
      throw new ForbiddenException('Apenas OWNER/ADMIN pode importar fluxos.');
    }

    let parsed: string[][];
    try {
      parsed = JSON.parse(body.csv) as string[][];
    } catch (err) {
      throw new BadRequestException(
        `Arquivo inválido. Esperava JSON array de arrays. ${err instanceof Error ? err.message : ''}`,
      );
    }

    if (!Array.isArray(parsed) || parsed.length < 2) {
      throw new BadRequestException('Arquivo vazio ou sem registros (esperava header + 1+ cards).');
    }

    const [header, ...rows] = parsed;
    if (!header || header.length < 24) {
      throw new BadRequestException(
        `Header inválido: esperava 24 colunas, veio ${header?.length ?? 0}.`,
      );
    }

    // Resolve board: pega o nome da coluna `Fluxos` da 1a linha (todos do mesmo fluxo)
    const boardName = body.boardName?.trim() || rows[0]?.[HEADER_INDEX.fluxos]?.trim();
    if (!boardName) {
      throw new BadRequestException('Não foi possível resolver nome do board.');
    }

    const report: ImportReport = {
      totalRows: rows.length,
      created: 0,
      skipped: 0,
      errors: [],
      createdContacts: 0,
      createdLabels: 0,
      createdLists: 0,
      warnings: [],
      dryRun: body.dryRun,
    };

    if (body.dryRun) {
      // Pre-flight: conta o que VAI ser criado, sem persistir.
      // Por simplicidade, retorna estatisticas basicas.
      const existingByShortCode = new Set(
        (
          await this.prisma.card.findMany({
            where: {
              organizationId: tenant.organizationId,
              shortCode: {
                in: rows
                  .map((r) => r[HEADER_INDEX.identificador])
                  .filter((v): v is string => Boolean(v)),
              },
            },
            select: { shortCode: true },
          })
        )
          .map((c) => c.shortCode)
          .filter((v): v is string => Boolean(v)),
      );
      const newCount = rows.filter(
        (r) => !existingByShortCode.has(r[HEADER_INDEX.identificador]!),
      ).length;
      const skipCount = rows.length - newCount;
      report.created = newCount;
      report.skipped = skipCount;
      report.warnings.push(
        `Dry-run: ${newCount} cards seriam criados, ${skipCount} pulados (ja existem).`,
      );
      return report;
    }

    // Garante existencia do board
    const board = await this.upsertBoard(tenant.organizationId, userId, boardName);

    // Pre-resolve users da Org pra lookup por nome
    const orgUsers = await this.prisma.user.findMany({
      where: { memberships: { some: { organizationId: tenant.organizationId } } },
      select: { id: true, name: true, email: true },
    });
    const userByNormName = new Map<string, string>();
    for (const u of orgUsers) {
      userByNormName.set(this.normalizeName(u.name), u.id);
    }

    // Cache local de listas/labels/contatos criados nesta passada
    const listsByName = new Map<string, string>(); // name -> listId
    const labelsByName = new Map<string, string>(); // name -> labelId
    const contactsByName = new Map<string, string>(); // name -> contactId

    // 1a passada: cria todos os cards SEM parent. 2a passada resolve parent.
    const cardIdByShortCode = new Map<string, string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const cardName = row[HEADER_INDEX.nome] || '(sem nome)';
      try {
        const created = await this.importCard({
          row,
          rowIndex: i,
          tenant,
          userId,
          boardId: board.id,
          listsByName,
          labelsByName,
          contactsByName,
          userByNormName,
          report,
        });
        if (created) {
          cardIdByShortCode.set(created.shortCode, created.id);
          report.created++;
        } else {
          report.skipped++;
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        report.errors.push({ row: i + 2, cardName, reason });
        this.logger.warn(`Import row ${i + 2} ("${cardName}"): ${reason}`);
      }
    }

    // 2a passada: vincular pais
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const myShortCode = row[HEADER_INDEX.identificador];
      const parentShortCode = row[HEADER_INDEX.cardPai]?.trim();
      if (!myShortCode || !parentShortCode) continue;
      const myId = cardIdByShortCode.get(myShortCode);
      if (!myId) continue;
      // pai pode estar nesta importacao OU ja existir
      let parentId = cardIdByShortCode.get(parentShortCode);
      if (!parentId) {
        const existing = await this.prisma.card.findUnique({
          where: {
            organizationId_shortCode: {
              organizationId: tenant.organizationId,
              shortCode: parentShortCode,
            },
          },
          select: { id: true },
        });
        parentId = existing?.id;
      }
      if (parentId) {
        await this.prisma.card.update({
          where: { id: myId },
          data: { parentCardId: parentId },
        });
      } else {
        report.warnings.push(
          `Card "${row[HEADER_INDEX.nome]}" referencia pai shortCode=${parentShortCode} que nao foi encontrado.`,
        );
      }
    }

    return report;
  }

  // ==================================================
  // Helpers
  // ==================================================

  private async upsertBoard(organizationId: string, createdById: string, name: string) {
    const existing = await this.prisma.board.findFirst({
      where: { organizationId, name, isArchived: false },
      select: { id: true, name: true },
    });
    if (existing) return existing;
    const created = await this.prisma.board.create({
      data: {
        organizationId,
        name,
        createdById,
        visibility: 'ORGANIZATION',
      },
      select: { id: true, name: true },
    });
    return created;
  }

  private async importCard(args: {
    row: string[];
    rowIndex: number;
    tenant: TenantContext;
    userId: string;
    boardId: string;
    listsByName: Map<string, string>;
    labelsByName: Map<string, string>;
    contactsByName: Map<string, string>;
    userByNormName: Map<string, string>;
    report: ImportReport;
  }): Promise<{ id: string; shortCode: string } | null> {
    const {
      row,
      tenant,
      userId,
      boardId,
      listsByName,
      labelsByName,
      contactsByName,
      userByNormName,
      report,
    } = args;

    const shortCode = row[HEADER_INDEX.identificador]?.trim();
    if (!shortCode) return null;

    // Idempotencia
    const existing = await this.prisma.card.findUnique({
      where: {
        organizationId_shortCode: { organizationId: tenant.organizationId, shortCode },
      },
      select: { id: true },
    });
    if (existing) return null;

    // Resolve lista
    const listName = row[HEADER_INDEX.colunaAtual]?.trim() || 'A fazer';
    let listId = listsByName.get(listName);
    if (!listId) {
      const dbList = await this.prisma.list.findFirst({
        where: { boardId, name: listName, isArchived: false },
        select: { id: true },
      });
      if (dbList) {
        listId = dbList.id;
      } else {
        const last = await this.prisma.list.findFirst({
          where: { boardId },
          orderBy: { position: 'desc' },
          select: { position: true },
        });
        const created = await this.prisma.list.create({
          data: {
            organizationId: tenant.organizationId,
            boardId,
            name: listName,
            position: (last?.position ?? 0) + 1024,
          },
          select: { id: true },
        });
        listId = created.id;
        report.createdLists++;
      }
      listsByName.set(listName, listId);
    }

    // Datas
    const dataInicio = this.parseDateBR(row[HEADER_INDEX.dataInicio]);
    const dataEntrega = this.parseDateBR(row[HEADER_INDEX.dataEntrega]);
    const criadoEm = this.parseDateBR(row[HEADER_INDEX.criadoEm]);
    const finalizadoEm = this.parseDateBR(row[HEADER_INDEX.finalizadoEm]);
    const isCompleted = row[HEADER_INDEX.status]?.trim() === 'completed';

    // Líder
    const leaderName = row[HEADER_INDEX.lider]?.trim();
    const leaderId = leaderName
      ? (userByNormName.get(this.normalizeName(leaderName)) ?? null)
      : null;
    if (leaderName && !leaderId) {
      report.warnings.push(`Líder "${leaderName}" não encontrado na Org (card #${shortCode}).`);
    }

    // Position
    const lastInList = await this.prisma.card.findFirst({
      where: { listId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = (lastInList?.position ?? 0) + 1024;

    // Descricao: HTML cru por enquanto — convertido pra ProseMirror simples
    // (1 paragrafo com texto puro). Usuario pode reformatar depois.
    const descriptionRaw = row[HEADER_INDEX.descricao] ?? '';
    const descriptionDoc = this.htmlToProseMirror(descriptionRaw);

    const card = await this.prisma.card.create({
      data: {
        organizationId: tenant.organizationId,
        shortCode,
        boardId,
        listId,
        title: row[HEADER_INDEX.nome] ?? '(sem nome)',
        description: descriptionDoc as unknown as Prisma.InputJsonValue,
        leadId: leaderId ?? userId, // fallback: importador vira lider
        createdById: userId,
        completedById: isCompleted ? (leaderId ?? userId) : null,
        completedAt: isCompleted ? (finalizadoEm ?? new Date()) : null,
        dueDate: dataEntrega,
        enteredListAt: dataInicio ?? new Date(),
        createdAt: criadoEm ?? undefined, // se null, usa default
        position,
      },
      select: { id: true, shortCode: true },
    });

    // Equipe
    const equipeNames = (row[HEADER_INDEX.equipe] ?? '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    const memberIds = new Set<string>();
    if (leaderId) memberIds.add(leaderId);
    for (const name of equipeNames) {
      const id = userByNormName.get(this.normalizeName(name));
      if (id) memberIds.add(id);
      else report.warnings.push(`Equipe: "${name}" não encontrado (card #${shortCode}).`);
    }
    if (memberIds.size > 0) {
      await this.prisma.cardMember.createMany({
        data: Array.from(memberIds).map((uid) => ({ cardId: card.id, userId: uid })),
        skipDuplicates: true,
      });
    }

    // Tags (Labels)
    const tagNames = (row[HEADER_INDEX.tags] ?? '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const tagName of tagNames) {
      let labelId = labelsByName.get(tagName);
      if (!labelId) {
        const existing = await this.prisma.label.findFirst({
          where: { organizationId: tenant.organizationId, boardId, name: tagName },
          select: { id: true },
        });
        if (existing) {
          labelId = existing.id;
        } else {
          const created = await this.prisma.label.create({
            data: {
              organizationId: tenant.organizationId,
              boardId,
              name: tagName,
              color: this.randomLabelColor(),
            },
            select: { id: true },
          });
          labelId = created.id;
          report.createdLabels++;
        }
        labelsByName.set(tagName, labelId);
      }
      await this.prisma.cardLabel
        .create({ data: { cardId: card.id, labelId } })
        .catch(() => undefined); // dedup
    }

    // Contatos: split por '|' e match posicional com Emails
    const contactNames = (row[HEADER_INDEX.contatos] ?? '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    const contactEmails = (row[HEADER_INDEX.emailsContatos] ?? '').split('|').map((s) => s.trim());
    for (let i = 0; i < contactNames.length; i++) {
      const name = contactNames[i]!;
      const email = contactEmails[i] || null;
      let contactId = contactsByName.get(name);
      if (!contactId) {
        const existing = await this.prisma.contact.findFirst({
          where: {
            organizationId: tenant.organizationId,
            name: { equals: name, mode: 'insensitive' },
            deletedAt: null,
          },
          select: { id: true },
        });
        if (existing) {
          contactId = existing.id;
        } else {
          // Heuristica: se nome tem espaco e parece pessoa, PERSON; senao COMPANY
          const type: ContactType =
            name.split(' ').length >= 2 || /[a-z]/.test(name[0] ?? '') ? 'PERSON' : 'COMPANY';
          const created = await this.prisma.contact.create({
            data: {
              organizationId: tenant.organizationId,
              type,
              name,
              email: email || null,
            },
            select: { id: true },
          });
          contactId = created.id;
          report.createdContacts++;
        }
        contactsByName.set(name, contactId);
      }
      await this.prisma.cardContact
        .create({ data: { cardId: card.id, contactId } })
        .catch(() => undefined); // dedup
    }

    // CardPresence
    await this.prisma.cardPresence
      .create({
        data: {
          cardId: card.id,
          boardId,
          listId,
          position,
          completedAt: isCompleted ? (finalizadoEm ?? new Date()) : null,
          completedById: isCompleted ? (leaderId ?? userId) : null,
        },
      })
      .catch(() => undefined);

    // Activity de criacao
    await this.prisma.activity.create({
      data: {
        organizationId: tenant.organizationId,
        boardId,
        cardId: card.id,
        actorId: userId,
        type: 'CARD_CREATED',
        payload: { via: 'ummense-import', cardId: card.id, title: row[HEADER_INDEX.nome] },
      },
    });

    return { id: card.id, shortCode: card.shortCode! };
  }

  /**
   * Normaliza nome pra match: lowercase + remove acentos + trim. Bate
   * "Nicchon Sanchez" com "nicchon  sanchez" sem ser sensivel a NFD.
   */
  private normalizeName(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Parse "dd/mm/yyyy hh:mm:ss" ou "dd/mm/yyyy" no fuso BRT (-03:00).
   * "Sem data" / vazio → null.
   */
  private parseDateBR(s: string | undefined): Date | null {
    if (!s) return null;
    const trimmed = s.trim();
    if (!trimmed || trimmed.toLowerCase() === 'sem data') return null;
    // dd/mm/yyyy [hh:mm:ss]
    const m = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/);
    if (!m) return null;
    const [, d, mo, y, hh, mm, ss] = m;
    // Trata como BRT-3 e converte pra UTC
    const localIso = `${y}-${mo}-${d}T${hh ?? '00'}:${mm ?? '00'}:${ss ?? '00'}-03:00`;
    const date = new Date(localIso);
    return isNaN(date.getTime()) ? null : date;
  }

  /**
   * Conversao bem simples: extrai texto puro do HTML, embrulha em
   * ProseMirror doc com 1 paragrafo. Suficiente pro MVP — usuario
   * reformata depois se quiser. Tag `<br>` vira quebra de paragrafo.
   */
  private htmlToProseMirror(html: string): { type: 'doc'; content: unknown[] } {
    if (!html) return { type: 'doc', content: [] };
    const cleaned = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
    const paragraphs = cleaned
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (paragraphs.length === 0) return { type: 'doc', content: [] };
    return {
      type: 'doc',
      content: paragraphs.map((p) => ({
        type: 'paragraph',
        content: p ? [{ type: 'text', text: p }] : [],
      })),
    };
  }

  private randomLabelColor(): string {
    const colors = [
      '#EF4444',
      '#F59E0B',
      '#EAB308',
      '#10B981',
      '#06B6D4',
      '#3B82F6',
      '#6366F1',
      '#8B5CF6',
      '#EC4899',
      '#94A3B8',
    ];
    return colors[Math.floor(Math.random() * colors.length)]!;
  }
}
