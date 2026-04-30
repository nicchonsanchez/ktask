import { z } from 'zod';
import { OrgPlanSchema, OrgRoleSchema } from './roles';

const slug = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9-]+$/, {
    message: 'Slug deve conter apenas letras minúsculas, números e hífens.',
  });

export const OrganizationSchema = z.object({
  id: z.string().cuid(),
  name: z.string(),
  slug: z.string(),
  logoUrl: z.string().url().nullable(),
  timezone: z.string(),
  locale: z.string(),
  plan: OrgPlanSchema,
  createdAt: z.string().datetime(),
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const CreateOrganizationRequestSchema = z.object({
  name: z.string().min(2).max(120).trim(),
  slug,
  timezone: z.string().optional(),
  locale: z.enum(['pt-BR', 'en', 'es']).optional(),
});
export type CreateOrganizationRequest = z.infer<typeof CreateOrganizationRequestSchema>;

export const UpdateOrganizationRequestSchema = CreateOrganizationRequestSchema.partial().extend({
  logoUrl: z.string().url().nullable().optional(),
});
export type UpdateOrganizationRequest = z.infer<typeof UpdateOrganizationRequestSchema>;

export const InviteMemberRequestSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  role: OrgRoleSchema.exclude(['OWNER']),
  /**
   * Telefone opcional pra disparar convite tambem via WhatsApp (doc 35).
   * Aceita formato livre — backend sanitiza pra digitos. Se informado,
   * precisa virar 10-15 digitos apos sanitizacao.
   */
  phone: z.string().optional(),
});
export type InviteMemberRequest = z.infer<typeof InviteMemberRequestSchema>;

export const UpdateMemberRoleRequestSchema = z.object({
  role: OrgRoleSchema,
});
export type UpdateMemberRoleRequest = z.infer<typeof UpdateMemberRoleRequestSchema>;

export const MembershipSchema = z.object({
  id: z.string().cuid(),
  userId: z.string().cuid(),
  organizationId: z.string().cuid(),
  role: OrgRoleSchema,
  createdAt: z.string().datetime(),
  user: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string().email(),
      avatarUrl: z.string().url().nullable(),
    })
    .optional(),
});
export type Membership = z.infer<typeof MembershipSchema>;
