import { z } from 'zod';

/**
 * No MVP aceitamos duas formas:
 *   1. `body` já como JSON (Tiptap/ProseMirror) e `plainText` separado
 *   2. Só `plainText` (string). Nesse caso o body vira um doc ProseMirror-like simples
 *      com um parágrafo.
 */
export const CreateCommentSchema = z.object({
  cardId: z.string().cuid(),
  plainText: z.string().min(1).max(10_000).trim(),
  body: z.unknown().optional(),
  /**
   * Quando setado, marca este comment como reply do parent. Backend faz
   * "flatten": se o parent ja eh reply (tem parentCommentId), redireciona
   * pra raiz — threads ficam sempre com 1 nivel de indentacao.
   */
  parentCommentId: z.string().cuid().optional(),
});
export type CreateCommentRequest = z.infer<typeof CreateCommentSchema>;

export const UpdateCommentSchema = z.object({
  plainText: z.string().min(1).max(10_000).trim(),
  body: z.unknown().optional(),
});
export type UpdateCommentRequest = z.infer<typeof UpdateCommentSchema>;

/**
 * Set fechado de emojis aceitos pra reacao. Mantemos no schema (nao em
 * env) pra que o validador rejeite emojis arbitrarios. Inclui Apple/Google
 * variation selectors quando necessario.
 */
export const ALLOWED_REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '👀'] as const;
export type ReactionEmoji = (typeof ALLOWED_REACTION_EMOJIS)[number];

export const ToggleReactionSchema = z.object({
  emoji: z.enum(ALLOWED_REACTION_EMOJIS),
});
export type ToggleReactionRequest = z.infer<typeof ToggleReactionSchema>;
