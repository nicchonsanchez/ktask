'use client';

import { useState } from 'react';
import {
  Building2,
  ChevronsUp,
  Clock,
  Contact as ContactIcon,
  Flag,
  Hash,
  Lock,
  Paperclip,
  Tag,
  ThumbsDown,
  ThumbsUp,
  Unlock,
  X,
} from 'lucide-react';
import { UserAvatar } from '@/components/user-avatar';
import { CardTabsBar, type CardTab } from '@/components/board/card-tabs-bar';
import { DemoProvider } from '../_DemoProvider';
import { DemoTopbar } from '../_DemoTopbar';
import { DEMO_TIMELINE_CARD_42, DEMO_USERS } from '../_data';

/**
 * Tela do card aberto (AURORA-42 — "Post Promo café da manhã").
 *
 * Replica fiel do card-modal real: usa o markup exato (mesmas classes Tailwind,
 * mesmo layout, mesmas variantes). Componentes reusados diretamente do projeto:
 *   - CardTabsBar (sem state externo, importavel)
 *   - UserAvatar
 *
 * Componentes que dependeriam de API/queries (StatusPicker, DueDatePicker,
 * LeadPicker, TeamPicker, LabelPicker, ApprovalsBlock, ChecklistBlock,
 * AttachmentsBlock, ContactsBlock, TimelineFeed, CardMenu, RichEditor) foram
 * substituidos por replicas estaticas com o markup interno deles.
 *
 * Cobre o print #06 — bloco Aprovacoes no estado PENDING (Marina como reviewer).
 */
export default function DemoCardPage() {
  return (
    <DemoProvider auth="marina">
      <CardView />
    </DemoProvider>
  );
}

function CardView() {
  const marina = DEMO_USERS.marina;
  const rafael = DEMO_USERS.rafael;
  const beatriz = DEMO_USERS.beatriz;
  const carla = DEMO_USERS.carla;
  const [tab, setTab] = useState<CardTab>('home');

  return (
    <>
      <DemoTopbar active="inicio" pendingApprovals={2} notificationsCount={3} />

      <div className="container mx-auto max-w-7xl px-2 py-4 sm:px-4 sm:py-6">
        {/* Container do modal — borda + sombra emulando Dialog */}
        <div className="bg-bg flex h-[calc(100vh-120px)] flex-col overflow-hidden rounded-xl border border-[var(--border)] shadow-2xl">
          {/* HEADER — copiado fiel do card-modal real (linhas 328-415) */}
          <header className="flex flex-col gap-2 px-5 pb-3 pt-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-7 sm:pt-6">
            {/* Botões — primeiro no mobile (sm:order-2 manda pra direita no desktop) */}
            <div className="-mr-1 flex shrink-0 items-center justify-end gap-1 sm:order-2 sm:mr-0 sm:gap-1.5">
              <StatusPickerStub />
              <TimerButtonStub />
              <DueDatePickerStub />
              <MenuStub />
              <button
                type="button"
                aria-label="Fechar"
                title="Fechar (Esc)"
                className="text-fg-muted hover:bg-bg-muted hover:text-fg inline-flex size-8 items-center justify-center rounded-md transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Título + meta */}
            <div className="min-w-0 flex-1 sm:order-1">
              <h1 className="text-fg block w-full text-2xl font-semibold leading-tight tracking-tight sm:text-[28px]">
                Post — Promo café da manhã (dia das mães)
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span
                  className="bg-bg-muted text-fg-muted inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] tracking-wider"
                  title="Código do card"
                >
                  <Hash size={10} />
                  AURORA-42
                </span>
                <span className="text-fg-subtle text-[11px]">· Aprovação do cliente</span>
              </div>
            </div>
          </header>

          {/* TABS — usa CardTabsBar real */}
          <CardTabsBar tab={tab} onChange={setTab} />

          {/* CORPO — grid 1fr | 400px */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[1fr_400px]">
              {/* Coluna esquerda — dados */}
              <div className="relative flex min-h-0 flex-col overflow-hidden">
                <div className="divide-border/40 flex flex-1 flex-col divide-y overflow-y-auto">
                  {/* MembersInline (Equipe + Lead + lock) */}
                  <div className="px-5 py-4 sm:px-7">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-fg-muted text-sm">Equipe</span>
                      <div className="flex items-center gap-2">
                        {/* Lead */}
                        <button
                          type="button"
                          className="hover:bg-bg-muted inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2 transition-colors"
                          title="Líder do card"
                        >
                          <UserAvatar
                            name={marina.name}
                            userId={marina.id}
                            avatarUrl={null}
                            size="md"
                          />
                          <span className="text-fg text-xs font-medium">{marina.name}</span>
                        </button>
                        {/* Team */}
                        <div className="flex items-center -space-x-1.5">
                          <UserAvatar
                            name={beatriz.name}
                            userId={beatriz.id}
                            avatarUrl={null}
                            size="md"
                          />
                          <UserAvatar
                            name={rafael.name}
                            userId={rafael.id}
                            avatarUrl={null}
                            size="md"
                          />
                          <UserAvatar
                            name={carla.name}
                            userId={carla.id}
                            avatarUrl={null}
                            size="md"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        title="Público: todos do fluxo veem. Clique para tornar privado."
                        className="text-fg-subtle hover:bg-bg-muted hover:text-fg-muted ml-auto inline-flex size-7 items-center justify-center rounded-md transition-colors"
                      >
                        <Unlock size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Blocks */}
                  <div className="flex flex-col gap-7 px-5 py-6 sm:px-7">
                    {/* Descrição */}
                    <Block icon={<DescriptionIcon />} label="Descrição">
                      <p className="text-fg text-sm leading-relaxed">
                        Post único pra feed e stories anunciando o combo café da manhã especial de
                        dia das mães. Foco visual: produto + texto bem chamativo. Mensagem da
                        Aurora: "queremos transmitir aconchego e celebração".
                      </p>
                    </Block>

                    {/* Cor do card */}
                    <Block icon={<ChevronsUp size={14} />} label="Cor do card">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {[
                          null,
                          '#ef4444',
                          '#f97316',
                          '#eab308',
                          '#22c55e',
                          '#3b82f6',
                          '#a855f7',
                          '#ec4899',
                        ].map((color, i) => (
                          <button
                            key={i}
                            type="button"
                            className={`inline-flex size-7 items-center justify-center rounded-full border transition-all ${
                              i === 0 ? 'border-fg/40 shadow-sm' : 'border-border/60 opacity-80'
                            }`}
                          >
                            {color ? (
                              <span
                                aria-hidden
                                className="block size-4 rounded-full"
                                style={{ backgroundColor: color }}
                              />
                            ) : (
                              <span
                                aria-hidden
                                className="block size-3.5 rounded-full border border-dashed border-current opacity-60"
                              />
                            )}
                          </button>
                        ))}
                      </div>
                    </Block>

                    {/* Privacidade */}
                    <Block icon={<Lock size={14} />} label="Privacidade">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          aria-pressed={true}
                          className="border-fg/20 bg-bg text-fg inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm"
                        >
                          <Unlock size={10} /> Público
                        </button>
                        <button
                          type="button"
                          aria-pressed={false}
                          className="border-border/60 text-fg-muted inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium opacity-80"
                        >
                          <Lock size={10} /> Só equipe
                        </button>
                      </div>
                    </Block>

                    {/* Etiquetas */}
                    <Block icon={<Tag size={14} />} label="Etiquetas" count={2}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium text-white"
                          style={{ backgroundColor: '#7c3aed' }}
                        >
                          Redes Sociais
                        </span>
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium text-white"
                          style={{ backgroundColor: '#dc2626' }}
                        >
                          Dia das Mães
                        </span>
                        <button
                          type="button"
                          className="border-border text-fg-muted hover:bg-bg-muted inline-flex h-6 items-center gap-1 rounded-full border border-dashed px-2 text-[11px] font-medium"
                        >
                          + Adicionar
                        </button>
                      </div>
                    </Block>

                    {/* Empresa */}
                    <Block icon={<Building2 size={14} />} label="Empresa">
                      <div className="bg-bg-muted text-fg inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-xs">
                        <Building2 size={12} className="text-fg-muted" />
                        Padaria Aurora
                      </div>
                    </Block>

                    {/* Contatos */}
                    <Block icon={<ContactIcon size={14} />} label="Contatos">
                      <p className="text-fg-subtle text-xs italic">Nenhum contato vinculado.</p>
                    </Block>

                    {/* APROVAÇÕES — bloco DESTACADO pro print #06.
                        Markup copiado de PendingApprovalCard (approvals-block.tsx). */}
                    <Block
                      icon={<ChevronsUp size={14} className="rotate-180" />}
                      label="Aprovações"
                    >
                      <div className="border-warning bg-warning-subtle/40 flex flex-col gap-2 rounded-md border-l-2 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Clock size={14} className="text-warning" />
                          <p className="text-fg text-sm font-medium">Aguardando aprovação</p>
                          <span className="text-fg-muted ml-auto text-[11px]">
                            Pedido por Rafael Lima · 12/05/2026
                          </span>
                        </div>

                        {/* ReviewerList */}
                        <ul className="flex flex-wrap gap-1.5">
                          <li className="bg-bg/70 border-border/50 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]">
                            <UserAvatar
                              name={marina.name}
                              userId={marina.id}
                              avatarUrl={null}
                              size="xs"
                            />
                            <span>{marina.name}</span>
                          </li>
                        </ul>

                        <div className="border-border/60 mt-1 flex items-center gap-2 border-t pt-2">
                          <button
                            type="button"
                            className="bg-success text-success-fg hover:bg-success/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium"
                          >
                            <ThumbsUp size={12} />
                            Aprovar
                          </button>
                          <button
                            type="button"
                            className="bg-danger text-danger-fg hover:bg-danger/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium"
                          >
                            <ThumbsDown size={12} />
                            Reprovar
                          </button>
                        </div>
                      </div>
                    </Block>

                    {/* Tarefas do card */}
                    <Block icon={<ChecklistIcon />} label="Tarefas do card" count="2/3">
                      <ul className="flex flex-col gap-1.5">
                        <ChecklistRow text="Fazer briefing" done />
                        <ChecklistRow text="Conferir postagem" done />
                        <ChecklistRow text="Aprovar copy" pending />
                      </ul>
                    </Block>

                    {/* Anexos */}
                    <Block icon={<Paperclip size={14} />} label="Anexos" count={2}>
                      <div className="flex flex-wrap gap-2">
                        <AttachmentChip name="arte-post-mae.png" size="320 KB" />
                        <AttachmentChip name="copy-final.txt" size="2 KB" />
                      </div>
                    </Block>
                  </div>
                </div>
              </div>

              {/* Coluna direita — Timeline */}
              <aside className="border-border/60 bg-bg-subtle relative hidden min-h-0 flex-col overflow-hidden lg:flex lg:border-l">
                <div className="flex shrink-0 items-center gap-2 px-5 pb-2 pt-5">
                  <h3 className="text-fg text-[13px] font-medium">Timeline</h3>
                  <span className="text-fg-subtle text-[11px]">
                    · {DEMO_TIMELINE_CARD_42.length}
                  </span>
                </div>
                <div className="flex min-h-0 flex-1 flex-col px-5 pb-4">
                  {/* Composer */}
                  <form className="flex flex-col gap-2 pb-3">
                    <textarea
                      rows={3}
                      placeholder="Escreva uma anotação. Use @ para mencionar. Arraste arquivos aqui ou use os botões abaixo."
                      className="border-border bg-bg text-fg placeholder:text-fg-muted resize-none rounded-md border px-3 py-2 text-sm focus:outline-none"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="text-fg-muted hover:bg-bg-muted hover:text-fg inline-flex items-center gap-1 rounded p-1.5 text-[11px]"
                          aria-label="Anexar imagem"
                        >
                          <Paperclip size={14} />
                        </button>
                      </div>
                      <button
                        type="submit"
                        className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex h-7 items-center rounded-md px-3 text-xs font-semibold"
                      >
                        Enviar
                      </button>
                    </div>
                  </form>

                  {/* Lista */}
                  <ul className="flex flex-col gap-3 overflow-y-auto">
                    {DEMO_TIMELINE_CARD_42.map((ev) => (
                      <TimelineRow key={ev.id} ev={ev} />
                    ))}
                  </ul>
                </div>
              </aside>
            </div>
          </div>

          {/* Footer — atalhos */}
          <div className="border-border/60 bg-bg-subtle/50 hidden shrink-0 items-center justify-end gap-3 border-t px-7 py-1.5 text-[10px] sm:flex">
            <span className="text-fg-subtle">
              <Kbd>Esc</Kbd> fechar
            </span>
            <span className="text-fg-subtle">
              <Kbd>⌘</Kbd>/<Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> salvar
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Componentes auxiliares (copia fiel dos privados do card-modal) ────

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

// ─── Stubs dos pickers do header (visualmente fieis aos reais) ─────────

function StatusPickerStub() {
  return (
    <button
      type="button"
      className="border-border bg-bg text-fg hover:bg-bg-muted inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium"
    >
      <span className="size-2 rounded-full bg-emerald-500" />
      Ativo
    </button>
  );
}

function TimerButtonStub() {
  return (
    <button
      type="button"
      className="text-fg-muted hover:bg-bg-muted hover:text-fg inline-flex size-8 items-center justify-center rounded-md"
      aria-label="Iniciar cronômetro"
    >
      <Clock size={15} />
    </button>
  );
}

function DueDatePickerStub() {
  return (
    <button
      type="button"
      className="border-border bg-bg text-fg hover:bg-bg-muted inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium"
    >
      <Flag size={12} />
      14/mai
    </button>
  );
}

function MenuStub() {
  return (
    <button
      type="button"
      aria-label="Mais opções"
      className="text-fg-muted hover:bg-bg-muted hover:text-fg inline-flex size-8 items-center justify-center rounded-md"
    >
      <span className="text-lg leading-none">⋯</span>
    </button>
  );
}

// ─── Checklist row + Timeline row ──────────────────────────────────────

function ChecklistRow({
  text,
  done,
  pending,
}: {
  text: string;
  done?: boolean;
  pending?: boolean;
}) {
  return (
    <li className="hover:bg-bg-muted/40 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm">
      <button
        aria-label={done ? 'Marcar como pendente' : 'Marcar como concluida'}
        className={`flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          done ? 'border-success bg-success' : 'border-border hover:border-success'
        }`}
      >
        {done && (
          <svg
            width="9"
            height="9"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
      <span className={done ? 'text-fg-muted line-through' : 'text-fg'}>{text}</span>
      {pending && (
        <span className="text-warning ml-auto rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold">
          Sua vez
        </span>
      )}
    </li>
  );
}

function AttachmentChip({ name, size }: { name: string; size: string }) {
  return (
    <div className="bg-bg-muted border-border inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs">
      <Paperclip size={12} className="text-fg-muted" />
      <span className="text-fg font-medium">{name}</span>
      <span className="text-fg-subtle">·</span>
      <span className="text-fg-subtle">{size}</span>
    </div>
  );
}

function TimelineRow({ ev }: { ev: (typeof DEMO_TIMELINE_CARD_42)[number] }) {
  if (ev.type === 'system') {
    return (
      <li className="text-fg-muted flex items-start gap-2 py-1 text-[12px]">
        <span className="bg-bg-muted text-fg-subtle mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full">
          <ChevronsUp size={10} />
        </span>
        <div className="flex-1">
          <span>{ev.message}</span>
          <span className="text-fg-subtle ml-1.5 text-[11px]">· {ev.when}</span>
        </div>
      </li>
    );
  }
  const actor = Object.values(DEMO_USERS).find((u) => u.id === ev.actorId);
  return (
    <li className="flex gap-3 py-1">
      {actor && <UserAvatar name={actor.name} userId={actor.id} avatarUrl={null} size="md" />}
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-fg text-sm font-semibold">{ev.actor}</span>
          <span className="text-fg-subtle text-[11px]">{ev.when}</span>
        </div>
        <p className="text-fg text-sm leading-relaxed">{ev.message}</p>
      </div>
    </li>
  );
}
