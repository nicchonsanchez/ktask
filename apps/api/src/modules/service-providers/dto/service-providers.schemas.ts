import { z } from 'zod';

/**
 * Eventos suportados pra webhook dispatcher. Lista canonica, mantida em sync
 * com WebhookDispatcherService (etapa 3 do plano de federacao).
 *
 * Ver tarefas-md/51-federacao-idp-para-ogma.md.
 */
export const ServiceProviderEventos = [
  'usuario.email_alterado',
  'usuario.senha_alterada',
  'usuario.desativado',
  'usuario.removido',
  'organizacao.atualizada',
] as const;

export type ServiceProviderEvento = (typeof ServiceProviderEventos)[number];

export const CreateServiceProviderSchema = z.object({
  nome: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
      message: 'Slug deve ser minusculo, alfanumerico com hifens, sem comecar/terminar com hifen.',
    }),
  webhookUrl: z.string().url().max(500),
  escopo: z.array(z.enum(ServiceProviderEventos)).min(1, {
    message: 'Informe ao menos 1 evento.',
  }),
  ativo: z.boolean().optional(),
  notas: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
export type CreateServiceProviderRequest = z.infer<typeof CreateServiceProviderSchema>;

export const UpdateServiceProviderSchema = CreateServiceProviderSchema.partial().extend({
  /**
   * Quando true, gera novo secret HMAC e retorna em plaintext (1x).
   * Invalida qualquer assinatura anterior.
   */
  rotacionarSecret: z.boolean().optional(),
});
export type UpdateServiceProviderRequest = z.infer<typeof UpdateServiceProviderSchema>;
