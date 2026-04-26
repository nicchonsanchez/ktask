import nextjs from '@ktask/config-eslint/nextjs';

export default [
  // Service worker (sw.ts) fica fora do tsconfig.json principal — o build
  // do Serwist faz seu próprio bundling/typecheck. Ignorar aqui evita
  // erro "TSConfig does not include this file".
  { ignores: ['src/app/sw.ts', '.next/**', 'public/sw.js', 'public/sw-*.js'] },
  ...nextjs,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
