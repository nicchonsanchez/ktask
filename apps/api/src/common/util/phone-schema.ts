import { z } from 'zod';

/**
 * Schema Zod pra campo de telefone que aceita input formatado
 * ("+55 (31) 99988-7777", "55 31 99988 7777") e normaliza pra dígitos
 * puros antes de validar (10-15 dígitos = DDI+DDD+número).
 *
 * Uso pra schemas de API que recebem phone como dígitos puros internamente.
 *
 * Variantes:
 *   - PhoneRequiredSchema: obriga phone valido
 *   - PhoneOptionalSchema: aceita undefined
 *   - PhoneNullableSchema: aceita null e ""
 */
export const PhoneRequiredSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => /^\d{10,15}$/.test(v), {
    message: 'Telefone deve ter de 10 a 15 dígitos (DDI + DDD + número).',
  });

export const PhoneOptionalSchema = z
  .union([z.string(), z.literal('')])
  .optional()
  .transform((v) => {
    if (v === undefined || v === '') return undefined;
    return v.replace(/\D/g, '');
  })
  .refine((v) => v === undefined || /^\d{10,15}$/.test(v), {
    message: 'Telefone deve ter de 10 a 15 dígitos.',
  });

export const PhoneNullableSchema = z
  .union([z.string(), z.literal(''), z.null()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === '') return null;
    return v.replace(/\D/g, '');
  })
  .refine((v) => v === null || /^\d{10,15}$/.test(v), {
    message: 'Telefone deve ter de 10 a 15 dígitos.',
  });
