'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertCircle } from 'lucide-react';

import { api, ApiError } from '@/lib/api-client';

/**
 * Rota curta /c/:code — resolve shortCode (#412) -> { id } e redireciona
 * pra `/?card=<id>` (modal sobre home, renderizado por GlobalCardModal).
 *
 * Antes redirecionava pra `/b/<boardId>?card=<id>`, mas isso quebrava o
 * acesso de usuarios que sao membros so de boards secundarios do card
 * (multi-fluxo): board primario do card pode ser inacessivel pra eles.
 * Agora a permissao eh verificada no proprio endpoint do card via
 * assertCardAccess no backend.
 *
 * Uso: link verbal/escrito ("/c/412") sem precisar saber em qual board
 * o card está. Se o codigo nao existir, mostra mensagem amigavel.
 */
export default function CardByShortCodePage() {
  const router = useRouter();
  const { code } = useParams<{ code: string }>();

  const q = useQuery({
    queryKey: ['cards', 'by-code', code],
    queryFn: () =>
      api.get<{ id: string; boardId: string }>(`/api/v1/cards/by-code/${encodeURIComponent(code)}`),
    enabled: !!code,
    retry: false,
  });

  useEffect(() => {
    if (q.data) {
      router.replace(`/?card=${q.data.id}`);
    }
  }, [q.data, router]);

  if (q.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-fg-muted flex items-center gap-2 text-sm">
          <Loader2 size={16} className="animate-spin" />
          Procurando card #{code}…
        </div>
      </div>
    );
  }

  if (q.isError) {
    const msg =
      q.error instanceof ApiError && q.error.status === 404
        ? `Card #${code} não foi encontrado.`
        : 'Erro ao buscar o card.';
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="border-border bg-bg flex max-w-md flex-col items-center gap-2 rounded-lg border p-6 text-center shadow-sm">
          <AlertCircle size={28} className="text-warning" />
          <p className="text-base font-semibold">{msg}</p>
          <p className="text-fg-muted text-xs">
            Verifique o número ou peça pra quem mandou o link confirmar o código.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
