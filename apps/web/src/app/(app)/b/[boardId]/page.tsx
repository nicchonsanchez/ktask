'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  closestCenter,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { Loader2 } from 'lucide-react';

import {
  boardsQueries,
  completeCard,
  moveCard,
  moveList,
  sortCardsForBoard,
  type BoardDetail,
  type CardListItem,
} from '@/lib/queries/boards';
import { CardItem, CardOverlay } from '@/components/board/card-item';
import { ListColumn, LIST_SORT_PREFIX } from '@/components/board/list-column';
import { CardModal } from '@/components/board/card-modal';
import { CompletedColumn, COMPLETED_DROPPABLE_ID } from '@/components/board/completed-column';
import { AddColumnButton } from '@/components/board/add-column-button';
import { BoardHeader } from '@/components/board/board-header';
import {
  applyBoardFilters,
  EMPTY_FILTERS,
  type BoardFilters,
} from '@/components/board/board-filter-popover';
import { ApiError } from '@/lib/api-client';
import { useRealtimeBoard } from '@/hooks/use-realtime-board';
import { useAuthStore } from '@/stores/auth-store';

export default function BoardPage() {
  const params = useParams<{ boardId: string }>();
  const boardId = params.boardId;
  const boardQuery = useQuery(boardsQueries.detail(boardId));
  const queryClient = useQueryClient();
  const [activeCard, setActiveCard] = useState<CardListItem | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<BoardFilters>(EMPTY_FILTERS);
  const searchNorm = search.trim().toLowerCase();
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);

  const { onlineUserIds } = useRealtimeBoard({
    boardId,
    organizationId: boardQuery.data?.organizationId ?? null,
  });

  // Sensores separados pra mouse e touch.
  // - Mouse: começa drag a 6px de movimento (rápido pra desktop).
  // - Touch: long-press 250ms com 5px de tolerância — assim toques curtos
  //   continuam scrollando a página normalmente, e segurar o card ativa o drag.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /**
   * Estratégia de colisão p/ kanban multi-coluna:
   *  1. Se o ponteiro está dentro de algum droppable, usa ele (prioriza o mais
   *     profundo: cards ganham da coluna que os contém). Isso resolve o caso
   *     da coluna vazia — assim que o cursor entra nela, ela ganha sem ser
   *     "ofuscada" por cards de outras colunas.
   *  2. Senão, fallback pra rectIntersection (drag saiu da zona do ponteiro).
   *  3. Último recurso: closestCenter pra não deixar sem `over`.
   */
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointer = pointerWithin(args);
    if (pointer.length > 0) return pointer;
    const rect = rectIntersection(args);
    if (rect.length > 0) return rect;
    return closestCenter(args);
  }, []);

  const board = boardQuery.data;

  const cardIdToListId = useMemo(() => {
    const map = new Map<string, string>();
    board?.lists.forEach((l) => l.cards.forEach((c) => map.set(c.id, l.id)));
    return map;
  }, [board]);

  function isListDrag(id: string) {
    return id.startsWith(LIST_SORT_PREFIX);
  }

  /**
   * Cada coluna tem 2 IDs no dnd-kit: `col:<listId>` (sortable pra reorder)
   * e `<listId>` (droppable pra receber cards). Quando o ponteiro está
   * em cima da coluna, o over.id pode vir de qualquer um dos dois. Pra
   * drag de CARD, normalizamos tirando o prefixo `col:` se estiver lá.
   */
  function normalizeOverForCard(overId: string): string {
    return overId.startsWith(LIST_SORT_PREFIX) ? overId.slice(LIST_SORT_PREFIX.length) : overId;
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    if (isListDrag(id)) {
      return; // drag de coluna não abre overlay de card
    }
    const listId = cardIdToListId.get(id);
    if (!board || !listId) return;
    const list = board.lists.find((l) => l.id === listId);
    const card = list?.cards.find((c) => c.id === id) ?? null;
    setActiveCard(card);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!board || !over) return;

    const activeId = String(active.id);
    const rawOverId = String(over.id);
    if (activeId === rawOverId) return;

    // Drag de coluna não afeta listas de cards; reorder é tratado em handleDragEnd
    if (isListDrag(activeId)) return;

    // Drop em coluna "Finalizado" é tratado só no handleDragEnd (não move card entre listas)
    if (rawOverId === COMPLETED_DROPPABLE_ID) return;

    // Normaliza: se o over.id veio como "col:<listId>", usa só o listId
    const overId = normalizeOverForCard(rawOverId);

    const activeListId = cardIdToListId.get(activeId);
    const overListId = cardIdToListId.get(overId) ?? overId; // overId pode ser um listId
    if (!activeListId || !overListId) return;

    if (activeListId === overListId) return;

    // Move optimistically entre listas no cache
    queryClient.setQueryData<BoardDetail>(boardsQueries.detail(boardId).queryKey, (prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      const from = next.lists.find((l) => l.id === activeListId);
      const to = next.lists.find((l) => l.id === overListId);
      if (!from || !to) return prev;
      const idx = from.cards.findIndex((c) => c.id === activeId);
      if (idx < 0) return prev;
      const [moved] = from.cards.splice(idx, 1);
      to.cards.push(moved!);
      return next;
    });
    cardIdToListId.set(activeId, overListId);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveCard(null);
    if (!board || !over) return;

    const activeId = String(active.id);
    const rawOverId = String(over.id);

    // Reorder de colunas (drag horizontal)
    if (isListDrag(activeId)) {
      if (!isListDrag(rawOverId) || activeId === rawOverId) return;
      const activeListId = activeId.slice(LIST_SORT_PREFIX.length);
      const overListId = rawOverId.slice(LIST_SORT_PREFIX.length);

      const data = queryClient.getQueryData<BoardDetail>(boardsQueries.detail(boardId).queryKey);
      if (!data) return;

      const fromIdx = data.lists.findIndex((l) => l.id === activeListId);
      const toIdx = data.lists.findIndex((l) => l.id === overListId);
      if (fromIdx < 0 || toIdx < 0) return;

      // Otimista: reordena no cache
      queryClient.setQueryData<BoardDetail>(boardsQueries.detail(boardId).queryKey, (prev) => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        next.lists = arrayMove(next.lists, fromIdx, toIdx);
        return next;
      });

      // Descobre o afterListId baseado no novo índice
      const newLists = arrayMove(data.lists, fromIdx, toIdx);
      const newIdx = newLists.findIndex((l) => l.id === activeListId);
      const afterListId = newIdx > 0 ? (newLists[newIdx - 1]?.id ?? null) : null;

      try {
        await moveList(activeListId, { afterListId });
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : 'Erro ao mover coluna.';
        console.error('[board] moveList failed:', msg);
        queryClient.invalidateQueries({ queryKey: boardsQueries.detail(boardId).queryKey });
      }
      return;
    }

    // Pra drag de card, normaliza o overId (tira "col:" se veio do sortable da coluna)
    const overId = normalizeOverForCard(rawOverId);

    // Drop na coluna virtual "Finalizado" = finalizar card
    if (overId === COMPLETED_DROPPABLE_ID) {
      // Remove otimisticamente da lista atual e incrementa contagem
      queryClient.setQueryData<BoardDetail>(boardsQueries.detail(boardId).queryKey, (prev) => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        for (const l of next.lists) {
          const idx = l.cards.findIndex((c) => c.id === activeId);
          if (idx >= 0) {
            l.cards.splice(idx, 1);
            break;
          }
        }
        next.completedCount = (next.completedCount ?? 0) + 1;
        return next;
      });
      try {
        await completeCard(activeId);
        queryClient.invalidateQueries({ queryKey: ['boards', boardId, 'completed'] });
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : 'Erro ao finalizar card.';
        console.error('[board] complete failed:', msg);
        queryClient.invalidateQueries({ queryKey: boardsQueries.detail(boardId).queryKey });
      }
      return;
    }

    const activeListId = cardIdToListId.get(activeId);
    if (!activeListId) return;

    const destList = board.lists.find((l) => l.id === activeListId);
    if (!destList) return;

    // Se droppou em outro card, reordena dentro da lista
    const overIsCard = cardIdToListId.has(overId);
    let afterCardId: string | null = null;
    let toListId = activeListId;

    if (overIsCard && overId !== activeId) {
      // Reorder: pegar índice do card alvo e usar o anterior como afterCardId
      const overListId = cardIdToListId.get(overId)!;
      toListId = overListId;
      const destList2 = board.lists.find((l) => l.id === overListId);
      if (destList2) {
        const overIndex = destList2.cards.findIndex((c) => c.id === overId);
        if (overIndex >= 0) {
          // Reflete posição otimista no cache local
          queryClient.setQueryData<BoardDetail>(boardsQueries.detail(boardId).queryKey, (prev) => {
            if (!prev) return prev;
            const next = structuredClone(prev);
            const sourceList = next.lists.find((l) => l.cards.some((c) => c.id === activeId));
            const targetList = next.lists.find((l) => l.id === overListId);
            if (!sourceList || !targetList) return prev;
            const fromIdx = sourceList.cards.findIndex((c) => c.id === activeId);
            const toIdx = targetList.cards.findIndex((c) => c.id === overId);
            if (sourceList === targetList) {
              targetList.cards = arrayMove(targetList.cards, fromIdx, toIdx);
            } else {
              const [moved] = sourceList.cards.splice(fromIdx, 1);
              targetList.cards.splice(toIdx, 0, moved!);
            }
            return next;
          });
          afterCardId = overIndex > 0 ? (destList2.cards[overIndex - 1]?.id ?? null) : null;
        }
      }
    }

    try {
      await moveCard(activeId, { toListId, afterCardId });
    } catch (err) {
      // Rollback em caso de erro
      const msg = err instanceof ApiError ? err.message : 'Erro ao mover card.';
      console.error('[board] move failed:', msg);
      queryClient.invalidateQueries({ queryKey: boardsQueries.detail(boardId).queryKey });
    }
  }

  if (boardQuery.isLoading) {
    return (
      <div className="flex h-[calc(100vh-52px)] items-center justify-center">
        <Loader2 size={20} className="text-fg-muted animate-spin" />
      </div>
    );
  }

  if (!board) {
    return (
      <div className="container py-10">
        <p className="text-fg-muted text-sm">Quadro não encontrado.</p>
      </div>
    );
  }

  return (
    <div className="bg-bg-subtle flex h-[calc(100vh-52px)] flex-col">
      <BoardHeader
        board={board}
        search={search}
        onSearchChange={setSearch}
        filters={filters}
        onFiltersChange={setFilters}
        onlineUserIds={onlineUserIds}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="inline-flex h-full gap-4 p-4 sm:gap-5 sm:p-6">
            <SortableContext
              items={board.lists.map((l) => `${LIST_SORT_PREFIX}${l.id}`)}
              strategy={horizontalListSortingStrategy}
            >
              {board.lists.map((list) => {
                const sortedCards = sortCardsForBoard(list.cards, board.cardOrdering);
                const filteredCards = applyBoardFilters(sortedCards, filters, currentUserId);
                const visibleCards = searchNorm
                  ? filteredCards.filter((c) => c.title.toLowerCase().includes(searchNorm))
                  : filteredCards;
                const otherLists = board.lists.filter((l) => l.id !== list.id);
                return (
                  <ListColumn
                    key={list.id}
                    list={list}
                    otherLists={otherLists}
                    isAdmin={board.myRole === 'ADMIN'}
                  >
                    <SortableContext
                      items={visibleCards.map((c) => c.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {visibleCards.map((card) => (
                        <CardItem key={card.id} card={card} />
                      ))}
                    </SortableContext>
                  </ListColumn>
                );
              })}
            </SortableContext>
            {board.myRole === 'ADMIN' && <AddColumnButton boardId={boardId} />}
            <CompletedColumn boardId={boardId} completedCount={board.completedCount ?? 0} />
          </div>
        </div>

        <DragOverlay>{activeCard && <CardOverlay card={activeCard} />}</DragOverlay>
      </DndContext>

      <Suspense fallback={null}>
        <CardModal boardId={boardId} />
      </Suspense>
    </div>
  );
}
