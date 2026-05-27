'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Search, Timer, X } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@ktask/ui';
import { ApiError } from '@/lib/api-client';
import {
  createManualEntry,
  updateTimeEntry,
  type TimesheetItem,
} from '@/lib/queries/time-tracking';
import { searchGlobal } from '@/lib/queries/search';
import { useNotify } from '@/components/ui/dialogs';

interface PickedCard {
  id: string;
  title: string;
  boardName: string;
  listName: string;
}

/** Extrai data (YYYY-MM-DD) e hora (HH:MM) locais de um ISO string. */
function splitLocal(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/**
 * Dialog de entrada de tempo manual. Dois modos:
 *  - Criar (entry undefined): cria via createManualEntry.
 *  - Editar (entry setado): pre-preenche e salva via updateTimeEntry,
 *    permitindo trocar card, data, horarios e anotacao.
 */
export function ManualEntryDialog({
  open,
  onOpenChange,
  entry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry?: TimesheetItem;
}) {
  const queryClient = useQueryClient();
  const notify = useNotify();
  const isEdit = !!entry;
  const [card, setCard] = useState<PickedCard | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (entry) {
      // Modo edicao: pre-preenche com os dados da entry.
      setCard(
        entry.card
          ? {
              id: entry.card.id,
              title: entry.card.title,
              boardName: entry.card.board.name,
              listName: '',
            }
          : null,
      );
      const s = splitLocal(entry.startedAt);
      setDate(s.date);
      setStartTime(s.time);
      setEndTime(entry.endedAt ? splitLocal(entry.endedAt).time : s.time);
      setNote(entry.note ?? '');
      setError(null);
    } else {
      setCard(null);
      setDate(new Date().toISOString().slice(0, 10));
      setStartTime('09:00');
      setEndTime('10:00');
      setNote('');
      setError(null);
    }
  }, [open, entry]);

  const createMut = useMutation({
    mutationFn: () => {
      if (!card) throw new Error('Selecione um card');
      const startedAt = new Date(`${date}T${startTime}:00`).toISOString();
      const endedAt = new Date(`${date}T${endTime}:00`).toISOString();
      if (new Date(endedAt).getTime() <= new Date(startedAt).getTime()) {
        throw new Error('Horário final deve ser depois do inicial');
      }
      if (isEdit && entry) {
        return updateTimeEntry(entry.id, {
          cardId: card.id,
          startedAt,
          endedAt,
          note: note.trim() || null,
        });
      }
      return createManualEntry({
        cardId: card.id,
        startedAt,
        endedAt,
        note: note.trim() || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-tracking'] });
      notify.success(isEdit ? 'Entrada atualizada.' : 'Entrada manual registrada.');
      onOpenChange(false);
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Falha ao registrar.';
      setError(msg);
    },
  });

  const canSubmit = !!card && !!date && !!startTime && !!endTime && !createMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="max-w-md gap-0 p-0">
        <header className="border-border/60 flex items-start gap-3 border-b px-5 py-4">
          <span className="bg-primary-subtle text-primary inline-flex size-9 shrink-0 items-center justify-center rounded-full">
            <Timer size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-fg text-[15px] font-semibold">
              {isEdit ? 'Editar entrada de tempo' : 'Adicionar tempo manualmente'}
            </DialogTitle>
            <p className="text-fg-muted text-[11px]">
              {isEdit
                ? 'Ajuste o card, a data, os horários ou a anotação desta entrada'
                : 'Registre uma entrada de tempo num card, sem usar o cronômetro'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-fg-muted hover:bg-bg-muted hover:text-fg -mr-1 -mt-1 shrink-0 rounded-full p-1.5 transition-colors"
            aria-label="Fechar"
          >
            <X size={15} />
          </button>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (canSubmit) createMut.mutate();
          }}
          className="flex flex-col gap-4 px-5 py-4"
        >
          <CardPicker selected={card} onSelect={setCard} />

          {/* Mobile: data ocupa a linha toda (input date precisa de largura),
              inicio/fim dividem a linha de baixo. sm+: 3 colunas lado-a-lado. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1">
              <Field label="Data">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="border-border focus:border-primary w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none"
                />
              </Field>
            </div>
            <Field label="Início">
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="border-border focus:border-primary w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none"
              />
            </Field>
            <Field label="Fim">
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="border-border focus:border-primary w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none"
              />
            </Field>
          </div>

          <Field label="Anotação (opcional)">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Ex: Reunião com cliente"
              className="border-border focus:border-primary rounded-md border px-2 py-1.5 text-sm focus:outline-none"
            />
          </Field>

          {error && (
            <p className="bg-danger-subtle text-danger rounded-md px-3 py-2 text-[12px]">{error}</p>
          )}

          <div className="border-border/60 bg-bg-subtle/40 -mx-5 -mb-4 mt-1 flex items-center justify-end gap-2 border-t px-5 py-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={createMut.isPending}
              className="text-fg-muted hover:text-fg hover:bg-bg-muted rounded-md px-3 py-1.5 text-[13px] font-medium disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[13px] font-semibold shadow-sm transition-all hover:shadow disabled:opacity-50"
            >
              {createMut.isPending && <Loader2 size={13} className="animate-spin" />}
              {isEdit ? 'Salvar' : 'Registrar'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-fg-muted text-[11px] font-medium">{label}</span>
      {children}
    </label>
  );
}

function CardPicker({
  selected,
  onSelect,
}: {
  selected: PickedCard | null;
  onSelect: (c: PickedCard) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const debouncedQuery = useDebounce(query, 250);
  const searchQ = useQuery({
    queryKey: ['search', 'manual-entry', debouncedQuery] as const,
    queryFn: () => searchGlobal(debouncedQuery),
    enabled: open && debouncedQuery.length >= 2,
  });

  return (
    <div className="flex flex-col gap-1">
      <span className="text-fg-muted text-[11px] font-medium">Card</span>
      {selected ? (
        <div className="border-primary/40 bg-primary-subtle/30 flex items-center gap-2 rounded-md border px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-fg truncate text-sm font-medium">{selected.title}</p>
            <p className="text-fg-muted truncate text-[11px]">
              {selected.boardName} · {selected.listName}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onSelect(null as never);
              setQuery('');
              setOpen(true);
            }}
            className="text-fg-muted hover:text-fg text-[11px] hover:underline"
          >
            Trocar
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search
            size={13}
            className="text-fg-muted pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Buscar card pelo título…"
            className="border-border focus:border-primary w-full rounded-md border py-2 pl-8 pr-2 text-sm focus:outline-none"
          />
          {open && debouncedQuery.length >= 2 && (
            <div className="border-border bg-bg absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-md border shadow-lg">
              {searchQ.isLoading ? (
                <div className="flex justify-center p-3">
                  <Loader2 size={14} className="text-fg-muted animate-spin" />
                </div>
              ) : (searchQ.data?.cards.length ?? 0) === 0 ? (
                <p className="text-fg-muted p-3 text-center text-[12px]">Nenhum card encontrado.</p>
              ) : (
                searchQ.data?.cards.slice(0, 8).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onSelect({
                        id: c.id,
                        title: c.title,
                        boardName: c.boardName,
                        listName: c.listName,
                      });
                      setOpen(false);
                    }}
                    className="hover:bg-bg-muted flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-[12px]"
                  >
                    <span className="text-fg truncate font-medium">{c.title}</span>
                    <span className="text-fg-muted truncate text-[11px]">
                      {c.boardName} · {c.listName}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function useDebounce<T>(value: T, delayMs: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return v;
}
