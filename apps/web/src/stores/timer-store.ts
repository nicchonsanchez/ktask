'use client';

import { create } from 'zustand';

interface ConflictPayload {
  active: {
    id: string;
    cardId: string | null; // null = timer "livre" sem card vinculado
    cardTitle: string | null;
    boardName: string | null;
    startedAt: string;
  };
  target: {
    cardId: string;
    cardTitle?: string;
    note?: string | null;
  };
  onResolved?: () => void;
}

interface TimerStoreState {
  conflict: ConflictPayload | null;
  openConflict: (payload: ConflictPayload) => void;
  closeConflict: () => void;
}

export const useTimerStore = create<TimerStoreState>((set) => ({
  conflict: null,
  openConflict: (payload) => set({ conflict: payload }),
  closeConflict: () => set({ conflict: null }),
}));
