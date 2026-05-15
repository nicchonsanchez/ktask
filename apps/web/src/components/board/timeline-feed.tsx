'use client';

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CornerDownRight,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Pencil,
  Send,
  SmilePlus,
  Trash2,
  X,
} from 'lucide-react';

import { Button } from '@ktask/ui';
import {
  cardsQueries,
  createComment,
  deleteComment,
  removeAttachment,
  toggleCommentReaction,
  updateComment,
  uploadAttachmentForComment,
  ALLOWED_REACTION_EMOJIS,
  type ActivityNode,
  type Attachment,
  type CommentNode,
  type CommentReactionNode,
  type ReactionEmoji,
} from '@/lib/queries/cards';
import { ApiError, NetworkError } from '@/lib/api-client';
import { formatRelativeTime, proseToPlainText } from '@/lib/prose';
import { activityParts } from '@/lib/activity-format';
import { renderInlineMentions } from '@/lib/mentions';
import { orgMembersQuery } from '@/lib/queries/cards';
import { UserAvatar } from '@/components/user-avatar';
import { useConfirm } from '@/components/ui/dialogs';
import { useAuthStore } from '@/stores/auth-store';
import { MentionTextarea } from './mention-textarea';

type TabKey = 'all' | 'comments' | 'mine' | 'records';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'comments', label: 'Anotações' },
  { key: 'mine', label: 'Minhas anotações' },
  { key: 'records', label: 'Registros' },
];

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB (alinhado com backend)

type FeedItem =
  | { kind: 'comment'; at: string; comment: CommentNode }
  | { kind: 'activity'; at: string; activity: ActivityNode };

interface TimelineFeedProps {
  cardId: string;
  boardId: string;
  comments: CommentNode[];
  activities: ActivityNode[];
}

/**
 * Handle exposto via ref pra que o card-modal possa empurrar arquivos
 * direto no composer quando o user arrasta um arquivo na coluna direita
 * (fora da textarea, mas dentro da timeline). Sem isso, o drag-and-drop
 * "wide" da coluna nao consegue popular o `pending` interno daqui.
 */
export interface TimelineFeedHandle {
  addFiles: (files: File[] | FileList) => void;
}

export const TimelineFeed = forwardRef<TimelineFeedHandle, TimelineFeedProps>(function TimelineFeed(
  { cardId, boardId, comments, activities },
  externalRef,
) {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [tab, setTab] = useState<TabKey>('all');
  const [text, setText] = useState('');
  const [pending, setPending] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileImageRef = useRef<HTMLInputElement>(null);
  const fileAnyRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: cardsQueries.detail(cardId).queryKey });
    queryClient.invalidateQueries({ queryKey: ['boards', boardId] });
  }

  function addFiles(list: FileList | File[]) {
    const arr = Array.from(list);
    const tooBig = arr.find((f) => f.size > MAX_FILE_SIZE);
    if (tooBig) {
      setError(`"${tooBig.name}" tem mais de 25MB. Limite por arquivo é 25MB.`);
      return;
    }
    setError(null);
    setPending((prev) => [...prev, ...arr]);
  }

  useImperativeHandle(externalRef, () => ({ addFiles }), []);

  function removePending(index: number) {
    setPending((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    const trimmed = text.trim();
    if (trimmed.length === 0 && pending.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      // Cria comment (mesmo se só tiver anexos, mandamos texto vazio com 1 espaço
      // pra o backend aceitar — alternativa: ajustar backend pra aceitar body vazio
      // se houver anexos. Por agora, se só anexos, mando "[anexo]" como placeholder)
      const placeholder = trimmed.length > 0 ? trimmed : '[anexo]';
      const created = await createComment({ cardId, plainText: placeholder });
      // Sobe anexos sequencialmente. Se algum falhar, mostra erro mas mantém os
      // que subiram (comment já existe).
      const failed: string[] = [];
      for (const file of pending) {
        try {
          await uploadAttachmentForComment(created.id, file);
        } catch (err) {
          failed.push(`${file.name}: ${err instanceof Error ? err.message : 'erro'}`);
        }
      }
      setText('');
      setPending([]);
      invalidate();
      if (failed.length > 0) {
        setError(`Alguns anexos falharam:\n${failed.join('\n')}`);
      }
    } catch (err) {
      // Categoriza pra mensagem util ao user:
      // - ApiError: usa mensagem do servidor (ex: validacao, permissao)
      // - NetworkError: rede/CORS/offline — pt-BR ja vem boa do api-client
      // - resto: bug do client, loga e mostra fallback generico
      if (err instanceof ApiError || err instanceof NetworkError) {
        setError(err.message);
      } else {
        console.error('[timeline submit]', err);
        setError('Erro ao enviar anotação. Verifique o console pra detalhes.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Drag-drop handlers (formulário). stopPropagation em TODOS os eventos
  // pra nao vazar pro card-modal — caso contrario o pane direito do modal
  // capturava o mesmo drop via bubble e chamava addFiles 2x (duplicava o
  // anexo no composer).
  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (Array.from(e.dataTransfer.types).includes('Files')) {
      dragCounter.current += 1;
      setDragActive(true);
    }
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setDragActive(false);
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragActive(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }

  // Indexa replies por parentCommentId. Cada root comment recebe seus filhos
  // via `repliesByParent[c.id]`. Replies em si NAO entram no feed (sao
  // renderizadas nested dentro do CommentItem da raiz).
  const repliesByParent = useMemo(() => {
    const map = new Map<string, CommentNode[]>();
    for (const c of comments) {
      if (c.parentCommentId && !c.deletedAt) {
        const arr = map.get(c.parentCommentId) ?? [];
        arr.push(c);
        map.set(c.parentCommentId, arr);
      }
    }
    // Ordena replies por createdAt asc (cronologico)
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    }
    return map;
  }, [comments]);

  const items = useMemo<FeedItem[]>(() => {
    const commentItems = comments
      .filter((c) => !c.deletedAt && !c.parentCommentId) // so raizes no feed
      .map<FeedItem>((c) => ({ kind: 'comment', at: c.createdAt, comment: c }));

    const activityItems = activities
      .filter(
        (a) =>
          a.type !== 'COMMENT_ADDED' && a.type !== 'COMMENT_EDITED' && a.type !== 'COMMENT_DELETED',
      )
      .map<FeedItem>((a) => ({ kind: 'activity', at: a.createdAt, activity: a }));

    const merged = [...commentItems, ...activityItems];
    merged.sort((a, b) => (a.at < b.at ? 1 : -1));

    switch (tab) {
      case 'comments':
        return merged.filter((i) => i.kind === 'comment');
      case 'mine':
        return merged.filter((i) => i.kind === 'comment' && i.comment.authorId === user?.id);
      case 'records':
        return merged.filter((i) => i.kind === 'activity');
      default:
        return merged;
    }
  }, [comments, activities, tab, user?.id]);

  return (
    <div
      className="flex h-full flex-col"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className={`flex flex-col gap-2 pb-3 ${dragActive ? 'ring-primary ring-offset-bg rounded-md ring-2 ring-offset-2' : ''}`}
      >
        <MentionTextarea
          value={text}
          onChange={setText}
          onSubmit={handleSubmit}
          rows={3}
          placeholder="Escreva uma anotação. Use @ para mencionar. Arraste arquivos aqui ou use os botões abaixo."
        />

        {/* Pending attachments */}
        {pending.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {pending.map((file, i) => (
              <li
                key={`${file.name}-${i}`}
                className="bg-bg-muted border-border inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
              >
                {file.type.startsWith('image/') ? (
                  <ImageIcon size={12} className="text-primary" />
                ) : (
                  <FileText size={12} className="text-fg-muted" />
                )}
                <span className="max-w-[160px] truncate">{file.name}</span>
                <span className="text-fg-subtle text-[10px]">{formatBytes(file.size)}</span>
                <button
                  type="button"
                  onClick={() => removePending(i)}
                  className="text-fg-muted hover:text-danger"
                  aria-label={`Remover ${file.name}`}
                >
                  <X size={11} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p className="bg-danger-subtle text-danger whitespace-pre-line rounded-md px-3 py-2 text-xs">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => fileImageRef.current?.click()}
              className="text-fg-muted hover:bg-bg-muted hover:text-fg inline-flex items-center gap-1 rounded p-1.5 text-[11px]"
              title="Anexar imagem"
              aria-label="Anexar imagem"
            >
              <ImageIcon size={14} />
            </button>
            <button
              type="button"
              onClick={() => fileAnyRef.current?.click()}
              className="text-fg-muted hover:bg-bg-muted hover:text-fg inline-flex items-center gap-1 rounded p-1.5 text-[11px]"
              title="Anexar arquivo"
              aria-label="Anexar arquivo"
            >
              <Paperclip size={14} />
            </button>
            <input
              ref={fileImageRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <input
              ref={fileAnyRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <span className="text-fg-subtle ml-2 text-[11px]">Ctrl/⌘ + Enter envia</span>
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={submitting || (text.trim().length === 0 && pending.length === 0)}
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            <Send size={14} />
            Enviar
          </Button>
        </div>
      </form>

      <div className="border-border flex flex-wrap items-center gap-x-1 gap-y-1 border-b pb-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
              tab === t.key ? 'text-primary bg-primary-subtle' : 'text-fg-muted hover:text-fg'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ul className="flex flex-1 flex-col gap-5 overflow-y-auto pt-4">
        {items.length === 0 ? (
          <li className="text-fg-muted py-6 text-center text-xs">Nada por aqui ainda.</li>
        ) : (
          items.map((item) =>
            item.kind === 'comment' ? (
              <CommentItem
                key={`c-${item.comment.id}`}
                comment={item.comment}
                replies={repliesByParent.get(item.comment.id) ?? []}
                currentUserId={user?.id ?? null}
                cardId={cardId}
                boardId={boardId}
              />
            ) : (
              <ActivityItem key={`a-${item.activity.id}`} activity={item.activity} />
            ),
          )
        )}
      </ul>
    </div>
  );
});

function CommentItem({
  comment,
  replies = [],
  currentUserId,
  cardId,
  boardId,
  /** Quando true, comment eh uma reply renderizada nested — esconde botoes redundantes (Responder). */
  nested = false,
}: {
  comment: CommentNode;
  replies?: CommentNode[];
  currentUserId: string | null;
  cardId: string;
  boardId: string;
  nested?: boolean;
}) {
  const isAuthor = currentUserId === comment.authorId;
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const orgMembers = useQuery(orgMembersQuery);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: cardsQueries.detail(cardId).queryKey });
    queryClient.invalidateQueries({ queryKey: ['boards', boardId] });
  }

  const replyMut = useMutation({
    mutationFn: () =>
      createComment({
        cardId,
        plainText: replyDraft.trim(),
        parentCommentId: comment.id,
      }),
    onSuccess: () => {
      setReplyDraft('');
      setReplyOpen(false);
      invalidate();
    },
  });

  const reactionMut = useMutation({
    mutationFn: (emoji: ReactionEmoji) => toggleCommentReaction(comment.id, emoji),
    onSuccess: () => {
      setEmojiPickerOpen(false);
      invalidate();
    },
  });

  const updateMut = useMutation({
    mutationFn: () => updateComment(comment.id, { plainText: draft.trim() }),
    onSuccess: () => {
      invalidate();
      setEditing(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteComment(comment.id),
    onSuccess: invalidate,
  });

  const removeAttMut = useMutation({
    mutationFn: (attachmentId: string) => removeAttachment(attachmentId),
    onSuccess: invalidate,
  });

  const plain = proseToPlainText(comment.body);
  const showPlaceholder = plain === '[anexo]';
  const attachments = comment.attachments ?? [];
  const images = attachments.filter((a) => a.kind === 'IMAGE');
  const others = attachments.filter((a) => a.kind !== 'IMAGE');

  return (
    <li className="flex gap-3 py-1">
      <UserAvatar
        name={comment.author.name}
        userId={comment.author.id}
        avatarUrl={comment.author.avatarUrl}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-fg text-sm font-semibold">{comment.author.name}</span>
          <span className="text-fg-subtle text-[11px]">
            {formatRelativeTime(comment.createdAt)}
          </span>
          {comment.editedAt && <span className="text-fg-subtle text-[11px]">· editado</span>}
        </div>
        {editing ? (
          <div className="flex flex-col gap-2">
            <MentionTextarea
              autoFocus
              rows={3}
              value={draft}
              onChange={setDraft}
              onSubmit={() => {
                if (draft.trim().length > 0) updateMut.mutate();
              }}
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={updateMut.isPending || draft.trim().length === 0}
                onClick={() => updateMut.mutate()}
              >
                Salvar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <>
            {!showPlaceholder && (
              <div className="bg-bg-muted rounded-md px-3 py-2 text-sm">
                <p className="whitespace-pre-wrap">
                  {renderInlineMentions(plain, orgMembers.data ?? [])}
                </p>
              </div>
            )}

            {/* Imagens em grade */}
            {images.length > 0 && (
              <div
                className={`mt-2 grid gap-1.5 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}
              >
                {images.map((a) => (
                  <a
                    key={a.id}
                    href={a.publicUrl ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group/img border-border bg-bg-subtle relative block overflow-hidden rounded-md border"
                  >
                    <img
                      src={a.publicUrl ?? ''}
                      alt={a.fileName}
                      className="h-auto max-h-64 w-full object-cover"
                      loading="lazy"
                    />
                    {isAuthor && (
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.preventDefault();
                          const ok = await confirm({
                            title: 'Remover imagem?',
                            description: `"${a.fileName}" será removida desta anotação.`,
                            confirmLabel: 'Remover',
                            danger: true,
                          });
                          if (ok) removeAttMut.mutate(a.id);
                        }}
                        disabled={removeAttMut.isPending}
                        className="bg-bg/90 text-fg-muted hover:text-danger absolute right-1 top-1 hidden size-6 items-center justify-center rounded-full group-hover/img:flex"
                        aria-label={`Remover ${a.fileName}`}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </a>
                ))}
              </div>
            )}

            {/* Outros arquivos como chips */}
            {others.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1.5">
                {others.map((a) => (
                  <FileChip
                    key={a.id}
                    attachment={a}
                    canRemove={isAuthor}
                    onRemove={async () => {
                      const ok = await confirm({
                        title: 'Remover anexo?',
                        description: `"${a.fileName}" será removido desta anotação.`,
                        confirmLabel: 'Remover',
                        danger: true,
                      });
                      if (ok) removeAttMut.mutate(a.id);
                    }}
                    removing={removeAttMut.isPending}
                  />
                ))}
              </ul>
            )}

            {/* Chips de reactions agrupados por emoji — so renderiza quando
                ha pelo menos 1 reacao. Picker continua acessivel sempre via
                botao "Reagir" na barra de acoes abaixo. */}
            <ReactionsChips
              reactions={comment.reactions ?? []}
              currentUserId={currentUserId}
              onToggle={(emoji) => reactionMut.mutate(emoji)}
              pending={reactionMut.isPending}
            />

            {/* Barra de acoes — sempre visivel, sem espacamento extra. */}
            <div className="mt-1.5 flex items-center gap-3 text-[11px]">
              <ReactButton
                onToggle={(emoji) => reactionMut.mutate(emoji)}
                pending={reactionMut.isPending}
                open={emojiPickerOpen}
                setOpen={setEmojiPickerOpen}
              />
              {!nested && (
                <button
                  type="button"
                  onClick={() => setReplyOpen((v) => !v)}
                  className="text-fg-muted hover:text-fg inline-flex items-center gap-1"
                >
                  <CornerDownRight size={11} /> Responder
                </button>
              )}
              {isAuthor && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(showPlaceholder ? '' : plain);
                      setEditing(true);
                    }}
                    className="text-fg-muted hover:text-fg inline-flex items-center gap-1"
                  >
                    <Pencil size={11} /> Editar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Excluir anotação?',
                        description: 'A anotação e seus anexos serão removidos.',
                        confirmLabel: 'Excluir',
                        danger: true,
                      });
                      if (ok) deleteMut.mutate();
                    }}
                    disabled={deleteMut.isPending}
                    className="text-fg-muted hover:text-danger inline-flex items-center gap-1"
                  >
                    <Trash2 size={11} /> Excluir
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {/* Composer de reply (so na raiz) */}
        {!nested && replyOpen && (
          <div className="border-border/60 mt-3 flex flex-col gap-2 border-l-2 pl-3">
            <MentionTextarea
              autoFocus
              rows={2}
              value={replyDraft}
              onChange={setReplyDraft}
              onSubmit={() => {
                if (replyDraft.trim().length > 0) replyMut.mutate();
              }}
              placeholder={`Responder a ${comment.author.name}…`}
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={replyMut.isPending || replyDraft.trim().length === 0}
                onClick={() => replyMut.mutate()}
              >
                {replyMut.isPending && <Loader2 size={12} className="animate-spin" />}
                Responder
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setReplyOpen(false);
                  setReplyDraft('');
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* Replies aninhadas — renderizadas com mesma estrutura mas indentadas */}
        {!nested && replies.length > 0 && (
          <ul className="border-border/40 mt-3 flex flex-col gap-3 border-l-2 pl-3">
            {replies.map((r) => (
              <CommentItem
                key={r.id}
                comment={r}
                currentUserId={currentUserId}
                cardId={cardId}
                boardId={boardId}
                nested
              />
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

/**
 * Renderiza os chips de reactions agrupados por emoji + contador. So
 * aparece quando ha pelo menos 1 reacao no comment — caso contrario o
 * componente nao monta nada (sem espacamento vazio).
 */
function ReactionsChips({
  reactions,
  currentUserId,
  onToggle,
  pending,
}: {
  reactions: CommentReactionNode[];
  currentUserId: string | null;
  onToggle: (emoji: ReactionEmoji) => void;
  pending: boolean;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, { emoji: string; count: number; mine: boolean; users: string[] }>();
    for (const r of reactions) {
      const g = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false, users: [] };
      g.count += 1;
      if (r.userId === currentUserId) g.mine = true;
      g.users.push(r.user.name);
      map.set(r.emoji, g);
    }
    return [...map.values()];
  }, [reactions, currentUserId]);

  if (groups.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {groups.map((g) => (
        <button
          key={g.emoji}
          type="button"
          onClick={() => onToggle(g.emoji as ReactionEmoji)}
          disabled={pending}
          title={g.users.join(', ')}
          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] transition-colors ${
            g.mine
              ? 'border-primary bg-primary-subtle/50 text-fg'
              : 'border-border/70 bg-bg-muted/40 text-fg-muted hover:border-border-strong'
          }`}
        >
          <span>{g.emoji}</span>
          <span className="tabular-nums">{g.count}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Botao "Reagir" + picker inline com os 5 emojis. Vive na barra de
 * acoes (sempre visivel, igual ao "Responder" e "Editar"), evita o
 * problema de hover invisivel no mobile.
 */
function ReactButton({
  onToggle,
  pending,
  open,
  setOpen,
}: {
  onToggle: (emoji: ReactionEmoji) => void;
  pending: boolean;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-fg-muted hover:text-fg inline-flex items-center gap-1"
        aria-label="Reagir"
        aria-expanded={open}
      >
        <SmilePlus size={11} /> Reagir
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="border-border bg-bg absolute bottom-full left-0 z-20 mb-1 flex items-center gap-0.5 rounded-full border px-1.5 py-1 shadow-md">
            {ALLOWED_REACTION_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  onToggle(e);
                  setOpen(false);
                }}
                disabled={pending}
                className="hover:bg-bg-muted rounded-full px-1.5 py-0.5 text-base leading-none transition-transform hover:scale-125"
              >
                {e}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FileChip({
  attachment,
  canRemove,
  onRemove,
  removing,
}: {
  attachment: Attachment;
  canRemove: boolean;
  onRemove: () => void;
  removing: boolean;
}) {
  return (
    <li className="bg-bg-muted border-border flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
      <FileText size={14} className="text-fg-muted shrink-0" />
      <span className="min-w-0 flex-1 truncate font-medium">{attachment.fileName}</span>
      <span className="text-fg-subtle shrink-0 text-[10px]">
        {formatBytes(attachment.sizeBytes)}
      </span>
      {attachment.publicUrl && (
        <a
          href={attachment.publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          download={attachment.fileName}
          className="text-fg-muted hover:text-fg shrink-0 rounded p-0.5"
          aria-label={`Baixar ${attachment.fileName}`}
          title="Baixar"
        >
          <Download size={12} />
        </a>
      )}
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          className="text-fg-muted hover:text-danger shrink-0 rounded p-0.5 disabled:opacity-50"
          aria-label="Remover"
          title="Remover"
        >
          <X size={12} />
        </button>
      )}
    </li>
  );
}

function ActivityItem({ activity }: { activity: ActivityNode }) {
  const actor = activity.actor?.name ?? 'Sistema';
  const parts = activityParts(activity);
  return (
    <li className="flex gap-3 py-1">
      <UserAvatar
        name={actor}
        userId={activity.actor?.id}
        avatarUrl={activity.actor?.avatarUrl}
        size="md"
        muted={!activity.actor}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-fg text-sm font-semibold">{actor}</span>
          <span className="text-fg-subtle text-[11px]">
            {formatRelativeTime(activity.createdAt)}
          </span>
        </div>
        <p className="text-fg-muted mt-0.5 text-sm leading-snug">
          {parts.map((part, i) =>
            typeof part === 'string' ? (
              <span key={i}>{part}</span>
            ) : (
              <strong key={i} className="text-fg font-semibold">
                {part.bold}
              </strong>
            ),
          )}
        </p>
      </div>
    </li>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
