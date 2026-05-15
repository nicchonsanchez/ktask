import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { TokenService } from '@/common/crypto/token.service';
import { PrismaService } from '@/common/prisma/prisma.service';

import type {
  CreateServiceProviderRequest,
  UpdateServiceProviderRequest,
} from './dto/service-providers.schemas';

export interface ServiceProviderPublic {
  id: string;
  nome: string;
  slug: string;
  webhookUrl: string;
  escopo: string[];
  ativo: boolean;
  notas: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface ServiceProviderCreated extends ServiceProviderPublic {
  /**
   * Secret HMAC em plaintext. Mostrado APENAS no momento da criacao ou
   * rotacao. Nao recuperavel depois (so o hash SHA-256 fica no banco).
   */
  secretPlaintext: string;
}

@Injectable()
export class ServiceProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async create(body: CreateServiceProviderRequest): Promise<ServiceProviderCreated> {
    const existing = await this.prisma.serviceProvider.findUnique({ where: { slug: body.slug } });
    if (existing) {
      throw new ConflictException(`Service Provider com slug "${body.slug}" ja existe.`);
    }

    const secret = this.tokens.generate();
    const secretHash = this.tokens.hash(secret);

    const created = await this.prisma.serviceProvider.create({
      data: {
        nome: body.nome,
        slug: body.slug,
        webhookUrl: body.webhookUrl,
        secretHash,
        escopo: body.escopo,
        ativo: body.ativo ?? true,
        notas: body.notas ?? null,
      },
    });

    return { ...this.toPublic(created), secretPlaintext: secret };
  }

  async list(): Promise<ServiceProviderPublic[]> {
    const rows = await this.prisma.serviceProvider.findMany({
      orderBy: { criadoEm: 'desc' },
    });
    return rows.map((r) => this.toPublic(r));
  }

  async getOne(id: string): Promise<ServiceProviderPublic> {
    const sp = await this.prisma.serviceProvider.findUnique({ where: { id } });
    if (!sp) {
      throw new NotFoundException('Service Provider nao encontrado.');
    }
    return this.toPublic(sp);
  }

  async update(
    id: string,
    body: UpdateServiceProviderRequest,
  ): Promise<ServiceProviderPublic | ServiceProviderCreated> {
    const current = await this.prisma.serviceProvider.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('Service Provider nao encontrado.');
    }

    if (body.slug && body.slug !== current.slug) {
      const conflict = await this.prisma.serviceProvider.findUnique({
        where: { slug: body.slug },
      });
      if (conflict) {
        throw new ConflictException(`Service Provider com slug "${body.slug}" ja existe.`);
      }
    }

    let newSecret: string | undefined;
    let newSecretHash: string | undefined;
    if (body.rotacionarSecret) {
      newSecret = this.tokens.generate();
      newSecretHash = this.tokens.hash(newSecret);
    }

    const updated = await this.prisma.serviceProvider.update({
      where: { id },
      data: {
        nome: body.nome ?? undefined,
        slug: body.slug ?? undefined,
        webhookUrl: body.webhookUrl ?? undefined,
        escopo: body.escopo ?? undefined,
        ativo: body.ativo ?? undefined,
        notas: body.notas !== undefined ? body.notas : undefined,
        secretHash: newSecretHash ?? undefined,
      },
    });

    const publicData = this.toPublic(updated);
    if (newSecret) {
      return { ...publicData, secretPlaintext: newSecret };
    }
    return publicData;
  }

  async remove(id: string): Promise<void> {
    const sp = await this.prisma.serviceProvider.findUnique({ where: { id } });
    if (!sp) {
      throw new NotFoundException('Service Provider nao encontrado.');
    }
    await this.prisma.serviceProvider.delete({ where: { id } });
  }

  /**
   * Listagem interna pra outros services (WebhookDispatcherService etapa 3).
   * Retorna inclusive secretHash pra que o dispatcher possa usar a assinatura
   * armazenada — nao retorna plaintext (impossivel, so temos o hash).
   *
   * Importante: o secret usado pra assinar deve ser passado por outra via
   * (ex: variavel de ambiente, cache em memoria com TTL curto). Esta funcao
   * existe pra listar quais SPs devem receber um evento especifico.
   */
  async listAtivosParaEvento(evento: string) {
    return this.prisma.serviceProvider.findMany({
      where: {
        ativo: true,
        escopo: { has: evento },
      },
    });
  }

  private toPublic(row: {
    id: string;
    nome: string;
    slug: string;
    webhookUrl: string;
    escopo: string[];
    ativo: boolean;
    notas: string | null;
    criadoEm: Date;
    atualizadoEm: Date;
  }): ServiceProviderPublic {
    return {
      id: row.id,
      nome: row.nome,
      slug: row.slug,
      webhookUrl: row.webhookUrl,
      escopo: row.escopo,
      ativo: row.ativo,
      notas: row.notas,
      criadoEm: row.criadoEm,
      atualizadoEm: row.atualizadoEm,
    };
  }
}
