'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ChangePasswordRequestSchema,
  UpdateProfileRequestSchema,
  type ChangePasswordRequest,
  type UpdateProfileRequest,
} from '@ktask/contracts';
import {
  Bell,
  BellOff,
  Camera,
  Eye,
  EyeOff,
  Loader2,
  Save,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';

import { Button, Input, Label } from '@ktask/ui';
import { UserAvatar } from '@/components/user-avatar';
import { changePassword, updateProfile, uploadAvatar } from '@/lib/queries/profile';
import { pushQueries, unsubscribePushById } from '@/lib/queries/push';
import { useAuthStore } from '@/stores/auth-store';
import { ApiError } from '@/lib/api-client';
import { usePushNotifications } from '@/hooks/use-push-notifications';

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  if (!user) {
    return (
      <div className="container py-10">
        <p className="text-fg-muted text-sm">Sessão não encontrada.</p>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-8">
      <header className="mb-8 flex items-center gap-4">
        <UserAvatar name={user.name} userId={user.id} avatarUrl={user.avatarUrl} size="xl" />
        <div>
          <h1 className="text-xl font-semibold">Meu perfil</h1>
          <p className="text-fg-muted mt-0.5 text-sm">{user.email}</p>
        </div>
      </header>

      <div className="flex flex-col gap-8">
        <AvatarForm user={user} onChange={(avatarUrl) => setUser({ ...user, avatarUrl })} />
        <ProfileForm
          initial={{
            name: user.name,
            phone: user.phone ?? '',
            notifyApprovalsOnWhatsApp: user.notifyApprovalsOnWhatsApp ?? false,
          }}
          onSuccess={(u) =>
            setUser({
              ...user,
              name: u.name,
              avatarUrl: u.avatarUrl,
              phone: u.phone,
              notifyApprovalsOnWhatsApp: u.notifyApprovalsOnWhatsApp,
            })
          }
        />
        <PushNotificationsSection />
        <PasswordForm />
      </div>
    </div>
  );
}

function AvatarForm({
  user,
  onChange,
}: {
  user: { id: string; name: string; avatarUrl: string | null };
  onChange: (url: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadMut = useMutation({
    mutationFn: async (file: File) => uploadAvatar(file),
    onSuccess: (u) => {
      setError(null);
      onChange(u.avatarUrl);
    },
    onError: (err) => {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Falha ao enviar a imagem.';
      setError(msg);
    },
  });

  const removeMut = useMutation({
    mutationFn: () => updateProfile({ avatarUrl: null }),
    onSuccess: () => {
      setError(null);
      onChange(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Falha ao remover.');
    },
  });

  const busy = uploadMut.isPending || removeMut.isPending;

  return (
    <Section
      title="Foto"
      description="JPG, PNG ou WEBP até 5 MB. A imagem aparece no seu avatar nos cards e comentários."
    >
      <div className="flex items-center gap-5">
        <UserAvatar name={user.name} userId={user.id} avatarUrl={user.avatarUrl} size="xl" />
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/avif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadMut.mutate(f);
                e.target.value = '';
              }}
            />
            <Button type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
              {uploadMut.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Camera size={14} />
              )}
              {user.avatarUrl ? 'Trocar foto' : 'Enviar foto'}
            </Button>
            {user.avatarUrl && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => removeMut.mutate()}
                disabled={busy}
                className="text-fg-muted hover:text-danger"
              >
                {removeMut.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
                Remover
              </Button>
            )}
          </div>
          {error && <p className="text-danger text-xs">{error}</p>}
          <p className="text-fg-subtle text-[11px]">
            A imagem é enviada direto pro storage — nenhum dado sensível trafega pela API.
          </p>
        </div>
      </div>
    </Section>
  );
}

function ProfileForm({
  initial,
  onSuccess,
}: {
  initial: { name: string; phone: string; notifyApprovalsOnWhatsApp: boolean };
  onSuccess: (u: {
    name: string;
    avatarUrl: string | null;
    phone: string | null;
    notifyApprovalsOnWhatsApp: boolean;
  }) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<UpdateProfileRequest>({
    resolver: zodResolver(UpdateProfileRequestSchema),
    defaultValues: {
      name: initial.name,
      phone: initial.phone || null,
      notifyApprovalsOnWhatsApp: initial.notifyApprovalsOnWhatsApp,
    },
  });

  const phoneValue = watch('phone');

  const mut = useMutation({
    mutationFn: (data: UpdateProfileRequest) => {
      // Normaliza telefone: remove tudo que não é dígito; vazio vira null.
      const phone =
        data.phone === undefined
          ? undefined
          : data.phone === null || data.phone === ''
            ? null
            : data.phone.replace(/\D/g, '');
      return updateProfile({ ...data, phone });
    },
    onSuccess: (u) => {
      setError(null);
      setSavedAt(Date.now());
      onSuccess({
        name: u.name,
        avatarUrl: u.avatarUrl,
        phone: u.phone,
        notifyApprovalsOnWhatsApp: u.notifyApprovalsOnWhatsApp,
      });
      reset({
        name: u.name,
        phone: u.phone,
        notifyApprovalsOnWhatsApp: u.notifyApprovalsOnWhatsApp,
      });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
    },
  });

  return (
    <Section title="Dados pessoais" description="Nome, telefone e preferências de notificação.">
      <form onSubmit={handleSubmit((data) => mut.mutate(data))} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" error={!!errors.name} {...register('name')} />
          {errors.name && <p className="text-danger text-xs">{errors.name.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">WhatsApp</Label>
          <Input
            id="phone"
            placeholder="5531999999999"
            inputMode="numeric"
            error={!!errors.phone}
            {...register('phone', {
              setValueAs: (v) => {
                if (v === '' || v === null || v === undefined) return null;
                return String(v).replace(/\D/g, '');
              },
            })}
          />
          <p className="text-fg-subtle text-[11px]">
            Apenas dígitos, com DDI e DDD (E.164 sem o &quot;+&quot;). Ex: 5531999999999.
          </p>
          {errors.phone && <p className="text-danger text-xs">{errors.phone.message}</p>}
        </div>

        <label className="border-border bg-bg-muted/30 flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            disabled={!phoneValue}
            {...register('notifyApprovalsOnWhatsApp')}
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">Receber pedidos de aprovação por WhatsApp</span>
            <span className="text-fg-muted text-xs leading-relaxed">
              Quando alguém te escolher como revisor de um card, você receberá uma mensagem direto
              no WhatsApp do número acima com o link pra aprovar/reprovar.
            </span>
            {!phoneValue && (
              <span className="text-fg-subtle text-[11px]">
                Preencha o número de WhatsApp pra ativar.
              </span>
            )}
          </span>
        </label>

        {error && (
          <p className="bg-danger-subtle text-danger rounded-md px-3 py-2 text-sm">{error}</p>
        )}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!isDirty || isSubmitting}>
            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar
          </Button>
          {savedAt && !isDirty && <span className="text-fg-muted text-xs">Salvo.</span>}
        </div>
      </form>
    </Section>
  );
}

function PasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ChangePasswordRequest>({
    resolver: zodResolver(ChangePasswordRequestSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  const mut = useMutation({
    mutationFn: (data: ChangePasswordRequest) => changePassword(data),
    onSuccess: () => {
      setError(null);
      setDone(true);
      reset();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Erro ao trocar senha.');
      setDone(false);
    },
  });

  return (
    <Section
      title="Senha"
      description="Trocar a senha encerra todas as sessões (você continuará logado aqui)."
    >
      <form onSubmit={handleSubmit((data) => mut.mutate(data))} className="flex flex-col gap-4">
        <PasswordField
          id="currentPassword"
          label="Senha atual"
          show={showCurrent}
          onToggle={() => setShowCurrent((v) => !v)}
          error={errors.currentPassword?.message}
          register={register('currentPassword')}
          autoComplete="current-password"
        />
        <PasswordField
          id="newPassword"
          label="Nova senha (mín. 10 caracteres)"
          show={showNew}
          onToggle={() => setShowNew((v) => !v)}
          error={errors.newPassword?.message}
          register={register('newPassword')}
          autoComplete="new-password"
        />
        {error && (
          <p className="bg-danger-subtle text-danger rounded-md px-3 py-2 text-sm">{error}</p>
        )}
        {done && (
          <p className="bg-accent/15 text-accent rounded-md px-3 py-2 text-sm">
            Senha atualizada com sucesso.
          </p>
        )}
        <div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Atualizar senha
          </Button>
        </div>
      </form>
    </Section>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border bg-bg rounded-lg border p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-fg-muted mt-0.5 text-xs">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function PasswordField({
  id,
  label,
  show,
  onToggle,
  error,
  register,
  autoComplete,
}: {
  id: string;
  label: string;
  show: boolean;
  onToggle: () => void;
  error?: string;
  register: ReturnType<ReturnType<typeof useForm<ChangePasswordRequest>>['register']>;
  autoComplete?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          error={!!error}
          className="pr-10"
          {...register}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? 'Ocultar' : 'Mostrar'}
          tabIndex={-1}
          className="text-fg-muted hover:text-fg absolute inset-y-0 right-0 flex w-10 items-center justify-center"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {error && <p className="text-danger text-xs">{error}</p>}
    </div>
  );
}

/**
 * Toggle de push notifications + lista dos dispositivos com push ativo.
 * Cada device é uma row com nome resumido (do User-Agent), data de registro
 * e botão pra desativar individualmente. Útil quando o user quer revogar
 * o push de um device antigo (ex: trocou de celular).
 */
function PushNotificationsSection() {
  const push = usePushNotifications();
  const queryClient = useQueryClient();
  const subsQuery = useQuery({
    ...pushQueries.subscriptions(),
    enabled: push.status === 'subscribed',
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => unsubscribePushById(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pushQueries.subscriptions().queryKey });
    },
  });

  const subs = subsQuery.data ?? [];

  return (
    <section className="border-border bg-bg flex flex-col gap-4 rounded-md border p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Bell size={16} className="text-primary" />
            Notificações no dispositivo
          </h2>
          <p className="text-fg-muted mt-1 text-xs leading-relaxed">
            Receba notificações push (mesmo com o app fechado) quando alguém te atribuir uma tarefa,
            mencionar você num comentário, ou outras atualizações importantes. Cada dispositivo
            precisa ser ativado separadamente.
          </p>
        </div>
        <PushToggleButton push={push} />
      </div>

      {push.error && <p className="text-danger text-xs">{push.error}</p>}

      {push.status === 'unsupported' && (
        <p className="text-fg-muted bg-bg-muted rounded-md px-3 py-2 text-[11px]">
          Seu navegador não suporta notificações push. Tente Chrome, Edge, Firefox ou Safari (iOS
          16.4+) com o app instalado na tela inicial.
        </p>
      )}
      {push.status === 'denied' && (
        <p className="text-danger bg-danger-subtle rounded-md px-3 py-2 text-[11px]">
          Você bloqueou notificações deste site. Habilite nas configurações do navegador (cadeado
          próximo à barra de endereço) e tente novamente.
        </p>
      )}

      {push.status === 'subscribed' && subs.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-fg-muted text-[10px] font-semibold uppercase tracking-wide">
            Dispositivos ativos
          </p>
          <ul className="divide-border/50 border-border/60 divide-y rounded-md border">
            {subs.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Smartphone size={13} className="text-fg-muted shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-fg truncate font-medium">
                      {summarizeUserAgent(s.userAgent)}
                    </p>
                    <p className="text-fg-muted text-[10px]">
                      Adicionado em {new Date(s.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeMut.mutate(s.id)}
                  disabled={removeMut.isPending}
                  className="text-fg-muted hover:text-danger rounded p-1"
                  aria-label="Remover dispositivo"
                  title="Remover dispositivo"
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function PushToggleButton({ push }: { push: ReturnType<typeof usePushNotifications> }) {
  if (push.status === 'loading') {
    return (
      <span className="text-fg-muted inline-flex items-center gap-1 text-xs">
        <Loader2 size={12} className="animate-spin" />
        Carregando…
      </span>
    );
  }
  if (push.status === 'unsupported') return null;
  if (push.status === 'subscribed') {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => push.disable()}
        disabled={push.busy}
      >
        {push.busy ? <Loader2 size={12} className="animate-spin" /> : <BellOff size={13} />}
        Desativar
      </Button>
    );
  }
  return (
    <Button
      type="button"
      size="sm"
      onClick={() => push.enable()}
      disabled={push.busy || push.status === 'denied'}
    >
      {push.busy ? <Loader2 size={12} className="animate-spin" /> : <Bell size={13} />}
      Ativar
    </Button>
  );
}

/**
 * Resume um User-Agent num nome curto e útil ("Chrome no Windows", "Safari
 * no iPhone"). Sem libs externas — heurística simples cobre 90% dos casos.
 */
function summarizeUserAgent(ua: string | null): string {
  if (!ua) return 'Dispositivo desconhecido';
  let browser = 'Navegador';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Chromium\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';

  let os = '';
  if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iOS/i.test(ua)) os = 'iOS';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  return os ? `${browser} no ${os}` : browser;
}
