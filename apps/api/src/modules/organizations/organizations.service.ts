import { Injectable, NotFoundException } from '@nestjs/common';
import type { Organization } from '@prisma/client';
import { PrismaService } from '@/common/prisma/prisma.service';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Organization | null> {
    return this.prisma.organization.findUnique({ where: { id } });
  }

  findBySlug(slug: string): Promise<Organization | null> {
    return this.prisma.organization.findUnique({ where: { slug } });
  }

  /**
   * Organizações às quais o usuário pertence.
   */
  findForUser(userId: string): Promise<Array<{ org: Organization; role: string }>> {
    return this.prisma.membership
      .findMany({
        where: { userId },
        include: { organization: true },
        orderBy: { createdAt: 'asc' },
      })
      .then((rows) =>
        rows.map((m) => ({
          org: m.organization,
          role: m.role,
        })),
      );
  }

  async getOrThrow(id: string): Promise<Organization> {
    const org = await this.findById(id);
    if (!org || org.deletedAt) {
      throw new NotFoundException('Organização não encontrada.');
    }
    return org;
  }

  update(
    id: string,
    data: Partial<
      Pick<
        Organization,
        | 'name'
        | 'logoUrl'
        | 'timezone'
        | 'locale'
        | 'autoCompleteCardWhenAllFinal'
        | 'approvalReminderEnabled'
        | 'approvalReminderIntervalHours'
        | 'approvalReminderHourStart'
        | 'approvalReminderHourEnd'
        | 'approvalReminderMaxAttempts'
      >
    >,
  ) {
    return this.prisma.organization.update({
      where: { id },
      data,
    });
  }
}
