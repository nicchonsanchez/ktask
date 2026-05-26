'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertCircle } from 'lucide-react';

import { api, ApiError } from '@/lib/api-client';

/**
 * Rota /c/:code — abre o card como modal sobre home.
 *
 * Aceita dois formatos:
 *  - **CUID** (formato preferido pra links compartilhados): `cmoxpj1i...`
 *    25 chars iniciando com 'c'. Globalmente unico — ninguem abre o card
 *    errado, mesmo cross-organization. Redireciona direto sem API call.
 *  - **shortCode** (#412): backward compat com links antigos. Resolve
 *    via /api/v1/cards/by-code dentro da Org do user logado.
 *
 * Permissao do card eh checada via assertCardAccess no proprio
 * /cards/:id (chamado pelo GlobalCardModal apos o redirect). Multi-fluxo:
 * user com acesso a qualquer board do card consegue abrir.
 */
const CUID_PATTERN = /^c[0-9a-z]{20,30}$/;

export default function CardByShortCodePage() {
  const router = useRouter();
  const { code } = useParams<{ code: string }>();
  const isCuid = code ? CUID_PATTERN.test(code) : false;

  // Caminho CUID: redireciona direto. Sem API call.
  useEffect(() => {
    if (isCuid && code) {
      router.replace(`/?card=${code}`);
    }
  }, [isCuid, code, router]);

  // Caminho shortCode: precisa resolver via API pra pegar o id.
  const q = useQuery({
    queryKey: ['cards', 'by-code', code],
    queryFn: () =>
      api.get<{ id: string; boardId: string }>(`/api/v1/cards/by-code/${encodeURIComponent(code)}`),
    enabled: !!code && !isCuid,
    retry: false,
  });

  useEffect(() => {
    if (!isCuid && q.data) {
      router.replace(`/?card=${q.data.id}`);
    }
  }, [isCuid, q.data, router]);

  if (isCuid || q.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-fg-muted flex items-center gap-2 text-sm">
          <Loader2 size={16} className="animate-spin" />
          {isCuid ? 'Abrindo card…' : `Procurando card #${code}…`}
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
