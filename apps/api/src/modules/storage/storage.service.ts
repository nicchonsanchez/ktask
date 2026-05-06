import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomBytes } from 'node:crypto';

import { env } from '@/config/env';

interface PresignOptions {
  /** Prefixo dentro do bucket: ex `avatars/{userId}` */
  keyPrefix: string;
  contentType: string;
  /** Tamanho máx permitido (bytes). Default 5MB. */
  maxSize?: number;
  /** Segundos de validade da URL. Default 60s. */
  ttl?: number;
}

export interface PresignResult {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresIn: number;
}

/**
 * Storage S3-compat (MinIO em prod/dev).
 *
 * Usamos 2 clients:
 *  - internalClient: pra operações server→MinIO (delete, stat). Usa o endpoint
 *    interno (http://minio:9000 na rede Docker). Mais rápido, sem passar por Caddy.
 *  - presignClient: pra gerar URLs PRÉ-ASSINADAS que o browser vai usar. Usa o
 *    endpoint público (cdn.ktask.agenciakharis.com.br). Se usarmos o endpoint
 *    interno aqui, o browser do cliente recebe uma URL com `minio:9000`, que
 *    obviamente ele não consegue resolver ("Failed to fetch" no client).
 *  - Em dev sem S3_PUBLIC_ENDPOINT setado, os dois colapsam no mesmo endpoint.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly internalClient: S3Client | null;
  private readonly presignClient: S3Client | null;
  private readonly publicBase: string | null;
  private readonly bucket: string;

  constructor() {
    this.bucket = env.S3_BUCKET;
    if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
      this.logger.warn('Storage (S3) desabilitado: S3_ENDPOINT/ACCESS_KEY/SECRET_KEY ausentes.');
      this.internalClient = null;
      this.presignClient = null;
      this.publicBase = null;
      return;
    }

    const credentials = {
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
    };

    this.internalClient = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials,
    });

    // Endpoint público usado pra gerar URLs que o browser vai consumir.
    // Se não setado, usa o mesmo endpoint interno (tipo dev sem reverse-proxy).
    const publicEndpoint = env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT;
    this.presignClient = new S3Client({
      region: env.S3_REGION,
      endpoint: publicEndpoint,
      forcePathStyle: true,
      credentials,
    });

    this.publicBase = `${publicEndpoint.replace(/\/+$/, '')}/${this.bucket}`;
  }

  isEnabled(): boolean {
    return this.internalClient !== null;
  }

  async presignUpload(opts: PresignOptions): Promise<PresignResult> {
    if (!this.presignClient) {
      throw new ServiceUnavailableException('Armazenamento de arquivos não configurado.');
    }
    const ttl = opts.ttl ?? 60;
    const ext = mimeToExt(opts.contentType) ?? 'bin';
    const key = `${opts.keyPrefix.replace(/^\/+|\/+$/g, '')}/${randomBytes(8).toString('hex')}.${ext}`;

    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: opts.contentType,
    });
    const uploadUrl = await getSignedUrl(this.presignClient, cmd, { expiresIn: ttl });
    const publicUrl = this.publicUrlFor(key);

    return { uploadUrl, publicUrl, key, expiresIn: ttl };
  }

  /** Monta a URL pública pra ler um objeto já existente (útil pra anexos). */
  publicUrlFor(key: string): string {
    if (!this.publicBase) {
      throw new ServiceUnavailableException('Armazenamento de arquivos não configurado.');
    }
    return `${this.publicBase}/${key}`;
  }

  /**
   * Upload server-side de buffer para o S3. Diferente de presignUpload (que
   * delega ao cliente), aqui a propria API faz o PUT — usado quando rehostamos
   * conteudo externo (ex: imagens inline do Ummense durante import).
   *
   * Gera key automatica se nao informada: `<keyPrefix>/<random>.<ext>`.
   */
  async putObject(params: {
    body: Buffer | Uint8Array;
    contentType: string;
    keyPrefix: string;
    key?: string;
  }): Promise<{ key: string; publicUrl: string }> {
    if (!this.internalClient) {
      throw new ServiceUnavailableException('Armazenamento de arquivos não configurado.');
    }
    const ext = mimeToExt(params.contentType) ?? 'bin';
    const key =
      params.key ??
      `${params.keyPrefix.replace(/^\/+|\/+$/g, '')}/${randomBytes(8).toString('hex')}.${ext}`;
    await this.internalClient.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: params.body,
        ContentType: params.contentType,
      }),
    );
    return { key, publicUrl: this.publicUrlFor(key) };
  }
}

function mimeToExt(mime: string): string | null {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'application/x-zip-compressed': 'zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/vnd.ms-powerpoint': 'ppt',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'text/markdown': 'md',
    'application/json': 'json',
    'video/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
  };
  return map[mime.toLowerCase()] ?? null;
}
