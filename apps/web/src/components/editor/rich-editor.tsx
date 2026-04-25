'use client';

import { useEditor, EditorContent, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePrompt } from '@/components/ui/dialogs';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Quote,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Link as LinkIcon,
  Image as ImageIcon,
  Highlighter,
  Palette,
  Undo2,
  Redo2,
} from 'lucide-react';

type ProseDoc = JSONContent & { type: 'doc' };

function isProseDoc(value: unknown): value is ProseDoc {
  return typeof value === 'object' && value !== null && (value as { type?: string }).type === 'doc';
}

const EMPTY_DOC: ProseDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

function normalizeIncoming(value: unknown): ProseDoc {
  if (isProseDoc(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    return {
      type: 'doc',
      content: value.split(/\n{2,}/).map((p) => ({
        type: 'paragraph',
        content: p.length > 0 ? [{ type: 'text', text: p }] : [],
      })),
    };
  }
  return EMPTY_DOC;
}

export interface UploadedImage {
  src: string;
  alt?: string;
}

export interface RichEditorProps {
  value: unknown;
  onChange: (next: ProseDoc) => void;
  placeholder?: string;
  /** Debounce para chamar onChange. 0 = sem debounce. */
  debounceMs?: number;
  /** Indica que está salvando externamente (para feedback no rodapé). */
  isSaving?: boolean;
  /** Quando true, renderiza somente leitura (sem toolbar). */
  readOnly?: boolean;
  /** Altura mínima do editor. Default: 8rem. */
  minHeight?: string;
  className?: string;
  /**
   * Se fornecida, ativa upload de imagens: botão "Imagem" na toolbar,
   * drag-drop e paste do clipboard fazem upload + insertImage.
   */
  onUploadImage?: (file: File) => Promise<UploadedImage>;
}

export function RichEditor({
  value,
  onChange,
  placeholder = 'Escrever detalhes...',
  debounceMs = 800,
  isSaving = false,
  readOnly = false,
  minHeight = '8rem',
  className,
  onUploadImage,
}: RichEditorProps) {
  const initialDoc = normalizeIncoming(value);
  const lastEmittedRef = useRef<string>(JSON.stringify(initialDoc));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const onUploadImageRef = useRef<typeof onUploadImage>(onUploadImage);
  useEffect(() => {
    onUploadImageRef.current = onUploadImage;
  }, [onUploadImage]);

  const emitChange = useCallback(
    (editor: Editor) => {
      const json = editor.getJSON() as ProseDoc;
      const serialized = JSON.stringify(json);
      if (serialized === lastEmittedRef.current) return;
      lastEmittedRef.current = serialized;
      onChange(json);
    },
    [onChange],
  );

  /** Faz upload e insere uma imagem no editor. Retorna true se inseriu. */
  const uploadAndInsertImage = useCallback(async (file: File, position?: number) => {
    const editor = editorRef.current;
    const uploader = onUploadImageRef.current;
    if (!editor || !uploader) return false;
    if (!file.type.startsWith('image/')) return false;
    try {
      setUploadingImage(true);
      setUploadError(null);
      const { src, alt } = await uploader(file);
      const chain = editor.chain().focus();
      if (typeof position === 'number') chain.setTextSelection(position);
      chain.setImage({ src, alt: alt ?? file.name }).run();
      return true;
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Falha ao enviar a imagem.');
      return false;
    } finally {
      setUploadingImage(false);
    }
  }, []);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline underline-offset-2',
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      Placeholder.configure({ placeholder }),
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: {
          class: 'max-w-full rounded-md border border-border my-2',
        },
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
    ],
    [placeholder],
  );

  const editor = useEditor({
    extensions,
    content: initialDoc,
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          'prose-sm max-w-none focus:outline-none px-3 py-2 text-sm leading-relaxed [&_p]:my-1 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:leading-snug [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:leading-snug [&_h3]:mt-2.5 [&_h3]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-fg-muted [&_code]:rounded [&_code]:bg-bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_img]:max-w-full [&_mark]:rounded-sm [&_mark]:px-0.5',
        style: `min-height: ${minHeight};`,
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const uploader = onUploadImageRef.current;
        if (!uploader) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
          f.type.startsWith('image/'),
        );
        if (files.length === 0) return false;
        event.preventDefault();
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        const pos = coords?.pos ?? view.state.selection.from;
        void (async () => {
          for (const file of files) {
            await uploadAndInsertImage(file, pos);
          }
        })();
        return true;
      },
      handlePaste: (_view, event) => {
        const uploader = onUploadImageRef.current;
        if (!uploader) return false;
        const items = Array.from(event.clipboardData?.items ?? []);
        const imageItem = items.find((i) => i.type.startsWith('image/'));
        if (!imageItem) return false;
        const file = imageItem.getAsFile();
        if (!file) return false;
        event.preventDefault();
        void uploadAndInsertImage(file);
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (debounceMs <= 0) {
        emitChange(ed);
        return;
      }
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => emitChange(ed), debounceMs);
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Sincroniza valor externo (ex: reload via TanStack Query) quando muda
  // de fonte real e não é eco da própria emissão. Enquanto o editor tem
  // foco, o estado local é fonte da verdade — ignora updates externos
  // (incluindo o refetch que acontece após salvar). Sem isso, o cursor
  // pula pro final cada vez que o salvamento volta do servidor.
  useEffect(() => {
    if (!editor) return;
    if (editor.isFocused) return;
    const incoming = normalizeIncoming(value);
    const serialized = JSON.stringify(incoming);
    if (serialized === lastEmittedRef.current) return;
    lastEmittedRef.current = serialized;
    editor.commands.setContent(incoming, { emitUpdate: false });
  }, [value, editor]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (!editor) {
    return (
      <div
        className="bg-bg border-border rounded-md border px-3 py-2 text-sm"
        style={{ minHeight }}
      />
    );
  }

  if (readOnly) {
    return (
      <div className={className}>
        <EditorContent editor={editor} />
      </div>
    );
  }

  return (
    <div
      className={`bg-bg border-border focus-within:border-primary/40 focus-within:ring-primary/30 flex flex-col overflow-hidden rounded-md border transition-shadow focus-within:ring-1 ${className ?? ''}`}
    >
      <Toolbar
        editor={editor}
        canUploadImage={Boolean(onUploadImage)}
        onPickImage={(file) => {
          void uploadAndInsertImage(file);
        }}
        uploadingImage={uploadingImage}
      />
      <EditorContent editor={editor} />
      <FooterStatus
        isSaving={isSaving}
        uploadingImage={uploadingImage}
        uploadError={uploadError}
        onDismissError={() => setUploadError(null)}
      />
    </div>
  );
}

function Toolbar({
  editor,
  canUploadImage,
  onPickImage,
  uploadingImage,
}: {
  editor: Editor;
  canUploadImage: boolean;
  onPickImage: (file: File) => void;
  uploadingImage: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptDialog = usePrompt();
  const isBold = editor.isActive('bold');
  const isItalic = editor.isActive('italic');
  const isUnderline = editor.isActive('underline');
  const isCode = editor.isActive('code');
  const isBlockquote = editor.isActive('blockquote');
  const isBulletList = editor.isActive('bulletList');
  const isOrderedList = editor.isActive('orderedList');
  const isH1 = editor.isActive('heading', { level: 1 });
  const isH2 = editor.isActive('heading', { level: 2 });
  const isH3 = editor.isActive('heading', { level: 3 });
  const isLink = editor.isActive('link');

  async function setLink() {
    const previous = editor.getAttributes('link').href as string | undefined;
    const input = await promptDialog({
      title: previous ? 'Editar link' : 'Inserir link',
      description: previous
        ? 'Edite a URL ou apague pra remover o link.'
        : 'Cole a URL completa. Adicionamos `https://` automaticamente se não tiver protocolo.',
      defaultValue: previous ?? 'https://',
      placeholder: 'https://...',
      inputType: 'url',
      confirmLabel: 'Aplicar link',
      allowEmpty: Boolean(previous),
    });
    if (input === null) return; // cancelar
    if (input === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    let url = input.trim();
    if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) url = `https://${url}`;
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

  return (
    <div className="border-border bg-bg-subtle flex flex-wrap items-center gap-0.5 border-b px-1 py-1">
      <ToolbarBtn
        label="Negrito (Ctrl+B)"
        active={isBold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold size={14} />
      </ToolbarBtn>
      <ToolbarBtn
        label="Itálico (Ctrl+I)"
        active={isItalic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic size={14} />
      </ToolbarBtn>
      <ToolbarBtn
        label="Sublinhado (Ctrl+U)"
        active={isUnderline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon size={14} />
      </ToolbarBtn>
      <ToolbarBtn
        label="Código inline"
        active={isCode}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code size={14} />
      </ToolbarBtn>
      <Separator />
      <ToolbarBtn
        label="Título 1"
        active={isH1}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 size={14} />
      </ToolbarBtn>
      <ToolbarBtn
        label="Título 2"
        active={isH2}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 size={14} />
      </ToolbarBtn>
      <ToolbarBtn
        label="Título 3"
        active={isH3}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 size={14} />
      </ToolbarBtn>
      <Separator />
      <ToolbarBtn
        label="Lista com marcadores"
        active={isBulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List size={14} />
      </ToolbarBtn>
      <ToolbarBtn
        label="Lista numerada"
        active={isOrderedList}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered size={14} />
      </ToolbarBtn>
      <ToolbarBtn
        label="Citação"
        active={isBlockquote}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote size={14} />
      </ToolbarBtn>
      <Separator />
      <ColorPicker editor={editor} kind="text" />
      <ColorPicker editor={editor} kind="highlight" />
      <Separator />
      <ToolbarBtn label="Link" active={isLink} onClick={setLink}>
        <LinkIcon size={14} />
      </ToolbarBtn>
      {canUploadImage && (
        <ToolbarBtn
          label={uploadingImage ? 'Enviando imagem...' : 'Inserir imagem'}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingImage}
        >
          <ImageIcon size={14} />
        </ToolbarBtn>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPickImage(file);
          e.target.value = '';
        }}
      />
      <Separator />
      <ToolbarBtn
        label="Desfazer (Ctrl+Z)"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      >
        <Undo2 size={14} />
      </ToolbarBtn>
      <ToolbarBtn
        label="Refazer (Ctrl+Shift+Z)"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      >
        <Redo2 size={14} />
      </ToolbarBtn>
    </div>
  );
}

function Separator() {
  return <span className="bg-border mx-1 h-4 w-px" aria-hidden />;
}

function ToolbarBtn({
  children,
  label,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className={`hover:bg-bg-muted text-fg-muted hover:text-fg inline-flex size-7 items-center justify-center rounded transition-colors disabled:opacity-40 disabled:hover:bg-transparent ${
        active ? 'bg-primary-subtle text-primary' : ''
      }`}
    >
      {children}
    </button>
  );
}

function FooterStatus({
  isSaving,
  uploadingImage,
  uploadError,
  onDismissError,
}: {
  isSaving: boolean;
  uploadingImage: boolean;
  uploadError: string | null;
  onDismissError: () => void;
}) {
  const [savedRecently, setSavedRecently] = useState(false);
  const wasSaving = useRef(false);

  useEffect(() => {
    if (isSaving) {
      wasSaving.current = true;
      return;
    }
    if (wasSaving.current) {
      wasSaving.current = false;
      setSavedRecently(true);
      const t = setTimeout(() => setSavedRecently(false), 1800);
      return () => clearTimeout(t);
    }
    return;
  }, [isSaving]);

  if (!isSaving && !savedRecently && !uploadingImage && !uploadError) return null;

  return (
    <div className="border-border bg-bg-subtle flex items-center justify-between border-t px-2 py-1 text-[11px]">
      <span className={uploadError ? 'text-danger' : 'text-fg-muted'}>
        {uploadError ? (
          <>
            {uploadError}{' '}
            <button type="button" onClick={onDismissError} className="underline underline-offset-2">
              fechar
            </button>
          </>
        ) : uploadingImage ? (
          'Enviando imagem…'
        ) : (
          ''
        )}
      </span>
      <span className="text-fg-muted" aria-live="polite">
        {isSaving ? 'Salvando…' : savedRecently ? 'Salvo' : ''}
      </span>
    </div>
  );
}

// Paleta para cor de texto e marca-texto. Tons sólidos pra texto, mais
// claros pra highlight (legibilidade sobre fundo claro).
const TEXT_COLORS: Array<{ name: string; value: string }> = [
  { name: 'Padrão', value: '' },
  { name: 'Cinza', value: '#6B7280' },
  { name: 'Vermelho', value: '#DC2626' },
  { name: 'Laranja', value: '#EA580C' },
  { name: 'Amarelo', value: '#CA8A04' },
  { name: 'Verde', value: '#16A34A' },
  { name: 'Azul', value: '#2563EB' },
  { name: 'Roxo', value: '#9333EA' },
  { name: 'Rosa', value: '#DB2777' },
];

const HIGHLIGHT_COLORS: Array<{ name: string; value: string }> = [
  { name: 'Sem marca', value: '' },
  { name: 'Amarelo', value: '#FEF08A' },
  { name: 'Verde', value: '#BBF7D0' },
  { name: 'Azul', value: '#BFDBFE' },
  { name: 'Roxo', value: '#E9D5FF' },
  { name: 'Rosa', value: '#FBCFE8' },
  { name: 'Laranja', value: '#FED7AA' },
  { name: 'Cinza', value: '#E5E7EB' },
];

/**
 * Popover de cor (texto ou marca-texto). Abre uma grade de swatches; o
 * primeiro item ("Padrão" / "Sem marca") remove o estilo. Click fora ou
 * Esc fecha. O `onMouseDown preventDefault` no botão evita que o editor
 * perca foco ao clicar.
 */
function ColorPicker({ editor, kind }: { editor: Editor; kind: 'text' | 'highlight' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const palette = kind === 'text' ? TEXT_COLORS : HIGHLIGHT_COLORS;
  const Icon = kind === 'text' ? Palette : Highlighter;
  const label = kind === 'text' ? 'Cor do texto' : 'Marca-texto';
  const activeColor =
    kind === 'text'
      ? ((editor.getAttributes('textStyle').color as string | undefined) ?? null)
      : ((editor.getAttributes('highlight').color as string | undefined) ?? null);
  const isActive = Boolean(activeColor);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  function apply(value: string) {
    if (kind === 'text') {
      if (value === '') editor.chain().focus().unsetColor().run();
      else editor.chain().focus().setColor(value).run();
    } else {
      if (value === '') editor.chain().focus().unsetHighlight().run();
      else editor.chain().focus().setHighlight({ color: value }).run();
    }
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-pressed={isActive}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className={`hover:bg-bg-muted text-fg-muted hover:text-fg relative inline-flex size-7 items-center justify-center rounded transition-colors ${
          isActive ? 'bg-primary-subtle text-primary' : ''
        }`}
      >
        <Icon size={14} />
        {activeColor && (
          <span
            aria-hidden
            className="absolute bottom-0.5 left-1 right-1 h-[3px] rounded-full"
            style={{ backgroundColor: activeColor }}
          />
        )}
      </button>
      {open && (
        <div className="border-border bg-bg absolute left-0 top-full z-30 mt-1 w-44 rounded-md border p-2 shadow-lg">
          <p className="text-fg-muted mb-1.5 text-[10px] font-medium uppercase tracking-wide">
            {label}
          </p>
          <div className="grid grid-cols-3 gap-1">
            {palette.map((c) => {
              const isCurrent = (activeColor ?? '') === c.value;
              return (
                <button
                  key={c.name}
                  type="button"
                  title={c.name}
                  aria-label={c.name}
                  aria-pressed={isCurrent}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => apply(c.value)}
                  className={`focus-visible:ring-primary group/sw relative flex h-7 items-center justify-center rounded border transition-all focus-visible:outline-none focus-visible:ring-2 ${
                    isCurrent ? 'border-primary ring-primary/30 ring-2' : 'border-border'
                  }`}
                  style={
                    c.value
                      ? kind === 'text'
                        ? { color: c.value }
                        : { backgroundColor: c.value }
                      : undefined
                  }
                >
                  {c.value === '' ? (
                    <span className="text-fg-muted text-[10px]">Limpar</span>
                  ) : (
                    <span className="text-[12px] font-bold">A</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
