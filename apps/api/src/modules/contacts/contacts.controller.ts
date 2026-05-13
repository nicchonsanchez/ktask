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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';
import { TenantGuard } from '@/common/tenant/tenant.guard';
import { CurrentOrg } from '@/common/tenant/current-org.decorator';
import type { TenantContext } from '@/common/tenant/tenant.types';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import type { AuthenticatedRequestContext } from '@/modules/auth/auth.types';

import { ContactsService } from './contacts.service';
import {
  CreateContactSchema,
  UpdateContactSchema,
  ListContactsQuerySchema,
  LinkContactSchema,
  LinkUserToContactSchema,
  type CreateContactRequest,
  type UpdateContactRequest,
  type LinkContactRequest,
  type LinkUserToContactRequest,
} from './dto/contacts.schemas';

/**
 * Endpoints de contatos (CRM lite):
 *   GET    /v1/contacts                     -> agenda
 *   POST   /v1/contacts                     -> cria contato (GESTOR+)
 *   GET    /v1/contacts/:id                 -> detalhe + cards vinculados
 *   PATCH  /v1/contacts/:id                 -> edita (GESTOR+)
 *   DELETE /v1/contacts/:id                 -> soft delete (ADMIN+)
 *   GET    /v1/cards/:cardId/contacts       -> contatos vinculados ao card
 *   POST   /v1/cards/:cardId/contacts       -> linka existente OU cria-e-linka
 *   DELETE /v1/cards/:cardId/contacts/:id   -> desvincula
 */
@ApiTags('contacts')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller({ version: '1' })
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get('contacts')
  @ApiOperation({ summary: 'Lista contatos da Org (agenda)' })
  list(
    @CurrentOrg() org: TenantContext,
    @Query(new ZodValidationPipe(ListContactsQuerySchema)) query: Record<string, unknown>,
  ) {
    return this.contacts.list(org, query as Parameters<ContactsService['list']>[1]);
  }

  @Post('contacts')
  @ApiOperation({ summary: 'Cria contato (GESTOR+)' })
  create(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Body(new ZodValidationPipe(CreateContactSchema)) body: CreateContactRequest,
  ) {
    return this.contacts.create(user.userId, org, body);
  }

  @Get('contacts/:id')
  @ApiOperation({ summary: 'Detalhe do contato + cards vinculados' })
  getOne(@CurrentOrg() org: TenantContext, @Param('id') id: string) {
    return this.contacts.getOne(org, id);
  }

  @Patch('contacts/:id')
  @ApiOperation({ summary: 'Edita contato (GESTOR+)' })
  update(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateContactSchema)) body: UpdateContactRequest,
  ) {
    return this.contacts.update(user.userId, org, id, body);
  }

  @Delete('contacts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete do contato (ADMIN+)' })
  async remove(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('id') id: string,
  ) {
    await this.contacts.remove(user.userId, org, id);
  }

  @Get('cards/:cardId/contacts')
  @ApiOperation({ summary: 'Contatos vinculados a um card' })
  listForCard(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
  ) {
    return this.contacts.listForCard(user.userId, org, cardId);
  }

  @Post('cards/:cardId/contacts')
  @ApiOperation({ summary: 'Vincula contato existente OU cria-e-vincula' })
  linkToCard(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
    @Body(new ZodValidationPipe(LinkContactSchema)) body: LinkContactRequest,
  ) {
    return this.contacts.linkToCard(user.userId, org, cardId, body);
  }

  @Delete('cards/:cardId/contacts/:contactId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desvincula contato do card' })
  async unlinkFromCard(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('cardId') cardId: string,
    @Param('contactId') contactId: string,
  ) {
    await this.contacts.unlinkFromCard(user.userId, org, cardId, contactId);
  }

  @Post('contacts/:id/link-user')
  @ApiOperation({ summary: 'Vincula contato a um usuário da Org (GESTOR+)' })
  linkToUser(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(LinkUserToContactSchema)) body: LinkUserToContactRequest,
  ) {
    return this.contacts.linkToUser(user.userId, org, id, body.userId);
  }

  @Delete('contacts/:id/link-user')
  @ApiOperation({ summary: 'Remove vínculo do contato com o usuário (GESTOR+)' })
  unlinkFromUser(
    @CurrentUser() user: AuthenticatedRequestContext,
    @CurrentOrg() org: TenantContext,
    @Param('id') id: string,
  ) {
    return this.contacts.unlinkFromUser(user.userId, org, id);
  }

  @Get('users/:userId/contact-suggestions')
  @ApiOperation({ summary: 'Sugere Contacts pra vincular a um User (match email/phone)' })
  suggestionsForUser(@CurrentOrg() org: TenantContext, @Param('userId') userId: string) {
    return this.contacts.suggestionsForUser(org, userId);
  }
}
