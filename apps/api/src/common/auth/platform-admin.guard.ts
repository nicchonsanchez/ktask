import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AuthenticatedRequestContext } from '@/modules/auth/auth.types';

/**
 * Guard pra rotas de administracao GLOBAL da plataforma KTask (fora de qualquer Org).
 *
 * Acesso restrito a emails declarados em PLATFORM_ADMIN_EMAILS (comma-separated, .env).
 * Sem mecanismo de role no schema — auth-via-env eh suficiente pra escopo
 * pequeno (donos da plataforma). Quando crescer, migrar pra flag no User ou
 * tabela dedicada.
 *
 * Caso de uso primario: cadastro de Service Providers da federacao OAuth2/OIDC
 * (sistemas externos como Ogma que consomem KTask como Identity Provider).
 * Ver tarefas-md/51-federacao-idp-para-ogma.md.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedRequestContext;
    }>();

    const user = request.user;
    if (!user?.userId) {
      throw new ForbiddenException('Autenticacao obrigatoria.');
    }

    const raw = this.config.get<string>('PLATFORM_ADMIN_EMAILS') ?? '';
    const allowedEmails = raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (allowedEmails.length === 0) {
      // Sem configuracao -> ninguem entra. Mais seguro do que liberar geral.
      throw new ForbiddenException('Acesso global nao configurado.');
    }

    const userEmail = user.email.toLowerCase();
    if (!allowedEmails.includes(userEmail)) {
      throw new ForbiddenException('Acesso restrito a admin de plataforma.');
    }

    return true;
  }
}
