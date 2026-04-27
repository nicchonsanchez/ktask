'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { Dialog, DialogContent, DialogTitle } from '@ktask/ui';
import { cardsQueries } from '@/lib/queries/cards';
import { CardModalContent, CardModalSkeleton } from './card-modal';

/**
 * Versao "global" do CardModal — renderiza em qualquer rota do app
 * autenticado quando a URL tem ?card=X. Permite abrir um card vindo de
 * notificacao, link copiado, busca, ou qualquer lugar — sem precisar
 * navegar primeiro pro fluxo dele.
 *
 * Permissao: o backend (GET /cards/:id) ja valida acesso (board publico
 * OU user e membro do board OU user e membro/lead do card). Se nao tem
 * permissao, retorna 403 e a query falha — exibimos "card nao encontrado".
 *
 * NAO renderiza em rotas /b/[boardId] — la o CardModal local ja cuida e
 * tem o boardId pelo path. Isso evita duplo render do mesmo dialog.
 */
export function GlobalCardModal() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const cardId = params.get('card');

  // Em /b/[boardId]/* o CardModal local cuida — nao duplica
  const insideBoard = pathname.startsWith('/b/');

  const query = useQuery({
    ...cardsQueries.detail(cardId ?? ''),
    enabled: Boolean(cardId) && !insideBoard,
  });

  if (insideBoard || !cardId) return null;

  function close() {
    const next = new URLSearchParams(params.toString());
    next.delete('card');
    next.delete('n');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        hideClose
        className="h-[100dvh] max-h-[100dvh] w-screen max-w-[100vw] gap-0 overflow-hidden rounded-none p-0 sm:h-[calc(100vh-4rem)] sm:max-h-[960px] sm:w-[calc(100vw-4rem)] sm:max-w-[1200px] sm:rounded-md"
      >
        {query.isLoading && <CardModalSkeleton />}
        {query.data && (
          <CardModalContent card={query.data} boardId={query.data.boardId} onClose={close} />
        )}
        {!query.isLoading && !query.data && (
          <div className="p-8">
            <DialogTitle>Card não encontrado</DialogTitle>
            <p className="text-fg-muted mt-2 text-sm">
              Pode ter sido arquivado ou você não tem permissão para acessá-lo.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
