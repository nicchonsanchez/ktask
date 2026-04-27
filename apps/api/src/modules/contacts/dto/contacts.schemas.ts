import { z } from 'zod';

export const ContactTypeSchema = z.enum(['PERSON', 'COMPANY']);

export const CreateContactSchema = z.object({
  type: ContactTypeSchema,
  name: z.string().trim().min(1).max(200),
  email: z
    .string()
    .email()
    .max(200)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  document: z
    .string()
    .trim()
    .max(40)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  note: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  parentId: z.string().min(1).optional().nullable(),
});
export type CreateContactRequest = z.infer<typeof CreateContactSchema>;

export const UpdateContactSchema = CreateContactSchema.partial();
export type UpdateContactRequest = z.infer<typeof UpdateContactSchema>;

/**
 * Body do POST /cards/:id/contacts pode ser:
 *   { contactId: '...' } -> linka contato existente
 *   { name, type, email?, phone? } -> cria contato novo + linka num passo
 */
export const LinkContactSchema = z.union([
  z.object({ contactId: z.string().min(1) }),
  CreateContactSchema, // shape de criacao
]);
export type LinkContactRequest = z.infer<typeof LinkContactSchema>;

export const ListContactsQuerySchema = z.object({
  type: ContactTypeSchema.optional(),
  q: z.string().trim().max(100).optional(),
  parentId: z.string().min(1).optional(),
  hasCards: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
});
export type ListContactsQuery = z.infer<typeof ListContactsQuerySchema>;
