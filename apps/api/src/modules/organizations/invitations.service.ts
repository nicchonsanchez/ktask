import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Invitation, OrgRole } from '@prisma/client';
import { ORG_ROLE_RANK, ORG_ROLE_LABELS } from '@ktask/contracts';

import { PrismaService } from '@/common/prisma/prisma.service';
import { TokenService } from '@/common/crypto/token.service';
import { MailService } from '@/modules/mail/mail.service';
import { WhatsAppHelper } from '@/modules/whatsapp/whatsapp.helper';
import { env } from '@/config/env';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1_000; // 7 dias

interface CreateInvitationParams {
  organizationId: string;
  email: string;
  /** Doc 35: telefone opcional. Quando informado, dispara convite tambem
   *  via WhatsApp em paralelo ao email. Sanitizado pra digitos puros. */
  phone?: string;
  role: OrgRole;
  invitedById: string;
  actorRole: OrgRole;
}

interface AcceptInvitationParams {
  token: string;
  userId: string; // user já criado (ex: cadastro pelo token)
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly whatsapp: WhatsAppHelper,
  ) {}

  async create(
    params: CreateInvitationParams,
  ): Promise<{ invitation: Invitation; rawToken: string }> {
    const { organizationId, email, role, invitedById, actorRole } = params;
    const emailNormalized = email.toLowerCase().trim();
    // Doc 35: phone opcional. Sanitiza pra digitos; rejeita se invalido.
    const phoneSanitized = params.phone ? params.phone.replace(/\D/g, '') : '';
    if (params.phone && !/^\d{10,15}$/.test(phoneSanitized)) {
      throw new BadRequestException(
        'Telefone inválido. Use formato com DDI+DDD+número (10 a 15 dígitos).',
      );
    }
    const phoneStored = phoneSanitized || null;

    // Regra: convites só por OWNER/ADMIN. Papel convidado não pode ser > rank do actor,
    // e ninguém pode convidar como OWNER (só transferência faz isso).
    if (actorRole !== 'OWNER' && actorRole !== 'ADMIN') {
      throw new ForbiddenException('Sem permissão para convidar novos membros.');
    }
    if (role === 'OWNER') {
      throw new BadRequestException('OWNER só é atribuído via transferência.');
    }
    if (ORG_ROLE_RANK[role] > ORG_ROLE_RANK[actorRole]) {
      throw new ForbiddenException('Não é possível convidar com papel superior ao seu.');
    }

    // Já é membro?
    const existingUser = await this.prisma.user.findUnique({ where: { email: emailNormalized } });
    if (existingUser) {
      const membership = await this.prisma.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: existingUser.id,
            organizationId,
          },
        },
      });
      if (membership) {
        throw new BadRequestException('Este e-mail já é membro da organização.');
      }
    }

    // Revoga convites pendentes anteriores (mesmo email, mesma org)
    await this.prisma.invitation.deleteMany({
      where: {
        organizationId,
        email: emailNormalized,
        acceptedAt: null,
      },
    });

    const rawToken = this.tokens.generate();
    const tokenHash = this.tokens.hash(rawToken);

    const invitation = await this.prisma.invitation.create({
      data: {
        organizationId,
        email: emailNormalized,
        phone: phoneStored,
        role,
        token: tokenHash, // armazena hash (nunca o raw)
        invitedById,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });

    // Doc 34/35: dispara email + WhatsApp (se phone). Falha gracioso —
    // admin sempre tem o link copiavel como fallback.
    void this.dispatchInvitationChannels(invitation, rawToken).catch(() => undefined);

    return { invitation, rawToken };
  }

  /**
   * Doc 35: dispara email + WhatsApp em paralelo (fire-and-forget).
   */
  private async dispatchInvitationChannels(invitation: Invitation, rawToken: string) {
    const [organization, inviter] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: invitation.organizationId },
        select: { name: true },
      }),
      this.prisma.user.findUnique({
        where: { id: invitation.invitedById },
        select: { name: true },
      }),
    ]);
    if (!organization) return;

    const inviteUrl = `${env.APP_URL}/convite/${rawToken}`;
    const roleLabel = ORG_ROLE_LABELS[invitation.role];

    await Promise.allSettled([
      this.mail.sendInvitation({
        to: invitation.email,
        inviteUrl,
        organizationName: organization.name,
        invitedByName: inviter?.name ?? null,
        roleLabel,
        expiresAt: invitation.expiresAt,
      }),
      invitation.phone
        ? this.dispatchInvitationWhatsApp({
            phone: invitation.phone,
            inviteUrl,
            email: invitation.email,
            organizationName: organization.name,
            invitedByName: inviter?.name ?? null,
            roleLabel,
            expiresAt: invitation.expiresAt,
          })
        : Promise.resolve(),
    ]);
  }

  /**
   * Doc 35: mensagem de convite via WhatsApp. Texto fixo sem emojis,
   * inclui o email do convite explicitamente pra o destinatario saber
   * com qual conta vai entrar.
   */
  private async dispatchInvitationWhatsApp(params: {
    phone: string;
    inviteUrl: string;
    email: string;
    organizationName: string;
    invitedByName: string | null;
    roleLabel: string;
    expiresAt: Date;
  }): Promise<void> {
    const { phone, inviteUrl, email, organizationName, invitedByName, roleLabel, expiresAt } =
      params;
    const inviter = invitedByName ? `${invitedByName} convidou você` : 'Você foi convidado(a)';
    const expiresStr = expiresAt.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const text = [
      '*Convite para KTask*',
      '',
      `${inviter} para entrar na *${organizationName}* como *${roleLabel}*.`,
      '',
      'Para aceitar, abra o link abaixo. Sua conta será criada com o e-mail:',
      email,
      '',
      inviteUrl,
      '',
      `Este convite expira em ${expiresStr}.`,
      '',
      '> Esta é uma mensagem automática.',
    ].join('\n');
    await this.whatsapp.sendText(phone, text).catch(() => undefined);
  }

  /**
   * Valida um token sem aceitar (útil pra tela de "aceitar convite" exibir dados).
   */
  async previewByRawToken(rawToken: string) {
    const tokenHash = this.tokens.hash(rawToken);
    const invitation = await this.prisma.invitation.findUnique({
      where: { token: tokenHash },
      include: { organization: { select: { id: true, name: true, slug: true, logoUrl: true } } },
    });

    if (!invitation) throw new NotFoundException('Convite inválido.');
    if (invitation.acceptedAt) throw new BadRequestException('Convite já aceito.');
    if (invitation.expiresAt < new Date()) throw new BadRequestException('Convite expirado.');

    // Doc 34: indica se o email do convite ja tem User. Frontend usa
    // pra decidir entre "form de cadastro inline" (false) e "logar e
    // aceitar" (true).
    const existingUser = await this.prisma.user.findUnique({
      where: { email: invitation.email.toLowerCase() },
      select: { id: true },
    });
    return { ...invitation, userExists: Boolean(existingUser) };
  }

  async accept(params: AcceptInvitationParams) {
    const { token: rawToken, userId } = params;

    const invitation = await this.previewByRawToken(rawToken);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new ForbiddenException('Este convite foi enviado para outro e-mail.');
    }

    // Transação: aceita convite + cria/atualiza membership
    return this.prisma.$transaction(async (tx) => {
      await tx.membership.upsert({
        where: {
          userId_organizationId: {
            userId,
            organizationId: invitation.organizationId,
          },
        },
        update: { role: invitation.role },
        create: {
          userId,
          organizationId: invitation.organizationId,
          role: invitation.role,
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      return tx.organization.findUniqueOrThrow({ where: { id: invitation.organizationId } });
    });
  }

  /**
   * Doc 35.1: reenvia convite pendente — gera novo token (link antigo
   * para de valer), renova expiresAt e dispara nos canais configurados
   * (email sempre; WhatsApp se phone presente).
   *
   * Reutiliza email/role/phone do invite original. Util quando o
   * convidado nao recebeu o link, perdeu, ou esta proximo de expirar.
   */
  async resend(invitationId: string, organizationId: string) {
    const invite = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
    });
    if (!invite || invite.organizationId !== organizationId) {
      throw new NotFoundException('Convite não encontrado.');
    }
    if (invite.acceptedAt) {
      throw new BadRequestException('Convite já aceito não pode ser reenviado.');
    }

    const rawToken = this.tokens.generate();
    const tokenHash = this.tokens.hash(rawToken);
    const updated = await this.prisma.invitation.update({
      where: { id: invitationId },
      data: {
        token: tokenHash,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });

    void this.dispatchInvitationChannels(updated, rawToken).catch(() => undefined);
    return { invitation: updated, rawToken };
  }

  async revoke(invitationId: string, organizationId: string) {
    const invite = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
    });
    if (!invite || invite.organizationId !== organizationId) {
      throw new NotFoundException('Convite não encontrado.');
    }
    if (invite.acceptedAt) {
      throw new BadRequestException('Convite já aceito não pode ser revogado.');
    }
    await this.prisma.invitation.delete({ where: { id: invitationId } });
  }

  listPending(organizationId: string) {
    return this.prisma.invitation.findMany({
      where: {
        organizationId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        invitedBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
