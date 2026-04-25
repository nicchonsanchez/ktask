'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, ChevronDown, Globe, Loader2, Lock, Plus } from 'lucide-react';

import { Button, Dialog, DialogContent, DialogTitle } from '@ktask/ui';
import {
  archiveBoard,
  boardsQueries,
  updateBoard,
  type BoardDetail,
  type CardOrdering,
} from '@/lib/queries/boards';
import { ApiError } from '@/lib/api-client';
import { UserAvatar } from '@/components/user-avatar';
import { useConfirm } from '@/components/ui/dialogs';
import { BoardMemberPicker } from './board-member-picker';

type Visibility = 'PRIVATE' | 'ORGANIZATION';

const ORDERING_OPTIONS: Array<{ value: CardOrdering; label: string }> = [
  { value: 'MANUAL', label: 'Manual (padrão)' },
  { value: 'TIME_IN_LIST', label: 'Tempo na coluna' },
  { value: 'TIME_INTERACTION', label: 'Tempo de interação' },
  { value: 'ALPHABETICAL', label: 'Ordem alfabética' },
  { value: 'COMPLETION_DATE', label: 'Data de conclusão' },
  { value: 'CREATION_DATE', label: 'Data de criação (identificador único do card)' },
];

export function BoardSettingsDialog({
  board,
  open,
  onOpenChange,
}: {
  board: BoardDetail;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [description, setDescription] = useState(board.description ?? '');
  const [visibility, setVisibility] = useState<Visibility>(board.visibility);
  const [cardOrdering, setCardOrdering] = useState<CardOrdering>(board.cardOrdering);
  const [inheritTeam, setInheritTeam] = useState<boolean>(board.inheritTeamOnNewCards);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDescription(board.description ?? '');
      setVisibility(board.visibility);
      setCardOrdering(board.cardOrdering);
      setInheritTeam(board.inheritTeamOnNewCards);
      setError(null);
    }
  }, [open, board.description, board.visibility, board.cardOrdering, board.inheritTeamOnNewCards]);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: boardsQueries.detail(board.id).queryKey });
    queryClient.invalidateQueries({ queryKey: ['boards'] });
  }

  const saveMut = useMutation({
    mutationFn: () =>
      updateBoard(board.id, {
        description: description.trim() ? description.trim() : null,
        visibility,
        cardOrdering,
        inheritTeamOnNewCards: inheritTeam,
      }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Erro ao salvar.'),
  });

  const archiveMut = useMutation({
    mutationFn: () => archiveBoard(board.id),
    onSuccess: () => {
      invalidate();
      window.location.href = '/quadros';
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Erro ao inativar.'),
  });

  const dirty =
    description !== (board.description ?? '') ||
    visibility !== board.visibility ||
    cardOrdering !== board.cardOrdering ||
    inheritTeam !== board.inheritTeamOnNewCards;

  function handleSave(closeAfter: boolean) {
    saveMut.mutate(undefined, {
      onSuccess: () => {
        if (closeAfter) onOpenChange(false);
      },
    });
  }

  async function handleArchive() {
    const ok = await confirm({
      title: `Inativar "${board.name}"?`,
      description:
        'O fluxo sai da listagem de quadros mas pode ser restaurado depois. Cards e dados continuam preservados.',
      confirmLabel: 'Inativar',
      danger: true,
    });
    if (ok) archiveMut.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[100dvh] max-h-[100dvh] w-screen max-w-[100vw] gap-0 overflow-hidden rounded-none p-0 sm:h-[calc(100vh-4rem)] sm:max-h-[860px] sm:w-[calc(100vw-4rem)] sm:max-w-[1100px] sm:rounded-md">
        <div className="border-border flex items-center justify-between border-b px-6 py-3">
          <DialogTitle className="text-base">Configurações do fluxo</DialogTitle>
        </div>

        <div className="grid h-full grid-cols-1 gap-6 overflow-y-auto p-6 md:grid-cols-[1fr_320px]">
          {/* Coluna esquerda: configurações */}
          <div className="flex flex-col gap-5">
            <Section title="Descrição do fluxo">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva o propósito deste fluxo..."
                rows={4}
                className="border-border bg-bg focus-visible:ring-primary w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2"
              />
            </Section>

            <Section title="Arquivos">
              <button
                type="button"
                disabled
                className="border-border text-fg-muted bg-bg-subtle inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs"
                title="Em breve"
              >
                <Plus size={14} />
                Adicionar arquivo
              </button>
              <p className="text-fg-subtle mt-2 text-[11px]">
                Em breve: anexar arquivos compartilhados no nível do fluxo.
              </p>
            </Section>

            <Section title="Ordenação padrão do fluxo">
              <p className="text-fg-muted mb-2 text-xs font-semibold">
                Critério de ordenação dos cards do fluxo:
              </p>
              <p className="text-fg-muted mb-3 text-[11px] leading-relaxed">
                Escolha um tipo de ordenação para organizar os cards em todas as colunas do fluxo. A
                ordenação manual na coluna fica inativa quando outra ordenação estiver selecionada.
                Você poderá mover os cards entre colunas normalmente.
              </p>
              <div className="relative">
                <select
                  value={cardOrdering}
                  onChange={(e) => setCardOrdering(e.target.value as CardOrdering)}
                  className="border-border bg-bg focus-visible:ring-primary w-full appearance-none rounded-md border px-3 py-2 pr-9 text-sm focus-visible:outline-none focus-visible:ring-2"
                >
                  {ORDERING_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="text-fg-muted pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
                />
              </div>
            </Section>

            <Section title="Inativar fluxo">
              <p className="text-fg mb-2 text-xs font-semibold">Ao realizar esta ação:</p>
              <ul className="text-fg-muted mb-3 list-disc space-y-1 pl-5 text-[11px] leading-relaxed">
                <li>
                  O fluxo não aparecerá no menu principal de fluxos e não poderá ser acessado por
                  nenhum usuário;
                </li>
                <li>
                  Os cards que estiverem no fluxo continuarão vinculados a ele, mas não poderão ser
                  movidos entre as colunas;
                </li>
                <li>Para reativar o fluxo, será necessário acessar a tela de Gestão de fluxos.</li>
              </ul>
              <Button
                variant="outline"
                onClick={handleArchive}
                disabled={archiveMut.isPending}
                className="text-danger border-danger/40 hover:bg-danger-subtle"
              >
                {archiveMut.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Archive size={14} />
                )}
                Inativar
              </Button>
            </Section>
          </div>

          {/* Coluna direita: privacidade + equipe + salvar + autoria */}
          <div className="flex flex-col gap-5">
            <Section title="Privacidade">
              <div className="flex flex-col gap-2">
                <VisibilityOption
                  label="Público"
                  description="Todos da organização podem acessar o fluxo."
                  icon={<Globe size={15} />}
                  selected={visibility === 'ORGANIZATION'}
                  onClick={() => setVisibility('ORGANIZATION')}
                />
                <VisibilityOption
                  label="Secreto"
                  description="Somente membros adicionados ao fluxo podem acessar."
                  icon={<Lock size={15} />}
                  selected={visibility === 'PRIVATE'}
                  onClick={() => setVisibility('PRIVATE')}
                />
              </div>
            </Section>

            <Section
              title="Equipe do fluxo"
              right={<span className="text-fg-muted text-[11px]">{board.members.length}</span>}
            >
              <label className="mb-3 flex cursor-pointer items-start gap-2 text-xs">
                <Checkbox checked={inheritTeam} onChange={() => setInheritTeam((v) => !v)} />
                <span className="leading-snug">
                  Incluir equipe do fluxo como equipe dos cards quando novos cards forem criados.
                </span>
              </label>
              <BoardMemberPicker boardId={board.id} members={board.members} />
            </Section>

            <div className="flex flex-col gap-2">
              <Button onClick={() => handleSave(false)} disabled={!dirty || saveMut.isPending}>
                {saveMut.isPending && <Loader2 size={14} className="animate-spin" />}
                Salvar todas as alterações
              </Button>
              <button
                type="button"
                onClick={() => handleSave(true)}
                disabled={!dirty || saveMut.isPending}
                className="text-primary hover:text-primary/80 text-sm font-medium disabled:opacity-50"
              >
                Salvar e fechar
              </button>
              {error && <p className="text-danger text-xs">{error}</p>}
            </div>

            <Authorship board={board} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function VisibilityOption({
  label,
  description,
  icon,
  selected,
  onClick,
}: {
  label: string;
  description: string;
  icon: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-colors ${
        selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-bg-muted'
      }`}
      aria-pressed={selected}
    >
      <span className={`mt-0.5 shrink-0 ${selected ? 'text-primary' : 'text-fg-muted'}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-fg-muted text-[11px]">{description}</p>
      </div>
    </button>
  );
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors ${
        checked
          ? 'bg-primary border-primary text-primary-fg'
          : 'border-border bg-bg hover:border-border-strong'
      }`}
    >
      {checked && (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
}

function Authorship({ board }: { board: BoardDetail }) {
  const ago = humanizeAgo(new Date(board.createdAt));
  return (
    <div className="text-fg-muted flex items-center gap-2 text-[11px]">
      <UserAvatar
        name={board.createdBy.name}
        userId={board.createdBy.id}
        avatarUrl={board.createdBy.avatarUrl}
        size="sm"
      />
      <span>
        <span className="text-fg font-medium">{board.createdBy.name}</span> criou este fluxo {ago}
      </span>
    </div>
  );
}

function humanizeAgo(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'há instantes';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days} dia${days === 1 ? '' : 's'}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `há ${months} ${months === 1 ? 'mês' : 'meses'}`;
  const years = Math.floor(months / 12);
  return `há ${years} ano${years === 1 ? '' : 's'}`;
}
