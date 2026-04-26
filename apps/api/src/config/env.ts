import { z } from 'zod';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: '.env' });
loadDotenv({ path: '.env.local', override: true });

/**
 * Trata strings vazias de .env como undefined (já que Zod `.optional()` não aceita "").
 * Permite escrever `KEY=` no .env sem quebrar validação dos campos opcionais.
 */
const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema) as unknown as T;

const optionalUrl = () => emptyToUndefined(z.string().url().optional());
const optionalString = () => emptyToUndefined(z.string().optional());
const optionalHexKey = (len: number) => emptyToUndefined(z.string().length(len).optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  // TTL do refresh token quando "Permanecer logado" está marcado (default no app).
  JWT_REFRESH_TTL: z.string().default('90d'),
  // TTL do refresh token quando "Permanecer logado" está DESMARCADO no login.
  // Sessão curta — útil em equipamentos compartilhados.
  JWT_REFRESH_TTL_SHORT: z.string().default('1d'),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) => s.split(',').map((o) => o.trim())),

  S3_ENDPOINT: optionalUrl(),
  /**
   * Endpoint PÚBLICO (acessível pelo browser). Usado pra gerar URLs
   * pré-assinadas e URLs de leitura. Se omitido, usa S3_ENDPOINT —
   * só funciona em dev ou quando o storage está exposto diretamente.
   */
  S3_PUBLIC_ENDPOINT: optionalUrl(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('ktask-attachments'),
  S3_ACCESS_KEY: optionalString(),
  S3_SECRET_KEY: optionalString(),
  /** @deprecated substituido por S3_PUBLIC_ENDPOINT */
  S3_PUBLIC_URL: optionalUrl(),

  EMAIL_FROM: z.string().default('KTask <noreply@ktask.local>'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: optionalString(),
  SMTP_PASS: optionalString(),

  EVOLUTION_DEFAULT_URL: optionalUrl(),
  EVOLUTION_DEFAULT_API_KEY: optionalString(),
  EVOLUTION_DEFAULT_INSTANCE: optionalString(),

  INTEGRATION_ENCRYPTION_KEY: optionalHexKey(64),

  // Web Push (PWA notifications). Sem essas creds o módulo de push fica
  // desabilitado e os endpoints respondem 503 explicando.
  VAPID_PUBLIC_KEY: optionalString(),
  VAPID_PRIVATE_KEY: optionalString(),
  VAPID_SUBJECT: z.string().default('mailto:noreply@ktask.local'),

  SENTRY_DSN: optionalUrl(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[ERROR] Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
