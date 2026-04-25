'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Eye, History, Lock, Loader2, MoreHorizontal, Plus } from 'lucide-react';

import {
  boardsQueries,
  moveCard,
  type BoardDetail,
  type BoardListItem,
} from '@/lib/queries/boards';
import { cardsQueries, type CardDetail } from '@/lib/queries/cards';
import { UserAvatar } from '@/components/user-avatar';

/**
 * Aba "Fluxos" do card — placeholder visual da feature de cards multi-fluxo.
 *
 * Ainda não funcional: hoje cada Card tem 1 boardId único. A presença em
 * múltiplos fluxos requer migration `CardPresence` (M:N entre Card e Board)
 * + refactor de várias queries. Plano detalhado em
 * `tarefas-md/13-cards-multi-fluxo.md`.
 *
 * O que esse componente exibe agora:
 *   - 1 fluxo (o board atual do card) com sua barra de colunas
 *   - Coluna atual destacada
 *   - Botões "Vincular a outro fluxo" e "Exibir fluxos inativados" disabled
 */
export function CardFlowsTab({ card }: { card: CardDetail }) {
  const boardQuery = useQuery(boardsQueries.detail(card.boardId));
  const boardListQuery = useQuery(boardsQueries.all());

  const board = boardQuery.data;
  const boardItem = boardListQuery.data?.find((b) => b.id === card.boardId);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-border/60 flex items-center justify-between gap-3 border-b px-5 py-3.5 sm:px-6">
        <h2 className="text-base font-semibold">Fluxos</h2>
        <FlowsHeaderMenu />
      </div>

      <div className="flex flex-col gap-6 px-6 py-6">
        {board && boardItem ? (
          <FlowRow card={card} board={board} boardItem={boardItem} />
        ) : (
          <p className="text-fg-muted text-sm">Carregando…</p>
        )}

        <p className="text-fg-subtle bg-bg-subtle border-border/60 rounded-md border border-dashed px-3 py-2 text-[11px]">
          Cards aparecendo em múltiplos fluxos simultaneamente é uma feature da Fase 2 (junto com a
          engine de automações). Por enquanto, cada card pertence a um fluxo só. Pra replicar uma
          demanda noutro setor, use a opção "Duplicar card" do menu.
        </p>
      </div>
    </div>
  );
}

function FlowRow({
  card,
  board,
  boardItem,
}: {
  card: CardDetail;
  board: BoardDetail;
  boardItem: BoardListItem;
}) {
  const lists = board.lists ?? [];
  const isCompleted = Boolean(card.completedAt);
  const currentIdx = lists.findIndex((l) => l.id === card.listId);
  const queryClient = useQueryClient();

  const moveMut = useMutation({
    mutationFn: (toListId: string) => moveCard(card.id, { toListId, afterCardId: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cardsQueries.detail(card.id).queryKey });
      queryClient.invalidateQueries({ queryKey: ['boards', board.id] });
    },
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          {boardItem.icon && <span className="text-base">{boardItem.icon}</span>}
          <h3 className="text-base font-semibold">{board.name}</h3>
          <div className="flex -space-x-1.5">
            {board.members.slice(0, 4).map((m) => (
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
          {board.visibility === 'PRIVATE' && (
            <span title="Fluxo privado" className="text-fg-muted inline-flex">
              <Lock size={13} />
            </span>
          )}
        </div>
        <button
          type="button"
          disabled
          title="Em breve"
          className="text-fg-muted hover:bg-bg-muted rounded p-1 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Mais ações do fluxo"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>

      <div className="flex items-stretch overflow-hidden rounded-md">
        {/* Histórico (timestamp icon à esquerda) */}
        <div className="bg-primary text-primary-fg flex shrink-0 items-center justify-center px-3">
          <History size={14} />
        </div>

        {/* Colunas — clicar move o card pra aquela coluna.
            Coloridas: atual + todas anteriores (indica "já passou"). */}
        <div className="flex flex-1">
          {lists.map((l, idx) => {
            const isCurrent = l.id === card.listId && !isCompleted;
            const isFilled = !isCompleted && currentIdx >= 0 && idx <= currentIdx;
            const pending = moveMut.isPending && moveMut.variables === l.id;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  if (!isCurrent && !moveMut.isPending) moveMut.mutate(l.id);
                }}
                disabled={isCurrent || moveMut.isPending}
                title={isCurrent ? `Coluna atual: ${l.name}` : `Mover para ${l.name}`}
                className={`group/col relative flex flex-1 items-center justify-center px-3 py-2 text-center text-[11px] font-medium transition-colors ${
                  isFilled
                    ? isCurrent
                      ? 'bg-primary text-primary-fg'
                      : 'bg-primary/70 text-primary-fg hover:bg-primary'
                    : 'bg-bg-muted text-fg-muted hover:bg-primary-subtle hover:text-primary'
                } ${!isCurrent ? 'cursor-pointer' : ''}`}
              >
                <span className="line-clamp-1">{l.name}</span>
                {pending && <Loader2 size={10} className="ml-1.5 animate-spin" />}
              </button>
            );
          })}
        </div>

        {/* Finalizar (check à direita) */}
        <div
          className={`flex shrink-0 items-center justify-center px-3 ${
            isCompleted ? 'bg-accent text-bg' : 'bg-bg-muted text-fg-muted'
          }`}
          title={isCompleted ? 'Finalizado' : 'Não finalizado'}
        >
          <CheckCircle2 size={14} />
        </div>
      </div>
    </div>
  );
}

/**
 * Menu kebab do header da aba Fluxos. Abriga ações que antes eram botões
 * grandes ("Vincular a outro fluxo", "Exibir fluxos inativados") — ambas
 * disabled enquanto cards multi-fluxo (Fase 2) não chega.
 */
function FlowsHeaderMenu() {
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
              disabled
              title="Em breve — disponível com cards multi-fluxo na Fase 2"
              className="text-fg-subtle flex cursor-not-allowed items-center gap-2 rounded-sm px-2 py-1.5 text-left"
            >
              <Plus size={13} />
              <span className="flex-1">Vincular a outro fluxo</span>
              <span className="text-fg-subtle text-[10px]">em breve</span>
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
