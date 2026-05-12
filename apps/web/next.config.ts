import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

/**
 * Serwist (sucessor moderno do next-pwa) — gera o service worker que
 * faz o app virar PWA com push notifications. O SW fica em /sw.js,
 * registrado automaticamente pelo Serwist no client. Em dev, fica
 * desabilitado pra não cachear builds parciais; em prod, gera e cacheia
 * assets do Next.
 */
const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  cacheOnNavigation: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  transpilePackages: ['@ktask/ui', '@ktask/contracts'],
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
    ],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', '@ktask/ui'],
  },
  async rewrites() {
    return [
      // Tutorial estático em /public/tutorial-para-clientes/ — sem essa rewrite,
      // a URL canonica /tutorial-para-clientes daria 404 (Next só serve o
      // arquivo se acessado como /tutorial-para-clientes/index.html).
      { source: '/tutorial-para-clientes', destination: '/tutorial-para-clientes/index.html' },
    ];
  },
};

export default withSerwist(nextConfig);
