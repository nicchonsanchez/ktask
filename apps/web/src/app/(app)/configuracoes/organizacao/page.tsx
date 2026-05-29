'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Building2, CheckCircle2, ChevronLeft, Loader2 } from 'lucide-react';
import type { OrgRole } from '@ktask/contracts';

import { api, ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

interface CurrentOrg {
  id: string;
  name: string;
  myRole: OrgRole;
  autoCompleteCardWhenAllFinal: boolean;
  approvalReminderEnabled: boolean;
  approvalReminderIntervalHours: number;
  approvalReminderHourStart: number;
  approvalReminderHourEnd: number;
  approvalReminderMaxAttempts: number;
}

type OrgPatch = Partial<{
  autoCompleteCardWhenAllFinal: boolean;
  approvalReminderEnabled: boolean;
  approvalReminderIntervalHours: number;
  approvalReminderHourStart: number;
  approvalReminderHourEnd: number;
  approvalReminderMaxAttempts: number;
}>;

const ADMIN_ROLES: OrgRole[] = ['OWNER', 'ADMIN'];

/**
 * Configurações da Organização (admin-only). Hoje:
 *   - auto-status: Card.status sincronizado com presences em coluna final
 *   - lembretes de aprovação: cron a cada 30min envia consolidado por
 *     reviewer respeitando janela horária (BRT seg-sex).
 */
export default function ConfiguracoesOrganizacaoPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const orgQ = useQuery({
    queryKey: ['org', 'current'],
    queryFn: () => api.get<CurrentOrg>('/api/v1/organizations/current'),
    enabled: !!user,
  });

  const isAdmin = orgQ.data ? ADMIN_ROLES.includes(orgQ.data.myRole) : false;

  const patchMut = useMutation({
    mutationFn: (patch: OrgPatch) => api.patch<CurrentOrg>('/api/v1/organizations/current', patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org', 'current'] });
      setError(null);
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.message : 'Erro ao atualizar configuração.');
    },
  });

  if (orgQ.isLoading || !orgQ.data) {
    return (
      <div className="text-fg-muted flex items-center gap-2 p-6 text-sm">
        <Loader2 size={14} className="animate-spin" />
        Carregando…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto max-w-md py-12 text-center">
        <Building2 size={32} className="text-fg-muted mx-auto mb-3" />
        <h1 className="text-lg font-semibold">Configurações da organização</h1>
        <p className="text-fg-muted mt-2 text-sm">
          Acesso restrito a OWNER e ADMIN. Fale com um admin se precisa alterar essas configurações.
        </p>
      </div>
    );
  }

  const org = orgQ.data;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6">
      <header className="mb-5 flex items-center gap-3">
        <Link
          href="/configuracoes"
          className="text-fg-muted hover:text-fg inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft size={14} />
          Configurações
        </Link>
        <span className="text-fg-subtle">/</span>
        <div className="flex items-center gap-2">
          <Building2 size={18} className="text-fg-muted" />
          <h1 className="text-lg font-semibold">Organização</h1>
        </div>
      </header>

      <section className="border-border bg-bg mb-4 flex flex-col gap-4 rounded-md border p-4">
        <h2 className="text-fg text-sm font-semibold">Sincronização automática de status</h2>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={org.autoCompleteCardWhenAllFinal}
            onChange={(e) => patchMut.mutate({ autoCompleteCardWhenAllFinal: e.target.checked })}
            disabled={patchMut.isPending}
            className="mt-1 size-4 shrink-0"
          />
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium">
              <CheckCircle2 size={13} className="text-emerald-600" />
              Marcar cards como concluídos automaticamente
            </span>
            <span className="text-fg-muted text-xs leading-relaxed">
              Quando todas as presenças ativas do card (em todos os fluxos) chegam em colunas
              marcadas como “coluna final” (ex: Finalizado), o status do card vira{' '}
              <strong>Concluído</strong>. Se algum fluxo voltar pra uma coluna não-final, o status
              volta pra <strong>Ativo</strong>.
            </span>
            <span className="text-fg-subtle text-[11px] leading-relaxed">
              • Cards com status <strong>Cancelado</strong> nunca mudam (cancelamento é terminal).
              <br />• Se um card está em vários quadros e fica concluído só em alguns, o status
              permanece <strong>Ativo</strong> até concluir em todos.
            </span>
          </div>
        </label>
      </section>

      <section className="border-border bg-bg flex flex-col gap-4 rounded-md border p-4">
        <h2 className="text-fg text-sm font-semibold">Lembretes de aprovação pendente</h2>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={org.approvalReminderEnabled}
            onChange={(e) => patchMut.mutate({ approvalReminderEnabled: e.target.checked })}
            disabled={patchMut.isPending}
            className="mt-1 size-4 shrink-0"
          />
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium">
              <BellRing size={13} className="text-amber-600" />
              Enviar lembrete automático para aprovações pendentes
            </span>
            <span className="text-fg-muted text-xs leading-relaxed">
              A cada X horas úteis (seg-sex, dentro da janela horária abaixo), envia WhatsApp e
              notificação interna para os aprovadores que ainda não decidiram. Se uma pessoa for
              aprovadora de vários cards, recebe <strong>1 mensagem consolidada</strong> em vez de
              várias.
            </span>
          </div>
        </label>

        {/* Sub-config — só faz sentido editar quando habilitado, mas mantém
            visível pra deixar claro o que entra em vigor quando ligar. */}
        <div
          className={`border-border ml-7 grid grid-cols-1 gap-3 rounded-md border p-3 sm:grid-cols-2 ${
            org.approvalReminderEnabled ? '' : 'opacity-50'
          }`}
        >
          <IntervalField
            label="Intervalo entre lembretes"
            hours={org.approvalReminderIntervalHours}
            disabled={!org.approvalReminderEnabled || patchMut.isPending}
            onChange={(v) => patchMut.mutate({ approvalReminderIntervalHours: v })}
            hint="Tempo entre 1 lembrete e o próximo (só conta horas úteis). Mínimo: 30min."
          />
          <NumberField
            label="Máximo de lembretes por aprovação"
            value={org.approvalReminderMaxAttempts}
            min={1}
            max={20}
            disabled={!org.approvalReminderEnabled || patchMut.isPending}
            onChange={(v) => patchMut.mutate({ approvalReminderMaxAttempts: v })}
            hint="Após atingir, para de cobrar. Cobrança manual continua possível."
          />
          <NumberField
            label="Início da janela (hora BRT)"
            value={org.approvalReminderHourStart}
            min={0}
            max={23}
            disabled={!org.approvalReminderEnabled || patchMut.isPending}
            onChange={(v) => patchMut.mutate({ approvalReminderHourStart: v })}
            hint="Ex: 8 = começa às 8h da manhã"
          />
          <NumberField
            label="Fim da janela (hora BRT)"
            value={org.approvalReminderHourEnd}
            min={1}
            max={24}
            disabled={!org.approvalReminderEnabled || patchMut.isPending}
            onChange={(v) => patchMut.mutate({ approvalReminderHourEnd: v })}
            hint="Ex: 18 = pára às 18h. Use 24 pra cobrir até meia-noite."
          />
        </div>

        <p className="text-fg-subtle text-[11px] leading-relaxed">
          • Feriados ainda não são considerados (entram numa próxima versão).
          <br />• Cada aprovação pode desligar o lembrete individualmente no popup de criação
          (opções avançadas).
        </p>
      </section>

      {patchMut.isPending && (
        <p className="text-fg-muted mt-3 inline-flex items-center gap-1 text-xs">
          <Loader2 size={11} className="animate-spin" />
          Salvando…
        </p>
      )}

      {error && (
        <p className="bg-danger-subtle text-danger mt-3 rounded-md px-3 py-2 text-xs">{error}</p>
      )}
    </div>
  );
}

/**
 * Campo de intervalo com seletor de unidade (minutos/horas).
 * Backend armazena sempre em horas (Float); UI escolhe a unidade conforme
 * o valor pra ficar legivel ("30 minutos" em vez de "0.5 horas").
 *
 * Inicia em horas se >= 1h, senao em minutos. Quando user troca a unidade
 * sem editar o valor, mantem o valor textual e converte ao salvar.
 */
function IntervalField({
  label,
  hours,
  disabled,
  onChange,
  hint,
}: {
  label: string;
  hours: number;
  disabled?: boolean;
  onChange: (hoursValue: number) => void;
  hint?: string;
}) {
  // Decide a unidade de exibicao baseada no valor inicial: < 1h vira minutos
  const initialUnit: 'minutos' | 'horas' = hours < 1 ? 'minutos' : 'horas';
  const initialValue = String(initialUnit === 'minutos' ? Math.round(hours * 60) : hours);

  const [unit, setUnit] = useState<'minutos' | 'horas'>(initialUnit);
  const [local, setLocal] = useState<string>(initialValue);

  // Re-sync se valor externo mudar (ex: outro patch resolveu)
  if (
    document.activeElement?.tagName !== 'INPUT' &&
    !Number.isNaN(Number(local)) &&
    Math.abs((unit === 'minutos' ? Number(local) / 60 : Number(local)) - hours) > 0.001
  ) {
    const nextUnit: 'minutos' | 'horas' = hours < 1 ? 'minutos' : 'horas';
    setUnit(nextUnit);
    setLocal(String(nextUnit === 'minutos' ? Math.round(hours * 60) : hours));
  }

  function commit() {
    const n = Number(local);
    if (!Number.isFinite(n) || n <= 0) {
      // Reverte pra valor original
      setLocal(initialValue);
      setUnit(initialUnit);
      return;
    }
    const inHours = unit === 'minutos' ? n / 60 : n;
    // Clamp em 0.5h (30min) pra evitar erro de validacao no backend
    const finalHours = Math.max(0.5, Math.min(72, inHours));
    if (Math.abs(finalHours - hours) > 0.001) {
      onChange(finalHours);
    }
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="text-fg text-xs font-medium">{label}</span>
      <div className="flex items-stretch gap-2">
        <input
          type="number"
          value={local}
          min={1}
          step={1}
          disabled={disabled}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="border-border bg-bg focus-visible:ring-primary flex-1 rounded-md border px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50"
        />
        <select
          value={unit}
          onChange={(e) => {
            // Troca de unidade sem reenviar — proximo blur converte e salva.
            setUnit(e.target.value as 'minutos' | 'horas');
          }}
          onBlur={commit}
          disabled={disabled}
          className="border-border bg-bg focus-visible:ring-primary rounded-md border px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50"
        >
          <option value="minutos">minutos</option>
          <option value="horas">horas</option>
        </select>
      </div>
      {hint && <span className="text-fg-subtle text-[11px]">{hint}</span>}
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  hint,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  hint?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  const [local, setLocal] = useState<string>(String(value));
  // Mantém sync se o valor externo mudar (ex: outro patch resolveu)
  if (String(value) !== local && document.activeElement?.tagName !== 'INPUT') {
    setLocal(String(value));
  }

  function commit() {
    const n = Number(local);
    if (Number.isFinite(n) && n >= min && n <= max && n !== value) {
      onChange(n);
    } else if (!Number.isFinite(n) || n < min || n > max) {
      setLocal(String(value)); // reverte
    }
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="text-fg text-xs font-medium">{label}</span>
      <input
        type="number"
        value={local}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="border-border bg-bg focus-visible:ring-primary rounded-md border px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50"
      />
      {hint && <span className="text-fg-subtle text-[11px]">{hint}</span>}
    </label>
  );
}
