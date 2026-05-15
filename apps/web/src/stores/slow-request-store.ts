import { create } from 'zustand';

/**
 * Tracka quantas requests HTTP estao em flight HA MAIS DE alguns segundos.
 *
 * Quando `lb_try_duration` do Caddy entra em cena (deploy em curso), as
 * requests ficam penduradas por 5-15s aguardando o backend novo subir.
 * Sem feedback, o user pensa que travou.
 *
 * Componente <UpdateToast> escuta esse store e mostra "Sistema atualizando..."
 * quando ha 1+ request lenta. Some quando todas voltam a responder.
 *
 * O api-client incrementa `slowCount` via setTimeout(SLOW_THRESHOLD_MS) e
 * decrementa quando a request completa.
 */
interface SlowRequestState {
  slowCount: number;
  inc: () => void;
  dec: () => void;
}

export const useSlowRequestStore = create<SlowRequestState>((set) => ({
  slowCount: 0,
  inc: () => set((s) => ({ slowCount: s.slowCount + 1 })),
  dec: () => set((s) => ({ slowCount: Math.max(0, s.slowCount - 1) })),
}));

/** Threshold pra considerar uma request "lenta" e mostrar o toast. */
export const SLOW_THRESHOLD_MS = 4000;
