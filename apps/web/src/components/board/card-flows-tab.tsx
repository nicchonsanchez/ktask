'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Eye,
  History,
  Link as LinkIcon,
  Loader2,
  Lock,
  MoreHorizontal,
  Plus,
  Unlink,
} from 'lucide-react';

import { boardsQueries, moveCard } from '@/lib/queries/boards';
import {
  cardsQueries,
  linkCardToFlow,
  unlinkCardFromFlow,
  type CardDetail,
  type CardFlow,
} from '@/lib/queries/cards';
import { UserAvatar } from '@/components/user-avatar';
import { useConfirm, useNotify } from '@/components/ui/dialogs';
import { ApiError } from '@/lib/api-client';

/**
 * Aba "Fluxos" do card — cards multi-fluxo (iteração 1).
 *
 * Lê de GET /cards/:id/flows que retorna 1 entrada por presença ativa
 * (`CardPresence` rows com `removedAt = null` em boards onde o user tem
 * acesso). Permite vincular o card a outro fluxo e desvincular dos não-
 * primários.
 *
 * Limitações desta iteração:
 *   - Click numa coluna ainda usa `cards/move` legado (só funciona no fluxo
 *     primário). Pra fluxos vinculados, click é placeholder. Iteração 2 vai
 *     ter `PATCH /cards/:id/flows/:boardId` pra mover por fluxo.
 *   - Cards vinculados em outros fluxos NÃO aparecem no kanban deles ainda
 *     (kanban lê de Card.boardId, não de CardPresence). Iteração 2.
 */
export function CardFlowsTab({ card }: { card: CardDetail }) {
  const flowsQuery = useQuery(cardsQueries.flows(card.id));
  const [linkOpen, setLinkOpen] = useState(false);

  const flows = flowsQuery.data ?? [];

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-border/60 flex items-center justify-between gap-3 border-b px-5 py-3.5 sm:px-6">
        <h2 className="text-base font-semibold">
          Fluxos
          {flows.length > 0 && (
            <span className="text-fg-muted ml-2 text-xs font-normal">({flows.length})</span>
          )}
        </h2>
        <FlowsHeaderMenu onLink={() => setLinkOpen(true)} />
      </div>

      <div className="flex flex-col gap-6 px-6 py-6">
        {flowsQuery.isLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={16} className="text-fg-muted animate-spin" />
          </div>
        )}

        {!flowsQuery.isLoading &&
          flows.map((flow) => <FlowRow key={flow.boardId} card={card} flow={flow} />)}

        {!flowsQuery.isLoading && flows.length === 0 && (
          <p className="text-fg-muted text-sm">Nenhum fluxo ativo. Vincule a um pra começar.</p>
        )}

        <p className="text-fg-subtle bg-bg-subtle border-border/60 rounded-md border border-dashed px-3 py-2 text-[11px]">
          Cada fluxo tem ciclo independente (coluna atual e finalização separadas). O kanban dos
          fluxos vinculados ainda não exibe o card — funcionalidade completa chega na próxima
          iteração desta feature.
        </p>
      </div>

      <LinkFlowDialog cardId={card.id} open={linkOpen} onOpenChange={setLinkOpen} />
    </div>
  );
}

function FlowRow({ card, flow }: { card: CardDetail; flow: CardFlow }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const notify = useNotify();
  const [menuOpen, setMenuOpen] = useState(false);
  const lists = flow.board.lists;
  const isCompleted = Boolean(flow.completedAt);
  const currentIdx = lists.findIndex((l) => l.id === flow.listId);

  // Move só funciona no fluxo primário nesta iteração (cards/move legacy).
  const moveMut = useMutation({
    mutationFn: (toListId: string) => moveCard(card.id, { toListId, afterCardId: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cardsQueries.detail(card.id).queryKey });
      queryClient.invalidateQueries({ queryKey: cardsQueries.flows(card.id).queryKey });
      queryClient.invalidateQueries({ queryKey: ['boards', flow.boardId] });
    },
  });

  const unlinkMut = useMutation({
    mutationFn: () => unlinkCardFromFlow(card.id, flow.boardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cardsQueries.flows(card.id).queryKey });
      notify.success(`Card desvinculado de "${flow.board.name}".`);
    },
    onError: (err) => {
      notify.error(err instanceof ApiError ? err.message : 'Erro ao desvincular.');
    },
  });

  async function handleUnlink() {
    setMenuOpen(false);
    const ok = await confirm({
      title: `Desvincular de "${flow.board.name}"?`,
      description: 'O card sai deste fluxo mas continua nos outros. Pode ser revinculado depois.',
      confirmLabel: 'Desvincular',
      danger: true,
    });
    if (ok) unlinkMut.mutate();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {flow.board.icon && <span className="text-base">{flow.board.icon}</span>}
          <h3 className="text-fg truncate text-base font-semibold">{flow.board.name}</h3>
          {flow.isPrimary && (
            <span className="border-primary/40 text-primary rounded border px-1.5 py-0.5 text-[10px] font-semibold">
              Primário
            </span>
          )}
          <div className="flex -space-x-1.5">
            {flow.board.members.slice(0, 4).map((m) => (
              <UserAvatar
                key={m.user.id}
                name={m.user.name}
                userId={m.user.id}
                avatarUrl={m.user.avatarUrl}
                size="sm"
                stacked
              />
            ))}
          </div>
          {flow.board.visibility === 'PRIVATE' && (
            <span title="Fluxo privado" className="text-fg-muted inline-flex">
              <Lock size={13} />
            </span>
          )}
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="text-fg-muted hover:bg-bg-muted rounded p-1"
            aria-label="Mais ações do fluxo"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="border-border bg-bg absolute right-0 top-full z-20 mt-1 flex w-56 flex-col rounded-md border p-1 text-xs shadow-lg">
                <a
                  href={`/b/${flow.boardId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-fg hover:bg-bg-muted flex items-center gap-2 rounded-sm px-2 py-1.5"
                >
                  <Eye size={13} />
                  Visualizar fluxo
                </a>
                {!flow.isPrimary && (
                  <button
                    type="button"
                    onClick={handleUnlink}
                    disabled={unlinkMut.isPending}
                    className="text-danger hover:bg-danger-subtle flex items-center gap-2 rounded-sm px-2 py-1.5 text-left"
                  >
                    <Unlink size={13} />
                    Desvincular deste fluxo
                  </button>
                )}
                {flow.isPrimary && (
                  <span className="text-fg-subtle px-2 py-1.5 text-[10px]">
                    Primário não pode ser desvinculado.
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-stretch overflow-hidden rounded-md">
        <div className="bg-primary text-primary-fg flex shrink-0 items-center justify-center px-3">
          <History size={14} />
        </div>

        <div className="flex flex-1">
          {lists.map((l, idx) => {
            const isCurrent = l.id === flow.listId && !isCompleted;
            const isFilled = !isCompleted && currentIdx >= 0 && idx <= currentIdx;
            const pending = moveMut.isPending && moveMut.variables === l.id;
            const canClick = flow.isPrimary && !isCurrent && !moveMut.isPending;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  if (canClick) moveMut.mutate(l.id);
                }}
                disabled={!canClick}
                title={
                  isCurrent
                    ? `Coluna atual: ${l.name}`
                    : flow.isPrimary
                      ? `Mover para ${l.name}`
                      : 'Mover por fluxo chega na próxima iteração'
                }
                className={`group/col relative flex flex-1 items-center justify-center px-3 py-2 text-center text-[11px] font-medium transition-colors ${
                  isFilled
                    ? isCurrent
                      ? 'bg-primary text-primary-fg'
                      : 'bg-primary/70 text-primary-fg hover:bg-primary'
                    : 'bg-bg-muted text-fg-muted'
                } ${canClick ? 'hover:bg-primary-subtle hover:text-primary cursor-pointer' : 'cursor-default'}`}
              >
                <span className="line-clamp-1">{l.name}</span>
                {pending && <Loader2 size={10} className="ml-1.5 animate-spin" />}
              </button>
            );
          })}
        </div>

        <div
          className={`flex shrink-0 items-center justify-center px-3 ${
            isCompleted ? 'bg-accent text-bg' : 'bg-bg-muted text-fg-muted'
          }`}
          title={isCompleted ? 'Finalizado neste fluxo' : 'Não finalizado'}
        >
          <CheckCircle2 size={14} />
        </div>
      </div>
    </div>
  );
}

function FlowsHeaderMenu({ onLink }: { onLink: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-fg-muted hover:bg-bg-muted hover:text-fg focus-visible:ring-primary inline-flex size-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2"
        aria-label="Mais ações dos fluxos"
        title="Mais ações"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="border-border bg-bg absolute right-0 top-full z-20 mt-1 flex w-60 flex-col rounded-md border p-1 text-xs shadow-lg">
            <button
              type="button"
              onClick={() => {
                onLink();
                setOpen(false);
              }}
              className="text-fg hover:bg-bg-muted flex items-center gap-2 rounded-sm px-2 py-1.5 text-left"
            >
              <Plus size={13} />
              <span className="flex-1">Vincular a outro fluxo</span>
            </button>
            <button
              type="button"
              disabled
              title="Em breve"
              className="text-fg-subtle flex cursor-not-allowed items-center gap-2 rounded-sm px-2 py-1.5 text-left"
            >
              <Eye size={13} />
              <span className="flex-1">Exibir fluxos inativados</span>
              <span className="text-fg-subtle text-[10px]">em breve</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function LinkFlowDialog({
  cardId,
  open,
  onOpenChange,
}: {
  cardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const notify = useNotify();
  const boardsQuery = useQuery({ ...boardsQueries.all(), enabled: open });
  const flowsQuery = useQuery({ ...cardsQueries.flows(cardId), enabled: open });
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);

  const linkMut = useMutation({
    mutationFn: () => {
      if (!selectedBoardId) throw new Error('Selecione um fluxo.');
      return linkCardToFlow(cardId, { boardId: selectedBoardId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cardsQueries.flows(cardId).queryKey });
      notify.success('Card vinculado ao fluxo.');
      onOpenChange(false);
      setSelectedBoardId(null);
    },
    onError: (err) => {
      notify.error(err instanceof ApiError ? err.message : 'Erro ao vincular.');
    },
  });

  if (!open) return null;

  const linkedIds = new Set((flowsQuery.data ?? []).map((f) => f.boardId));
  const available = (boardsQuery.data ?? []).filter((b) => !b.isArchived && !linkedIds.has(b.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="border-border bg-bg flex w-full max-w-md flex-col rounded-md border shadow-2xl">
        <div className="border-border/60 flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-fg flex items-center gap-2 text-sm font-semibold">
            <LinkIcon size={14} />
            Vincular a outro fluxo
          </h3>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-fg-muted hover:text-fg rounded p-0.5"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <div className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto p-3">
          {boardsQuery.isLoading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={14} className="text-fg-muted animate-spin" />
            </div>
          )}
          {!boardsQuery.isLoading && available.length === 0 && (
            <p className="text-fg-muted py-4 text-center text-xs">
              Não há outros fluxos disponíveis.
            </p>
          )}
          {available.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelectedBoardId(b.id)}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                selectedBoardId === b.id
                  ? 'border-primary bg-primary-subtle/30'
                  : 'border-border/60 hover:border-border-strong'
              }`}
            >
              {b.icon && <span>{b.icon}</span>}
              <span className="text-fg flex-1 truncate">{b.name}</span>
              <span className="text-fg-muted text-[10px]">{b.cardsCount} cards</span>
            </button>
          ))}
        </div>
        <div className="border-border/60 flex justify-end gap-2 border-t px-4 py-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="border-border text-fg hover:bg-bg-muted rounded-md border px-3 py-1.5 text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => linkMut.mutate()}
            disabled={!selectedBoardId || linkMut.isPending}
            className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-60"
          >
            {linkMut.isPending && <Loader2 size={12} className="animate-spin" />}
            Vincular
          </button>
        </div>
      </div>
    </div>
  );
}
