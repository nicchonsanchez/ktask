'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageSquare, Pencil, Plus, Send, Trash2, X } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@ktask/ui';
import {
  createMessageTemplate,
  deleteMessageTemplate,
  messageTemplatesQueries,
  updateMessageTemplate,
  type MessageTemplate,
  type MessageTemplateType,
} from '@/lib/queries/message-templates';
import { useAuthStore } from '@/stores/auth-store';
import { useConfirm, useNotify } from '@/components/ui/dialogs';
import { ApiError } from '@/lib/api-client';
import { UserAvatar } from '@/components/user-avatar';
import { VarTextarea, type TemplateVar } from '@/components/board/var-textarea';

const ALL_VARS: Record<MessageTemplateType, TemplateVar[]> = {
  whatsapp: [
    { token: '{{card.title}}', label: 'Título do card' },
    { token: '{{card.list.name}}', label: 'Coluna' },
    { token: '{{card.board.name}}', label: 'Fluxo' },
    { token: '{{card.lead.name}}', label: 'Líder do card' },
    { token: '{{actor.name}}', label: 'Quem disparou' },
    { token: '{{recipient.name}}', label: 'Nome do contato' },
    { token: '{{recipient.firstName}}', label: 'Primeiro nome do contato' },
  ],
  comment: [
    { token: '{{card.title}}', label: 'Título do card' },
    { token: '{{card.list.name}}', label: 'Coluna' },
    { token: '{{card.board.name}}', label: 'Fluxo' },
    { token: '{{actor.name}}', label: 'Quem disparou' },
  ],
};

const TYPE_LABEL: Record<MessageTemplateType, string> = {
  whatsapp: 'WhatsApp',
  comment: 'Comentário',
};

const TYPE_ICON: Record<MessageTemplateType, React.ComponentType<{ size?: number }>> = {
  whatsapp: Send,
  comment: MessageSquare,
};

export default function ModelosMensagemPage() {
  const [filter, setFilter] = useState<MessageTemplateType | 'ALL'>('ALL');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);

  const listQ = useQuery({
    ...messageTemplatesQueries.list(filter === 'ALL' ? undefined : filter),
  });

  const items = listQ.data ?? [];

  return (
    <div className="container max-w-4xl py-8">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-fg text-xl font-semibold">Modelos de mensagem</h1>
          <p className="text-fg-muted mt-1 text-sm">
            Templates reutilizáveis pra automações de WhatsApp e comentário automático.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
        >
          <Plus size={14} />
          Novo modelo
        </button>
      </header>

      <div className="mb-3 flex items-center gap-1.5">
        <FilterChip active={filter === 'ALL'} onClick={() => setFilter('ALL')}>
          Todos
        </FilterChip>
        <FilterChip active={filter === 'whatsapp'} onClick={() => setFilter('whatsapp')}>
          WhatsApp
        </FilterChip>
        <FilterChip active={filter === 'comment'} onClick={() => setFilter('comment')}>
          Comentário
        </FilterChip>
      </div>

      {listQ.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 size={18} className="text-fg-muted animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="border-border/70 bg-bg-subtle/30 rounded-lg border border-dashed px-6 py-16 text-center">
          <p className="text-fg text-sm font-medium">Nenhum modelo ainda</p>
          <p className="text-fg-muted mx-auto mt-1 max-w-sm text-[12px] leading-relaxed">
            Crie modelos pra reaproveitar mensagens em automações de WhatsApp e comentários
            automáticos. Variáveis Mustache (<code>{'{{card.title}}'}</code>) continuam funcionando
            dentro do modelo.
          </p>
        </div>
      ) : (
        <ul className="border-border/60 divide-border/40 flex flex-col divide-y rounded-md border">
          {items.map((tpl) => (
            <Row key={tpl.id} tpl={tpl} onEdit={() => setEditing(tpl)} />
          ))}
        </ul>
      )}

      {creating && <EditorDialog mode="create" onClose={() => setCreating(false)} />}
      {editing && <EditorDialog mode="edit" template={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
        active
          ? 'bg-primary text-primary-fg'
          : 'border-border/70 text-fg-muted hover:bg-bg-muted border bg-transparent'
      }`}
    >
      {children}
    </button>
  );
}

function Row({ tpl, onEdit }: { tpl: MessageTemplate; onEdit: () => void }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const notify = useNotify();
  const me = useAuthStore((s) => s.user);

  const Icon = TYPE_ICON[tpl.type];

  const deleteMut = useMutation({
    mutationFn: () => deleteMessageTemplate(tpl.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-templates'] });
      notify.success('Modelo removido.');
    },
    onError: (err) =>
      notify.error(err instanceof ApiError ? err.message : 'Falha ao remover modelo.'),
  });

  async function handleDelete() {
    const ok = await confirm({
      title: 'Remover este modelo?',
      description: tpl.name,
      confirmLabel: 'Remover',
      danger: true,
    });
    if (ok) deleteMut.mutate();
  }

  const canEdit = tpl.createdById === me?.id; // ADMIN/OWNER backend ja libera tb

  return (
    <li className="hover:bg-bg-subtle/40 flex items-center gap-3 px-4 py-3">
      <span className="bg-primary-subtle text-primary inline-flex size-8 shrink-0 items-center justify-center rounded">
        <Icon size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-fg text-sm font-semibold">{tpl.name}</p>
          <span className="border-border/70 text-fg-muted rounded-full border px-1.5 py-0 text-[10px]">
            {TYPE_LABEL[tpl.type]}
          </span>
        </div>
        <p className="text-fg-muted mt-0.5 line-clamp-2 text-[11px] leading-snug">{tpl.body}</p>
        <div className="text-fg-subtle mt-1 flex items-center gap-1.5 text-[10px]">
          <UserAvatar
            name={tpl.createdBy.name}
            userId={tpl.createdBy.id}
            avatarUrl={tpl.createdBy.avatarUrl}
            size="xs"
          />
          <span>{tpl.createdBy.name}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="text-fg-muted hover:text-primary shrink-0 rounded p-1.5"
        aria-label="Editar"
        title={canEdit ? 'Editar' : 'Editar (admin)'}
      >
        <Pencil size={13} />
      </button>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleteMut.isPending}
        className="text-fg-muted hover:text-danger shrink-0 rounded p-1.5"
        aria-label="Remover"
        title="Remover"
      >
        {deleteMut.isPending ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Trash2 size={13} />
        )}
      </button>
    </li>
  );
}

function EditorDialog({
  mode,
  template,
  onClose,
}: {
  mode: 'create' | 'edit';
  template?: MessageTemplate;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const notify = useNotify();
  const [name, setName] = useState(template?.name ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [type, setType] = useState<MessageTemplateType>(template?.type ?? 'whatsapp');
  const ref = useRef<HTMLTextAreaElement>(null);

  const vars = useMemo(() => ALL_VARS[type], [type]);

  const saveMut = useMutation({
    mutationFn: () => {
      if (mode === 'create') {
        return createMessageTemplate({ name: name.trim(), body: body.trim(), type });
      }
      return updateMessageTemplate(template!.id, { name: name.trim(), body: body.trim() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-templates'] });
      notify.success(mode === 'create' ? 'Modelo criado.' : 'Modelo atualizado.');
      onClose();
    },
    onError: (err) =>
      notify.error(err instanceof ApiError ? err.message : 'Falha ao salvar modelo.'),
  });

  const canSubmit = name.trim().length > 0 && body.trim().length > 0 && !saveMut.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent hideClose className="max-w-lg gap-0 p-0">
        <header className="border-border/60 flex items-start justify-between border-b px-5 py-4">
          <DialogTitle className="text-fg text-[15px] font-semibold">
            {mode === 'create' ? 'Novo modelo' : 'Editar modelo'}
          </DialogTitle>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-muted hover:bg-bg-muted hover:text-fg -mr-1 -mt-1 rounded-full p-1.5"
            aria-label="Fechar"
          >
            <X size={15} />
          </button>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) saveMut.mutate();
          }}
          className="flex flex-col gap-3 px-5 py-4"
        >
          <label className="flex flex-col gap-1">
            <span className="text-fg-muted text-[11px] font-medium">Nome</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="Ex: Aviso de prazo"
              className="border-border focus:border-primary rounded-md border px-2 py-1.5 text-sm focus:outline-none"
              required
            />
          </label>

          {mode === 'create' && (
            <label className="flex flex-col gap-1">
              <span className="text-fg-muted text-[11px] font-medium">Tipo</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as MessageTemplateType)}
                className="border-border focus:border-primary rounded-md border px-2 py-1.5 text-sm focus:outline-none"
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="comment">Comentário automático</option>
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-fg-muted text-[11px] font-medium">Corpo da mensagem</span>
            <VarTextarea
              ref={ref}
              value={body}
              onChange={setBody}
              vars={vars}
              rows={6}
              maxLength={2000}
              placeholder="Digite / pra inserir variáveis. Ex: Olá /primeiro-nome..."
            />
          </label>

          <div className="border-border/60 bg-bg-subtle/40 -mx-5 -mb-4 mt-1 flex items-center justify-end gap-2 border-t px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saveMut.isPending}
              className="text-fg-muted hover:text-fg hover:bg-bg-muted rounded-md px-3 py-1.5 text-[13px] font-medium disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[13px] font-semibold disabled:opacity-50"
            >
              {saveMut.isPending && <Loader2 size={13} className="animate-spin" />}
              {mode === 'create' ? 'Criar' : 'Salvar'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
