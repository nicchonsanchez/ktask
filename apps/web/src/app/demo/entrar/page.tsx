'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Eye, EyeOff, LogIn, Sparkles } from 'lucide-react';

/**
 * Replica visual da tela /entrar com dados estaticos pre-preenchidos.
 * Print #03 do tutorial: campos de e-mail e senha preenchidos + checkbox
 * "Permanecer logado" marcado.
 */
export default function DemoLoginPage() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
      <DemoCorner />

      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="bg-bg-subtle border-border w-full max-w-sm rounded-xl border p-6 shadow-sm">
          <div className="mb-6 flex flex-col items-start gap-2">
            <Image
              src="/brand/lockup-wordmark-dark.png"
              alt="KTask"
              width={120}
              height={34}
              priority
              className="block dark:hidden"
            />
            <Image
              src="/brand/lockup-wordmark.png"
              alt=""
              width={120}
              height={34}
              priority
              aria-hidden
              className="hidden dark:block"
            />
            <p className="text-fg-muted text-xs">Gestão de tarefas e fluxos</p>
          </div>

          <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-fg text-sm font-medium">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="off"
                defaultValue="marina@padariaaurora.com.br"
                className="bg-bg border-border text-fg focus:border-primary focus:ring-primary/20 h-9 rounded-md border px-3 text-sm transition-colors focus:outline-none focus:ring-2"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-fg text-sm font-medium">
                  Senha
                </label>
                <Link
                  href="#"
                  className="text-fg-muted hover:text-primary text-xs underline-offset-2 hover:underline"
                >
                  Esqueci minha senha
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="off"
                  defaultValue="exemplo1234"
                  className="bg-bg border-border text-fg focus:border-primary focus:ring-primary/20 h-9 w-full rounded-md border px-3 pr-10 text-sm transition-colors focus:outline-none focus:ring-2"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  tabIndex={-1}
                  className="text-fg-muted hover:text-fg absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <label className="text-fg-muted -mt-1 inline-flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                defaultChecked
                className="accent-primary size-4 cursor-pointer"
              />
              <span>Permanecer logado neste dispositivo</span>
            </label>

            <button
              type="submit"
              className="bg-primary text-primary-fg hover:bg-primary/90 mt-2 inline-flex h-9 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors"
            >
              <LogIn size={16} />
              Entrar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function DemoCorner() {
  return (
    <Link
      href="/demo"
      className="absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-400 hover:bg-violet-500/20"
    >
      <Sparkles size={11} /> Demo · clique pra voltar ao índice
    </Link>
  );
}
