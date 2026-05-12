'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { Button, Input, Label } from '@ktask/ui';
import { DemoProvider } from '../_DemoProvider';

/**
 * Replica visual da tela /entrar com dados estaticos pre-preenchidos.
 * Print #03 do tutorial: campos de e-mail e senha preenchidos + checkbox
 * "Permanecer logado" marcado.
 *
 * Usa primitivos do @ktask/ui (Button, Input, Label) — mesmos componentes
 * que a tela real, garantindo paridade visual.
 */
export default function DemoLoginPage() {
  return (
    <DemoProvider auth="none">
      <LoginForm />
    </DemoProvider>
  );
}

function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="bg-bg-subtle border-border w-full max-w-sm rounded-xl border p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-start gap-2">
          <Image
            src="/brand/lockup-wordmark-dark.png"
            alt="KTask"
            width={120}
            height={34}
            priority
          />
          <p className="text-fg-muted text-xs">Gestão de tarefas e fluxos</p>
        </div>

        <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="off"
              defaultValue="marina@padariaaurora.com.br"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Senha</Label>
              <Link
                href="#"
                className="text-fg-muted hover:text-primary text-xs underline-offset-2 hover:underline"
              >
                Esqueci minha senha
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="off"
                defaultValue="exemplo1234"
                className="pr-10"
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

          <Button type="submit" className="mt-2">
            <LogIn size={16} />
            Entrar
          </Button>
        </form>
      </div>
    </div>
  );
}
