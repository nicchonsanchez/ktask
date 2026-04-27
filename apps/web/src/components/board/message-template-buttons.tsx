'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookmarkPlus, Download, Loader2 } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@ktask/ui';
import {
  createMessageTemplate,
  messageTemplatesQueries,
  type MessageTemplate,
  type MessageTemplateType,
} from '@/lib/queries/message-templates';
import { useNotify, usePrompt } from '@/components/ui/dialogs';
import { ApiError } from '@/lib/api-client';

/**
 * Dois botões pequenos pra ficar acima da textarea de mensagem:
 *   - Carregar: popover lista modelos (do tipo certo); click substitui
 *     o conteudo atual (com confirmacao implicita pelo overwrite).
 *   - Salvar: pede nome via prompt e cria modelo com o body atual.
 */
export function MessageTemplateButtons({
  type,
  value,
  onChange,
}: {
  type: MessageTemplateType;
  value: string;
  onChange: (next: string) => void;
}) {
  const queryClient = useQueryClient();
  const notify = useNotify();
  const prompt = usePrompt();
  const [openLoad, setOpenLoad] = useState(false);

  const listQ = useQuery({
    ...messageTemplatesQueries.list(type),
    enabled: openLoad,
  });

  const saveMut = useMutation({
    mutationFn: (name: string) => createMessageTemplate({ name, body: value, type }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-templates'] });
      notify.success('Modelo salvo.');
    },
    onError: (err) => {
      notify.error(err instanceof ApiError ? err.message : 'Falha ao salvar modelo.');
    },
  });

  async function handleSave() {
    if (!value.trim()) {
      notify.info('Escreva uma mensagem antes de salvar como modelo.');
      return;
    }
    const name = await prompt({
      title: 'Salvar como modelo',
      description: 'Dê um nome curto pra encontrar fácil depois.',
      placeholder: 'Ex: Aviso de prazo',
      confirmLabel: 'Salvar',
    });
    if (!name?.trim()) return;
    saveMut.mutate(name.trim());
  }

  function handleLoad(tpl: MessageTemplate) {
    onChange(tpl.body);
    setOpenLoad(false);
    notify.info(`Modelo "${tpl.name}" carregado.`);
  }

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={openLoad} onOpenChange={setOpenLoad}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="border-border/70 hover:bg-bg-muted text-fg-muted hover:text-fg inline-flex items-center gap-1 rounded-md border bg-transparent px-2 py-0.5 text-[11px] transition-colors"
            title="Carregar um modelo salvo"
          >
            <Download size={11} />
            Carregar modelo
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <header className="border-border/60 flex items-center justify-between border-b px-3 py-2">
            <p className="text-fg text-xs font-semibold">Modelos salvos</p>
            <span className="text-fg-subtle text-[10px]">{listQ.data?.length ?? 0}</span>
          </header>
          <div className="max-h-72 overflow-y-auto">
            {listQ.isLoading ? (
              <div className="flex justify-center p-4">
                <Loader2 size={14} className="text-fg-muted animate-spin" />
              </div>
            ) : (listQ.data?.length ?? 0) === 0 ? (
              <p className="text-fg-muted px-3 py-4 text-center text-[11px]">
                Nenhum modelo ainda. Use "Salvar como modelo" pra criar o primeiro.
              </p>
            ) : (
              <ul className="divide-border/40 divide-y">
                {listQ.data!.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => handleLoad(t)}
                      className="hover:bg-bg-muted flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left"
                    >
                      <span className="text-fg text-[12px] font-medium">{t.name}</span>
                      <span className="text-fg-muted line-clamp-2 text-[10px] leading-tight">
                        {t.body}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <button
        type="button"
        onClick={handleSave}
        disabled={saveMut.isPending}
        className="border-border/70 hover:bg-bg-muted text-fg-muted hover:text-fg inline-flex items-center gap-1 rounded-md border bg-transparent px-2 py-0.5 text-[11px] transition-colors disabled:opacity-50"
        title="Salvar o texto atual como modelo reutilizável"
      >
        {saveMut.isPending ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <BookmarkPlus size={11} />
        )}
        Salvar como modelo
      </button>
    </div>
  );
}
