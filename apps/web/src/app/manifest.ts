import type { MetadataRoute } from 'next';

/**
 * Web App Manifest do KTask.
 *
 * Define identidade do app pra navegadores que suportam PWA-style behavior:
 * Android Chrome (add to homescreen), Safari iOS (standalone web app),
 * Edge (install as app). Ainda não somos uma PWA completa (sem service
 * worker), mas o manifest melhora a experiência de "salvar na tela inicial"
 * e identifica o app pro sistema operacional.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KTask — Gestão de tarefas Kharis',
    short_name: 'KTask',
    description:
      'Sistema interno de gestão de tarefas e fluxos da Kharis. Kanban, automações, cronômetro e colaboração em tempo real.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0b',
    theme_color: '#6D28D9',
    lang: 'pt-BR',
    orientation: 'any',
    categories: ['productivity', 'business'],
    icons: [
      {
        src: '/brand/app-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/brand/app-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
