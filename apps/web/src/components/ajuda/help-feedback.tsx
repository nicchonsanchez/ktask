'use client';

import { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export function HelpFeedback() {
  const [vote, setVote] = useState<'up' | 'down' | null>(null);

  if (vote) {
    return (
      <div className="border-border bg-bg-subtle text-fg-muted rounded-lg border p-4 text-sm">
        Obrigado pelo retorno!{' '}
        {vote === 'down' && (
          <>
            Se quiser explicar o que faltou, use o{' '}
            <a href="/ajuda/suporte" className="text-primary hover:underline">
              formulário de suporte
            </a>
            .
          </>
        )}
      </div>
    );
  }

  return (
    <div className="border-border bg-bg-subtle flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
      <span className="text-fg text-sm font-medium">Esse artigo foi útil?</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setVote('up')}
          className={cn(
            'border-border bg-bg text-fg-muted hover:border-primary hover:text-primary inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors',
          )}
        >
          <ThumbsUp size={14} aria-hidden />
          Sim
        </button>
        <button
          type="button"
          onClick={() => setVote('down')}
          className={cn(
            'border-border bg-bg text-fg-muted hover:border-primary hover:text-primary inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors',
          )}
        >
          <ThumbsDown size={14} aria-hidden />
          Não
        </button>
      </div>
    </div>
  );
}
