'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Filter,
  Globe,
  Layout,
  Link as LinkIcon,
  Lock,
  MoreHorizontal,
  Search,
  Settings,
} from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@ktask/ui';
import { archiveBoard, boardsQueries, updateBoard, type BoardDetail } from '@/lib/queries/boards';
import { UserAvatar } from '@/components/user-avatar';
import { ApiError } from '@/lib/api-client';
import { useConfirm, useNotify } from '@/components/ui/dialogs';
import { BoardMemberPicker } from './board-member-picker';
import { BoardSettingsDialog } from './board-settings-dialog';

const STACK_LIMIT = 4;

export function BoardHeader({
  board,
  search,
  onSearchChange,
}: {
  board: BoardDetail;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const notify = useNotify();

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: boardsQueries.detail(board.id).queryKey });
    queryClient.invalidateQueries({ queryKey: ['boards'] });
  }

  const archiveMut = useMutation({
    mutationFn: () => archiveBoard(board.id),
    onSuccess: () => {
      invalidate();
      window.location.href = '/quadros';
    },
    onError: (err) => {
      notify.error(err instanceof ApiError ? err.message : 'Erro ao inativar fluxo.');
    },
  });

  function copyUrl() {
    const url = `${window.location.origin}/b/${board.id}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  async function handleArchive() {
    setMenuOpen(false);
    const ok = await confirm({
      title: `Inativar "${board.name}"?`,
      description:
        'O fluxo sai da listagem de quadros mas pode ser restaurado depois. Cards e dados continuam preservados.',
      confirmLabel: 'Inativar',
      danger: true,
    });
    if (ok) archiveMut.mutate();
  }

  const visibleMembers = board.members.slice(0, STACK_LIMIT);
  const overflow = Math.max(0, board.members.length - STACK_LIMIT);

  return (
    <>
      <div className="border-border bg-bg flex items-center gap-3 border-b px-6 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            aria-hidden
            className="text-fg-muted inline-flex size-7 shrink-0 items-center justify-center"
          >
            <Layout size={18} />
          </span>
          <h1 className="truncate text-base font-semibold">{board.name}</h1>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="hover:bg-bg-muted -my-1 flex items-center rounded-md px-1 py-1 transition-colors"
                aria-label={`Equipe do fluxo (${board.members.length} pessoas)`}
              >
                <div className="flex -space-x-2">
                  {visibleMembers.map((m) => (
                    <UserAvatar
                      key={m.user.id}
                      name={m.user.name}
                      userId={m.user.id}
                      avatarUrl={m.user.avatarUrl}
                      size="sm"
                      stacked
                    />
                  ))}
                  {overflow > 0 && (
                    <span className="border-bg bg-bg-muted text-fg-muted inline-flex size-6 items-center justify-center rounded-full border-2 text-[10px] font-semibold">
                      +{overflow}
                    </span>
                  )}
                  {visibleMembers.length === 0 && (
                    <span className="text-fg-muted text-xs">Sem membros</span>
                  )}
                </div>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">Equipe do fluxo</p>
                <span className="text-fg-muted text-[11px]">{board.members.length}</span>
              </div>
              <BoardMemberPicker boardId={board.id} members={board.members} />
            </PopoverContent>
          </Popover>

          <VisibilityButton board={board} />

          <div className="border-border/70 focus-within:border-primary/40 focus-within:ring-primary/30 hidden h-8 items-center gap-1.5 rounded-md border px-2 transition-colors focus-within:ring-1 md:flex">
            <Search size={13} className="text-fg-muted shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filtrar por palavra"
              className="text-fg placeholder:text-fg-muted/70 w-44 bg-transparent text-xs focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="text-fg-muted hover:text-fg shrink-0 rounded p-0.5"
                aria-label="Limpar busca"
                title="Limpar"
              >
                <span aria-hidden className="block size-3 leading-none">
                  ×
                </span>
              </button>
            )}
          </div>

          <button
            type="button"
            disabled
            title="Em breve"
            className="border-border/70 text-fg-muted hidden h-8 cursor-not-allowed items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium md:inline-flex"
          >
            <Filter size={13} />
            Filtrar
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="text-fg-muted hover:bg-bg-muted hover:text-fg focus-visible:ring-primary rounded-md p-1.5 focus-visible:outline-none focus-visible:ring-2"
            aria-label="Configurações do fluxo"
          >
            <Settings size={16} />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="text-fg-muted hover:bg-bg-muted hover:text-fg focus-visible:ring-primary rounded-md p-1.5 focus-visible:outline-none focus-visible:ring-2"
              aria-label="Mais ações"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="border-border bg-bg absolute right-0 top-full z-20 mt-1 flex w-56 flex-col rounded-md border p-1 text-xs shadow-lg">
                  <MenuItem
                    label="Configurações do fluxo"
                    icon={<Settings size={14} />}
                    onClick={() => {
                      setMenuOpen(false);
                      setSettingsOpen(true);
                    }}
                  />
                  <MenuItem
                    label={copied ? 'URL copiada' : 'Copiar URL do fluxo'}
                    icon={<LinkIcon size={14} />}
                    onClick={copyUrl}
                  />
                  <div className="border-border my-1 border-t" />
                  <MenuItem
                    label="Inativar fluxo"
                    icon={<Archive size={14} />}
                    danger
                    onClick={handleArchive}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <BoardSettingsDialog board={board} open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}

function VisibilityButton({ board }: { board: BoardDetail }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const updateMut = useMutation({
    mutationFn: (visibility: 'PRIVATE' | 'ORGANIZATION') => updateBoard(board.id, { visibility }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: boardsQueries.detail(board.id).queryKey });
      setOpen(false);
    },
  });

  const isPublic = board.visibility === 'ORGANIZATION';
  const Icon = isPublic ? Globe : Lock;
  const label = isPublic ? 'Público na organização' : 'Secreto';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-fg-muted hover:bg-bg-muted hover:text-fg focus-visible:ring-primary rounded-md p-1.5 focus-visible:outline-none focus-visible:ring-2"
          aria-label={`Privacidade: ${label}`}
          title={label}
        >
          <Icon size={15} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1">
        <button
          type="button"
          onClick={() => updateMut.mutate('ORGANIZATION')}
          disabled={updateMut.isPending}
          className="hover:bg-bg-muted flex w-full items-start gap-2.5 rounded-sm px-2 py-2 text-left"
        >
          <Globe size={15} className="text-fg-muted mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Público</p>
            <p className="text-fg-muted text-[11px]">Todos da organização podem acessar o fluxo.</p>
          </div>
          {isPublic && <span className="text-primary text-[11px] font-medium">atual</span>}
        </button>
        <button
          type="button"
          onClick={() => updateMut.mutate('PRIVATE')}
          disabled={updateMut.isPending}
          className="hover:bg-bg-muted flex w-full items-start gap-2.5 rounded-sm px-2 py-2 text-left"
        >
          <Lock size={15} className="text-fg-muted mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Secreto</p>
            <p className="text-fg-muted text-[11px]">
              Somente membros adicionados ao fluxo podem acessar.
            </p>
          </div>
          {!isPublic && <span className="text-primary text-[11px] font-medium">atual</span>}
        </button>
      </PopoverContent>
    </Popover>
  );
}

function MenuItem({
  label,
  icon,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 rounded-sm px-2 py-1.5 text-left transition-colors ${
        disabled
          ? 'text-fg-subtle cursor-not-allowed'
          : danger
            ? 'text-danger hover:bg-danger-subtle'
            : 'text-fg hover:bg-bg-muted'
      }`}
    >
      {icon}
      <span>{label}</span>
      {disabled && <span className="text-fg-subtle ml-auto text-[10px]">em breve</span>}
    </button>
  );
}
