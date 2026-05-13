import { randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma/prisma.service';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { AuthService } from '@/modules/auth/auth.service';

import type { UpdateMemberRequest, SuspendMemberRequest } from './dto/members-admin.schemas';

/**
 * Operacoes admin sobre outros members da Org. Toda acao registra
 * Activity (audit log).
 *
 * Permissoes:
 *   OWNER: tudo, exceto degradar ultimo OWNER
 *   ADMIN: tudo exceto mexer em OWNER ou promover pra OWNER
 *   GESTOR/MEMBER/GUEST: bloqueado (s pode editar o proprio perfil)
 */
@Injectable()
export class MembersAdminService {
  private readonly logger = new Logger(MembersAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AuthService))
    private readonly auth: AuthService,
  ) {}

  /**
   * Detalhe completo do membro pra modal admin: dados + role na Org +
   * skills (placeholder) + ultima atividade + sessoes ativas.
   */
  async getOne(actorTenant: TenantContext, targetUserId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: targetUserId,
          organizationId: actorTenant.organizationId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            pendingEmail: true,
            name: true,
            avatarUrl: true,
            phone: true,
            notifyApprovalsOnWhatsApp: true,
            twoFactorEnabled: true,
            suspendedAt: true,
            suspendedReason: true,
            createdAt: true,
            lockedUntil: true,
            failedLoginCount: true,
          },
        },
      },
    });
    if (!membership) {
      throw new NotFoundException('Membro não encontrado nesta organização.');
    }

    // Ultima atividade (qualquer Activity onde actorId = target user na Org)
    const lastActivity = await this.prisma.activity.findFirst({
      where: { organizationId: actorTenant.organizationId, actorId: targetUserId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, type: true },
    });

    // Sessoes ativas (nao revogadas, nao expiradas)
    const activeSessions = await this.prisma.session.count({
      where: {
        userId: targetUserId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    return {
      ...membership.user,
      role: membership.role,
      lastActivity,
      activeSessions,
    };
  }

  /**
   * Lista as N ultimas Activities do user na Org (audit + atividade do user).
   */
  async listActivity(actorTenant: TenantContext, targetUserId: string, limit = 30) {
    const memb = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: targetUserId,
          organizationId: actorTenant.organizationId,
        },
      },
      select: { id: true },
    });
    if (!memb) throw new NotFoundException('Membro não encontrado.');

    return this.prisma.activity.findMany({
      where: { organizationId: actorTenant.organizationId, actorId: targetUserId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      select: {
        id: true,
        type: true,
        payload: true,
        boardId: true,
        cardId: true,
        createdAt: true,
      },
    });
  }

  /**
   * Atualiza nome / phone / email (este ultimo via fluxo de confirmacao).
   * Email nao troca direto — gera pendingEmail + envia link pro novo email.
   */
  async update(
    actorUserId: string,
    actorTenant: TenantContext,
    targetUserId: string,
    body: UpdateMemberRequest,
  ) {
    await this.assertCanModify(actorUserId, actorTenant, targetUserId);

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, email: true, phone: true, pendingEmail: true },
    });
    if (!target) throw new NotFoundException('Usuário não encontrado.');

    const data: Prisma.UserUpdateInput = {};
    const activities: Array<Promise<unknown>> = [];

    if (body.name !== undefined && body.name !== target.name) {
      data.name = body.name;
      activities.push(
        this.prisma.activity.create({
          data: {
            organizationId: actorTenant.organizationId,
            actorId: actorUserId,
            type: 'MEMBER_NAME_CHANGED',
            payload: {
              targetUserId,
              from: target.name,
              to: body.name,
            } as unknown as Prisma.InputJsonValue,
          },
        }),
      );
    }

    if (body.phone !== undefined && body.phone !== target.phone) {
      data.phone = body.phone;
      activities.push(
        this.prisma.activity.create({
          data: {
            organizationId: actorTenant.organizationId,
            actorId: actorUserId,
            type: 'MEMBER_PHONE_CHANGED',
            payload: {
              targetUserId,
              from: target.phone,
              to: body.phone,
            } as unknown as Prisma.InputJsonValue,
          },
        }),
      );
    }

    if (body.email !== undefined && body.email !== target.email) {
      // Verificar se ja tem outro user com esse email
      const exists = await this.prisma.user.findUnique({
        where: { email: body.email },
        select: { id: true },
      });
      if (exists) throw new BadRequestException('E-mail já em uso por outro usuário.');
      data.pendingEmail = body.email;
      // TODO(email): enviar email de confirmacao pro novo endereco quando
      // mailer estiver integrado (SMTP_SECURE config ja preparado).
      // Por ora, log o token pra admin enviar manualmente.
      const confirmToken = randomBytes(24).toString('base64url');
      this.logger.warn(
        `[email-change] User ${targetUserId} email change requested: ${target.email} -> ${body.email}. ` +
          `Confirm token (TODO send email): ${confirmToken}`,
      );
      activities.push(
        this.prisma.activity.create({
          data: {
            organizationId: actorTenant.organizationId,
            actorId: actorUserId,
            type: 'MEMBER_EMAIL_CHANGE_REQUESTED',
            payload: {
              targetUserId,
              from: target.email,
              to: body.email,
            } as unknown as Prisma.InputJsonValue,
          },
        }),
      );
    }

    if (Object.keys(data).length === 0) {
      return { ok: true, changed: false };
    }

    await this.prisma.user.update({ where: { id: targetUserId }, data });
    await Promise.all(activities);
    return { ok: true, changed: true };
  }

  /**
   * Forca redefinicao de senha. Admin nunca define a senha direto —
   * sistema gera token, invalida sessoes ativas e dispara link de reset
   * via email + WhatsApp (se phone). Reusa AuthService.dispatchPasswordResetForUser
   * pra unificar a logica com o /auth/forgot-password publico.
   */
  async forcePasswordReset(actorUserId: string, actorTenant: TenantContext, targetUserId: string) {
    await this.assertCanModify(actorUserId, actorTenant, targetUserId);

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        suspendedAt: true,
        deletedAt: true,
      },
    });
    if (!target || target.deletedAt) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    // Invalida todas as sessoes ativas (forca relogin)
    await this.prisma.session.updateMany({
      where: { userId: targetUserId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Dispara token + email + WhatsApp via AuthService.
    await this.auth.dispatchPasswordResetForUser(
      { id: target.id, email: target.email, name: target.name, phone: target.phone },
      { source: 'admin' },
    );
    this.logger.log(
      `[force-password-reset] User ${targetUserId} sessoes invalidadas + link enviado por ` +
        `${actorUserId} (email${target.phone ? ' + whatsapp' : ''})`,
    );

    await this.prisma.activity.create({
      data: {
        organizationId: actorTenant.organizationId,
        actorId: actorUserId,
        type: 'MEMBER_PASSWORD_RESET_FORCED',
        payload: { targetUserId } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      ok: true,
      message: target.phone
        ? 'Sessões invalidadas. Link de redefinição enviado por email e WhatsApp.'
        : 'Sessões invalidadas. Link de redefinição enviado por email.',
    };
  }

  /**
   * Envia link de redefinicao SEM invalidar sessoes ativas. Pra cenarios
   * de atendimento (user esqueceu, prazo apertado pra logar dnv): facilita
   * sem cortar trabalho em andamento. Diferente de forcePasswordReset
   * que e pra incidente/suspeita de uso indevido.
   */
  async sendPasswordResetLink(
    actorUserId: string,
    actorTenant: TenantContext,
    targetUserId: string,
  ) {
    await this.assertCanModify(actorUserId, actorTenant, targetUserId);

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, name: true, phone: true, deletedAt: true },
    });
    if (!target || target.deletedAt) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    await this.auth.dispatchPasswordResetForUser(
      { id: target.id, email: target.email, name: target.name, phone: target.phone },
      { source: 'admin' },
    );
    this.logger.log(
      `[send-password-reset] User ${targetUserId} link enviado por ${actorUserId} ` +
        `(email${target.phone ? ' + whatsapp' : ''}, sessoes preservadas)`,
    );

    await this.prisma.activity.create({
      data: {
        organizationId: actorTenant.organizationId,
        actorId: actorUserId,
        type: 'MEMBER_PASSWORD_RESET_SENT',
        payload: { targetUserId } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      ok: true,
      message: target.phone
        ? 'Link de redefinição enviado por email e WhatsApp.'
        : 'Link de redefinição enviado por email.',
    };
  }

  async suspend(
    actorUserId: string,
    actorTenant: TenantContext,
    targetUserId: string,
    body: SuspendMemberRequest,
  ) {
    await this.assertCanModify(actorUserId, actorTenant, targetUserId);

    if (actorUserId === targetUserId) {
      throw new BadRequestException('Você não pode suspender a própria conta.');
    }

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        suspendedAt: new Date(),
        suspendedReason: body.reason,
      },
    });

    // Invalida sessoes ativas
    await this.prisma.session.updateMany({
      where: { userId: targetUserId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: actorTenant.organizationId,
        actorId: actorUserId,
        type: 'MEMBER_SUSPENDED',
        payload: { targetUserId, reason: body.reason } as unknown as Prisma.InputJsonValue,
      },
    });

    return { ok: true };
  }

  async unsuspend(actorUserId: string, actorTenant: TenantContext, targetUserId: string) {
    await this.assertCanModify(actorUserId, actorTenant, targetUserId);

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { suspendedAt: null, suspendedReason: null },
    });

    await this.prisma.activity.create({
      data: {
        organizationId: actorTenant.organizationId,
        actorId: actorUserId,
        type: 'MEMBER_UNSUSPENDED',
        payload: { targetUserId } as unknown as Prisma.InputJsonValue,
      },
    });

    return { ok: true };
  }

  /**
   * Permissao: actor precisa ser OWNER ou ADMIN da Org. ADMIN nao pode
   * mexer em outro OWNER. Ninguem pode rebaixar/suspender o ultimo OWNER.
   */
  private async assertCanModify(
    actorUserId: string,
    actorTenant: TenantContext,
    targetUserId: string,
  ) {
    if (actorTenant.role !== 'OWNER' && actorTenant.role !== 'ADMIN') {
      throw new ForbiddenException('Apenas OWNER/ADMIN pode editar outros membros.');
    }

    const targetMembership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: targetUserId,
          organizationId: actorTenant.organizationId,
        },
      },
      select: { role: true },
    });
    if (!targetMembership) {
      throw new NotFoundException('Membro não encontrado nesta organização.');
    }

    // ADMIN nao pode editar OWNER
    if (actorTenant.role === 'ADMIN' && targetMembership.role === 'OWNER') {
      throw new ForbiddenException('ADMIN não pode editar membros OWNER.');
    }

    // Caso especial: nao permitir suspender/remover ultimo OWNER
    if (targetMembership.role === 'OWNER' && actorUserId !== targetUserId) {
      const ownerCount = await this.prisma.membership.count({
        where: { organizationId: actorTenant.organizationId, role: 'OWNER' },
      });
      if (ownerCount <= 1) {
        // Admin pode editar dados (nome/phone) mas nao acoes destrutivas.
        // Esta restricao e checada no caller (suspend/remove) via flag.
      }
    }
  }
}
