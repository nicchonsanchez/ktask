import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { QueryProvider } from '@/components/query-provider';
import { SessionBootstrap } from '@/components/session-bootstrap';
import { UpdateToast } from '@/components/update-toast';
import '@/styles/globals.css';

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-sans',
  display: 'swap',
});

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ktask.agenciakharis.com.br';
const SITE_NAME = 'KTask';
const SITE_DESCRIPTION =
  'Sistema interno de gestão de tarefas e fluxos da Kharis. Kanban, automações, cronômetro, time tracking e colaboração em tempo real.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: '%s · KTask',
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: 'Kharis', url: 'https://agenciakharis.com.br' }],
  creator: 'Kharis',
  publisher: 'Kharis',
  keywords: [
    'gestão de tarefas',
    'kanban',
    'fluxos operacionais',
    'time tracking',
    'cronômetro',
    'automações',
    'colaboração',
    'KTask',
    'Kharis',
  ],
  // Não queremos indexação pública por enquanto — sistema interno.
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
  // Open Graph — usado por WhatsApp, LinkedIn, Discord, Telegram, Slack, Facebook
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'KTask — gestão de tarefas e fluxos',
        type: 'image/png',
      },
    ],
  },
  // Twitter Card — usado por X (Twitter)
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: ['/opengraph-image'],
    creator: '@agenciakharis',
  },
  // Icons + manifest
  icons: {
    icon: '/icon.png',
    shortcut: '/favicon.ico',
    apple: '/apple-icon.png',
  },
  // Hint pro browser de que é um app web
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    email: false,
    telephone: false,
    address: false,
  },
  category: 'productivity',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#6D28D9' },
    { media: '(prefers-color-scheme: dark)', color: '#7C3AED' },
  ],
  colorScheme: 'light dark',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable} suppressHydrationWarning>
      <body className="bg-bg text-fg min-h-screen font-sans antialiased">
        <ThemeProvider>
          <QueryProvider>
            <SessionBootstrap />
            <UpdateToast />
            {children}
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
