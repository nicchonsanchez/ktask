import { api } from '@/lib/api-client';
import type { User as UserContract } from '@ktask/contracts';

export function updateProfile(input: {
  name?: string;
  avatarUrl?: string | null;
  phone?: string | null;
  notifyApprovalsOnWhatsApp?: boolean;
  locale?: string;
  timezone?: string;
}) {
  return api.patch<UserContract>('/api/v1/users/me', input);
}

export function changePassword(input: { currentPassword: string; newPassword: string }) {
  return api.post<void>('/api/v1/users/me/change-password', input);
}

export interface PresignResult {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresIn: number;
}

export function presignAvatar(contentType: string) {
  return api.post<PresignResult>('/api/v1/users/me/avatar/presigned-url', { contentType });
}

/**
 * Upload completo do avatar:
 *   1. Pede URL pré-assinada pra API
 *   2. Faz PUT direto no storage com o arquivo
 *   3. Salva o publicUrl no perfil (PATCH /users/me)
 * Lança Error amigável em qualquer etapa.
 */
export async function uploadAvatar(file: File): Promise<UserContract> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecione uma imagem.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('A imagem deve ter no máximo 5 MB.');
  }

  const presign = await presignAvatar(file.type);

  let res: Response;
  try {
    res = await fetch(presign.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
    });
  } catch {
    throw new Error(
      'Não foi possível enviar a imagem pro servidor de arquivos. Verifique sua conexão e tente de novo.',
    );
  }
  if (!res.ok) {
    throw new Error(`Falha no upload (servidor de arquivos respondeu HTTP ${res.status}).`);
  }

  return updateProfile({ avatarUrl: presign.publicUrl });
}
