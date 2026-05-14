import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BoardRole, BoardVisibility, OrgRole } from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';

export const SUPPORT_BOARD_NAME = 'Suporte';
export const SUPPORT_LIST_NAMES = ['Novo', 'Em triagem', 'Em atendimento', 'Resolvido'] as const;
type SupportListName = (typeof SUPPORT_LIST_NAMES)[number];
const SUPPORT_INTAKE_LIST: SupportListName = 'Novo';
const SUPPORT_FINAL_LIST: SupportListName = 'Resolvido';

export interface SupportContext {
  organizationId: string;
  ownerUserId: string;
  boardId: string;
  intakeListId: string;
}

/**
 * Garante que existe o board "Suporte" na org Kharis com as listas padrão
 * (Novo / Em triagem / Em atendimento / Resolvido). Roda no startup e
 * cacheia o contexto. Idempotente: se board já existe, só garante listas
 * faltantes.
 *
 * Falha no startup (banco vazio, migrate não rodou) é logada mas não
 * impede o app de subir — tenta de novo no primeiro POST do controller.
 */
@Injectable()
export class SupportBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(SupportBootstrapService.name);
  private cached: SupportContext | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.ensure();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Bootstrap do board "Suporte" falhou no startup: ${msg}. Vai tentar de novo no primeiro ticket.`,
      );
    }
  }

  async getContext(): Promise<SupportContext> {
    if (this.cached) return this.cached;
    return this.ensure();
  }

  private async ensure(): Promise<SupportContext> {
    const org = await this.prisma.organization.findUnique({ where: { slug: 'kharis' } });
    if (!org) {
      throw new Error('Organização "kharis" não encontrada — rode `pnpm db:seed`.');
    }

    const ownerMembership = await this.prisma.membership.findFirst({
      where: { organizationId: org.id, role: OrgRole.OWNER },
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
    });
    if (!ownerMembership) {
      throw new Error('Nenhum OWNER configurado na org Kharis — rode `pnpm db:seed`.');
    }

    let board = await this.prisma.board.findFirst({
      where: { organizationId: org.id, name: SUPPORT_BOARD_NAME, isArchived: false },
      include: { lists: true },
    });

    if (!board) {
      board = await this.prisma.board.create({
        data: {
          organizationId: org.id,
          name: SUPPORT_BOARD_NAME,
          description: 'Canal de suporte alimentado pelo formulário público em /ajuda/suporte.',
          // Visível pra toda a Kharis — qualquer membro interno pode triar.
          visibility: BoardVisibility.ORGANIZATION,
          createdById: ownerMembership.userId,
          members: {
            create: { userId: ownerMembership.userId, role: BoardRole.ADMIN },
          },
          lists: {
            create: SUPPORT_LIST_NAMES.map((name, idx) => ({
              organizationId: org.id,
              name,
              position: (idx + 1) * 1024,
              isBacklog: name === SUPPORT_INTAKE_LIST,
              isFinalList: name === SUPPORT_FINAL_LIST,
            })),
          },
        },
        include: { lists: true },
      });
      this.logger.log(`Board "Suporte" criado em org "${org.slug}" (boardId=${board.id}).`);
    } else {
      const existingNames = new Set(board.lists.map((l) => l.name));
      const missing = SUPPORT_LIST_NAMES.filter((n) => !existingNames.has(n));
      if (missing.length > 0) {
        const maxPos = board.lists.reduce((m, l) => Math.max(m, l.position), 0);
        await this.prisma.list.createMany({
          data: missing.map((name, idx) => ({
            organizationId: org.id,
            boardId: board!.id,
            name,
            position: maxPos + (idx + 1) * 1024,
            isBacklog: name === SUPPORT_INTAKE_LIST,
            isFinalList: name === SUPPORT_FINAL_LIST,
          })),
        });
        this.logger.log(`Listas faltantes criadas no board "Suporte": ${missing.join(', ')}.`);
        board = await this.prisma.board.findUnique({
          where: { id: board.id },
          include: { lists: true },
        });
      }
    }

    const intake = board!.lists.find((l) => l.name === SUPPORT_INTAKE_LIST);
    if (!intake) {
      throw new Error(`Lista "${SUPPORT_INTAKE_LIST}" não encontrada após bootstrap.`);
    }

    this.cached = {
      organizationId: org.id,
      ownerUserId: ownerMembership.userId,
      boardId: board!.id,
      intakeListId: intake.id,
    };
    return this.cached;
  }
}
