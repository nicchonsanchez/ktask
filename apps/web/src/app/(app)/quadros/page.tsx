'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Activity as ActivityIcon,
  AlertTriangle,
  CalendarClock,
  Clock,
  Globe2,
  Layers,
  Loader2,
  Lock,
  Plus,
  Star,
  Users,
} from 'lucide-react';

import {
  Button,
  Input,
  Label,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@ktask/ui';
import {
  boardsQueries,
  createBoard,
  favoriteBoard,
  unfavoriteBoard,
  type BoardListItem,
} from '@/lib/queries/boards';
import { meQueries, type OrgActivityItem } from '@/lib/queries/me';
import { UserAvatar } from '@/components/user-avatar';
import { ApiError } from '@/lib/api-client';

const CreateSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres.').max(120),
  description: z.string().max(1000).optional(),
});
type CreateInput = z.infer<typeof CreateSchema>;

export default function BoardsPage() {
  const boards = useQuery(boardsQueries.all());
  const activity = useQuery(meQueries.orgActivity(8));
  const [open, setOpen] = useState(false);

  return (
    <div className="container py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Seus quadros</h1>
          <p className="text-fg-muted mt-1 text-sm">
            Kanban para organizar fluxos, tarefas e responsáveis.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus size={16} />
              Novo quadro
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar quadro</DialogTitle>
              <DialogDescription>
                Ele já virá com 3 listas padrão: A Fazer, Fazendo, Concluído.
              </DialogDescription>
            </DialogHeader>
            <CreateBoardForm onCreated={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {boards.isLoading && (
        <div className="text-fg-muted flex items-center gap-2 text-sm">
          <Loader2 size={16} className="animate-spin" /> Carregando quadros...
        </div>
      )}

      {boards.data && boards.data.length === 0 && (
        <div className="border-border bg-bg-subtle rounded-lg border border-dashed p-10 text-center">
          <Layers size={32} className="text-fg-muted mx-auto" />
          <p className="mt-3 text-sm font-medium">Nenhum quadro ainda</p>
          <p className="text-fg-muted mt-1 text-xs">
            Crie seu primeiro quadro para começar a organizar tarefas.
          </p>
        </div>
      )}

      {boards.data && boards.data.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <BoardsListing boards={boards.data} />
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <ActivityFeedPanel items={activity.data ?? []} loading={activity.isLoading} />
          </aside>
        </div>
      )}
    </div>
  );
}

/** Doc 41: feed lateral com a atividade recente da Org. */
function ActivityFeedPanel({ items, loading }: { items: OrgActivityItem[]; loading: boolean }) {
  return (
    <section className="border-border/60 bg-bg-subtle/40 rounded-lg border p-3">
      <h2 className="text-fg-muted mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
        <ActivityIcon size={12} /> Atividade recente
      </h2>
      {loading && (
        <div className="text-fg-muted flex items-center gap-2 py-4 text-xs">
          <Loader2 size={12} className="animate-spin" /> Carregando…
        </div>
      )}
      {!loading && items.length === 0 && (
        <p className="text-fg-subtle py-4 text-center text-xs">Sem atividade recente.</p>
      )}
      {!loading && items.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {items.map((it) => (
            <ActivityRow key={it.id} item={it} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ActivityRow({ item }: { item: OrgActivityItem }) {
  const cardLink = item.card
    ? `/b/${item.card.board.id}?card=${item.card.id}`
    : item.boardId
      ? `/b/${item.boardId}`
      : null;
  const verb = activityVerb(item.type, item.payload);
  const cardLabel = item.card?.title ?? '(sem card)';
  const boardLabel = item.card?.board.name ?? '';
  const ago = relativeTime(item.createdAt);

  const content = (
    <div className="hover:bg-bg-muted/50 flex items-start gap-2 rounded px-2 py-1.5 transition-colors">
      {item.actor ? (
        <UserAvatar
          name={item.actor.name}
          userId={item.actor.id}
          avatarUrl={item.actor.avatarUrl}
          size="sm"
        />
      ) : (
        <span className="bg-bg-muted text-fg-muted inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[10px]">
          ?
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-fg text-[12px] leading-snug">
          <span className="font-medium">{item.actor?.name ?? 'Alguém'}</span>{' '}
          <span className="text-fg-muted">{verb}</span>{' '}
          <span className="font-medium">{cardLabel}</span>
        </p>
        <p className="text-fg-subtle truncate text-[10px]">
          {boardLabel ? `${boardLabel} · ` : ''}
          {ago}
        </p>
      </div>
    </div>
  );

  return cardLink ? <Link href={cardLink}>{content}</Link> : content;
}

function activityVerb(type: string, payload: Record<string, unknown>): string {
  // Mapas amplos pra cobrir o que a Activity loga hoje. Fallback generico.
  if (type === 'CARD_CREATED') return 'criou';
  if (type === 'CARD_MOVED') return 'moveu';
  if (type === 'CARD_COMPLETED') return 'finalizou';
  if (type === 'CARD_REOPENED') return 'reabriu';
  if (type === 'CARD_ARCHIVED') return 'arquivou';
  if (type === 'COMMENT_CREATED') return 'comentou em';
  if (type === 'CARD_UPDATED') {
    const kind = typeof payload.kind === 'string' ? payload.kind : '';
    if (kind.startsWith('approval.approved')) return 'aprovou';
    if (kind.startsWith('approval.rejected')) return 'reprovou';
    if (kind === 'privacy_changed') return 'mudou privacidade de';
    return 'editou';
  }
  return 'mexeu em';
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'agora';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d}d`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

/**
 * Doc 36: separa em "Favoritos" (topo) + "Todos os fluxos" (embaixo).
 * Dentro de cada grupo, ordem alfabetica por nome.
 */
function BoardsListing({ boards }: { boards: BoardListItem[] }) {
  const sorted = [...boards].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const favorites = sorted.filter((b) => b.isFavorite);
  const others = sorted.filter((b) => !b.isFavorite);

  return (
    <div className="flex flex-col gap-8">
      {favorites.length > 0 && (
        <section>
          <h2 className="text-fg-muted mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
            <Star size={12} className="fill-warning text-warning" /> Favoritos
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {favorites.map((b) => (
              <BoardCard key={b.id} board={b} />
            ))}
          </div>
        </section>
      )}
      <section>
        {favorites.length > 0 && (
          <h2 className="text-fg-muted mb-3 text-xs font-semibold uppercase tracking-wide">
            Todos os fluxos
          </h2>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((b) => (
            <BoardCard key={b.id} board={b} />
          ))}
        </div>
      </section>
    </div>
  );
}

function BoardCard({ board }: { board: BoardListItem }) {
  const color = board.color ?? 'hsl(var(--primary))';
  const queryClient = useQueryClient();

  // Doc 36: toggle de favorito otimista. Atualiza o cache local antes do
  // round-trip e reverte em erro.
  const favMut = useMutation({
    mutationFn: () => (board.isFavorite ? unfavoriteBoard(board.id) : favoriteBoard(board.id)),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['boards'] });
      const prev = queryClient.getQueryData<BoardListItem[]>(['boards']);
      queryClient.setQueryData<BoardListItem[]>(['boards'], (old) =>
        old?.map((b) => (b.id === board.id ? { ...b, isFavorite: !b.isFavorite } : b)),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['boards'], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['boards'] }),
  });

  return (
    <div className="border-border bg-bg-subtle hover:bg-bg-muted group relative overflow-hidden rounded-lg border p-4 transition-colors">
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <Link href={`/b/${board.id}`} className="block">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 pr-16 text-sm font-semibold">{board.name}</h3>
          {board.visibility === 'PRIVATE' ? (
            <Lock size={14} className="text-fg-muted shrink-0" aria-label="Privado" />
          ) : (
            <Globe2 size={14} className="text-fg-muted shrink-0" aria-label="Toda a empresa" />
          )}
        </div>
        {board.description && (
          <p className="text-fg-muted line-clamp-2 text-xs">{board.description}</p>
        )}

        {/* Doc 41: badges de saude — atrasado / vence hoje, so aparecem
            quando >0 pra evitar ruido visual. */}
        {(board.overdueCount > 0 || board.dueTodayCount > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {board.overdueCount > 0 && (
              <span
                className="bg-danger-subtle text-danger inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                title={`${board.overdueCount} card(s) atrasados`}
              >
                <AlertTriangle size={10} />
                {board.overdueCount} atrasado{board.overdueCount > 1 ? 's' : ''}
              </span>
            )}
            {board.dueTodayCount > 0 && (
              <span
                className="bg-warning-subtle text-warning inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                title={`${board.dueTodayCount} card(s) vencem hoje`}
              >
                <CalendarClock size={10} />
                {board.dueTodayCount} hoje
              </span>
            )}
          </div>
        )}

        <div className="text-fg-subtle mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1" title="Cards abertos">
            <Layers size={12} /> {board.openCardsCount}
            {board.cardsCount > board.openCardsCount && (
              <span className="text-fg-subtle/70">/{board.cardsCount}</span>
            )}
          </span>
          {board.membersCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Users size={12} /> {board.membersCount}
            </span>
          )}
          {board.lastActivityAt && (
            <span
              className="inline-flex items-center gap-1"
              title={new Date(board.lastActivityAt).toLocaleString('pt-BR')}
            >
              <Clock size={12} /> {relativeTime(board.lastActivityAt)}
            </span>
          )}
        </div>
      </Link>
      {/* Estrela favoritar — posicionada antes do icone de visibilidade
          (lock/globe) pra nao sobrepor. text-fg-muted em vez de fg-subtle
          pra ficar visivel em ambos os temas. */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          favMut.mutate();
        }}
        title={board.isFavorite ? 'Desfavoritar' : 'Favoritar'}
        aria-label={board.isFavorite ? 'Desfavoritar fluxo' : 'Favoritar fluxo'}
        className="hover:bg-bg-emphasis absolute right-9 top-3 rounded p-1 transition-colors"
      >
        <Star
          size={16}
          className={
            board.isFavorite ? 'fill-warning text-warning' : 'text-fg-muted hover:text-warning'
          }
        />
      </button>
    </div>
  );
}

function CreateBoardForm({ onCreated }: { onCreated: () => void }) {
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CreateInput>({ resolver: zodResolver(CreateSchema) });

  const mutation = useMutation({
    mutationFn: createBoard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      reset();
      onCreated();
    },
    onError: (err) => {
      setSubmitError(err instanceof ApiError ? err.message : 'Não foi possível criar o quadro.');
    },
  });

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="board-name">Nome</Label>
        <Input
          id="board-name"
          placeholder="Vendas 2026"
          autoFocus
          error={!!errors.name}
          {...register('name')}
        />
        {errors.name && <p className="text-danger text-xs">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="board-desc">Descrição (opcional)</Label>
        <Input id="board-desc" placeholder="Prospecção e fechamento" {...register('description')} />
      </div>

      {submitError && (
        <p role="alert" className="bg-danger-subtle text-danger rounded-md px-3 py-2 text-sm">
          {submitError}
        </p>
      )}

      <DialogFooter>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 size={16} className="animate-spin" />}
          Criar quadro
        </Button>
      </DialogFooter>
    </form>
  );
}
