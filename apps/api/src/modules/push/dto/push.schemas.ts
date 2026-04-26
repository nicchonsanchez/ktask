import { z } from 'zod';

export const SubscribePushSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().max(500).optional(),
});
export type SubscribePushRequest = z.infer<typeof SubscribePushSchema>;
