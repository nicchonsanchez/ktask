'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Building2,
  ChevronsUp,
  Contact as ContactIcon,
  Copy,
  Eye,
  ExternalLink,
  Flag,
  Hash,
  Link as LinkIcon,
  Lock,
  Unlock,
  MoreHorizontal,
  Paperclip,
  Tag,
  Trash2,
  X,
} from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@ktask/ui';
import {
  archiveCard,
  cardsQueries,
  deleteCardPermanent,
  unassignMember,
  updateCard,
  uploadAttachment,
  type CardDetail,
} from '@/lib/queries/cards';
import { ApiError } from '@/lib/api-client';
import { RichEditor } from '@/components/editor';
import { UserAvatar } from '@/components/user-avatar';
import { TimelineFeed, type TimelineFeedHandle } from './timeline-feed';
import { LeadPicker } from './lead-picker';
import { TeamPicker } from './team-picker';
import { ChecklistBlock } from './checklist-block';
import { AttachmentsBlock } from './attachments-block';
import { VisitedByBlock } from './visited-by-block';
import { DueDatePicker } from './due-date-picker';
import { CardTimerButton } from './card-timer-button';
import { DuplicateCardDialog } from './duplicate-card-dialog';
import { CreateChildCardDialog } from './create-child-card-dialog';
import { SetParentCardDialog } from './set-parent-card-dialog';
import { CardTabsBar, type CardTab } from './card-tabs-bar';
import { CardFlowsTab } from './card-flows-tab';
import { CardFamilyTab } from './card-family-tab';
import { LabelPicker } from './label-picker';
import { ApprovalsBlock } from './approvals-block';
import { ContactsBlock } from './contacts-block';
import { useConfirm, useNotify, usePrompt } from '@/components/ui/dialogs';
import {
  CARD_COLOR_LABEL,
  CARD_COLOR_ORDER,
  CARD_COLOR_SWATCH,
  type CardColor,
} from './card-color-config';
import { StatusPicker } from './status-picker';
import type { CardStatus as CardStatusValue } from './status-config';

export function CardModal({ boardId }: { boardId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const cardId = params.get('card');

  const query = useQuery({
    ...cardsQueries.detail(cardId ?? ''),
    enabled: Boolean(cardId),
  });

  function close() {
    const next = new URLSearchParams(params.toString());
    next.delete('card');
    router.replace(next.size ? `?${next.toString()}` : `/b/${boardId}`, { scroll: false });
  }

  return (
    <Dialog open={Boolean(cardId)} onOpenChange={(open) => !open && close()}>
      <DialogContent
        hideClose
        className="h-[100dvh] max-h-[100dvh] w-screen max-w-[100vw] gap-0 overflow-hidden rounded-none p-0 sm:h-[calc(100vh-4rem)] sm:max-h-[960px] sm:w-[calc(100vw-4rem)] sm:max-w-[1200px] sm:rounded-md"
      >
        {query.isLoading && <CardModalSkeleton />}
        {query.data && <CardModalContent card={query.data} boardId={boardId} onClose={close} />}
        {!query.isLoading && !query.data && (
          <div className="p-8">
            <DialogTitle>Card não encontrado</DialogTitle>
            <p className="text-fg-muted mt-2 text-sm">
              Pode ter sido arquivado ou você não tem acesso.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CardModalContent({
  card,
  boardId,
  onClose,
}: {
  card: CardDetail;
  boardId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const confirmDialog = useConfirm();
  const promptDialog = usePrompt();
  const notify = useNotify();
  const isCompleted = Boolean(card.completedAt);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: cardsQueries.detail(card.id).queryKey });
    queryClient.invalidateQueries({ queryKey: ['boards', boardId] });
  }

  // Mensagem amigável a partir de erro de API. 403 vira "sem permissão";
  // demais usam a mensagem do servidor. Centraliza pra todas as mutations
  // chamarem em onError junto com rollback.
  function errorMessage(err: unknown, fallback: string): string {
    if (err instanceof ApiError) {
      if (err.status === 403) return 'Você não tem permissão para essa ação neste card.';
      return err.message || fallback;
    }
    return fallback;
  }

  const [title, setTitle] = useState(card.title);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setTitle(card.title), [card.title]);

  // Auto-grow do textarea de título: ajusta height pra caber todo o texto
  // sem scroll. Roda em qualquer mudança do valor (digitar, paste, edição
  // externa via realtime, mudança de viewport pode disparar reflow).
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);

  // Optimistic update genérico: sobrescreve campo no cache antes do server
  // confirmar. Em caso de erro, reverte. Linear-style "feels instant".
  function optimistic<T extends keyof CardDetail>(field: T, value: CardDetail[T]) {
    const key = cardsQueries.detail(card.id).queryKey;
    const prev = queryClient.getQueryData<CardDetail>(key);
    queryClient.setQueryData<CardDetail>(key, (old) => (old ? { ...old, [field]: value } : old));
    return prev;
  }
  function rollback(prev: CardDetail | undefined) {
    if (prev) queryClient.setQueryData(cardsQueries.detail(card.id).queryKey, prev);
  }

  const titleMut = useMutation({
    mutationFn: (next: string) => updateCard(card.id, { title: next }),
    onMutate: (next) => ({ prev: optimistic('title', next) }),
    onError: (e, _v, ctx) => {
      rollback(ctx?.prev);
      notify.error(errorMessage(e, 'Erro ao salvar título.'));
    },
    onSuccess: invalidate,
  });

  const descMut = useMutation({
    mutationFn: (doc: unknown) => updateCard(card.id, { description: doc }),
    onError: (e) => notify.error(errorMessage(e, 'Erro ao salvar descrição.')),
    onSuccess: invalidate,
  });

  const cardColorMut = useMutation({
    mutationFn: (cardColor: CardColor | null) => updateCard(card.id, { cardColor }),
    onMutate: (next) => ({ prev: optimistic('cardColor', next) }),
    onError: (e, _v, ctx) => {
      rollback(ctx?.prev);
      notify.error(errorMessage(e, 'Erro ao alterar a cor do card.'));
    },
    onSuccess: invalidate,
  });

  // Doc 25: toggle de privacidade. PUBLIC <-> TEAM_ONLY.
  const privacyMut = useMutation({
    mutationFn: (privacy: CardDetail['privacy']) => updateCard(card.id, { privacy }),
    onMutate: (next) => ({ prev: optimistic('privacy', next) }),
    onError: (e, _v, ctx) => {
      rollback(ctx?.prev);
      notify.error(errorMessage(e, 'Erro ao alterar privacidade.'));
    },
    onSuccess: invalidate,
  });

  // Doc 42: status do card (4 estados ortogonais a coluna).
  const statusMut = useMutation({
    mutationFn: (status: CardStatusValue) => updateCard(card.id, { status }),
    onMutate: (next) => ({ prev: optimistic('status', next) }),
    onError: (e, _v, ctx) => {
      rollback(ctx?.prev);
      notify.error(errorMessage(e, 'Erro ao alterar status.'));
    },
    onSuccess: invalidate,
  });

  const dueDateMut = useMutation({
    mutationFn: (iso: string | null) => updateCard(card.id, { dueDate: iso }),
    onMutate: (iso) => ({ prev: optimistic('dueDate', iso) }),
    onError: (e, _v, ctx) => {
      rollback(ctx?.prev);
      notify.error(errorMessage(e, 'Erro ao alterar prazo.'));
    },
    onSuccess: invalidate,
  });

  const archiveMut = useMutation({
    mutationFn: () => archiveCard(card.id),
    onError: (e) => notify.error(errorMessage(e, 'Erro ao arquivar card.')),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [createChildOpen, setCreateChildOpen] = useState(false);
  const [setParentOpen, setSetParentOpen] = useState(false);
  const [tab, setTab] = useState<CardTab>('home');

  // Drag-and-drop wide: 2 zonas de drop com alvos diferentes.
  // - 'card': dropping na coluna esquerda anexa permanente no card.
  // - 'comment': dropping na coluna direita (timeline) empilha no
  //   composer de comentario — user clica Enviar depois.
  // dragCounter evita flicker durante eventos enter/leave entre filhos.
  const [dragTarget, setDragTarget] = useState<'card' | 'comment' | null>(null);
  const dragCounter = useRef(0);
  const timelineRef = useRef<TimelineFeedHandle>(null);

  /** Aceita drag SO se trouxer arquivos do SO. Texto/HTML ignorado. */
  function isFileDrag(e: React.DragEvent): boolean {
    return Array.from(e.dataTransfer.types).includes('Files');
  }

  function makeDropHandlers(target: 'card' | 'comment') {
    return {
      onDragEnter: (e: React.DragEvent) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        dragCounter.current += 1;
        setDragTarget(target);
      },
      onDragOver: (e: React.DragEvent) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!isFileDrag(e)) return;
        dragCounter.current = Math.max(0, dragCounter.current - 1);
        if (dragCounter.current === 0) setDragTarget(null);
      },
      onDrop: async (e: React.DragEvent) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        dragCounter.current = 0;
        setDragTarget(null);
        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;
        if (target === 'card') {
          // Upload sequencial pra nao saturar conexao. Mesmo padrao do
          // AttachmentsBlock; embedded=false (anexo real, nao inline).
          for (const file of files) {
            try {
              await uploadAttachment(card.id, file);
            } catch (err) {
              const msg = err instanceof ApiError ? err.message : 'Falha no anexo.';
              console.error('drop card attach:', msg);
            }
          }
          queryClient.invalidateQueries({ queryKey: cardsQueries.detail(card.id).queryKey });
        } else {
          // Empurra pro composer da timeline (user envia manualmente).
          timelineRef.current?.addFiles(files);
        }
      },
    };
  }

  // Tab "Timeline" só existe em mobile (em desktop ela vira coluna lateral).
  // Se o usuário está nela e a tela cresce pra lg+, redireciona pra Início.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(min-width: 1024px)');
    const handler = () => {
      if (mql.matches && tab === 'timeline') setTab('home');
    };
    handler();
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [tab]);

  const deleteMut = useMutation({
    mutationFn: () => deleteCardPermanent(card.id),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  // Prefere shortCode (412); fallback nos ultimos 8 chars do cuid pra
  // cards antigos que ainda nao foram backfilled.
  // Sem prefixo "#" — o ícone <Hash /> ao lado ja simboliza isso.
  const cardCode = card.shortCode ?? card.id.slice(-8).toUpperCase();
  const cover = card.coverAttachmentId
    ? card.attachments.find((a) => a.id === card.coverAttachmentId && a.publicUrl)
    : undefined;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Capa do card (cover) — só renderiza quando há um attachment marcado */}
      {cover?.publicUrl && (
        <div className="bg-bg-muted relative h-32 w-full shrink-0 overflow-hidden sm:h-40">
          <img src={cover.publicUrl} alt="" className="size-full object-cover" loading="lazy" />
        </div>
      )}
      {/* Header — inspirado no Ummense mobile.
          Mobile (< sm): botões em cima (alinhados à direita) e título embaixo
            ocupando 100% da largura — pode quebrar em N linhas se for grande.
          Desktop (sm+): título à esquerda, botões à direita, na mesma linha
            (título com flex-1 — ainda pode quebrar mas geralmente fica em 1 linha). */}
      <header className="bg-bg z-20 flex shrink-0 flex-col gap-2 px-5 pb-3 pt-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-7 sm:pt-6">
        {/* Botões — primeiro no mobile (sm:order-2 manda pra direita no desktop) */}
        <div className="-mr-1 flex shrink-0 items-center justify-end gap-1 sm:order-2 sm:mr-0 sm:gap-1.5">
          <StatusPicker
            value={card.status}
            onChange={(s) => statusMut.mutate(s)}
            disabled={statusMut.isPending}
          />
          <CardTimerButton cardId={card.id} />
          <DueDatePicker value={card.dueDate} onChange={(iso) => dueDateMut.mutate(iso)} />
          <CardMenu
            cardId={card.id}
            boardId={boardId}
            shortCode={card.shortCode}
            busy={deleteMut.isPending}
            onArchive={async () => {
              const ok = await confirmDialog({
                title: 'Arquivar card?',
                description:
                  'O card sai do fluxo mas pode ser restaurado depois pela área de arquivados.',
                confirmLabel: 'Arquivar',
              });
              if (ok) archiveMut.mutate();
            }}
            onDuplicate={() => setDuplicateOpen(true)}
            onCreateChild={() => setCreateChildOpen(true)}
            onSetParent={() => setSetParentOpen(true)}
            onDelete={async () => {
              const confirmation = await promptDialog({
                title: `Excluir "${card.title}" permanentemente?`,
                description:
                  'Esta ação é IRREVERSÍVEL — o card, comentários, checklists e anexos serão apagados.',
                requiredText: 'EXCLUIR',
                placeholder: 'Digite EXCLUIR',
                confirmLabel: 'Excluir definitivamente',
                danger: true,
              });
              if (confirmation === 'EXCLUIR') deleteMut.mutate();
            }}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            title="Fechar (Esc)"
            className="text-fg-muted hover:bg-bg-muted hover:text-fg focus-visible:ring-primary inline-flex size-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2"
          >
            <X size={16} />
          </button>
        </div>
        {/* Título + meta — segundo no mobile, primeiro no desktop (sm:order-1) */}
        <div className="min-w-0 flex-1 sm:order-1">
          <textarea
            ref={titleRef}
            rows={1}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              const v = title.trim();
              if (v && v !== card.title) titleMut.mutate(v);
            }}
            onKeyDown={(e) => {
              // Enter (sem Shift) salva e sai. Shift+Enter mantido livre — mas
              // título com quebra manual é raro; o auto-grow já cuida do wrap.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
            placeholder="Título do card"
            className="text-fg block w-full resize-none overflow-hidden bg-transparent text-2xl font-semibold leading-tight tracking-tight focus:outline-none sm:text-[28px]"
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className="bg-bg-muted text-fg-muted inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] tracking-wider"
              title="Código do card"
            >
              <Hash size={10} />
              {cardCode}
            </span>
            <span className="text-fg-subtle text-[11px]">· {card.list.name}</span>
            {isCompleted && (
              <span className="text-success inline-flex items-center gap-1 text-[11px] font-medium">
                <Flag size={10} fill="currentColor" />
                Finalizado
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Tabs horizontais — substituem a sidebar vertical anterior */}
      <CardTabsBar tab={tab} onChange={setTab} />

      {/* Corpo: conteúdo da aba ativa */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {tab !== 'home' && (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {tab === 'flows' && <CardFlowsTab card={card} />}
            {tab === 'family' && <CardFamilyTab card={card} />}
            {tab === 'timeline' && (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4 sm:px-6 lg:hidden">
                <h2 className="text-fg mb-3 text-base font-semibold">
                  Timeline
                  <span className="text-fg-subtle ml-1.5 text-[12px] font-normal">
                    · {card.comments.length + card.activities.length}
                  </span>
                </h2>
                <TimelineFeed
                  cardId={card.id}
                  boardId={boardId}
                  comments={card.comments}
                  activities={card.activities}
                />
              </div>
            )}
          </div>
        )}

        {tab === 'home' && (
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[1fr_400px]">
            {/* Coluna esquerda — dados. Ordem: pessoas → conteúdo (descrição) →
                organização (detalhes/tags) → execução (tarefas/anexos).
                Divisores sutis separam blocos; respiração generosa.
                Drag-and-drop wide: dropping aqui anexa permanente no card.
                Estrutura: outer relative+overflow-hidden serve de positioning
                context pro overlay (que precisa ficar no viewport, nao no
                conteudo rolavel). Scroll fica no filho interno. */}
            <div
              {...makeDropHandlers('card')}
              className="relative flex min-h-0 flex-col overflow-hidden"
            >
              <DropOverlay active={dragTarget === 'card'} label="Solte para anexar ao card" />
              <div className="divide-border/40 flex flex-1 flex-col divide-y overflow-y-auto">
                {/* Equipe — linha única estilo Ummense: label + lead + avatares + cadeado */}
                <div className="px-5 py-4 sm:px-7">
                  <MembersInline
                    card={card}
                    boardId={boardId}
                    onTogglePrivacy={() =>
                      privacyMut.mutate(card.privacy === 'TEAM_ONLY' ? 'PUBLIC' : 'TEAM_ONLY')
                    }
                    togglingPrivacy={privacyMut.isPending}
                  />
                </div>

                <div className="flex flex-col gap-7 px-5 py-6 sm:px-7">
                  {/* Descrição */}
                  <Block icon={<DescriptionIcon />} label="Descrição">
                    <RichEditor
                      value={card.description}
                      onChange={(doc) => descMut.mutate(doc)}
                      placeholder="Escreva detalhes, contexto, links… aceita imagens (paste/drop)."
                      isSaving={descMut.isPending}
                      onUploadImage={async (file) => {
                        const att = await uploadAttachment(card.id, file, { embedded: true });
                        if (!att.publicUrl) {
                          throw new Error('Imagem enviada, mas a URL pública não está disponível.');
                        }
                        return { src: att.publicUrl, alt: att.fileName };
                      }}
                    />
                  </Block>

                  {/* Aprovações — logo após descrição pra que ações urgentes
                      (Aprovar/Reprovar/Cancelar) fiquem visíveis sem muito
                      scroll, especialmente no mobile. */}
                  <Block icon={<ChevronsUp size={14} className="rotate-180" />} label="Aprovações">
                    <ApprovalsBlock
                      cardId={card.id}
                      boardId={card.boardId}
                      currentListId={card.listId}
                    />
                  </Block>

                  {/* Cor decorativa do card. Substituiu o sistema de Priority. */}
                  <Block icon={<ChevronsUp size={14} />} label="Cor do card">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => cardColorMut.mutate(null)}
                        disabled={cardColorMut.isPending}
                        aria-pressed={!card.cardColor}
                        title="Sem cor"
                        className={`focus-visible:ring-primary inline-flex size-7 items-center justify-center rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
                          !card.cardColor
                            ? 'border-fg/40 shadow-sm'
                            : 'border-border/60 hover:border-border-strong opacity-80 hover:opacity-100'
                        }`}
                      >
                        <span
                          aria-hidden
                          className="block size-3.5 rounded-full border border-dashed border-current opacity-60"
                        />
                      </button>
                      {CARD_COLOR_ORDER.map((value) => {
                        const active = card.cardColor === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => cardColorMut.mutate(value)}
                            disabled={cardColorMut.isPending}
                            aria-pressed={active}
                            title={CARD_COLOR_LABEL[value]}
                            className={`focus-visible:ring-primary inline-flex size-7 items-center justify-center rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
                              active
                                ? 'border-fg/40 shadow-sm'
                                : 'border-border/60 hover:border-border-strong opacity-80 hover:opacity-100'
                            }`}
                          >
                            <span
                              aria-hidden
                              className="block size-4 rounded-full"
                              style={{ backgroundColor: CARD_COLOR_SWATCH[value] }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </Block>

                  {/* Tags (labels) */}
                  <Block
                    icon={<Tag size={14} />}
                    label="Etiquetas"
                    count={card.labels.length || undefined}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      {card.labels.map((cl) => (
                        <span
                          key={cl.labelId}
                          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium text-white"
                          style={{ backgroundColor: cl.label.color }}
                        >
                          {cl.label.name}
                        </span>
                      ))}
                      <LabelPicker card={card} boardId={boardId} />
                    </div>
                  </Block>

                  {/* Doc 38: Empresa(s) + Contatos vinculados. Dois Blocks
                      lado-a-lado em md+, empilhados em mobile. Grid 1fr 1fr
                      pra dar peso igual; gap-7 vertical pra casar com o
                      espaçamento dos outros Blocks quando empilhado. */}
                  <div className="grid grid-cols-1 gap-7 md:grid-cols-2">
                    <Block icon={<Building2 size={14} />} label="Empresa">
                      <ContactsBlock cardId={card.id} filterType="COMPANY" />
                    </Block>
                    <Block icon={<ContactIcon size={14} />} label="Contatos">
                      <ContactsBlock cardId={card.id} filterType="PERSON" />
                    </Block>
                  </div>

                  {/* Tarefas do card */}
                  <Block
                    icon={<ChecklistIcon />}
                    label="Tarefas do card"
                    count={checklistCounts(card)}
                  >
                    <ChecklistBlock card={card} boardId={boardId} />
                  </Block>

                  {/* Anexos */}
                  <Block
                    icon={<Paperclip size={14} />}
                    label="Anexos"
                    count={card.attachments.length || undefined}
                  >
                    <AttachmentsBlock card={card} boardId={boardId} />
                  </Block>

                  {/* Visualizado por — auditoria minimalista. Lista discreta
                      no fim do modal pra nao competir com info mais util. */}
                  <Block icon={<Eye size={14} />} label="Visualizado por">
                    <VisitedByBlock cardId={card.id} />
                  </Block>
                </div>
              </div>
            </div>

            {/* Coluna direita — Timeline (atividade + comentários). No mobile,
                Timeline tem aba própria, então essa coluna só aparece em lg+.
                Drag-and-drop wide: dropping aqui empilha no composer do
                comentário em vez de anexar no card. */}
            <aside
              {...makeDropHandlers('comment')}
              className="border-border/60 bg-bg-subtle relative hidden min-h-0 flex-col overflow-hidden lg:flex lg:border-l"
            >
              <DropOverlay
                active={dragTarget === 'comment'}
                label="Solte para anexar ao comentário"
              />
              <div className="flex shrink-0 items-center gap-2 px-5 pb-2 pt-5">
                <h3 className="text-fg text-[13px] font-medium">Timeline</h3>
                <span className="text-fg-subtle text-[11px]">
                  · {card.comments.length + card.activities.length}
                </span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col px-5 pb-4">
                <TimelineFeed
                  ref={timelineRef}
                  cardId={card.id}
                  boardId={boardId}
                  comments={card.comments}
                  activities={card.activities}
                />
              </div>
            </aside>
          </div>
        )}
      </div>

      {/* Rodapé com dica de atalhos — ajuda descobrir teclado sem ser intrusivo */}
      <div className="border-border/60 bg-bg-subtle/50 hidden shrink-0 items-center justify-end gap-3 border-t px-7 py-1.5 text-[10px] sm:flex">
        <span className="text-fg-subtle">
          <Kbd>Esc</Kbd> fechar
        </span>
        <span className="text-fg-subtle">
          <Kbd>⌘</Kbd>/<Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> salvar
        </span>
      </div>

      <DuplicateCardDialog card={card} open={duplicateOpen} onOpenChange={setDuplicateOpen} />
      <CreateChildCardDialog
        parent={card}
        open={createChildOpen}
        onOpenChange={setCreateChildOpen}
      />
      <SetParentCardDialog card={card} open={setParentOpen} onOpenChange={setSetParentOpen} />
    </div>
  );
}

/* ---------------- sub-componentes ---------------- */

function checklistCounts(card: CardDetail): string | undefined {
  let total = 0;
  let done = 0;
  for (const cl of card.checklists) {
    total += cl.items.length;
    done += cl.items.filter((it) => it.isDone).length;
  }
  if (total === 0) return undefined;
  return `${done}/${total}`;
}

function Block({
  icon,
  label,
  count,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number | string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="text-fg-muted mb-2.5 flex items-center gap-2 text-[13px] font-medium">
        <span className="opacity-80">{icon}</span>
        <span>{label}</span>
        {count !== undefined && <span className="text-fg-subtle text-[11px]">· {count}</span>}
      </div>
      {children}
    </section>
  );
}

/**
 * Skeleton com layout fiel ao modal real (header, sidebar de abas, 2 colunas
 * de conteúdo). Reduz percepção de espera vs spinner genérico.
 */
export function CardModalSkeleton() {
  return (
    <div className="flex h-full animate-pulse flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-7 pb-3 pt-6">
        <div className="flex-1 space-y-2.5">
          <div className="bg-bg-muted h-7 w-2/3 rounded" />
          <div className="bg-bg-muted h-4 w-32 rounded" />
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-bg-muted h-8 w-20 rounded" />
          <div className="bg-bg-muted h-8 w-8 rounded" />
        </div>
      </div>
      {/* Tabs */}
      <div className="border-border/60 flex gap-3 border-b px-5 pb-3 pt-1">
        <div className="bg-bg-muted h-5 w-16 rounded" />
        <div className="bg-bg-muted h-5 w-16 rounded" />
        <div className="bg-bg-muted h-5 w-16 rounded" />
      </div>
      {/* Body */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[1fr_400px]">
        <div className="divide-border/40 divide-y">
          <div className="px-7 py-4">
            <div className="flex items-center gap-3">
              <div className="bg-bg-muted h-4 w-14 rounded" />
              <div className="bg-bg-muted h-7 w-7 rounded-full" />
              <div className="bg-bg-muted h-7 w-7 rounded-full" />
            </div>
          </div>
          <div className="space-y-7 px-7 py-6">
            <div className="space-y-2">
              <div className="bg-bg-muted h-3 w-20 rounded" />
              <div className="bg-bg-muted h-24 w-full rounded" />
            </div>
            <div className="space-y-2">
              <div className="bg-bg-muted h-3 w-20 rounded" />
              <div className="flex gap-1.5">
                <div className="bg-bg-muted h-6 w-14 rounded-full" />
                <div className="bg-bg-muted h-6 w-14 rounded-full" />
                <div className="bg-bg-muted h-6 w-14 rounded-full" />
              </div>
            </div>
          </div>
        </div>
        <div className="bg-bg-subtle border-border/60 space-y-3 border-l p-5">
          <div className="bg-bg-muted h-4 w-24 rounded" />
          <div className="bg-bg-muted h-16 w-full rounded" />
          <div className="bg-bg-muted h-12 w-full rounded" />
          <div className="bg-bg-muted h-12 w-full rounded" />
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="border-border bg-bg text-fg-muted inline-flex items-center justify-center rounded border px-1 py-0.5 font-mono text-[10px] leading-none">
      {children}
    </kbd>
  );
}

function DescriptionIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="15" y2="18" />
    </svg>
  );
}

function ChecklistIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function CardMenu({
  cardId,
  boardId,
  shortCode,
  onArchive,
  onDuplicate,
  onDelete,
  onCreateChild,
  onSetParent,
  busy,
}: {
  cardId: string;
  boardId: string;
  shortCode: string | null;
  onArchive: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCreateChild: () => void;
  onSetParent: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Compartilhar: prefere /c/<shortCode> (curto, memoravel, board-agnostico).
  // Fallback pra /?card=<id> quando shortCode faltar (legacy / edge).
  // Antes era /b/<boardId>?card=<id> mas isso quebrava acesso multi-fluxo.
  function shareUrl() {
    if (shortCode) {
      return `${window.location.origin}/c/${encodeURIComponent(shortCode)}`;
    }
    return `${window.location.origin}/?card=${cardId}`;
  }

  function copyUrl() {
    navigator.clipboard
      .writeText(shareUrl())
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  function openNewTab() {
    window.open(shareUrl(), '_blank', 'noopener');
    setOpen(false);
  }
  // boardId mantido na prop pra compat com callers; nao usado no menu.
  void boardId;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="text-fg-muted hover:text-fg focus-visible:ring-primary rounded-md p-1.5 focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50"
        aria-label="Mais ações"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          {/* Mobile: fixed (evita corte). Desktop: ancorado ao trigger. */}
          <div className="border-border bg-bg fixed inset-x-2 top-[4.5rem] z-20 flex flex-col rounded-md border p-1 text-xs shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-1 sm:w-56">
            <MenuItem
              label="Duplicar card"
              icon={<Copy size={14} />}
              onClick={() => {
                setOpen(false);
                onDuplicate();
              }}
            />
            <MenuItem
              label="Criar card filho"
              icon={<Copy size={14} />}
              onClick={() => {
                setOpen(false);
                onCreateChild();
              }}
            />
            <MenuItem
              label="Tornar filho de..."
              icon={<Copy size={14} />}
              onClick={() => {
                setOpen(false);
                onSetParent();
              }}
            />
            <div className="border-border my-1 border-t" />
            <MenuItem
              label={copied ? 'URL copiada' : 'Copiar URL do card'}
              icon={<LinkIcon size={14} />}
              onClick={copyUrl}
            />
            <MenuItem
              label="Abrir em nova aba"
              icon={<ExternalLink size={14} />}
              onClick={openNewTab}
            />
            <div className="border-border my-1 border-t" />
            <MenuItem
              label="Arquivar card"
              icon={<Archive size={14} />}
              onClick={() => {
                setOpen(false);
                onArchive();
              }}
            />
            <MenuItem
              label="Excluir card..."
              icon={<Trash2 size={14} />}
              danger
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            />
          </div>
        </>
      )}
    </div>
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

function MembersInline({
  card,
  boardId,
  onTogglePrivacy,
  togglingPrivacy,
}: {
  card: CardDetail;
  boardId: string;
  onTogglePrivacy: () => void;
  togglingPrivacy: boolean;
}) {
  const queryClient = useQueryClient();
  // "Equipe" = membros do card que não são o líder atual
  const team = card.members.filter((m) => m.userId !== card.leadId);

  const unassignMut = useMutation({
    mutationFn: (userId: string) => unassignMember(card.id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cardsQueries.detail(card.id).queryKey });
      queryClient.invalidateQueries({ queryKey: ['boards', boardId] });
    },
  });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-fg-muted text-sm">Equipe</span>
      <div className="flex items-center gap-2">
        <LeadPicker card={card} boardId={boardId} />
        {team.length > 0 && (
          <div className="flex items-center -space-x-1.5">
            {team.slice(0, 4).map((m) => (
              <RemovableTeamAvatar
                key={m.userId}
                user={m.user}
                onRemove={() => unassignMut.mutate(m.userId)}
                disabled={unassignMut.isPending}
              />
            ))}
            {team.length > 4 && (
              <span className="border-bg bg-bg-muted text-fg-muted inline-flex size-6 shrink-0 select-none items-center justify-center rounded-full border-2 text-[10px] font-semibold">
                +{team.length - 4}
              </span>
            )}
          </div>
        )}
        <TeamPicker card={card} boardId={boardId} />
      </div>
      {/* Doc 25: toggle rápido de privacidade. Click alterna PUBLIC <-> TEAM_ONLY.
          Visual: cadeado neutro quando público; cadeado warning quando privado. */}
      <button
        type="button"
        onClick={onTogglePrivacy}
        disabled={togglingPrivacy}
        title={
          card.privacy === 'TEAM_ONLY'
            ? 'Privado: só líder e equipe veem. Clique para tornar público.'
            : 'Público: todos do fluxo veem. Clique para tornar privado.'
        }
        aria-label={card.privacy === 'TEAM_ONLY' ? 'Tornar público' : 'Tornar privado (só equipe)'}
        aria-pressed={card.privacy === 'TEAM_ONLY'}
        className={`hover:bg-bg-muted ml-auto inline-flex size-7 items-center justify-center rounded-md transition-colors disabled:opacity-50 ${
          card.privacy === 'TEAM_ONLY' ? 'text-fg' : 'text-fg-subtle hover:text-fg-muted'
        }`}
      >
        {card.privacy === 'TEAM_ONLY' ? <Lock size={15} /> : <Unlock size={15} />}
      </button>
    </div>
  );
}

function RemovableTeamAvatar({
  user,
  onRemove,
  disabled,
}: {
  user: { id: string; name: string; avatarUrl: string | null };
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <span className="group/ta relative inline-flex">
      <UserAvatar name={user.name} userId={user.id} avatarUrl={user.avatarUrl} size="sm" stacked />
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="bg-bg border-bg text-fg-muted hover:text-danger absolute -right-1 -top-1 hidden size-3.5 items-center justify-center rounded-full border shadow-sm disabled:opacity-50 group-hover/ta:flex"
        aria-label={`Remover ${user.name}`}
        title="Remover do card"
      >
        <X size={9} />
      </button>
    </span>
  );
}

/**
 * Overlay visual que aparece quando o user arrasta arquivos sobre uma das
 * 2 colunas (card pane ou timeline pane). Fica fora do container que rola
 * — posicionado em `absolute inset-0` no wrapper relative+overflow-hidden,
 * entao acompanha o viewport mesmo se o conteudo estiver rolado.
 *
 * Visual: dashed border ao redor + backdrop blur sutil + card central
 * flutuante com icone. Inspirado em Notion/Linear.
 */
function DropOverlay({ active, label }: { active: boolean; label: string }) {
  if (!active) return null;
  return (
    <div className="border-primary bg-primary-subtle/70 pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-xl border-2 border-dashed backdrop-blur-[2px]">
      <div className="border-primary/30 bg-bg flex flex-col items-center gap-2 rounded-xl border px-6 py-4 shadow-xl">
        <div className="bg-primary text-primary-fg flex size-10 items-center justify-center rounded-full shadow">
          <Paperclip size={18} />
        </div>
        <span className="text-fg text-sm font-medium">{label}</span>
      </div>
    </div>
  );
}
