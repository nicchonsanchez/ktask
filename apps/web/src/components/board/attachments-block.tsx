'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  File,
  FileText,
  ImageIcon,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
} from 'lucide-react';

import {
  cardsQueries,
  removeAttachment,
  uploadAttachment,
  type Attachment,
  type CardDetail,
} from '@/lib/queries/cards';
import { formatRelativeTime } from '@/lib/prose';
import { ApiError } from '@/lib/api-client';
import { useConfirm } from '@/components/ui/dialogs';

export function AttachmentsBlock({ card, boardId }: { card: CardDetail; boardId: string }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: cardsQueries.detail(card.id).queryKey });
    queryClient.invalidateQueries({ queryKey: ['boards', boardId] });
  }

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadAttachment(card.id, file),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Falha ao enviar arquivo.',
      );
    },
  });

  function enqueue(files: FileList | File[]) {
    const arr = Array.from(files);
    for (const f of arr) {
      uploadMut.mutate(f);
    }
  }

  const hasAttachments = card.attachments.length > 0;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length > 0) enqueue(e.dataTransfer.files);
      }}
      className="flex flex-col gap-3"
    >
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) enqueue(e.target.files);
          e.target.value = '';
        }}
      />

      {hasAttachments && (
        <ul className="flex flex-col gap-2">
          {card.attachments.map((a) => (
            <AttachmentRow key={a.id} attachment={a} onRemoved={invalidate} />
          ))}
        </ul>
      )}

      {/* Dropzone principal: grande quando vazio, discreta quando tem anexos */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploadMut.isPending}
        className={`group/drop flex w-full items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 text-left transition-all ${
          dragOver
            ? 'border-primary bg-primary-subtle'
            : 'border-border/60 hover:border-primary/50 hover:bg-bg-muted/50'
        } ${hasAttachments ? 'py-2.5' : 'py-6'} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <div
          className={`bg-primary-subtle text-primary flex shrink-0 items-center justify-center rounded-full transition-all ${
            hasAttachments ? 'size-8' : 'size-10'
          }`}
        >
          {uploadMut.isPending ? (
            <Loader2 size={hasAttachments ? 14 : 18} className="animate-spin" />
          ) : dragOver ? (
            <Upload size={hasAttachments ? 14 : 18} />
          ) : (
            <Paperclip size={hasAttachments ? 14 : 18} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-fg font-medium ${hasAttachments ? 'text-xs' : 'text-sm'}`}>
            {uploadMut.isPending
              ? 'Enviando…'
              : dragOver
                ? 'Solte aqui para anexar'
                : hasAttachments
                  ? 'Adicionar outro arquivo'
                  : 'Anexar arquivo ao card'}
          </p>
          {!hasAttachments && !uploadMut.isPending && !dragOver && (
            <p className="text-fg-muted mt-0.5 text-[11px]">
              Arraste ou clique — até 25 MB por arquivo
            </p>
          )}
        </div>
      </button>

      {error && (
        <p className="bg-danger-subtle text-danger rounded-md px-3 py-2 text-xs">{error}</p>
      )}
    </div>
  );
}

function AttachmentRow({
  attachment,
  onRemoved,
}: {
  attachment: Attachment;
  onRemoved: () => void;
}) {
  const confirm = useConfirm();
  const removeMut = useMutation({
    mutationFn: () => removeAttachment(attachment.id),
    onSuccess: onRemoved,
  });

  const isImage = attachment.kind === 'IMAGE' && attachment.publicUrl;

  return (
    <li className="group/att border-border bg-bg hover:border-border-strong flex items-start gap-3 rounded-md border p-2 transition-colors">
      {isImage ? (
        <a
          href={attachment.publicUrl!}
          target="_blank"
          rel="noreferrer"
          className="bg-bg-muted flex size-14 shrink-0 items-center justify-center overflow-hidden rounded"
        >
          <img
            src={attachment.publicUrl!}
            alt={attachment.fileName}
            className="size-full object-cover"
          />
        </a>
      ) : (
        <div className="bg-bg-muted text-fg-muted flex size-14 shrink-0 items-center justify-center rounded">
          <IconForMime mime={attachment.mimeType} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <a
          href={attachment.publicUrl ?? '#'}
          target="_blank"
          rel="noreferrer"
          className="hover:text-primary truncate text-sm font-medium"
          title={attachment.fileName}
        >
          {attachment.fileName}
        </a>
        <div className="text-fg-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
          <span>{formatSize(attachment.sizeBytes)}</span>
          <span>·</span>
          <span>por {attachment.uploader.name}</span>
          <span>·</span>
          <span>{formatRelativeTime(attachment.createdAt)}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {attachment.publicUrl && (
          <a
            href={attachment.publicUrl}
            download={attachment.fileName}
            className="text-fg-muted hover:text-fg rounded p-1"
            title="Baixar"
          >
            <Download size={13} />
          </a>
        )}
        <button
          type="button"
          onClick={async () => {
            if (
              await confirm({
                title: 'Remover anexo?',
                description: `"${attachment.fileName}" será removido do card.`,
                confirmLabel: 'Remover',
                danger: true,
              })
            )
              removeMut.mutate();
          }}
          disabled={removeMut.isPending}
          className="text-fg-muted hover:text-danger rounded p-1 opacity-0 transition-opacity group-hover/att:opacity-100"
          aria-label="Remover anexo"
          title="Remover"
        >
          {removeMut.isPending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Trash2 size={13} />
          )}
        </button>
      </div>
    </li>
  );
}

function IconForMime({ mime }: { mime: string }) {
  if (mime.startsWith('image/')) return <ImageIcon size={20} />;
  if (mime === 'application/pdf' || mime.startsWith('text/')) return <FileText size={20} />;
  return <File size={20} />;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
