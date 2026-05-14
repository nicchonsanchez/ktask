import { z } from 'zod';

export const SupportCategoryEnum = z.enum(['duvida', 'problema', 'sugestao', 'outro']);
export type SupportCategory = z.infer<typeof SupportCategoryEnum>;

export const CATEGORY_LABELS: Record<SupportCategory, string> = {
  duvida: 'Dúvida',
  problema: 'Problema',
  sugestao: 'Sugestão',
  outro: 'Outro',
};

/**
 * Campos opcionais que aceitam string vazia do frontend. Browser nativo envia
 * "" pra inputs vazios; sem isso o Zod rejeita por causa do .url()/min().
 */
const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

export const CreateSupportTicketSchema = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome.').max(100),
  email: z.string().trim().email('E-mail inválido.').max(200),
  telefone: z.preprocess(emptyToUndefined, z.string().trim().max(40).optional()),
  categoria: SupportCategoryEnum,
  mensagem: z
    .string()
    .trim()
    .min(10, 'Conte um pouco mais (mínimo 10 caracteres).')
    .max(2000, 'Mensagem muito longa (máximo 2000 caracteres).'),
  urlOrigem: z.preprocess(emptyToUndefined, z.string().url().max(500).optional()),
  /**
   * Honeypot: campo invisível pro usuário. Bots de spam preenchem.
   * Se vier setado, o service rejeita silenciosamente (resposta genérica
   * pra não dar pista pro bot).
   */
  website: z.preprocess(emptyToUndefined, z.string().max(0).optional()),
});
export type CreateSupportTicketDto = z.infer<typeof CreateSupportTicketSchema>;
