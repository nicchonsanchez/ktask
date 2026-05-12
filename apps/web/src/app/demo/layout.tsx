import type { ReactNode } from 'react';

export const metadata = {
  title: 'Demo · KTask',
  description:
    'Telas do KTask com dados fictícios — usadas para tutoriais, apresentações e screenshots.',
  robots: 'noindex, nofollow',
};

export default function DemoLayout({ children }: { children: ReactNode }) {
  return <div className="bg-bg text-fg min-h-screen">{children}</div>;
}
