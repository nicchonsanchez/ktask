import type { PrismaClient } from '@prisma/client';

/**
 * Soft-delete: injeta `deletedAt: null` em todas as operacoes de leitura
 * de Card e List quando o caller nao especificou esse campo no where.
 *
 * Caller que precisa ver registros na lixeira (TrashService, cron de purge)
 * deve usar `PrismaService.raw` ou passar `deletedAt: { not: null }` explicito.
 *
 * Aplicado via Proxy no construtor do PrismaService — substitui o `this`
 * retornado, mantendo tipagem PrismaClient pra todos os 189+ call sites
 * existentes sem refactor.
 */

const READ_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

const SOFT_DELETE_MODELS = new Set(['card', 'list']);

function injectFilter(args: any): any {
  const next = { ...(args ?? {}) };
  const where = { ...(next.where ?? {}) };
  if (where.deletedAt === undefined) {
    where.deletedAt = null;
  }
  next.where = where;
  return next;
}

function wrapDelegate<T extends object>(delegate: T): T {
  return new Proxy(delegate, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      if (typeof prop !== 'string' || !READ_OPERATIONS.has(prop)) {
        return (value as (...a: unknown[]) => unknown).bind(target);
      }
      return (args?: any) =>
        (value as (...a: unknown[]) => unknown).apply(target, [injectFilter(args)]);
    },
  }) as T;
}

const RAW_CLIENT = Symbol.for('ktask.prisma.rawClient');

export function applySoftDelete<T extends PrismaClient>(client: T): T {
  const proxy = new Proxy(client, {
    get(target, prop) {
      if (typeof prop === 'string' && SOFT_DELETE_MODELS.has(prop)) {
        // `target.card`/`target.list` sao getters dinamicos do PrismaClient —
        // chamar direto no target preserva o `this` interno do Prisma.
        const delegate = (target as unknown as Record<string, unknown>)[prop];
        return wrapDelegate(delegate as object);
      }
      const value = (target as unknown as Record<string | symbol, unknown>)[prop as string];
      if (typeof value === 'function') {
        return (value as (...a: unknown[]) => unknown).bind(target);
      }
      return value;
    },
  });
  (proxy as unknown as { [RAW_CLIENT]: T })[RAW_CLIENT] = client;
  return proxy;
}

export function getRawClient<T extends PrismaClient>(client: T): T {
  const raw = (client as unknown as { [RAW_CLIENT]?: T })[RAW_CLIENT];
  return raw ?? client;
}
