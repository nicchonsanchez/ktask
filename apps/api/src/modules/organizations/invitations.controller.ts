import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { Public } from '@/modules/auth/decorators/public.decorator';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '@/modules/auth/auth.types';

import { InvitationsService } from './invitations.service';

const AcceptSchema = z.object({ token: z.string().min(10) });

@ApiTags('invitations')
@Controller({ path: 'invitations', version: '1' })
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Public()
  @Get(':token')
  @ApiOperation({ summary: 'Preview de convite público (valida token)' })
  async preview(@Param('token') rawToken: string) {
    const inv = await this.invitations.previewByRawToken(rawToken);
    return {
      email: inv.email,
      role: inv.role,
      expiresAt: inv.expiresAt.toISOString(),
      organization: inv.organization,
      // Doc 34: usuario novo precisa de form de cadastro; existente loga e aceita.
      userExists: inv.userExists,
    };
  }

  @Post('accept')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Aceitar convite com o usuário autenticado' })
  async accept(
    @CurrentUser() user: AuthenticatedRequestContext,
    @Body(new ZodValidationPipe(AcceptSchema)) body: z.infer<typeof AcceptSchema>,
  ) {
    const org = await this.invitations.accept({ token: body.token, userId: user.userId });
    return {
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
      },
    };
  }
}
