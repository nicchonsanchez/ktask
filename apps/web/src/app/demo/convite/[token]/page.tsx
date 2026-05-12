'use client';

import { useState } from 'react';
import { Eye, EyeOff, ShieldCheck, UserPlus } from 'lucide-react';
import { DEMO_ORG } from '../../_data';

/**
 * Replica visual da tela /convite/[token] — fluxo de signup novo (email
 * convidado ainda nao tem User). Print #02 do tutorial.
 */
export default function DemoInvitePage() {
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="bg-bg-subtle border-border w-full max-w-md rounded-xl border p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-violet-600 font-bold text-white">
            K
          </div>
          <div>
            <h1 className="text-fg font-semibold">Convite para KTask</h1>
            <p className="text-fg-muted text-xs">Crie sua senha para entrar</p>
          </div>
        </div>

        <div className="bg-bg-muted text-fg-muted mb-6 rounded-md border border-[var(--border)] p-3 text-xs">
          <div className="text-fg mb-1 font-medium">Você foi convidado(a) por</div>
          Carla Mendes pra entrar como <strong className="text-fg">Membro</strong> em{' '}
          <strong className="text-fg">{DEMO_ORG.name}</strong>.
        </div>

        <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-fg text-sm font-medium">Seu nome</label>
            <input
              type="text"
              defaultValue="Marina Costa"
              className="bg-bg border-border text-fg focus:border-primary focus:ring-primary/20 h-9 rounded-md border px-3 text-sm focus:outline-none focus:ring-2"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-fg text-sm font-medium">E-mail</label>
            <input
              type="email"
              defaultValue="marina@padariaaurora.com.br"
              disabled
              className="bg-bg-muted border-border text-fg-muted h-9 cursor-not-allowed rounded-md border px-3 text-sm"
            />
            <p className="text-fg-muted text-xs">
              O e-mail vem do convite e não pode ser alterado.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-fg text-sm font-medium">Crie sua senha</label>
            <div className="relative">
              <input
                type={show1 ? 'text' : 'password'}
                defaultValue="senhasegura1234"
                className="bg-bg border-border text-fg focus:border-primary focus:ring-primary/20 h-9 w-full rounded-md border px-3 pr-10 text-sm focus:outline-none focus:ring-2"
              />
              <button
                type="button"
                onClick={() => setShow1((v) => !v)}
                className="text-fg-muted hover:text-fg absolute inset-y-0 right-0 flex w-10 items-center justify-center"
                tabIndex={-1}
              >
                {show1 ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-fg-muted text-xs">Mínimo 8 caracteres.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-fg text-sm font-medium">Confirme a senha</label>
            <div className="relative">
              <input
                type={show2 ? 'text' : 'password'}
                defaultValue="senhasegura1234"
                className="bg-bg border-border text-fg focus:border-primary focus:ring-primary/20 h-9 w-full rounded-md border px-3 pr-10 text-sm focus:outline-none focus:ring-2"
              />
              <button
                type="button"
                onClick={() => setShow2((v) => !v)}
                className="text-fg-muted hover:text-fg absolute inset-y-0 right-0 flex w-10 items-center justify-center"
                tabIndex={-1}
              >
                {show2 ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="bg-primary text-primary-fg hover:bg-primary/90 mt-2 inline-flex h-10 items-center justify-center gap-2 rounded-md text-sm font-semibold"
          >
            <UserPlus size={16} />
            Criar conta e entrar
          </button>

          <p className="text-fg-muted mt-1 flex items-center justify-center gap-1.5 text-[11px]">
            <ShieldCheck size={12} />
            Sua senha é criptografada — nem a equipe da Kharis vê.
          </p>
        </form>
      </div>
    </div>
  );
}
