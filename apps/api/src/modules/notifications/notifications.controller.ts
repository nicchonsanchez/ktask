import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '@/modules/auth/auth.types';

import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar notificações do usuário (padrão: todas, últimas 50)' })
  list(
    @CurrentUser() user: AuthenticatedRequestContext,
    @Query('unread') unread?: string,
    @Query('take') take?: string,
  ) {
    return this.notifications.list(user.userId, {
      onlyUnread: unread === 'true' || unread === '1',
      take: take ? Number(take) : undefined,
    });
  }

  @Get('page')
  @ApiOperation({
    summary: 'Histórico paginado (cursor-based)',
    description:
      'Pra tela /notificacoes. Sem `cursor`, primeira página. Resposta `{ items, nextCursor }`. `nextCursor=null` quando acabou.',
  })
  paginate(
    @CurrentUser() user: AuthenticatedRequestContext,
    @Query('take') take?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.notifications.listPaginated(user.userId, {
      take: take ? Number(take) : undefined,
      cursor: cursor || undefined,
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Quantidade de notificações não lidas' })
  async unreadCount(@CurrentUser() user: AuthenticatedRequestContext) {
    const count = await this.notifications.countUnread(user.userId);
    return { count };
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Marcar notificação como lida' })
  markRead(@CurrentUser() user: AuthenticatedRequestContext, @Param('id') id: string) {
    return this.notifications.markAsRead(user.userId, id);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Marcar todas como lidas' })
  markAllRead(@CurrentUser() user: AuthenticatedRequestContext) {
    return this.notifications.markAllAsRead(user.userId);
  }
}
