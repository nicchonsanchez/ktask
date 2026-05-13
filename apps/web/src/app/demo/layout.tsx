import type { ReactNode } from 'react';
import { DemoLightTheme } from './_DemoLightTheme';

export const metadata = {
  title: 'Demo · KTask',
  description:
    'Telas do KTask com dados fictícios — usadas para tutoriais, apresentações e screenshots.',
  robots: 'noindex, nofollow',
};

export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <DemoLightTheme>
      <div className="bg-bg text-fg min-h-screen">{children}</div>
    </DemoLightTheme>
  );
}
