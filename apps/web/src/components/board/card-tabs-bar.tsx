'use client';

import { Calendar, Cloud, GitBranch, Home, Layout } from 'lucide-react';

export type CardTab = 'home' | 'flows' | 'files' | 'calendar' | 'family';

const TABS: Array<{
  key: CardTab;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  comingSoon?: boolean;
}> = [
  { key: 'home', label: 'Início', icon: Home },
  { key: 'flows', label: 'Fluxos', icon: Layout },
  { key: 'family', label: 'Família', icon: GitBranch },
  { key: 'files', label: 'Arquivos', icon: Cloud, comingSoon: true },
  { key: 'calendar', label: 'Calendário', icon: Calendar, comingSoon: true },
];

export function CardTabsBar({ tab, onChange }: { tab: CardTab; onChange: (t: CardTab) => void }) {
  return (
    <nav
      role="tablist"
      aria-label="Seções do card"
      className="border-border/60 scrollbar-none flex shrink-0 items-stretch gap-1 overflow-x-auto border-b px-3 sm:px-5"
    >
      {TABS.map((t) => {
        const active = tab === t.key;
        const Icon = t.icon;
        const disabled = t.comingSoon;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            aria-disabled={disabled}
            onClick={() => !disabled && onChange(t.key)}
            disabled={disabled}
            title={disabled ? `${t.label} (em breve)` : t.label}
            className={`relative inline-flex shrink-0 items-center gap-1.5 px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none ${
              active
                ? 'text-primary'
                : disabled
                  ? 'text-fg-subtle cursor-not-allowed'
                  : 'text-fg-muted hover:text-fg'
            }`}
          >
            <Icon size={15} />
            <span>{t.label}</span>
            {active && (
              <span
                aria-hidden
                className="bg-primary absolute inset-x-2 -bottom-px h-0.5 rounded-full"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
