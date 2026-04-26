import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import {
  ChangePasswordRequestSchema,
  UpdateProfileRequestSchema,
  type ChangePasswordRequest,
  type UpdateProfileRequest,
  type User as UserContract,
} from '@ktask/contracts';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '@/modules/auth/auth.types';
import { AuthService } from '@/modules/auth/auth.service';
import { StorageService } from '@/modules/storage/storage.service';

import { UsersService } from './users.service';

const ALLOWED_AVATAR_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'] as const;

const AvatarPresignRequestSchema = z.object({
  contentType: z.enum(ALLOWED_AVATAR_MIMES, {
    errorMap: () => ({ message: 'Formato não suportado. Use PNG, JPEG, WEBP ou AVIF.' }),
  }),
});
type AvatarPresignRequest = z.infer<typeof AvatarPresignRequestSchema>;

@ApiTags('users')
@ApiBearerAuth()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly storage: StorageService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Dados do usuário autenticado' })
  async me(@CurrentUser() user: AuthenticatedRequestContext): Promise<UserContract> {
    const me = await this.users.findPublicById(user.userId);
    return {
      id: me.id,
      email: me.email,
      name: me.name,
      avatarUrl: me.avatarUrl,
      phone: me.phone,
      notifyApprovalsOnWhatsApp: me.notifyApprovalsOnWhatsApp,
      locale: me.locale,
      timezone: me.timezone,
      twoFactorEnabled: me.twoFactorEnabled,
      createdAt: me.createdAt.toISOString(),
    };
  }

  @Patch('me')
  @ApiOperation({ summary: 'Atualiza o próprio perfil' })
  async updateMe(
    @CurrentUser() user: AuthenticatedRequestContext,
    @Body(new ZodValidationPipe(UpdateProfileRequestSchema)) body: UpdateProfileRequest,
  ): Promise<UserContract> {
    const updated = await this.users.updateProfile(user.userId, body);
    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      avatarUrl: updated.avatarUrl,
      phone: updated.phone,
      notifyApprovalsOnWhatsApp: updated.notifyApprovalsOnWhatsApp,
      locale: updated.locale,
      timezone: updated.timezone,
      twoFactorEnabled: updated.twoFactorEnabled,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  @Post('me/change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Trocar a própria senha (invalida outras sessões)' })
  async changePassword(
    @CurrentUser() user: AuthenticatedRequestContext,
    @Body(new ZodValidationPipe(ChangePasswordRequestSchema)) body: ChangePasswordRequest,
  ): Promise<void> {
    await this.auth.changePassword(user.userId, body.currentPassword, body.newPassword);
  }

  @Post('me/avatar/presigned-url')
  @ApiOperation({
    summary: 'Gera URL pré-assinada pra upload do avatar',
    description:
      'Cliente faz PUT na uploadUrl retornada com o arquivo cru, depois chama PATCH /users/me passando o avatarUrl.',
  })
  async presignAvatar(
    @CurrentUser() user: AuthenticatedRequestContext,
    @Body(new ZodValidationPipe(AvatarPresignRequestSchema)) body: AvatarPresignRequest,
  ) {
    if (!this.storage.isEnabled()) {
      throw new BadRequestException(
        'Upload de foto não está configurado neste ambiente. Fale com o administrador.',
      );
    }
    return this.storage.presignUpload({
      keyPrefix: `avatars/${user.userId}`,
      contentType: body.contentType,
      maxSize: 5 * 1024 * 1024, // 5MB
      ttl: 120,
    });
  }
}
