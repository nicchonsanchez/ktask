'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity as ActivityIcon,
  AlertCircle,
  Ban,
  Check,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Phone,
  Save,
  Shield,
  ShieldCheck,
  User as UserIcon,
  X,
} from 'lucide-react';

import { ApiError } from '@/lib/api-client';
import { ORG_ROLE_LABELS, type OrgRole } from '@ktask/contracts';
import {
  forcePasswordReset,
  membersAdminQueries,
  suspendMember,
  unsuspendMember,
  updateMember,
  type UpdateMemberInput,
} from '@/lib/queries/members-admin';
import { updateMemberRole } from '@/lib/queries/members';
import { useAuthStore } from '@/stores/auth-store';
import { UserAvatar } from '@/components/user-avatar';

type Tab = 'data' | 'security' | 'activity';

const ROLE_OPTIONS: OrgRole[] = ['ADMIN', 'GESTOR', 'MEMBER', 'GUEST'];

/**
 * Modal de detalhes do membro. Abre quando clica numa linha da
 * /configuracoes/membros. Tem 3 abas:
 *   - Dados: nome, email (com fluxo de confirmacao), phone, papel
 *   - Seguranca: forcar reset senha, ver 2FA, sessoes ativas, suspender
 *   - Atividade: ultimas 30 actions
 *
 * Permissoes (do back-end):
 *   OWNER: tudo
 *   ADMIN: tudo exceto editar OWNER
 *   GESTOR/MEMBER/GUEST: bloqueado pra outros (so pode ver propria pagina)
 *
 * Pra users sem permissao, modal abre em modo READ-ONLY (sem botao Salvar).
 */
export function MemberDetailModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('data');

  const detailQ = useQuery({ ...membersAdminQueries.detail(userId), retry: false });

  // Permissao client-side: OWNER edita qualquer um. ADMIN edita exceto OWNER.
  // Demais: read-only. (Backend valida tambem.)
  // Como auth store nao expoe role da Org corrente, deixamos o backend
  // bloquear via 403; aqui assumimos que se o detail carregou, o user
  // pelo menos tem permissao de LER. Pra escrita, o bloqueio do back vai
  // fechar o ciclo se faltar permissao.
  const isSelf = me?.id === userId;
  const canEdit = !isSelf; // self-edit usa /configuracoes/perfil

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'members', userId] });
    queryClient.invalidateQueries({ queryKey: ['org', 'members'] });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-bg border-border flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border shadow-xl">
        {detailQ.isLoading && (
          <div className="text-fg-muted flex items-center gap-2 p-8 text-sm">
            <Loader2 size={14} className="animate-spin" />
            Carregando…
          </div>
        )}

        {detailQ.isError && (
          <div className="flex items-start gap-3 p-6">
            <AlertCircle size={18} className="text-warning mt-0.5" />
            <div>
              <p className="text-fg text-sm font-medium">Não foi possível carregar</p>
              <p className="text-fg-muted text-xs">
                {detailQ.error instanceof ApiError && detailQ.error.status === 403
                  ? 'Sem permissão pra ver detalhes deste membro.'
                  : 'Erro ao buscar dados. Tente de novo.'}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="text-fg-muted hover:text-fg mt-3 text-xs underline"
              >
                Fechar
              </button>
            </div>
          </div>
        )}

        {detailQ.data && (
          <>
            <header className="border-border/60 flex items-start gap-3 border-b p-5">
              <UserAvatar
                name={detailQ.data.name}
                userId={detailQ.data.id}
                avatarUrl={detailQ.data.avatarUrl}
                size="lg"
              />
              <div className="min-w-0 flex-1">
                <h2 className="text-fg truncate text-lg font-semibold">
                  {detailQ.data.name}
                  {isSelf && <span className="text-fg-muted ml-2 text-xs">(você)</span>}
                </h2>
                <p className="text-fg-muted text-xs">
                  {detailQ.data.email}
                  {detailQ.data.pendingEmail && (
                    <span className="text-warning ml-2">
                      → {detailQ.data.pendingEmail} (aguardando confirmação)
                    </span>
                  )}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <RoleBadge role={detailQ.data.role} />
                  {detailQ.data.suspendedAt && (
                    <span className="bg-danger-subtle text-danger inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium">
                      <Ban size={10} />
                      Suspenso
                    </span>
                  )}
                  {detailQ.data.twoFactorEnabled && (
                    <span className="bg-success-subtle text-success inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium">
                      <ShieldCheck size={10} />
                      2FA
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-fg-muted hover:bg-bg-muted rounded p-1"
                aria-label="Fechar"
              >
                <X size={14} />
              </button>
            </header>

            <nav role="tablist" className="border-border/60 flex shrink-0 gap-1 border-b px-3">
              <TabBtn label="Dados" active={tab === 'data'} onClick={() => setTab('data')} />
              <TabBtn
                label="Segurança"
                active={tab === 'security'}
                onClick={() => setTab('security')}
              />
              <TabBtn
                label="Atividade"
                active={tab === 'activity'}
                onClick={() => setTab('activity')}
              />
            </nav>

            <div className="flex-1 overflow-y-auto p-5">
              {tab === 'data' && (
                <DataTab member={detailQ.data} canEdit={canEdit} onSaved={refresh} />
              )}
              {tab === 'security' && (
                <SecurityTab member={detailQ.data} canEdit={canEdit} onChanged={refresh} />
              )}
              {tab === 'activity' && <ActivityTab userId={userId} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TabBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`relative px-3 py-2 text-[12px] font-medium transition-colors ${
        active ? 'text-primary' : 'text-fg-muted hover:text-fg'
      }`}
    >
      {label}
      {active && <span className="bg-primary absolute inset-x-3 bottom-0 h-[2px] rounded-t" />}
    </button>
  );
}

function RoleBadge({ role }: { role: OrgRole }) {
  const colors: Record<OrgRole, string> = {
    OWNER: 'bg-primary-subtle/60 text-primary',
    ADMIN: 'bg-warning-subtle text-warning',
    GESTOR: 'bg-bg-emphasis text-fg',
    MEMBER: 'bg-bg-muted text-fg-muted',
    GUEST: 'bg-bg-muted text-fg-subtle',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${colors[role]}`}
    >
      {ORG_ROLE_LABELS[role]}
    </span>
  );
}

function DataTab({
  member,
  canEdit,
  onSaved,
}: {
  member: { id: string; name: string; email: string; phone: string | null; role: OrgRole };
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email);
  const [phone, setPhone] = useState(member.phone ?? '');
  const [role, setRole] = useState<OrgRole>(member.role);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const updateMut = useMutation({
    mutationFn: () => {
      const input: UpdateMemberInput = {};
      if (name.trim() !== member.name) input.name = name.trim();
      if (email.trim() !== member.email) input.email = email.trim();
      const phoneNorm = phone.replace(/\D/g, '') || null;
      if (phoneNorm !== member.phone) input.phone = phoneNorm;
      return updateMember(member.id, input);
    },
    onSuccess: () => {
      setSavedAt(Date.now());
      setError(null);
      onSaved();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar.');
    },
  });

  const roleMut = useMutation({
    mutationFn: () => updateMemberRole(member.id, role),
    onSuccess: () => {
      onSaved();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Erro ao alterar papel.');
    },
  });

  const dirty =
    name.trim() !== member.name ||
    email.trim() !== member.email ||
    (phone.replace(/\D/g, '') || null) !== member.phone;

  const roleDirty = role !== member.role;

  return (
    <div className="flex flex-col gap-4">
      <Field label="Nome" icon={<UserIcon size={13} />}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!canEdit}
          className="border-border bg-bg w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none disabled:opacity-60"
        />
      </Field>

      <Field label="E-mail" icon={<Mail size={13} />}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={!canEdit}
          className="border-border bg-bg w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none disabled:opacity-60"
        />
        <p className="text-fg-subtle mt-1 text-[11px]">
          Mudança de e-mail dispara link de confirmação pro novo endereço (anti-sequestro). Email
          original continua válido até confirmação.
        </p>
      </Field>

      <Field label="WhatsApp" icon={<Phone size={13} />}>
        <input
          inputMode="numeric"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
          disabled={!canEdit}
          placeholder="5531999999999"
          className="border-border bg-bg w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none disabled:opacity-60"
        />
      </Field>

      <Field label="Papel">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as OrgRole)}
          disabled={!canEdit || member.role === 'OWNER'}
          className="border-border bg-bg w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none disabled:opacity-60"
        >
          {member.role === 'OWNER' && <option value="OWNER">Dono</option>}
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {ORG_ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        {member.role === 'OWNER' && (
          <p className="text-fg-subtle mt-1 text-[11px]">
            Donos não podem ser rebaixados pelo modal. Use endpoints de transferência de ownership
            (não implementado).
          </p>
        )}
      </Field>

      {error && <p className="bg-danger-subtle text-danger rounded px-2 py-1 text-xs">{error}</p>}

      {canEdit && (
        <div className="border-border flex items-center justify-end gap-2 border-t pt-3">
          {savedAt && !dirty && !roleDirty && (
            <span className="text-success inline-flex items-center gap-1 text-xs">
              <Check size={12} />
              Salvo
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              if (dirty) updateMut.mutate();
              if (roleDirty) roleMut.mutate();
            }}
            disabled={(!dirty && !roleDirty) || updateMut.isPending || roleMut.isPending}
            className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            {(updateMut.isPending || roleMut.isPending) && (
              <Loader2 size={13} className="animate-spin" />
            )}
            <Save size={13} />
            Salvar
          </button>
        </div>
      )}
    </div>
  );
}

function SecurityTab({
  member,
  canEdit,
  onChanged,
}: {
  member: {
    id: string;
    twoFactorEnabled: boolean;
    activeSessions: number;
    suspendedAt: string | null;
    suspendedReason: string | null;
    lockedUntil: string | null;
    failedLoginCount: number;
  };
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');

  const resetMut = useMutation({
    mutationFn: () => forcePasswordReset(member.id),
    onSuccess: (r) => {
      setInfo(r.message);
      setError(null);
      onChanged();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Erro.'),
  });

  const suspendMut = useMutation({
    mutationFn: () => suspendMember(member.id, suspendReason.trim()),
    onSuccess: () => {
      setSuspendOpen(false);
      setSuspendReason('');
      onChanged();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Erro.'),
  });

  const unsuspendMut = useMutation({
    mutationFn: () => unsuspendMember(member.id),
    onSuccess: () => onChanged(),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Erro.'),
  });

  return (
    <div className="flex flex-col gap-4 text-sm">
      {/* 2FA — read-only */}
      <Row icon={<Shield size={14} />} label="Autenticação em 2 fatores">
        <span className={member.twoFactorEnabled ? 'text-success' : 'text-fg-muted'}>
          {member.twoFactorEnabled ? 'Ativo' : 'Inativo'}
        </span>
        <p className="text-fg-subtle text-[11px]">
          Admin não pode desativar 2FA de outro usuário (segurança).
          {member.twoFactorEnabled && ' Se ele perdeu acesso, processo formal é necessário.'}
        </p>
      </Row>

      {/* Sessoes ativas */}
      <Row icon={<Lock size={14} />} label="Sessões ativas">
        <span className="text-fg">{member.activeSessions}</span>
        <p className="text-fg-subtle text-[11px]">
          Forçar reset de senha invalida todas as sessões ativas.
        </p>
      </Row>

      {/* Tentativas / lock */}
      {(member.failedLoginCount > 0 || member.lockedUntil) && (
        <div className="bg-warning-subtle/40 text-fg rounded px-3 py-2 text-xs">
          {member.failedLoginCount} tentativa(s) recente(s) de login falharam.
          {member.lockedUntil && ` Bloqueado até ${new Date(member.lockedUntil).toLocaleString()}`}
        </div>
      )}

      {/* Reset senha */}
      <div className="border-border rounded-md border p-3">
        <div className="flex items-start gap-2">
          <KeyRound size={14} className="text-fg-muted mt-0.5" />
          <div className="flex-1">
            <p className="text-fg text-sm font-medium">Forçar redefinição de senha</p>
            <p className="text-fg-subtle text-[11px]">
              Invalida todas as sessões e (quando mailer estiver pronto) envia link de redefinição
              pro e-mail do usuário. Admin nunca define a senha direto — segurança.
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                if (confirm('Forçar redefinição? Todas as sessões serão invalidadas.')) {
                  resetMut.mutate();
                }
              }}
              disabled={resetMut.isPending}
              className="border-border hover:bg-bg-muted text-fg shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              {resetMut.isPending ? <Loader2 size={11} className="animate-spin" /> : 'Forçar'}
            </button>
          )}
        </div>
      </div>

      {/* Suspender */}
      <div
        className={`rounded-md border p-3 ${
          member.suspendedAt ? 'border-danger bg-danger-subtle/30' : 'border-border'
        }`}
      >
        <div className="flex items-start gap-2">
          <Ban
            size={14}
            className={member.suspendedAt ? 'text-danger mt-0.5' : 'text-fg-muted mt-0.5'}
          />
          <div className="flex-1">
            <p className="text-fg text-sm font-medium">
              {member.suspendedAt ? 'Conta suspensa' : 'Suspender conta'}
            </p>
            {member.suspendedAt ? (
              <p className="text-fg-muted text-[11px]">
                Suspenso desde {new Date(member.suspendedAt).toLocaleDateString()}.
                {member.suspendedReason && ` Motivo: ${member.suspendedReason}`}
              </p>
            ) : (
              <p className="text-fg-subtle text-[11px]">
                Bloqueia login + invalida sessões. Dados preservados — pode reativar depois.
                Diferente de "remover" que desvincula da Org.
              </p>
            )}
          </div>
          {canEdit &&
            (member.suspendedAt ? (
              <button
                type="button"
                onClick={() => unsuspendMut.mutate()}
                disabled={unsuspendMut.isPending}
                className="bg-success text-success-fg hover:bg-success/90 shrink-0 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {unsuspendMut.isPending ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  'Reativar'
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setSuspendOpen(true)}
                className="border-danger text-danger hover:bg-danger-subtle shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium"
              >
                Suspender
              </button>
            ))}
        </div>

        {suspendOpen && (
          <div className="border-border/60 mt-3 flex flex-col gap-2 border-t pt-3">
            <label className="text-fg-muted text-[11px] font-medium">Motivo da suspensão</label>
            <input
              autoFocus
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="Ex: férias prolongadas, revisão de acesso..."
              maxLength={500}
              className="border-border bg-bg rounded-md border px-2 py-1.5 text-sm focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSuspendOpen(false)}
                className="text-fg-muted hover:bg-bg-muted rounded px-3 py-1 text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => suspendMut.mutate()}
                disabled={suspendReason.trim().length === 0 || suspendMut.isPending}
                className="bg-danger text-danger-fg hover:bg-danger/90 inline-flex items-center gap-1 rounded px-3 py-1 text-xs font-medium disabled:opacity-50"
              >
                {suspendMut.isPending && <Loader2 size={11} className="animate-spin" />}
                Suspender
              </button>
            </div>
          </div>
        )}
      </div>

      {info && (
        <p className="bg-primary-subtle/50 text-primary rounded px-2 py-1 text-xs">{info}</p>
      )}
      {error && <p className="bg-danger-subtle text-danger rounded px-2 py-1 text-xs">{error}</p>}
    </div>
  );
}

function ActivityTab({ userId }: { userId: string }) {
  const q = useQuery({ ...membersAdminQueries.activity(userId, 30) });
  const items = q.data ?? [];

  return (
    <div className="flex flex-col gap-2">
      {q.isLoading && (
        <div className="text-fg-muted flex items-center gap-2 text-sm">
          <Loader2 size={14} className="animate-spin" />
          Carregando…
        </div>
      )}
      {!q.isLoading && items.length === 0 && (
        <p className="text-fg-muted text-sm">Sem atividade recente.</p>
      )}
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li
            key={item.id}
            className="border-border/40 hover:bg-bg-muted/30 flex items-start gap-2 rounded border-l-2 px-3 py-2 text-xs"
          >
            <ActivityIcon size={11} className="text-fg-muted mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-fg font-medium">{item.type}</p>
              <p className="text-fg-muted text-[10px]">
                {new Date(item.createdAt).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-fg-muted mb-1 flex items-center gap-1.5 text-[11px] font-medium">
        {icon}
        {label}
      </label>
      {children}
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border flex items-start gap-2 rounded-md border p-3">
      <span className="text-fg-muted mt-0.5">{icon}</span>
      <div className="flex-1">
        <p className="text-fg text-sm font-medium">{label}</p>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}
