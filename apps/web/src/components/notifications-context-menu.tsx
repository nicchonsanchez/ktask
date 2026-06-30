'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Eye, EyeOff } from 'lucide-react';

/**
 * Menu de contexto que aparece no right-click de uma notificacao do sino.
 *
 * Trade-off conhecido: substitui o menu nativo do Chrome quando o user
 * clica com botao direito EM CIMA de uma notificacao. Right-click no
 * resto do app (sidebar, cards, etc.) continua com menu nativo intacto.
 * Pra cobrir o caso "quero abrir em nova guia" — usavel pelo menu
 * nativo — incluimos a acao explicitamente aqui.
 *
 * Posicionamento: o caller passa `x`/`y` (coordenadas do mouse). O menu
 * faz auto-flip se for cortado na borda do viewport (mede tamanho real
 * apos render e reposiciona).
 *
 * Fecha em: click fora, ESC, scroll do popover-pai (caller passa
 * onClose pra sincronizar).
 */
export function NotificationContextMenu({
  x,
  y,
  url,
  isRead,
  onClose,
  onOpenNewTab,
  onToggleRead,
}: {
  x: number;
  y: number;
  url: string;
  isRead: boolean;
  onClose: () => void;
  onOpenNewTab: () => void;
  onToggleRead: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // SSR guard: createPortal precisa do document, que so existe no client.
  // Sem isso, render server-side quebra ("document is not defined").
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Auto-flip nas bordas do viewport. Roda apos primeira render pra
  // poder medir o tamanho real do menu (rect.width/height).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let finalX = x;
    let finalY = y;
    if (x + rect.width > vw - 8) finalX = vw - rect.width - 8;
    if (y + rect.height > vh - 8) finalY = vh - rect.height - 8;
    if (finalX !== x) el.style.left = `${finalX}px`;
    if (finalY !== y) el.style.top = `${finalY}px`;
  }, [x, y]);

  // Fecha em ESC ou click fora. `mousedown` (nao `click`) pra fechar
  // antes que o click outside dispare acao em outro elemento.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  if (!mounted) return null;

  // Portalizado direto pro <body> pra escapar do stacking context do
  // Popover do Radix UI (que renderiza seus filhos num portal proprio com
  // z-index alto). Sem o portal, o menu ficava ATRAS do popover de
  // notificacoes apesar do position:fixed + zIndex 200 — o navegador
  // respeita stacking contexts antes do z-index. zIndex 10000 garante
  // ficar acima de dialogs, popovers e outras camadas custom.
  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', left: x, top: y, zIndex: 10000 }}
      className="border-border bg-bg min-w-[200px] rounded-md border py-1 shadow-lg"
      role="menu"
      // Impede que o right-click DENTRO do proprio menu reabra outro menu
      // (nativo) — UX mais previsivel.
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuItem
        icon={<ExternalLink size={13} />}
        label="Abrir em nova guia"
        disabled={!url}
        onClick={() => {
          onOpenNewTab();
          onClose();
        }}
      />
      <MenuItem
        icon={isRead ? <EyeOff size={13} /> : <Eye size={13} />}
        label={isRead ? 'Marcar como não lida' : 'Marcar como lida'}
        onClick={() => {
          onToggleRead();
          onClose();
        }}
      />
    </div>,
    document.body,
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'danger';
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={
        'hover:bg-bg-muted flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs disabled:cursor-not-allowed disabled:opacity-40 ' +
        (tone === 'danger' ? 'text-danger hover:bg-danger/10' : 'text-fg')
      }
    >
      <span className="text-fg-muted">{icon}</span>
      {label}
    </button>
  );
}
