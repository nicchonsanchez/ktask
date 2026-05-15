'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { useSlowRequestStore } from '@/stores/slow-request-store';

/**
 * Toast global que aparece quando ha 1+ request HTTP demorando mais que
 * SLOW_THRESHOLD_MS (definido em slow-request-store).
 *
 * Cenario tipico:
 * - Deploy em curso. Caddy esta com lb_try_duration segurando requests
 *   por ate 30s aguardando o container API novo subir.
 * - Sem este toast, o user ve um spinner generico e pensa que travou.
 * - Com este toast, ele entende: "Sistema atualizando, aguarde".
 *
 * Animacao: fade-in/out leve. Posicao: fixed top-center, abaixo da topbar
 * (z-30 da topbar + offset). Visual: pill com background neutro + spinner.
 *
 * Sai automaticamente quando todas as requests pendentes voltam (slowCount
 * volta a zero).
 */
export function UpdateToast() {
  const slowCount = useSlowRequestStore((s) => s.slowCount);
  const [visible, setVisible] = useState(false);

  // Debounce visual: mostra IMEDIATO quando ha slow request; some apos 600ms
  // de slowCount=0 (suaviza piscadas se a request completar logo apos passar
  // do threshold).
  useEffect(() => {
    if (slowCount > 0) {
      setVisible(true);
      return undefined;
    }
    const t = setTimeout(() => setVisible(false), 600);
    return () => clearTimeout(t);
  }, [slowCount]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 top-[60px] z-40 -translate-x-1/2 px-3"
    >
      <div className="bg-bg border-border text-fg-muted data-[state=open]:animate-fade-in pointer-events-auto inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-md">
        <Loader2 size={13} className="animate-spin" />
        Sistema atualizando, aguarde alguns segundos…
      </div>
    </div>
  );
}
