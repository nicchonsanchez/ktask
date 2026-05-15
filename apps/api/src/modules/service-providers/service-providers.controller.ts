import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PlatformAdminGuard } from '@/common/auth/platform-admin.guard';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';

import {
  CreateServiceProviderSchema,
  UpdateServiceProviderSchema,
  type CreateServiceProviderRequest,
  type UpdateServiceProviderRequest,
} from './dto/service-providers.schemas';
import { ServiceProvidersService } from './service-providers.service';

/**
 * Endpoints de administracao GLOBAL de Service Providers (federacao OAuth2/OIDC).
 *
 * Restritos a admin de plataforma via PlatformAdminGuard (email em
 * PLATFORM_ADMIN_EMAILS). Ver tarefas-md/51-federacao-idp-para-ogma.md.
 *
 *   GET    /v1/platform/service-providers       -> lista
 *   POST   /v1/platform/service-providers       -> cria (retorna secret 1x)
 *   GET    /v1/platform/service-providers/:id   -> detalhe
 *   PATCH  /v1/platform/service-providers/:id   -> edita (pode rotacionar secret)
 *   DELETE /v1/platform/service-providers/:id   -> remove
 */
@ApiTags('platform/service-providers')
@ApiBearerAuth()
@UseGuards(PlatformAdminGuard)
@Controller({ path: 'platform/service-providers', version: '1' })
export class ServiceProvidersController {
  constructor(private readonly service: ServiceProvidersService) {}

  @Get()
  @ApiOperation({ summary: 'Lista todos os Service Providers (admin de plataforma)' })
  list() {
    return this.service.list();
  }

  @Post()
  @ApiOperation({
    summary:
      'Cria Service Provider. Retorna secret HMAC em plaintext APENAS 1x — armazene de forma segura.',
  })
  create(
    @Body(new ZodValidationPipe(CreateServiceProviderSchema)) body: CreateServiceProviderRequest,
  ) {
    return this.service.create(body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do Service Provider' })
  getOne(@Param('id') id: string) {
    return this.service.getOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edita Service Provider. Use rotacionarSecret=true pra gerar novo secret.',
  })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateServiceProviderSchema)) body: UpdateServiceProviderRequest,
  ) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove Service Provider (hard delete)' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
