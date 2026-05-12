'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Sparkles, Camera } from 'lucide-react';
import { DEMO_SCREENS } from './_data';

/**
 * Indice de /demo — lista todas as telas com dados ficticios disponiveis
 * pra prints e apresentacoes. Espelha o padrao usado em /demo de outros
 * sistemas (sistema-pedidos, sistema-educacional).
 */
export default function DemoIndex() {
  const grupos = ['Acesso', 'Visão do cliente', 'Cards e fluxos', 'Notificações'] as const;

  return (
    <div className="container mx-auto max-w-6xl px-6 py-12">
      <header className="mb-12 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
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
          <div className="hidden h-10 w-px bg-[var(--border)] sm:block" />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-violet-400">
            <Sparkles size={12} /> Demonstração
          </span>
        </div>
      </header>

      <div className="mb-12">
        <h1 className="text-fg mb-3 text-3xl font-bold sm:text-4xl">Telas do sistema</h1>
        <p className="text-fg-muted max-w-2xl text-base leading-relaxed">
          Cenário fictício realista (Estúdio Verde atendendo a Padaria Aurora) para apresentações,
          tutoriais e screenshots. As telas reproduzem fielmente o KTask em produção, com dados de
          exemplo — sem dados reais de clientes.
        </p>
      </div>

      <div className="mb-8 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
        <p className="mb-1 flex items-center gap-2 font-semibold text-amber-500">
          <Camera size={14} /> Para tirar prints do tutorial
        </p>
        <p className="text-fg-muted">
          Cada tela abaixo corresponde a um (ou mais) print listado em{' '}
          <code className="rounded bg-black/20 px-1.5 py-0.5 text-xs">/tutorial-para-clientes</code>
          . Abra a tela, posicione a janela, screenshot e salve em{' '}
          <code className="rounded bg-black/20 px-1.5 py-0.5 text-xs">
            apps/web/public/tutorial-para-clientes/img/
          </code>
          .
        </p>
      </div>

      <div className="flex flex-col gap-12">
        {grupos.map((grupo) => {
          const items = DEMO_SCREENS.filter((s) => s.grupo === grupo);
          if (!items.length) return null;
          return (
            <section key={grupo}>
              <h2 className="text-fg-muted mb-5 text-xs font-bold uppercase tracking-widest">
                {grupo}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((s) => (
                  <Link
                    key={s.slug}
                    href={`/demo/${s.slug}`}
                    className="group relative flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] p-5 transition-all hover:border-violet-500/40 hover:bg-[var(--bg-muted)]"
                  >
                    <div className="flex items-start justify-between">
                      <div className="text-3xl">{s.icon}</div>
                      <ArrowRight
                        size={18}
                        className="text-fg-muted transition-all group-hover:translate-x-1 group-hover:text-violet-500"
                      />
                    </div>
                    <div>
                      <h3 className="text-fg mb-1 text-base font-semibold">{s.titulo}</h3>
                      <p className="text-fg-muted text-xs leading-relaxed">{s.descricao}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <footer className="text-fg-muted mt-16 border-t border-[var(--border)] pt-6 text-xs">
        Cenário fictício pra fins de tutorial — Estúdio Verde e Padaria Aurora não são empresas
        reais.
      </footer>
    </div>
  );
}
