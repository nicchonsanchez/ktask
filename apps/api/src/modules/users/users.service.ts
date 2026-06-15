import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, type User } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';
import {
  resolveNotificationPrefs,
  type NotificationPreferences,
} from '@/modules/notifications/preferences.types';
import type { UpdateNotificationPreferencesRequest } from './dto/notification-prefs.schemas';

export type PublicUser = Pick<
  User,
  | 'id'
  | 'email'
  | 'name'
  | 'avatarUrl'
  | 'phone'
  | 'notifyApprovalsOnWhatsApp'
  | 'locale'
  | 'timezone'
  | 'twoFactorEnabled'
  | 'createdAt'
>;

const PUBLIC_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  phone: true,
  notifyApprovalsOnWhatsApp: true,
  locale: true,
  timezone: true,
  twoFactorEnabled: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findPublicById(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: PUBLIC_SELECT,
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return user;
  }

  updatePasswordHash(id: string, passwordHash: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });
  }

  async updateProfile(
    id: string,
    input: {
      name?: string;
      avatarUrl?: string | null;
      phone?: string | null;
      notifyApprovalsOnWhatsApp?: boolean;
      locale?: string;
      timezone?: string;
    },
  ): Promise<PublicUser> {
    // Capta phone anterior pra detectar mudança e emitir evento depois.
    // Outros módulos (ex: Approvals) usam isso pra vincular reviewers
    // phone-only órfãos: pessoa cadastra phone X → approvals antigas com
    // mesmo X passam a aparecer na aba "Minhas" dela.
    let previousPhone: string | null | undefined;
    if (input.phone !== undefined) {
      const current = await this.prisma.user.findUnique({
        where: { id },
        select: { phone: true },
      });
      previousPhone = current?.phone ?? null;
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.notifyApprovalsOnWhatsApp !== undefined
          ? { notifyApprovalsOnWhatsApp: input.notifyApprovalsOnWhatsApp }
          : {}),
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      },
      select: PUBLIC_SELECT,
    });

    // Emite só se phone realmente mudou e novo phone não é null.
    if (input.phone !== undefined && input.phone && input.phone !== previousPhone) {
      this.events.emit('user.phone.changed', { userId: id, newPhone: input.phone });
    }

    return updated;
  }

  /**
   * Devolve preferências resolvidas (com defaults aplicados). Sempre retorna
   * todas as chaves canonicas pra UI nao precisar lidar com "ausente".
   */
  async getNotificationPreferences(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPreferences: true, notifyApprovalsOnWhatsApp: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return resolveNotificationPrefs(user);
  }

  /**
   * Merge das prefs recebidas com o storage atual. Caller pode mandar so
   * as chaves alteradas (PATCH parcial), sem risco de zerar o resto.
   */
  async updateNotificationPreferences(userId: string, patch: UpdateNotificationPreferencesRequest) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPreferences: true, notifyApprovalsOnWhatsApp: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    const current = (user.notificationPreferences ?? {}) as NotificationPreferences;
    const merged: NotificationPreferences = { ...current, ...patch };

    await this.prisma.user.update({
      where: { id: userId },
      data: { notificationPreferences: merged as Prisma.InputJsonValue },
    });

    return resolveNotificationPrefs({
      notificationPreferences: merged,
      notifyApprovalsOnWhatsApp: user.notifyApprovalsOnWhatsApp,
    });
  }
}
