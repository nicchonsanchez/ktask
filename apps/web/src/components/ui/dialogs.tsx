'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@ktask/ui';

/**
 * Sistema de dialogs imperativos: confirm, prompt e notify (toast).
 *
 * Substitui `window.alert/confirm/prompt` nativos por popups consistentes
 * com a UI do app. Hooks retornam promises pra integrar com fluxos async.
 *
 * Uso:
 *   const confirm = useConfirm();
 *   if (await confirm({ title: 'Apagar?', danger: true })) ...
 *
 *   const prompt = usePrompt();
 *   const url = await prompt({ title: 'URL do link', defaultValue: 'https://' });
 *
 *   const notify = useNotify();
 *   notify.error('Falhou.');
 */

// ---------------- Types ----------------

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Estilo perigoso (botão vermelho). Default: false. */
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Quando definido, exige que o usuário digite EXATAMENTE esse texto pra liberar o submit (uso: confirmação de exclusão). */
  requiredText?: string;
  /** Define que a ação é destrutiva (botão vermelho). */
  danger?: boolean;
  /** Tipo do input. Default: text. */
  inputType?: 'text' | 'url';
  /** Permite submeter string vazia (uso: edição de link onde vazio = remover). Default: false. */
  allowEmpty?: boolean;
  /** Ação terciária à esquerda do rodapé (ex: "Remover link"). Resolve com o `value` quando clicada. */
  tertiaryAction?: {
    label: string;
    /** Valor que será retornado pela promise quando esse botão for clicado. */
    value: string;
    /** Botão vermelho. Default: false. */
    danger?: boolean;
  };
}

export type NotifyKind = 'error' | 'success' | 'info';
export interface NotifyItem {
  id: number;
  kind: NotifyKind;
  message: string;
}

interface DialogsCtx {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
  notify: {
    error: (message: string) => void;
    success: (message: string) => void;
    info: (message: string) => void;
  };
}

const DialogsContext = createContext<DialogsCtx | null>(null);

// ---------------- Provider ----------------

export function DialogsProvider({ children }: { children: React.ReactNode }) {
  // Cada chamada cria uma "request" pendente; o componente correspondente
  // a renderiza com seu state local. Promise resolve quando o usuário responde.
  const [confirmReq, setConfirmReq] = useState<{
    opts: ConfirmOptions;
    resolve: (v: boolean) => void;
  } | null>(null);
  const [promptReq, setPromptReq] = useState<{
    opts: PromptOptions;
    resolve: (v: string | null) => void;
  } | null>(null);

  const [toasts, setToasts] = useState<NotifyItem[]>([]);
  const toastIdRef = useRef(0);

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmReq({ opts, resolve })),
    [],
  );
  const prompt = useCallback(
    (opts: PromptOptions) =>
      new Promise<string | null>((resolve) => setPromptReq({ opts, resolve })),
    [],
  );

  const pushToast = useCallback((kind: NotifyKind, message: string) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const notify = useMemo(
    () => ({
      error: (m: string) => pushToast('error', m),
      success: (m: string) => pushToast('success', m),
      info: (m: string) => pushToast('info', m),
    }),
    [pushToast],
  );

  const value = useMemo(() => ({ confirm, prompt, notify }), [confirm, prompt, notify]);

  return (
    <DialogsContext.Provider value={value}>
      {children}
      {confirmReq && (
        <ConfirmDialog
          opts={confirmReq.opts}
          onResolve={(v) => {
            confirmReq.resolve(v);
            setConfirmReq(null);
          }}
        />
      )}
      {promptReq && (
        <PromptDialog
          opts={promptReq.opts}
          onResolve={(v) => {
            promptReq.resolve(v);
            setPromptReq(null);
          }}
        />
      )}
      <ToastViewport
        items={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </DialogsContext.Provider>
  );
}

// ---------------- Hooks ----------------

function useDialogs() {
  const ctx = useContext(DialogsContext);
  if (!ctx) throw new Error('useDialogs deve ser usado dentro de <DialogsProvider>');
  return ctx;
}

export function useConfirm() {
  return useDialogs().confirm;
}

export function usePrompt() {
  return useDialogs().prompt;
}

export function useNotify() {
  return useDialogs().notify;
}

// ---------------- Dialog: Confirm ----------------

function ConfirmDialog({
  opts,
  onResolve,
}: {
  opts: ConfirmOptions;
  onResolve: (v: boolean) => void;
}) {
  const {
    title,
    description,
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    danger = false,
  } = opts;

  return (
    <Dialog open onOpenChange={(open) => !open && onResolve(false)}>
      <DialogContent hideClose className="w-[calc(100vw-2rem)] max-w-md gap-0 rounded-md p-0">
        <div className="flex items-start gap-3 p-5">
          <span
            aria-hidden
            className={`mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full ${
              danger ? 'bg-danger-subtle text-danger' : 'bg-primary-subtle text-primary'
            }`}
          >
            <AlertTriangle size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-fg text-base font-semibold leading-snug">
              {title}
            </DialogTitle>
            {description && (
              <p className="text-fg-muted mt-1.5 whitespace-pre-line text-sm leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </div>
        <div className="border-border/60 bg-bg-subtle/50 flex justify-end gap-2 border-t px-5 py-3">
          <button
            type="button"
            onClick={() => onResolve(false)}
            className="border-border text-fg hover:bg-bg-muted focus-visible:ring-primary inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => onResolve(true)}
            className={`focus-visible:ring-primary inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 ${
              danger
                ? 'bg-danger hover:bg-danger/90 text-white'
                : 'bg-primary hover:bg-primary-hover text-primary-fg'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Dialog: Prompt ----------------

function PromptDialog({
  opts,
  onResolve,
}: {
  opts: PromptOptions;
  onResolve: (v: string | null) => void;
}) {
  const {
    title,
    description,
    placeholder,
    defaultValue = '',
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    requiredText,
    danger = false,
    inputType = 'text',
    allowEmpty = false,
    tertiaryAction,
  } = opts;
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const canSubmit = requiredText ? value === requiredText : allowEmpty || value.trim().length > 0;

  function submit() {
    if (!canSubmit) return;
    onResolve(value);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onResolve(null)}>
      <DialogContent hideClose className="w-[calc(100vw-2rem)] max-w-md gap-0 rounded-md p-0">
        <div className="p-5">
          <DialogTitle className="text-fg text-base font-semibold leading-snug">
            {title}
          </DialogTitle>
          {description && (
            <p className="text-fg-muted mt-1.5 whitespace-pre-line text-sm leading-relaxed">
              {description}
            </p>
          )}
          <input
            ref={inputRef}
            type={inputType}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            className="bg-bg border-border text-fg focus:border-primary focus:ring-primary/30 mt-4 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2"
          />
          {requiredText && (
            <p className="text-fg-subtle mt-1.5 text-[11px]">
              Digite <span className="text-fg-muted font-mono font-semibold">{requiredText}</span>{' '}
              para liberar o botão.
            </p>
          )}
        </div>
        <div className="border-border/60 bg-bg-subtle/50 flex items-center gap-2 border-t px-5 py-3">
          {tertiaryAction && (
            <button
              type="button"
              onClick={() => onResolve(tertiaryAction.value)}
              className={`focus-visible:ring-primary inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 ${
                tertiaryAction.danger
                  ? 'text-danger hover:bg-danger-subtle'
                  : 'text-fg-muted hover:bg-bg-muted hover:text-fg'
              }`}
            >
              {tertiaryAction.label}
            </button>
          )}
          <div className="flex flex-1 justify-end gap-2">
            <button
              type="button"
              onClick={() => onResolve(null)}
              className="border-border text-fg hover:bg-bg-muted focus-visible:ring-primary inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className={`focus-visible:ring-primary inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                danger
                  ? 'bg-danger hover:bg-danger/90 text-white'
                  : 'bg-primary hover:bg-primary-hover text-primary-fg'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Toast viewport ----------------

function ToastViewport({
  items,
  onDismiss,
}: {
  items: NotifyItem[];
  onDismiss: (id: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {items.map((t) => (
        <Toast key={t.id} item={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function Toast({ item, onDismiss }: { item: NotifyItem; onDismiss: () => void }) {
  const palette =
    item.kind === 'error'
      ? 'bg-danger-subtle border-danger/30 text-danger'
      : item.kind === 'success'
        ? 'bg-success-subtle border-success/30 text-success'
        : 'bg-info/15 border-info/30 text-info';
  const Icon =
    item.kind === 'error' ? AlertTriangle : item.kind === 'success' ? CheckCircle2 : Info;
  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-start gap-2.5 rounded-md border px-3 py-2.5 shadow-lg backdrop-blur ${palette}`}
    >
      <Icon size={16} className="mt-0.5 shrink-0" />
      <p className="min-w-0 flex-1 whitespace-pre-line text-[13px] leading-snug">{item.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="hover:bg-bg/30 -mr-1 -mt-1 shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
        aria-label="Fechar"
      >
        <X size={13} />
      </button>
    </div>
  );
}
