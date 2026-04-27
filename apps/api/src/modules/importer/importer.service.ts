import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import type { Prisma, ContactType } from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';

import type { ImportUmmenseRequest } from './dto/importer.schemas';

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

@Injectable()
export class ImporterService {
  private readonly logger = new Logger(ImporterService.name);

  constructor(private readonly prisma: PrismaService) {}

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
