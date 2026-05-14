'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { bootstrapSession } from '@/lib/auth';
import { useAuthStore } from '@/stores/auth-store';

export function HelpLoggedBanner() {
  const userInStore = useAuthStore((s) => s.user);
  const initialized = useAuthStore((s) => s.initialized);
  const [checked, setChecked] = useState(initialized);

  useEffect(() => {
    if (initialized) {
      setChecked(true);
      return;
    }
    let cancelled = false;
    bootstrapSession()
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [initialized]);

  if (!checked || !userInStore) return null;

  return (
    <div className="border-primary/30 bg-primary-subtle text-fg border-b">
      <div className="container flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <span className="text-fg-muted">
          Você está autenticado no KTask como{' '}
          <strong className="text-fg font-medium">{userInStore.name || userInStore.email}</strong>.
        </span>
        <Link
          href="/"
          className="text-primary hover:text-primary-hover inline-flex items-center gap-1 font-medium"
        >
          Voltar para o app
          <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
