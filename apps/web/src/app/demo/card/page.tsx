'use client';

import {
  Calendar,
  CheckCircle2,
  ChevronsUp,
  Circle,
  Flag,
  Hash,
  MessageCircle,
  Paperclip,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import { DemoProvider } from '../_DemoProvider';
import { DemoTopbar } from '../_DemoTopbar';
import { DEMO_CARDS, DEMO_TIMELINE_CARD_42, DEMO_USERS } from '../_data';

/**
 * Tela do card aberto (AURORA-42 — "Post Promo café da manhã").
 *
 * Cobre o print #06 do tutorial: card aberto mostrando o bloco de Aprovações
 * com botoes Aprovar/Reprovar destacados (Marina precisa decidir).
 *
 * Tres variacoes deste card (mesmo layout, focus visual diferente) cobrem
 * os prints #07, #08, #09:
 *   - /demo/card-comentar — cursor no campo da timeline
 *   - /demo/card-reprovar — botao Reprovar destacado
 *   - /demo/card-mencao   — dropdown @ aberto
 */
export default function DemoCardPage() {
  return (
    <DemoProvider auth="marina">
      <CardView />
    </DemoProvider>
  );
}

function CardView() {
  const card = DEMO_CARDS.find((c) => c.code === 'AURORA-42')!;
  const beatriz = DEMO_USERS.beatriz;
  const rafael = DEMO_USERS.rafael;
  const marina = DEMO_USERS.marina;
  const carla = DEMO_USERS.carla;

  return (
    <>
      <DemoTopbar active="inicio" pendingApprovals={2} notificationsCount={3} />

      <div className="container mx-auto max-w-7xl px-4 py-6">
        {/* "Modal" emulation — borda + sombra suave */}
        <div className="bg-bg-subtle border-border overflow-hidden rounded-xl border shadow-lg">
          {/* Header */}
          <header className="border-border flex flex-col gap-2 border-b px-7 py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-fg-muted mb-1.5 flex items-center gap-1.5 text-xs font-medium">
                <Hash size={12} />
                <span>AURORA-42</span>
                <span>·</span>
                <span>Redes Sociais</span>
                <span>·</span>
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                  Aprovação do cliente
                </span>
              </div>
              <h1 className="text-fg text-xl font-semibold sm:text-2xl">{card.title}</h1>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <PillIcon
                  icon={<Calendar size={13} />}
                  label="Quinta, 14/mai"
                  cls="bg-rose-500/15 text-rose-600"
                />
                <PillIcon
                  icon={<Flag size={13} />}
                  label="Alta prioridade"
                  cls="bg-amber-500/15 text-amber-600"
                />
                <PillIcon
                  icon={<ChevronsUp size={13} />}
                  label="Ativo"
                  cls="bg-emerald-500/15 text-emerald-600"
                />
              </div>
            </div>

            <button
              aria-label="Fechar"
              className="text-fg-muted hover:bg-bg-muted hover:text-fg inline-flex size-9 shrink-0 items-center justify-center rounded-md"
            >
              <X size={18} />
            </button>
          </header>

          {/* Conteudo */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px]">
            {/* Main column */}
            <div className="divide-border/60 flex flex-col divide-y px-7 py-6">
              {/* Lider + Equipe */}
              <div className="flex flex-col gap-3 pb-6">
                <Section title="Líder">
                  <Avatar user={marina} />
                </Section>
                <Section title="Equipe do card">
                  <div className="flex items-center gap-1.5">
                    <Avatar user={beatriz} />
                    <Avatar user={rafael} />
                    <Avatar user={carla} />
                  </div>
                </Section>
              </div>

              {/* Descricao */}
              <div className="py-6">
                <Section title="Briefing">
                  <p className="text-fg text-sm leading-relaxed">{card.description}</p>
                </Section>
              </div>

              {/* Aprovacoes — bloco DESTACADO pro print #06 */}
              <div className="py-6">
                <h2 className="text-fg mb-3 flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck size={15} className="text-amber-500" />
                  Aprovações
                </h2>

                <div className="rounded-lg border-2 border-amber-500/40 bg-amber-50 p-4 dark:bg-amber-500/5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-amber-500/20 px-2.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                      <ShieldCheck size={11} /> Aguardando você
                    </span>
                    <span className="text-fg-muted text-xs">
                      solicitada por Rafael há 14 minutos
                    </span>
                  </div>

                  <p className="text-fg mb-4 text-sm leading-relaxed">
                    Marina, esse post está liberado pra publicar?
                  </p>

                  <div className="text-fg-muted mb-3 flex items-center gap-2 text-xs">
                    <span className="font-medium">Aprovadores:</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2 py-0.5">
                      <Avatar user={marina} size="xs" />
                      <span className="text-fg font-medium">Marina Costa</span>
                      <span className="text-amber-600">· pendente</span>
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700">
                      <ThumbsUp size={14} />
                      Aprovar
                    </button>
                    <button className="border-border bg-bg text-fg hover:bg-bg-muted inline-flex h-9 items-center gap-1.5 rounded-md border px-4 text-sm font-semibold transition-colors">
                      <ThumbsDown size={14} />
                      Reprovar
                    </button>
                  </div>
                </div>
              </div>

              {/* Checklist (simplificada) */}
              <div className="py-6">
                <Section title="Tarefas do card">
                  <ul className="flex flex-col gap-2.5">
                    <ChecklistItem label="Fazer briefing" done />
                    <ChecklistItem label="Conferir postagem" done />
                    <ChecklistItem label="Aprovar copy" pending />
                  </ul>
                </Section>
              </div>

              {/* Anexos */}
              <div className="py-6">
                <Section title="Anexos">
                  <div className="flex flex-wrap gap-2">
                    <AttachmentChip name="arte-post-mae.png" size="320 KB" />
                    <AttachmentChip name="copy-final.txt" size="2 KB" />
                  </div>
                </Section>
              </div>
            </div>

            {/* Sidebar — Timeline */}
            <aside className="bg-bg border-border flex flex-col border-t lg:border-l lg:border-t-0">
              <div className="border-border flex items-center justify-between border-b px-5 py-3">
                <h2 className="text-fg flex items-center gap-2 text-sm font-semibold">
                  <MessageCircle size={14} /> Timeline
                </h2>
                <span className="text-fg-muted text-xs">
                  {DEMO_TIMELINE_CARD_42.length} eventos
                </span>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                <ul className="flex flex-col gap-4">
                  {DEMO_TIMELINE_CARD_42.map((ev) => (
                    <TimelineItem key={ev.id} ev={ev} />
                  ))}
                </ul>
              </div>

              {/* Input de comentario */}
              <div className="border-border bg-bg-subtle border-t px-5 py-3">
                <div className="bg-bg border-border rounded-md border p-3">
                  <textarea
                    rows={2}
                    placeholder="Escreva um comentário..."
                    className="placeholder:text-fg-muted text-fg w-full resize-none bg-transparent text-sm focus:outline-none"
                  />
                  <div className="text-fg-muted mt-2 flex items-center justify-between text-xs">
                    <span>
                      Use <kbd className="bg-bg-muted rounded px-1 font-mono">@</kbd> pra mencionar
                    </span>
                    <button className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex h-7 items-center rounded-md px-3 text-xs font-semibold">
                      Enviar
                    </button>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Auxiliares visuais ─────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-fg-muted mb-2 text-xs font-semibold uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function PillIcon({ icon, label, cls }: { icon: React.ReactNode; label: string; cls: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {icon}
      {label}
    </span>
  );
}

function Avatar({
  user,
  size = 'sm',
}: {
  user: { avatarInitials: string; color: string; name: string };
  size?: 'xs' | 'sm';
}) {
  const sz = size === 'xs' ? 'size-5 text-[10px]' : 'size-7 text-[11px]';
  return (
    <span
      className={`${sz} flex items-center justify-center rounded-full font-bold text-white`}
      style={{ background: user.color }}
      title={user.name}
    >
      {user.avatarInitials}
    </span>
  );
}

function ChecklistItem({
  label,
  done,
  pending,
}: {
  label: string;
  done?: boolean;
  pending?: boolean;
}) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      {done ? (
        <CheckCircle2 size={16} className="text-emerald-500" />
      ) : (
        <Circle size={16} className="text-fg-muted" />
      )}
      <span className={done ? 'text-fg-muted line-through' : 'text-fg'}>{label}</span>
      {pending && (
        <span className="ml-auto rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
          Sua vez
        </span>
      )}
    </li>
  );
}

function AttachmentChip({ name, size }: { name: string; size: string }) {
  return (
    <div className="bg-bg border-border inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs">
      <Paperclip size={12} className="text-fg-muted" />
      <span className="text-fg font-medium">{name}</span>
      <span className="text-fg-muted">·</span>
      <span className="text-fg-muted">{size}</span>
    </div>
  );
}

function TimelineItem({ ev }: { ev: (typeof DEMO_TIMELINE_CARD_42)[number] }) {
  if (ev.type === 'system') {
    return (
      <li className="text-fg-muted flex items-start gap-2 text-xs">
        <span className="bg-bg-muted mt-1 flex size-5 shrink-0 items-center justify-center rounded-full">
          <ShieldCheck size={10} />
        </span>
        <div className="flex-1">
          <span>{ev.message}</span>
          <div className="text-fg-muted/70 mt-0.5">{ev.when}</div>
        </div>
      </li>
    );
  }
  // comment
  const actor = Object.values(DEMO_USERS).find((u) => u.id === ev.actorId);
  return (
    <li className="flex items-start gap-2.5">
      {actor && <Avatar user={actor} />}
      <div className="bg-bg-muted text-fg flex-1 rounded-lg rounded-tl-none p-3 text-sm">
        <div className="mb-1 flex items-center gap-2">
          <strong className="text-fg text-xs">{ev.actor}</strong>
          <span className="text-fg-muted text-[11px]">{ev.when}</span>
        </div>
        <p className="leading-relaxed">{ev.message}</p>
      </div>
    </li>
  );
}
