import { z } from 'zod';

/**
 * DTOs do módulo `me` — endpoints da página inicial pessoal (home).
 */

export const BulkRescheduleTodaySchema = z.object({
  /** ids dos ChecklistItems a serem reagendados pra hoje. */
  ids: z.array(z.string().cuid()).min(1).max(500),
});
export type BulkRescheduleTodayRequest = z.infer<typeof BulkRescheduleTodaySchema>;

export const CalendarQuerySchema = z.object({
  /** Mês no formato YYYY-MM. Default: mês corrente. */
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});
export type CalendarQuery = z.infer<typeof CalendarQuerySchema>;
